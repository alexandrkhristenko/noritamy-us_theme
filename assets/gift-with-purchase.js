import { ThemeEvents, CartUpdateEvent } from '@theme/events';
import { fetchConfig } from '@theme/utilities';

/**
 * Gift with purchase: keeps exactly one free gift line in the cart while the cart holds at
 * least one other item, and removes it when it does not.
 *
 * The price is never set here. The gift is free only because of an automatic "Buy X get Y"
 * discount configured in Shopify admin. If, after adding, the gift is not fully discounted
 * (discount missing, expired or its conditions not met), the gift is removed again and not
 * re-added for the rest of the browser session, so a customer is never charged for it.
 *
 * Gift lines are tagged with a hidden line item property, so a pair of the same product that
 * the customer adds themselves is a separate, normal line and is never touched.
 *
 * Config comes from the theme settings (Theme settings → Gift with purchase), rendered by
 * snippets/scripts.liquid into #gift-with-purchase-config.
 */

const GIFT_PROPERTY = '_gift_with_purchase';
const SOURCE = 'gift-with-purchase';
const NOT_FREE_KEY = 'gift-with-purchase:not-free';

/**
 * @typedef {object} GiftConfig
 * @property {boolean} enabled
 * @property {number | null} variantId
 * @property {boolean} available
 * @property {boolean} needsSync - The server-rendered cart already needs a fix on page load.
 */

/** @type {GiftConfig | null} */
const config = readConfig();

/** @returns {GiftConfig | null} */
function readConfig() {
  const element = document.getElementById('gift-with-purchase-config');
  if (!element?.textContent) return null;
  try {
    return JSON.parse(element.textContent);
  } catch (error) {
    console.warn('[gift-with-purchase] invalid config', error);
    return null;
  }
}

/** @param {any} item */
function isGiftLine(item) {
  return item.properties?.[GIFT_PROPERTY] === '1';
}

function giftWasNotFree() {
  try {
    return sessionStorage.getItem(NOT_FREE_KEY) === String(config?.variantId);
  } catch {
    return false;
  }
}

function rememberGiftNotFree() {
  try {
    sessionStorage.setItem(NOT_FREE_KEY, String(config?.variantId));
  } catch {
    // Storage unavailable: the gift is still removed, it may just be retried on the next update.
  }
}

/** Section ids of every cart items component on the page, so they re-render with the change. */
function cartSectionIds() {
  const ids = new Set();
  document.querySelectorAll('cart-items-component').forEach((element) => {
    if (element instanceof HTMLElement && element.dataset.sectionId) ids.add(element.dataset.sectionId);
  });
  return Array.from(ids);
}

/**
 * @param {string} url
 * @param {object} payload
 */
async function postCart(url, payload) {
  const sections = cartSectionIds();
  const body = JSON.stringify({
    ...payload,
    ...(sections.length ? { sections: sections.join(','), sections_url: window.location.pathname } : {}),
  });
  const response = await fetch(url, fetchConfig('json', { body }));
  const json = await response.json();
  if (!response.ok || json.status) throw new Error(json.description || json.message || 'Cart request failed');
  return json;
}

/** @param {number} line @param {number} quantity */
function changeLine(line, quantity) {
  return postCart(Theme.routes.cart_change_url, { line, quantity });
}

async function getCart() {
  const response = await fetch(`${Theme.routes.cart_url}.js`, { headers: { Accept: 'application/json' } });
  return response.json();
}

/**
 * Tells the rest of the theme (cart drawer/page, cart bubble) that the cart changed.
 * @param {any} cart
 * @param {Record<string, string> | undefined} sections
 */
function announce(cart, sections) {
  document.dispatchEvent(
    new CartUpdateEvent({}, SOURCE, {
      source: SOURCE,
      itemCount: cart.item_count,
      sections,
    })
  );
}

/**
 * The automatic discount may land on a pair the customer bought themselves instead of the gift
 * line, since both are the same variant. What matters is that one unit of the variant is free.
 * @param {any} cart
 */
function giftIsFree(cart) {
  const lines = cart.items.filter((/** @type {any} */ item) => item.variant_id === config?.variantId);
  if (!lines.length) return true;
  const unitPrice = lines[0].original_price;
  const discounted = lines.reduce(
    (/** @type {number} */ sum, /** @type {any} */ item) => sum + (item.original_line_price - item.final_line_price),
    0
  );
  return discounted >= unitPrice;
}

async function sync() {
  if (!config) return;

  let cart = await getCart();
  let sections;
  let changed = false;

  const wanted = config.enabled && config.available && config.variantId && !giftWasNotFree();
  const hasOtherItems = cart.items.some((/** @type {any} */ item) => !isGiftLine(item));

  // Remove gift lines that should not be there: feature off, gift sold out or replaced by
  // another product in the settings, or nothing else left in the cart. Keep at most one.
  // Walk from the end, since removing a line shifts the indexes of the ones after it.
  let keptGift = false;
  for (let index = cart.items.length - 1; index >= 0; index -= 1) {
    const item = cart.items[index];
    if (!isGiftLine(item)) continue;
    const keep = wanted && hasOtherItems && item.variant_id === config.variantId && !keptGift;
    if (keep) {
      keptGift = true;
      if (item.quantity !== 1) {
        ({ sections, ...cart } = await changeLine(index + 1, 1));
        changed = true;
      }
      continue;
    }
    ({ sections, ...cart } = await changeLine(index + 1, 0));
    changed = true;
  }

  if (wanted && hasOtherItems && !keptGift) {
    // cart/add.js returns the added items, not the cart, but its sections are rendered for the
    // updated cart, so they can be used as is.
    ({ sections } = await postCart(Theme.routes.cart_add_url, {
      items: [{ id: config.variantId, quantity: 1, properties: { [GIFT_PROPERTY]: '1' } }],
    }));
    cart = await getCart();
    changed = true;
    keptGift = true;
  }

  // Also re-checked for a gift that was already in the cart, e.g. when the discount ended.
  if (keptGift && !giftIsFree(cart)) {
    console.warn('[gift-with-purchase] gift is not free in the cart (check the automatic discount); removing it');
    rememberGiftNotFree();
    const index = cart.items.findIndex((/** @type {any} */ item) => isGiftLine(item));
    if (index !== -1) {
      ({ sections, ...cart } = await changeLine(index + 1, 0));
      changed = true;
    }
  }

  if (changed) announce(cart, sections);
}

// Serialise syncs: a burst of cart events collapses into one run after the current one.
let running = Promise.resolve();
let queued = false;
function scheduleSync() {
  if (queued) return;
  queued = true;
  running = running.then(async () => {
    queued = false;
    try {
      await sync();
    } catch (error) {
      console.warn('[gift-with-purchase]', error);
    }
  });
}

// Our own update must not pop the cart drawer open (it opens on every cart:update when it has
// auto-open), e.g. when the gift is fixed up on page load.
document.addEventListener(
  ThemeEvents.cartUpdate,
  (event) => {
    if (/** @type {CustomEvent} */ (event).detail?.data?.source !== SOURCE) return;
    const drawer = document.querySelector('cart-drawer-component');
    if (!drawer?.hasAttribute('auto-open') || drawer.querySelector('dialog[open]')) return;
    drawer.removeAttribute('auto-open');
    setTimeout(() => drawer.setAttribute('auto-open', ''), 0);
  },
  { capture: true }
);

document.addEventListener(ThemeEvents.cartUpdate, (event) => {
  const detail = /** @type {CustomEvent} */ (event).detail;
  if (detail?.data?.source === SOURCE || detail?.data?.didError) return;
  scheduleSync();
});

if (config?.needsSync) scheduleSync();
