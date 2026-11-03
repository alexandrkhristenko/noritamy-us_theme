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
 * snippets/gift-with-purchase.liquid into #gift-with-purchase-config.
 *
 * The script has no static imports, so it also runs outside the theme layout, e.g. on Shopeaks
 * app proxy pages (layout/shopeaks.liquid), which have no importmap and render their own cart
 * UI. There ("standalone" in the config) it watches the page's own cart requests instead of the
 * theme's cart events.
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
 * @property {boolean} [standalone] - Rendered outside the theme layout (no theme modules).
 * @property {{ cart: string, add: string, change: string }} routes
 * @property {string} [badge] - Badge text shown on the gift line (standalone pages).
 * @property {string} [productTitle] - Gift product title, to find its line in a foreign cart UI.
 */

const CART_UPDATE_EVENT = 'cart:update';
const SHOPEAKS_SYNC_EVENT = 'shopeaks:sync-shopify-cart';
const CART_REQUEST = /\/cart\/(add|change|update|clear)(\.js)?(\?|$)/;

/** The page's fetch before it is wrapped in standalone mode, so our own requests are not watched. */
const nativeFetch = window.fetch.bind(window);

/** @param {string} body */
function fetchConfig(body) {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body,
  };
}

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
  const response = await nativeFetch(url, fetchConfig(body));
  const json = await response.json();
  if (!response.ok || json.status) throw new Error(json.description || json.message || 'Cart request failed');
  return json;
}

/** @param {number} line @param {number} quantity */
function changeLine(line, quantity) {
  if (!config) throw new Error('No config');
  return postCart(config.routes.change, { line, quantity });
}

async function getCart() {
  if (!config) throw new Error('No config');
  const response = await nativeFetch(`${config.routes.cart}.js`, { headers: { Accept: 'application/json' } });
  return response.json();
}

/**
 * Tells the rest of the theme (cart drawer/page, cart bubble) that the cart changed.
 * @param {any} cart
 * @param {Record<string, string> | undefined} sections
 */
async function announce(cart, sections) {
  if (config?.standalone) {
    // Shopeaks keeps its own copy of the cart. Its app re-reads /cart.js on this event (it is
    // what it listens to for the BOGOS gift app), so the gift shows without a page reload.
    document.dispatchEvent(new CustomEvent(SHOPEAKS_SYNC_EVENT));
    return;
  }
  const { CartUpdateEvent } = await import('@theme/events');
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
    ({ sections } = await postCart(config.routes.add, {
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

  rememberGiftDiscountTitles(cart);
  if (changed) await announce(cart, sections);
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

/**
 * Standalone pages (Shopeaks) change the cart with their own fetch/XHR calls and fire no theme
 * events, so sync after each successful cart request they make.
 */
function watchCartRequests() {
  /** @param {unknown} url */
  const isCartRequest = (url) => {
    try {
      return CART_REQUEST.test(new URL(String(url), window.location.href).pathname);
    } catch {
      return false;
    }
  };

  window.fetch = function (input, init) {
    const url = input instanceof Request ? input.url : input;
    const request = nativeFetch(input, init);
    if (isCartRequest(url)) {
      request.then((response) => response.ok && scheduleSync()).catch(() => {});
    }
    return request;
  };

  const open = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function (/** @type {string} */ method, /** @type {string | URL} */ url, ...rest) {
    if (isCartRequest(url)) {
      this.addEventListener('load', () => this.status >= 200 && this.status < 300 && scheduleSync());
    }
    // @ts-ignore - forwards the optional async/user/password arguments as given.
    return open.call(this, method, url, ...rest);
  };
}

/**
 * Titles of the discounts on the gift variant's lines (the automatic "Buy X get Y"). Shopeaks
 * lists them under every line the discount touches, including the paid ones at $0 off.
 * @type {Set<string>}
 */
const giftDiscountTitles = new Set();

/** @param {any} cart */
function rememberGiftDiscountTitles(cart) {
  for (const item of cart.items) {
    if (item.variant_id !== config?.variantId) continue;
    for (const allocation of item.line_level_discount_allocations || []) {
      const title = allocation.discount_application?.title;
      if (title) giftDiscountTitles.add(title.trim().toLowerCase());
    }
  }
  scheduleDecorate();
}

const BADGE_ATTRIBUTE = 'data-gift-with-purchase-badge';
const HIDDEN_ATTRIBUTE = 'data-gift-with-purchase-hidden';

/**
 * Shopeaks cart drawer, as in the theme cart: a badge on the gift line, and the gift discount's
 * title hidden on all lines. Shopeaks renders its own React UI, so only its stable class
 * (.cart-cart-drawer-content, one child per line) and the text are relied on; if its markup
 * changes, the drawer just looks as it does without this.
 */
function decorateShopeaksCart() {
  if (!config?.badge || !config.productTitle) return;
  const productTitle = config.productTitle.trim().toLowerCase();

  document.querySelectorAll('.cart-cart-drawer-content > *').forEach((row) => {
    const texts = Array.from(row.querySelectorAll('p')).filter((p) => !p.hasAttribute(BADGE_ATTRIBUTE));
    const title = texts[0];
    if (!title) return;

    for (const text of texts) {
      const label = text.textContent?.trim().toLowerCase();
      if (!label || !giftDiscountTitles.has(label)) continue;
      const container = text.parentElement;
      if (container && container !== row && !container.hasAttribute(HIDDEN_ATTRIBUTE)) {
        container.setAttribute(HIDDEN_ATTRIBUTE, '');
        container.style.display = 'none';
      }
    }

    // The gift line: the gift product at $0. A pair the customer pays for keeps no badge.
    const isGift =
      title.textContent?.trim().toLowerCase() === productTitle &&
      texts.some((text) => /^\D*0([.,]00)?\D*$/.test(text.textContent?.trim() || ''));
    const badge = row.querySelector(`[${BADGE_ATTRIBUTE}]`);
    if (isGift && !badge) {
      const element = document.createElement('p');
      element.setAttribute(BADGE_ATTRIBUTE, '');
      element.textContent = config?.badge || '';
      Object.assign(element.style, {
        display: 'inline-block',
        width: 'fit-content',
        margin: '6px 0 0',
        padding: '2px 8px',
        borderRadius: '4px',
        backgroundColor: '#000',
        color: '#fff',
        fontSize: '0.75rem',
        fontWeight: '600',
        letterSpacing: '0.02em',
        lineHeight: '1.5',
        textTransform: 'uppercase',
      });
      // After the title's own row (title and price side by side), not inside it.
      const anchor = title.parentElement && title.parentElement !== row ? title.parentElement : title;
      anchor.insertAdjacentElement('afterend', element);
    } else if (!isGift && badge) {
      badge.remove();
    }
  });
}

let decorateQueued = false;
function scheduleDecorate() {
  if (!config?.standalone || decorateQueued) return;
  decorateQueued = true;
  requestAnimationFrame(() => {
    decorateQueued = false;
    decorateShopeaksCart();
  });
}

if (config?.standalone) {
  watchCartRequests();
  new MutationObserver(scheduleDecorate).observe(document.documentElement, { childList: true, subtree: true });
  // Reads the cart once, also for the discount titles, even when nothing needs fixing.
  if (!config.needsSync) scheduleSync();
} else {
  // Our own update must not pop the cart drawer open (it opens on every cart:update when it has
  // auto-open), e.g. when the gift is fixed up on page load.
  document.addEventListener(
    CART_UPDATE_EVENT,
    (event) => {
      if (/** @type {CustomEvent} */ (event).detail?.data?.source !== SOURCE) return;
      const drawer = document.querySelector('cart-drawer-component');
      if (!drawer?.hasAttribute('auto-open') || drawer.querySelector('dialog[open]')) return;
      drawer.removeAttribute('auto-open');
      setTimeout(() => drawer.setAttribute('auto-open', ''), 0);
    },
    { capture: true }
  );

  document.addEventListener(CART_UPDATE_EVENT, (event) => {
    const detail = /** @type {CustomEvent} */ (event).detail;
    if (detail?.data?.source === SOURCE || detail?.data?.didError) return;
    scheduleSync();
  });
}

if (config?.needsSync) scheduleSync();
