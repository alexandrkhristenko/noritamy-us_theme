import { CartAddEvent } from '@theme/events';

/*
  Landing page behaviour (sections/landing-range.liquid and sections/landing-looks.liquid).

  All product data is rendered into the page as JSON by snippets/landing-product-data.liquid, so
  nothing here fetches a product. Adding one piece to the cart submits the theme's own
  product-form-component; only "add the look" posts to /cart/add.js itself, because that is several
  products in one request, and it then dispatches the same cart event the theme's form does.
*/

const LETTER_KEY = 'noritamy:landing-letter';

/** @returns {string} */
function storedLetter() {
  try {
    return window.localStorage.getItem(LETTER_KEY) || '';
  } catch (error) {
    return '';
  }
}

/** @param {string} letter */
function storeLetter(letter) {
  try {
    window.localStorage.setItem(LETTER_KEY, letter);
  } catch (error) {
    // Private mode or blocked storage: the letter is simply not remembered.
  }
}

/**
 * Formats cents with the shop's money format, without ".00" on whole amounts.
 * @param {number} cents
 * @param {string} format - e.g. "${{amount}}"
 */
function formatMoney(cents, format) {
  const amount = cents / 100;
  const value = Number.isInteger(amount)
    ? amount.toLocaleString('en-US')
    : amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pattern = /\{\{\s*amount[a-z_]*\s*\}\}/;
  return pattern.test(format) ? format.replace(pattern, value) : `$${value}`;
}

/**
 * One list of materials across the card's products, so a second product (e.g. the sterling silver
 * earring) is just one more swatch.
 * @param {any[]} products
 */
function flattenMaterials(products) {
  const materials = products.flatMap((product) => product.materials.map((material) => ({ ...material, product })));
  // The material a piece opens on (gold) always comes first, whatever order the product lists them in.
  return materials.sort((a, b) => Number(b.default) - Number(a.default));
}

/**
 * The material a card or look piece opens on.
 * @param {any[]} materials
 */
function defaultIndex(materials) {
  return Math.max(0, materials.findIndex((material) => material.default));
}

/**
 * @param {any} material - Entry from flattenMaterials
 * @param {string} letter - '' when the product has no letter option
 */
function findVariant(material, letter) {
  const matches = material.product.variants.filter(
    (/** @type {any} */ variant) => variant.m === material.value && variant.l === letter
  );
  return matches.find((/** @type {any} */ variant) => variant.a) || matches[0] || null;
}

/**
 * The remembered letter, when this material can actually be bought in it.
 * @param {any} material
 */
function rememberedLetter(material) {
  const letter = storedLetter();
  return letter && findVariant(material, letter)?.a ? letter : '';
}

/** Lets the page scroll again, unless another dialog (the cart drawer) is still open. */
function releaseScrollLock() {
  if (document.querySelector('dialog[open]')) return;
  document.documentElement.removeAttribute('scroll-lock');
}

/**
 * Price of pieces bought together under the shop's "second piece" discount: the lower-priced piece
 * of each pair gets the percentage off.
 * @param {number[]} prices - in cents
 * @param {number} percent
 */
function lookTotals(prices, percent) {
  const separate = prices.reduce((sum, price) => sum + price, 0);
  const saving = [...prices]
    .sort((a, b) => a - b)
    .slice(0, Math.floor(prices.length / 2))
    .reduce((sum, price) => sum + Math.round((price * percent) / 100), 0);
  return { separate, together: separate - saving, saving };
}

/** @param {any} material */
function firstVariant(material) {
  const variants = material.product.variants.filter((variant) => variant.m === material.value);
  return variants.find((variant) => variant.a) || variants[0] || null;
}

/**
 * @param {HTMLElement} container
 * @param {{ s: string, l: string, a: string }[]} images
 * @param {'s' | 'l'} size
 * @param {boolean} [eagerFirst] - Load the first photo straight away (the open dialog)
 */
function fillSlides(container, images, size, eagerFirst = false) {
  container.replaceChildren(
    ...images.map((image, index) => {
      if (image.v) {
        const video = slideVideo(image, size);
        video.dataset.index = String(index);
        return video;
      }
      const img = document.createElement('img');
      img.src = image[size];
      img.alt = image.a;
      img.loading = eagerFirst && index === 0 ? 'eager' : 'lazy';
      img.decoding = 'async';
      img.dataset.index = String(index);
      return img;
    })
  );
  container.scrollLeft = 0;
}

/**
 * A product video as a slide: silent and looping, and it downloads nothing until its slide is the
 * one on screen (see Gallery).
 * @param {{ v: string, s: string, l: string, a: string }} media
 * @param {'s' | 'l'} size - poster size
 */
function slideVideo(media, size) {
  const video = document.createElement('video');
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = 'none';
  video.poster = media[size];
  video.src = (size === 's' && media.vs) || media.v;
  video.setAttribute('muted', '');
  video.setAttribute('aria-label', media.a);
  return video;
}

/**
 * Starts fetching a row's video ahead of the swipe, so it plays at once when its slide arrives.
 * 'metadata' is a few kilobytes (used when a card comes on screen); 'auto' buffers the video itself
 * (used once a card's photo row starts to move or a mouse rests on the card, and in the quick view).
 * @param {HTMLElement} slides
 * @param {'metadata' | 'auto'} level
 */
function warmSlideVideo(slides, level) {
  slides.querySelectorAll('video').forEach((video) => {
    if (video.preload === 'auto' || video.preload === level) return;
    video.preload = level;
    // Never restart a video that is already playing or has data.
    if (level === 'auto' && video.paused && video.readyState < 2) video.load();
  });
}

/** @param {any[]} images @param {number} index */
function mediaType(images, index) {
  return images[index]?.v ? 'video' : 'photo';
}

/**
 * Plays the video on the given slide and pauses every other one in the row.
 * @param {HTMLElement} slides
 * @param {number} active - index of the slide on screen, or -1 to pause them all
 */
function playSlideVideo(slides, active) {
  Array.from(slides.children).forEach((slide, index) => {
    const video = slide instanceof HTMLVideoElement ? slide : slide.querySelector('video');
    if (!video) return;
    if (index === active) video.play().catch(() => {});
    else video.pause();
  });
}

/**
 * Keeps the dots and arrows of a swipeable photo row in step with its scroll position.
 */
class Gallery {
  /**
   * @param {HTMLElement} slides
   * @param {HTMLElement} dots
   * @param {HTMLButtonElement | null} previous
   * @param {HTMLButtonElement | null} next
   * @param {(index: number) => void} [onSwipe]
   */
  constructor(slides, dots, previous, next, onSwipe) {
    this.slides = slides;
    this.dots = dots;
    this.previous = previous;
    this.next = next;
    this.onSwipe = onSwipe;
    this.index = 0;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    this.settle = undefined;

    let frame = 0;
    slides.addEventListener(
      'scroll',
      () => {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => this.#syncIndex());
      },
      { passive: true }
    );
    previous?.addEventListener('click', () => this.#step(-1));
    next?.addEventListener('click', () => this.#step(1));
  }

  /** Call after the slides change. */
  refresh() {
    const count = this.slides.children.length;
    this.index = 0;
    clearTimeout(this.settle);
    this.dots.replaceChildren(
      ...Array.from({ length: count > 1 ? count : 0 }, () => document.createElement('span'))
    );
    if (this.previous) this.previous.hidden = count < 2;
    if (this.next) this.next.hidden = count < 2;
    this.#paintDots();
  }

  /**
   * Shows a given slide straight away, without counting it as a swipe.
   * @param {number} index
   */
  jumpTo(index) {
    this.slides.scrollLeft = index * this.slides.clientWidth;
    this.index = index;
    clearTimeout(this.settle);
    this.#paintDots();
    playSlideVideo(this.slides, index);
  }

  /** @param {number} direction */
  #step(direction) {
    const count = this.slides.children.length;
    const target = (this.index + direction + count) % count;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.slides.scrollTo({ left: target * this.slides.clientWidth, behavior: reduced ? 'auto' : 'smooth' });
  }

  #syncIndex() {
    const width = this.slides.clientWidth || 1;
    const index = Math.round(Math.abs(this.slides.scrollLeft) / width);
    if (index === this.index) return;
    this.index = index;
    this.#paintDots();
    playSlideVideo(this.slides, index);
    // Report once the row has come to rest, so a fling or a wrap-around counts as one swipe.
    clearTimeout(this.settle);
    this.settle = setTimeout(() => this.onSwipe?.(this.index), 200);
  }

  #paintDots() {
    Array.from(this.dots.children).forEach((dot, index) => {
      dot.setAttribute('aria-current', index === this.index ? 'true' : 'false');
    });
  }
}

// Same value as snippets/collection-tile-tracking.liquid, so landing cards and collection tiles
// share GA4 dimensions and the existing GTM tags.
const TRACKING_VERSION = 'v2_tile_tracking';

// Tag Manager keeps the last value of every data layer key, so each event states all of the
// page-specific fields, null when they do not apply, and none leaks into the next event.
const EVENT_FIELDS = {
  position_served: null,
  position_shown: null,
  personalized: null,
  tile_product_id: null,
  tile_price: null,
  tile_discount_pct: null,
  tile_on_sale: null,
  tile_material: null,
  tile_letter: null,
  tile_window: null,
  tile_click_source: null,
  tile_collection: null,
  media_type: null,
  details_name: null,
  section_name: null,
  section_index: null,
  link_text: null,
  link_url: null,
  error_message: null,
  image_index: null,
  filter_value: null,
  look_name: null,
  look_pieces: null,
  look_value: null,
  look_saving: null,
};

/** @param {Record<string, unknown>} payload */
function pushDataLayer(payload) {
  const host = /** @type {any} */ (window);
  host.dataLayer = host.dataLayer || [];
  host.dataLayer.push(payload.event ? { ...EVENT_FIELDS, ...payload } : payload);
}

/** @param {number} cents */
function toUnits(cents) {
  return Math.round(cents) / 100;
}

/** @type {WeakMap<HTMLElement, { materials: any[], onPick: (index: number) => void }>} */
const swatchState = new WeakMap();

/**
 * @param {HTMLElement} container
 * @param {any[]} materials
 * @param {number} selected
 * @param {(index: number) => void} onPick
 */
function renderSwatches(container, materials, selected, onPick) {
  // Same materials as last time: only move the pressed state, so keyboard focus stays on the swatch.
  const state = swatchState.get(container);
  if (state && state.materials === materials && container.children.length === materials.length) {
    state.onPick = onPick;
    Array.from(container.children).forEach((button, index) => {
      button.setAttribute('aria-pressed', index === selected ? 'true' : 'false');
    });
    return;
  }
  swatchState.set(container, { materials, onPick });
  container.replaceChildren(
    ...materials.map((material, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'landing-swatch';
      button.title = material.label;
      button.setAttribute('aria-label', material.label);
      button.setAttribute('aria-pressed', index === selected ? 'true' : 'false');
      const chip = document.createElement('span');
      chip.style.setProperty('--landing-swatch', material.swatch);
      button.append(chip);
      button.addEventListener('click', () => swatchState.get(container)?.onPick(index));
      return button;
    })
  );
}

/**
 * @param {HTMLElement} element
 * @param {number} price
 * @param {number} compare
 * @param {string} format
 */
function renderPrice(element, price, compare, format) {
  element.replaceChildren();
  if (compare > price) {
    const was = document.createElement('s');
    was.className = 'compare-at-price';
    was.textContent = formatMoney(compare, format);
    element.append(was);
  }
  const now = document.createElement('span');
  now.textContent = formatMoney(price, format);
  element.append(now);
}

/**
 * Full-screen photos. A click or tap on a photo enlarges it to twice the size, centred on that spot;
 * another click brings it back.
 */
class Zoom {
  /** @param {HTMLDialogElement} dialog */
  constructor(dialog) {
    this.dialog = dialog;
    this.slides = /** @type {HTMLElement} */ (dialog.querySelector('[data-zoom-slides]'));
    this.gallery = new Gallery(
      this.slides,
      /** @type {HTMLElement} */ (dialog.querySelector('[data-zoom-dots]')),
      dialog.querySelector('[data-zoom-prev]'),
      dialog.querySelector('[data-zoom-next]'),
      () => this.#reset()
    );
    dialog.querySelector('[data-close]')?.addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => {
      playSlideVideo(this.slides, -1);
      releaseScrollLock();
    });
    this.slides.addEventListener('click', (event) => this.#toggle(/** @type {MouseEvent} */ (event)));
  }

  /**
   * @param {{ s: string, l: string, a: string }[]} images
   * @param {number} index
   * @returns {boolean} whether the viewer opened
   */
  open(images, index) {
    if (!images.length) return false;
    this.slides.replaceChildren(
      ...images.map((image, position) => {
        const frame = document.createElement('div');
        frame.className = 'landing-zoom__frame';
        if (image.v) {
          const video = slideVideo(/** @type {any} */ (image), 'l');
          video.controls = true;
          frame.classList.add('landing-zoom__frame--video');
          frame.append(video);
          return frame;
        }
        const img = document.createElement('img');
        // Ask Shopify's image CDN for a larger copy, so the photo stays sharp at twice the size.
        img.src = image.l.replace(/([?&]width=)\d+/, (_match, prefix) => `${prefix}2400`);
        img.alt = image.a;
        img.decoding = 'async';
        img.loading = position === index ? 'eager' : 'lazy';
        frame.append(img);
        return frame;
      })
    );
    this.dialog.showModal();
    document.documentElement.setAttribute('scroll-lock', '');
    this.gallery.refresh();
    this.gallery.jumpTo(index);
    return true;
  }

  #reset() {
    this.slides.querySelectorAll('.is-zoomed').forEach((frame) => frame.classList.remove('is-zoomed'));
  }

  /** @param {MouseEvent} event */
  #toggle(event) {
    const frame = /** @type {HTMLElement | null} */ (
      event.target instanceof Element ? event.target.closest('.landing-zoom__frame') : null
    );
    if (!frame || frame.classList.contains('landing-zoom__frame--video')) return;
    if (frame.classList.contains('is-zoomed')) {
      frame.classList.remove('is-zoomed');
      return;
    }
    const box = frame.getBoundingClientRect();
    const x = (event.clientX - box.left) / box.width;
    const y = (event.clientY - box.top) / box.height;
    frame.classList.add('is-zoomed');
    frame.scrollLeft = x * frame.scrollWidth - box.width / 2;
    frame.scrollTop = y * frame.scrollHeight - box.height / 2;
  }
}

class Card {
  /**
   * @param {HTMLElement} element
   * @param {Range} range
   */
  constructor(element, range) {
    this.element = element;
    this.range = range;
    const data = JSON.parse(element.querySelector('[data-card-json]')?.textContent || '{"products":[]}');
    this.materials = flattenMaterials(data.products);
    this.selected = defaultIndex(this.materials);
    this.group = element.dataset.groupLabel || '';

    this.slides = /** @type {HTMLElement} */ (element.querySelector('[data-slides]'));
    this.photoNote = /** @type {HTMLElement} */ (element.querySelector('[data-photo-note]'));
    this.swatches = /** @type {HTMLElement} */ (element.querySelector('[data-swatches]'));
    this.materialLabel = /** @type {HTMLElement} */ (element.querySelector('[data-material-label]'));
    this.price = /** @type {HTMLElement} */ (element.querySelector('[data-price]'));
    this.detailsLink = /** @type {HTMLAnchorElement | null} */ (element.querySelector('[data-details-link]'));
    this.formHome = /** @type {HTMLElement} */ (element.querySelector('[data-form-home]'));
    this.form = /** @type {HTMLElement} */ (this.formHome.querySelector('product-form-component'));

    this.gallery = new Gallery(
      this.slides,
      /** @type {HTMLElement} */ (element.querySelector('[data-dots]')),
      element.querySelector('[data-prev]'),
      element.querySelector('[data-next]'),
      (index) =>
        range.track('tile_image_swipe', this, {
          image_index: index + 1,
          media_type: mediaType(this.material.images, index),
          tile_window: 'card',
        })
    );
    /** @type {'' | 'metadata' | 'auto'} */
    this.warm = '';
    // Buffer the video only on a real sign that its slide is next: the photo row starts to move
    // (a swipe, the arrow keys), an arrow is pressed, or a mouse rests on the card. A finger landing
    // on the card is not one, since on a phone that is how every page scroll starts.
    const warmUp = () => this.warmVideo('auto');
    this.slides.addEventListener(
      'scroll',
      () => {
        if (this.slides.scrollLeft !== 0) warmUp();
      },
      { passive: true }
    );
    element.querySelectorAll('[data-prev], [data-next]').forEach((arrow) => {
      arrow.addEventListener('pointerdown', warmUp);
    });
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let hover;
    element.addEventListener('pointerenter', (event) => {
      if (/** @type {PointerEvent} */ (event).pointerType !== 'mouse') return;
      hover = setTimeout(warmUp, 200);
    });
    element.addEventListener('pointerleave', () => clearTimeout(hover));

    // A photo opens the full quick view, where it can be enlarged; the same as "See details".
    const openFromPhoto = () => range.quickView.open(this, 'details', 'image', this.gallery.index);
    this.slides.addEventListener('click', openFromPhoto);
    this.slides.addEventListener('keydown', (event) => {
      if (event.target !== this.slides || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      openFromPhoto();
    });
    element.querySelectorAll('[data-open-quick-view]').forEach((opener) => {
      opener.addEventListener('click', (event) => {
        // The details link is a real link to the product page: for when this script has not run,
        // and for opening the product in a new tab.
        const mouse = /** @type {MouseEvent} */ (event);
        if (mouse.metaKey || mouse.ctrlKey || mouse.shiftKey || mouse.altKey) return;
        event.preventDefault();
        const mode = /** @type {HTMLElement} */ (opener).dataset.openQuickView === 'details' ? 'details' : 'quick';
        range.quickView.open(this, mode, /** @type {HTMLElement} */ (opener).dataset.clickSource || 'button');
      });
    });
    this.render();
  }

  get material() {
    return this.materials[this.selected];
  }

  /** @param {'metadata' | 'auto'} level */
  warmVideo(level) {
    if (this.warm === 'auto' || this.warm === level) return;
    this.warm = level;
    warmSlideVideo(this.slides, level);
  }

  /** @param {number} index */
  select(index) {
    if (index === this.selected || !this.materials[index]) return;
    this.selected = index;
    this.render();
    this.range.track('tile_variant_select', this);
  }

  render() {
    const material = this.material;
    if (!material) return;

    fillSlides(this.slides, material.images, 's');
    if (this.warm) warmSlideVideo(this.slides, this.warm);
    this.gallery.refresh();
    this.range.paintPhotoNote(this.photoNote, material, this.materials[defaultIndex(this.materials)]);

    this.swatches.hidden = this.materials.length < 2;
    if (!this.swatches.hidden) {
      renderSwatches(this.swatches, this.materials, this.selected, (index) => this.select(index));
    }
    this.materialLabel.textContent = material.label;
    renderPrice(this.price, material.price, material.compare, this.range.moneyFormat);

    const variant = firstVariant(material);
    if (this.detailsLink) this.detailsLink.href = variant ? `${material.product.url}?variant=${variant.id}` : material.product.url;
  }
}

class QuickView {
  /** @param {Range} range */
  constructor(range) {
    this.range = range;
    const dialog = /** @type {HTMLDialogElement} */ (range.root.querySelector('[data-quick-view]'));
    this.dialog = dialog;
    /** @type {Card | null} */
    this.card = null;
    this.letter = '';

    /** @param {string} name */
    const find = (name) => /** @type {HTMLElement} */ (dialog.querySelector(`[data-qv-${name}]`));
    this.slides = find('slides');
    this.photoNote = find('photo-note');
    this.group = find('group');
    this.title = find('title');
    this.note = find('note');
    this.price = find('price');
    this.materialBlock = find('material-block');
    this.materialLabel = find('material-label');
    this.swatches = find('swatches');
    this.letterBlock = find('letter-block');
    this.letterName = find('letter-name');
    this.letterValue = find('letter-value');
    this.letters = find('letters');
    this.formSlot = find('form-slot');
    this.materialsProduct = find('materials-product');
    this.fullLink = /** @type {HTMLAnchorElement} */ (find('full-link'));
    this.error = find('error');
    /** @type {any} */
    this.lettersProduct = null;

    // The page's standing promises are written once, in the "Landing standard" section; show the
    // same lines here so they are seen by shoppers who never scroll that far.
    const standard = document.querySelector('[data-landing-standard]');
    const standardSlot = find('standard');
    if (standard && standardSlot) {
      standardSlot.replaceChildren(...Array.from(standard.children).map((child) => child.cloneNode(true)));
      // The copies must not look like editable blocks to the theme editor.
      standardSlot.querySelectorAll('[data-shopify-editor-block]').forEach((element) => {
        element.removeAttribute('data-shopify-editor-block');
      });
      standardSlot.hidden = false;
    }

    this.gallery = new Gallery(
      this.slides,
      find('dots'),
      /** @type {HTMLButtonElement} */ (find('prev')),
      /** @type {HTMLButtonElement} */ (find('next')),
      (index) => {
        if (!this.card) return;
        range.track('tile_image_swipe', this.card, {
          image_index: index + 1,
          media_type: mediaType(this.card.material.images, index),
          tile_window: this.windowName,
        });
      }
    );

    dialog.querySelectorAll('details[data-details-name]').forEach((details) => {
      details.addEventListener('toggle', () => {
        const element = /** @type {HTMLDetailsElement} */ (details);
        if (!element.open || !this.card) return;
        range.track('tile_details_open', this.card, { details_name: element.dataset.detailsName });
      });
    });
    this.fullLink.addEventListener('click', () => {
      if (!this.card) return;
      range.track('landing_link_click', this.card, {
        item_variant: this.#variant()?.id,
        section_name: 'quick_view',
        link_text: (this.fullLink.textContent || '').trim().slice(0, 60),
        link_url: this.fullLink.getAttribute('href'),
      });
    });

    dialog.querySelector('[data-close]')?.addEventListener('click', () => dialog.close());
    const zoom = () => {
      if (!this.card || !range.zoom.open(this.card.material.images, this.gallery.index)) return;
      playSlideVideo(this.slides, -1);
      range.track('tile_image_zoom', this.card, {
        image_index: this.gallery.index + 1,
        media_type: mediaType(this.card.material.images, this.gallery.index),
      });
    };
    this.slides.addEventListener('click', zoom);
    this.slides.addEventListener('keydown', (event) => {
      if (event.target !== this.slides || (event.key !== 'Enter' && event.key !== ' ')) return;
      event.preventDefault();
      zoom();
    });
    dialog.querySelector('[data-qv-more]')?.addEventListener('click', () => {
      dialog.dataset.mode = 'details';
      warmSlideVideo(this.slides, 'auto');
      this.title.focus();
      if (this.card) {
        range.track('select_item', this.card, { item_variant: this.#variant()?.id, tile_click_source: 'quick_add' });
      }
    });
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener('close', () => this.#release());

    // The theme's form reports a finished add on the document; close once this card's form succeeds.
    /** @param {Event} event */
    const onCartUpdate = (event) => {
      if (!dialog.isConnected) {
        // The theme editor replaced this section; let go of the old dialog.
        document.removeEventListener('cart:update', onCartUpdate);
        window.removeEventListener('cart:error', onCartError);
        return;
      }
      if (!this.card || !(event.target instanceof Node) || !this.card.form.contains(event.target)) return;
      const detail = /** @type {any} */ (event).detail;
      if (detail?.data?.didError) return;
      if (this.letter) storeLetter(this.letter);
      range.track('tile_add_to_cart', this.card, {
        item_variant: this.#variant()?.id,
        tile_letter: this.letter || null,
        tile_window: this.windowName,
      });
      dialog.close();
    };
    // A refused add (sold out meanwhile, quantity limit) only reaches the theme's hidden live region.
    /** @param {Event} event */
    const onCartError = (event) => {
      if (!this.card || !dialog.open) return;
      const message = /** @type {any} */ (event).detail?.data?.message;
      this.error.textContent = message || range.labels.error;
      this.error.hidden = false;
      range.track('landing_error', this.card, {
        item_variant: this.#variant()?.id,
        error_message: String(message || 'add to cart failed').slice(0, 100),
        tile_window: this.windowName,
      });
    };
    document.addEventListener('cart:update', onCartUpdate);
    window.addEventListener('cart:error', onCartError);
  }

  /**
   * @param {Card} card
   * @param {'quick' | 'details'} mode - 'quick' is only the material and letter choice; 'details'
   *   adds the photos, materials and shipping.
   * @param {string} [source] - what was clicked: 'image', 'button' or 'title'
   * @param {number} [photo] - photo to open on (the one showing on the card)
   */
  open(card, mode, source = 'button', photo = 0) {
    this.card = card;
    this.dialog.dataset.mode = mode;
    this.letter = rememberedLetter(card.material);
    this.error.hidden = true;

    this.formSlot.append(card.form);
    playSlideVideo(card.slides, -1);
    this.render(true);
    this.dialog.showModal();
    document.documentElement.setAttribute('scroll-lock', '');
    if (photo > 0) this.gallery.jumpTo(photo);
    // "See details" is this page's click-through; the short window is the quick add.
    this.range.track(mode === 'details' ? 'select_item' : 'tile_quick_add_open', card, {
      item_variant: this.#variant()?.id,
      tile_click_source: source,
    });
  }

  /**
   * Where the shopper is, as every event's tile_window reports it: 'quick_add' (the short window
   * with only material and letter) or 'details' (the full quick view). Events on the page itself
   * use 'card'.
   * @returns {'quick_add' | 'details'}
   */
  get windowName() {
    return this.dialog.dataset.mode === 'details' ? 'details' : 'quick_add';
  }

  /** Puts the card's form back where it lives and resets it for the next open. */
  #release() {
    playSlideVideo(this.slides, -1);
    releaseScrollLock();
    this.dialog.querySelectorAll('details[open]').forEach((details) => details.removeAttribute('open'));
    if (!this.card) return;
    // The card's own video was paused while the dialog was open.
    playSlideVideo(this.card.slides, this.card.gallery.index);
    this.card.formHome.append(this.card.form);
    this.card = null;
  }

  #variant() {
    if (!this.card) return null;
    const material = this.card.material;
    return material.product.letters.length ? findVariant(material, this.letter) : firstVariant(material);
  }

  /** @param {boolean} resetPhotos */
  render(resetPhotos) {
    const card = this.card;
    if (!card) return;
    const material = card.material;
    const { product } = material;
    const range = this.range;

    if (resetPhotos) {
      fillSlides(this.slides, material.images, 'l', true);
      if (this.dialog.dataset.mode === 'details') warmSlideVideo(this.slides, 'auto');
      this.gallery.refresh();
      range.paintPhotoNote(this.photoNote, material, card.materials[defaultIndex(card.materials)]);
    }

    this.group.textContent = card.group;
    this.group.hidden = !card.group;
    this.title.textContent = product.title;
    this.note.textContent = product.note;
    this.note.hidden = !product.note;

    this.materialBlock.hidden = card.materials.length < 2;
    this.materialLabel.textContent = material.label;
    renderSwatches(this.swatches, card.materials, card.selected, (index) => {
      card.select(index);
      if (!card.material.product.letters.includes(this.letter)) this.letter = '';
      this.error.hidden = true;
      this.render(true);
    });

    const hasLetters = product.letters.length > 0;
    this.letterBlock.hidden = !hasLetters;
    this.letterName.textContent = range.labels.letter;
    this.letterValue.textContent = this.letter ? ` · ${this.letter}` : '';
    this.letters.setAttribute('aria-label', range.labels.letter);
    // Build the letter buttons once per product, then only update them, so focus is never lost.
    if (this.lettersProduct !== product) {
      this.lettersProduct = product;
      this.letters.replaceChildren(
        ...product.letters.map((/** @type {string} */ letter) => {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'landing-letter';
          button.textContent = letter;
          button.addEventListener('click', () => {
            this.letter = letter;
            this.error.hidden = true;
            this.render(false);
            if (this.card) {
              range.track('tile_letter_select', this.card, {
                item_variant: this.#variant()?.id,
                tile_letter: letter,
                tile_window: this.windowName,
              });
            }
          });
          return button;
        })
      );
    }
    Array.from(this.letters.children).forEach((child) => {
      const button = /** @type {HTMLButtonElement} */ (child);
      const letter = button.textContent || '';
      button.setAttribute('aria-pressed', letter === this.letter ? 'true' : 'false');
      button.disabled = !findVariant(card.material, letter)?.a;
    });

    const variant = this.#variant();
    renderPrice(
      this.price,
      variant ? variant.p : material.price,
      variant ? variant.c : material.compare,
      range.moneyFormat
    );

    const form = card.form;
    const idInput = /** @type {HTMLInputElement} */ (form.querySelector('input[name="id"]'));
    const addButton = /** @type {HTMLButtonElement} */ (form.querySelector('[data-add-button]'));
    const addLabel = /** @type {HTMLElement} */ (form.querySelector('[data-add-label]'));
    const express = /** @type {HTMLElement | null} */ (form.querySelector('[data-express]'));
    const ready = Boolean(variant && variant.a);

    if (variant) idInput.value = String(variant.id);
    // The theme's form reads the product id from here when it reports the add.
    form.dataset.productId = String(product.id);
    form.dataset.productUrl = product.url;
    addButton.disabled = !ready;
    if (!variant) {
      addLabel.textContent = range.labels.choose;
    } else if (!variant.a) {
      addLabel.textContent = range.labels.soldOut;
    } else {
      addLabel.textContent = `${range.labels.add} · ${formatMoney(variant.p, range.moneyFormat)}`;
    }
    if (express) express.hidden = !ready;

    this.materialsProduct.innerHTML = product.materialsCare || '';
    this.fullLink.href = variant ? `${product.url}?variant=${variant.id}` : product.url;
  }
}

class Range {
  /** @param {HTMLElement} root */
  constructor(root) {
    this.root = root;
    this.moneyFormat = root.dataset.moneyFormat || '${{amount}}';
    this.listName = root.dataset.listName || 'Landing';
    this.listId = root.dataset.listId || 'landing';
    this.currency = root.dataset.currency || 'USD';
    this.labels = {
      add: root.dataset.labelAdd || 'Add to cart',
      soldOut: root.dataset.labelSoldOut || 'Sold out',
      choose: root.dataset.labelChoose || 'Choose your letter',
      photoNote: root.dataset.labelPhotoNote || 'Photo shows',
      letter: root.dataset.labelLetter || 'Letter',
      error: root.dataset.labelError || 'Something went wrong. Please try again.',
    };
    this.zoom = new Zoom(/** @type {HTMLDialogElement} */ (root.querySelector('[data-zoom]')));
    this.quickView = new QuickView(this);
    // The quick view's video was paused while the zoom was open.
    this.zoom.dialog.addEventListener('close', () => {
      const quickView = this.quickView;
      if (quickView.dialog.open) playSlideVideo(quickView.slides, quickView.gallery.index);
    });
    /** @type {Card[]} */
    this.cards = [];
    root.querySelectorAll('[data-landing-card]').forEach((element) => {
      try {
        this.cards.push(new Card(/** @type {HTMLElement} */ (element), this));
      } catch (error) {
        // One card with bad data must not take the rest of the page down with it.
        console.error('Landing card skipped', error);
      }
    });

    const filters = Array.from(root.querySelectorAll('[data-filter]'));
    filters.forEach((filter) => {
      filter.addEventListener('click', () => {
        const group = /** @type {HTMLElement} */ (filter).dataset.filter || '';
        filters.forEach((other) => other.setAttribute('aria-pressed', other === filter ? 'true' : 'false'));
        this.cards.forEach((card) => {
          card.element.hidden = group !== '' && card.element.dataset.group !== group;
        });
        pushDataLayer({ ecommerce: null });
        pushDataLayer({
          event: 'landing_filter',
          feature_version: TRACKING_VERSION,
          tile_collection: this.listId,
          filter_value: group || 'all',
        });
      });
    });
    this.#watchImpressions();
  }

  /**
   * A material without its own photo shows the first material's photo, and says so.
   * @param {HTMLElement} element
   * @param {any} material
   * @param {any} fallback
   */
  paintPhotoNote(element, material, fallback) {
    element.hidden = !material.noPhoto;
    element.textContent = material.noPhoto ? `${this.labels.photoNote} ${fallback.label.toLowerCase()}` : '';
  }

  /**
   * Pushes one card event to the dataLayer in the same shape the collection tiles use, so
   * tile_impression, select_item and tile_add_to_cart need no new GTM tags. The other event names
   * are specific to this page.
   * @param {string} event
   * @param {Card} card
   * @param {Record<string, unknown>} [extra]
   */
  track(event, card, extra = {}) {
    const material = card.material;
    if (!material) return;
    const { product } = material;
    // item_variant belongs inside the item; every other extra field rides at event level.
    const { item_variant: chosenVariant, ...fields } = extra;
    const variantId = chosenVariant ?? firstVariant(material)?.id ?? null;
    const variant = product.variants.find((/** @type {any} */ entry) => entry.id === variantId);
    const price = toUnits(variant ? variant.p : material.price);
    const compareAt = toUnits(variant ? variant.c : material.compare);
    const onSale = compareAt > price;
    const position = Number(card.element.dataset.position) || null;
    const item = {
      item_id: String(product.id),
      item_variant: variantId ? String(variantId) : null,
      item_name: product.title,
      item_handle: String(product.url).split('/').pop()?.split('?')[0] || null,
      price,
      compare_at_price: compareAt || null,
      discount: onSale ? Math.round((compareAt - price) * 100) / 100 : 0,
      discount_pct: onSale ? Math.round(((compareAt - price) / compareAt) * 100) : 0,
      on_sale: onSale,
      index: position,
      item_list_name: this.listName,
      item_list_id: this.listId,
      position_served: position,
      position_shown: position,
      personalized: false,
      page: 1,
    };
    pushDataLayer({ ecommerce: null });
    pushDataLayer({
      event,
      feature_version: TRACKING_VERSION,
      position_served: position,
      position_shown: position,
      personalized: false,
      tile_product_id: item.item_id,
      tile_collection: this.listId,
      tile_price: price,
      tile_discount_pct: item.discount_pct,
      tile_on_sale: onSale,
      tile_material: material.label || null,
      ...fields,
      ecommerce: { currency: this.currency, item_list_name: this.listName, item_list_id: this.listId, items: [item] },
    });
  }

  /** One impression per card per page view, once at least half of it is on screen. */
  #watchImpressions() {
    if (!('IntersectionObserver' in window)) return;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          observer.unobserve(entry.target);
          const card = this.cards.find((candidate) => candidate.element === entry.target);
          if (!card) return;
          card.warmVideo('metadata');
          this.track('tile_impression', card);
        });
      },
      { threshold: 0.5 }
    );
    this.cards.forEach((card) => observer.observe(card.element));

    // A card's video stops once the card has scrolled away, and picks up again when it is back.
    const offScreen = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const card = this.cards.find((candidate) => candidate.element === entry.target);
        if (card) playSlideVideo(card.slides, entry.isIntersecting ? card.gallery.index : -1);
      });
    });
    this.cards.forEach((card) => offScreen.observe(card.element));
  }
}

/**
 * @typedef {Object} LookPiece
 * @property {any[]} materials
 * @property {number} selected
 * @property {string} letter
 * @property {HTMLImageElement} [image]
 * @property {HTMLElement} [price]
 * @property {HTMLElement} [swatches]
 * @property {HTMLSelectElement} [select]
 */

class Looks {
  /** @param {HTMLElement} root */
  constructor(root) {
    this.root = root;
    this.moneyFormat = root.dataset.moneyFormat || '${{amount}}';
    this.percent = Number(root.dataset.percent) || 0;
    this.savingText = root.dataset.savingText || '';
    this.currency = root.dataset.currency || 'USD';
    this.lookName = '';
    this.showSeparate = root.dataset.showSeparate !== 'false';
    this.labels = {
      add: root.dataset.labelAdd || 'Add the look to cart',
      choose: root.dataset.labelChoose || 'Choose your letters',
      soldOut: root.dataset.labelSoldOut || 'Sold out',
      letter: root.dataset.labelLetter || 'Letter',
      error: root.dataset.labelError || 'Something went wrong. Please try again.',
    };

    const dialog = /** @type {HTMLDialogElement} */ (root.querySelector('[data-look-dialog]'));
    this.dialog = dialog;
    /** @param {string} name */
    const find = (name) => /** @type {HTMLElement} */ (dialog.querySelector(`[data-look-${name}]`));
    this.title = find('title');
    this.rows = find('rows');
    this.separateRow = find('separate-row');
    this.separate = find('separate');
    this.together = find('together');
    this.error = find('error');
    this.addButton = /** @type {HTMLButtonElement} */ (find('add'));
    this.addLabel = find('add-label');
    /** @type {LookPiece[]} */
    this.pieces = [];

    dialog.querySelector('[data-close]')?.addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => {
      if (event.target === dialog) dialog.close();
    });
    dialog.addEventListener('close', releaseScrollLock);
    this.addButton.addEventListener('click', () => this.#add());

    root.querySelectorAll('[data-landing-look]').forEach((look) => {
      try {
        const data = JSON.parse(look.querySelector('[data-look-json]')?.textContent || '{"products":[]}');
        this.#paintCard(/** @type {HTMLElement} */ (look), data);
        look.querySelector('[data-open-look]')?.addEventListener('click', () => this.#open(data));
      } catch (error) {
        console.error('Landing look skipped', error);
      }
    });
  }

  /**
   * The look card shows the same prices the dialog opens on (each piece in its default material).
   * @param {HTMLElement} look
   * @param {{ products: any[] }} data
   */
  #paintCard(look, data) {
    const prices = data.products.map((product) => {
      const materials = flattenMaterials([product]);
      const material = materials[defaultIndex(materials)];
      return firstVariant(material)?.p ?? material.price;
    });
    const totals = lookTotals(prices, this.percent);
    /** @param {string} name */
    const find = (name) => /** @type {HTMLElement | null} */ (look.querySelector(`[data-look-card-${name}]`));
    look.querySelectorAll('[data-look-card-item]').forEach((element, index) => {
      if (prices[index] !== undefined) element.textContent = formatMoney(prices[index], this.moneyFormat);
    });
    const separateRow = find('separate-row');
    const separate = find('separate');
    const together = find('together');
    const saving = find('saving');
    if (separateRow) separateRow.hidden = totals.saving === 0 || !this.showSeparate;
    if (separate) separate.textContent = formatMoney(totals.separate, this.moneyFormat);
    if (together) together.textContent = formatMoney(totals.together, this.moneyFormat);
    if (saving) {
      saving.hidden = totals.saving === 0 || !this.savingText;
      saving.textContent = this.savingText.replace('[amount]', formatMoney(totals.saving, this.moneyFormat));
    }
  }

  /** @param {{ name: string, products: any[] }} look */
  #open(look) {
    this.pieces = look.products.map((product) => {
      const materials = flattenMaterials([product]);
      const selected = defaultIndex(materials);
      return /** @type {LookPiece} */ ({
        materials,
        selected,
        letter: product.letters.length ? rememberedLetter(materials[selected]) : '',
      });
    });
    this.title.textContent = look.name;
    this.lookName = look.name;
    this.error.hidden = true;
    this.rows.replaceChildren(...this.pieces.map((piece) => this.#buildRow(piece)));
    this.#update();
    this.#track('look_open');
    this.dialog.showModal();
    document.documentElement.setAttribute('scroll-lock', '');
  }

  /** @param {'look_open' | 'look_add_to_cart'} event */
  #track(event) {
    const variants = this.pieces.map((piece) => this.#variantOf(piece));
    const prices = this.pieces.map((piece, index) => variants[index]?.p ?? piece.materials[piece.selected].price);
    const totals = lookTotals(prices, this.percent);
    pushDataLayer({ ecommerce: null });
    pushDataLayer({
      event,
      feature_version: TRACKING_VERSION,
      tile_collection: pageListId(),
      look_name: this.lookName,
      look_pieces: this.pieces.length,
      look_value: toUnits(totals.together),
      look_saving: toUnits(totals.saving),
      ecommerce: {
        currency: this.currency,
        value: toUnits(totals.together),
        items: this.pieces.map((piece, index) => {
          const material = piece.materials[piece.selected];
          return {
            item_id: String(material.product.id),
            item_variant: variants[index] ? String(variants[index].id) : null,
            item_name: material.product.title,
            price: toUnits(prices[index]),
            quantity: 1,
          };
        }),
      },
    });
  }

  /** @param {LookPiece} piece */
  #variantOf(piece) {
    const material = piece.materials[piece.selected];
    return material.product.letters.length ? findVariant(material, piece.letter) : firstVariant(material);
  }

  /**
   * Builds a piece's row once; #update then only changes what moved, so focus stays where it is.
   * @param {LookPiece} piece
   */
  #buildRow(piece) {
    const { product } = piece.materials[piece.selected];

    const row = document.createElement('div');
    row.className = 'landing-look-row';

    piece.image = document.createElement('img');
    piece.image.loading = 'lazy';

    const body = document.createElement('div');
    body.className = 'landing-look-row__body';

    const head = document.createElement('div');
    head.className = 'landing-look-row__head';
    const name = document.createElement('span');
    name.textContent = product.title;
    piece.price = document.createElement('span');
    head.append(name, piece.price);

    const controls = document.createElement('div');
    controls.className = 'landing-look-row__controls';

    if (piece.materials.length > 1) {
      piece.swatches = document.createElement('div');
      piece.swatches.className = 'landing-card__swatches';
      controls.append(piece.swatches);
    }

    if (product.letters.length) {
      const select = document.createElement('select');
      select.setAttribute('aria-label', `${product.title}: ${this.labels.letter}`);
      const placeholder = new Option(this.labels.letter, '');
      placeholder.disabled = true;
      select.append(placeholder, ...product.letters.map((/** @type {string} */ letter) => new Option(letter, letter)));
      select.value = piece.letter;
      select.addEventListener('change', () => {
        piece.letter = select.value;
        this.error.hidden = true;
        this.#update();
      });
      piece.select = select;
      controls.append(select);
    }

    body.append(head, controls);
    row.append(piece.image, body);
    return row;
  }

  #update() {
    this.pieces.forEach((piece) => {
      const material = piece.materials[piece.selected];
      const variant = this.#variantOf(piece);
      const photo = material.images[0];

      if (piece.image && photo && piece.image.getAttribute('src') !== photo.s) piece.image.src = photo.s;
      if (piece.image) piece.image.alt = photo?.a || material.product.title;
      if (piece.price) piece.price.textContent = formatMoney(variant ? variant.p : material.price, this.moneyFormat);
      if (piece.swatches) {
        renderSwatches(piece.swatches, piece.materials, piece.selected, (index) => {
          piece.selected = index;
          this.error.hidden = true;
          this.#update();
        });
      }
      if (piece.select) {
        Array.from(piece.select.options).forEach((option) => {
          if (option.value) option.disabled = !findVariant(material, option.value)?.a;
        });
      }
    });

    const variants = this.pieces.map((piece) => this.#variantOf(piece));
    const totals = lookTotals(
      this.pieces.map((piece, index) => variants[index]?.p ?? piece.materials[piece.selected].price),
      this.percent
    );

    this.separateRow.hidden = totals.saving === 0 || !this.showSeparate;
    this.separate.textContent = formatMoney(totals.separate, this.moneyFormat);
    this.together.textContent = formatMoney(totals.together, this.moneyFormat);

    const allChosen = variants.every(Boolean);
    const allAvailable = variants.every((variant) => variant && variant.a);
    this.addButton.disabled = !allAvailable;
    if (!allChosen) {
      this.addLabel.textContent = this.labels.choose;
    } else if (!allAvailable) {
      this.addLabel.textContent = this.labels.soldOut;
    } else {
      this.addLabel.textContent = `${this.labels.add} · ${formatMoney(totals.together, this.moneyFormat)}`;
    }
  }

  async #add() {
    const variants = this.pieces.map((piece) => this.#variantOf(piece));
    if (!variants.every((variant) => variant && variant.a)) return;

    this.addButton.disabled = true;
    this.error.hidden = true;

    // Ask for the same cart sections the theme's own form asks for, so the drawer updates in one go.
    const sections = Array.from(document.querySelectorAll('cart-items-component'))
      .map((element) => /** @type {HTMLElement} */ (element).dataset.sectionId)
      .filter(Boolean)
      .join(',');

    try {
      const response = await fetch(Theme.routes.cart_add_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'X-Requested-With': 'XMLHttpRequest',
        },
        body: JSON.stringify({
          items: variants.map((variant) => ({ id: variant.id, quantity: 1 })),
          sections,
        }),
      });
      const result = await response.json();
      if (!response.ok || result.status) throw new Error(result.description || result.message || 'cart add failed');

      const letter = this.pieces.find((piece) => piece.letter)?.letter;
      if (letter) storeLetter(letter);
      this.#track('look_add_to_cart');

      this.dialog.close();
      this.root.dispatchEvent(
        new CartAddEvent({}, 'landing-look', {
          source: 'product-form-component',
          itemCount: variants.length,
          sections: result.sections,
        })
      );
    } catch (error) {
      // Shopify's own reason ("only 1 left") is more useful than the generic line when there is one.
      const reason = error instanceof Error && error.message !== 'cart add failed' ? error.message : '';
      this.error.textContent = reason || this.labels.error;
      pushDataLayer({ ecommerce: null });
      pushDataLayer({
        event: 'landing_error',
        feature_version: TRACKING_VERSION,
        tile_collection: pageListId(),
        look_name: this.lookName,
        error_message: String(reason || 'look add failed').slice(0, 100),
      });
      this.error.hidden = false;
      this.addButton.disabled = false;
    }
  }
}

/**
 * Lines that mention the worn-together offer take their number from the looks section, the one
 * place it is set. With no looks section, or a percentage of 0, they stay hidden.
 */
function fillPercentNotes() {
  const looks = /** @type {HTMLElement | null} */ (document.querySelector('[data-landing-looks]'));
  const percent = Number(looks?.dataset.percent) || 0;
  document.querySelectorAll('[data-percent-note]').forEach((element) => {
    const note = /** @type {HTMLElement} */ (element);
    note.textContent = (note.dataset.percentNote || '').replace('[percent]', String(percent));
    note.hidden = percent === 0;
  });
}

/** The list id page-level events share with the card events, so they can be filtered together. */
function pageListId() {
  return /** @type {HTMLElement | null} */ (document.querySelector('[data-landing-range]'))?.dataset.listId || null;
}

/**
 * How far down the page a visit got: one event per section, the first time it is properly on
 * screen.
 */
function watchSections() {
  if (!('IntersectionObserver' in window)) return;
  const sections = Array.from(document.querySelectorAll('[data-landing-section]:not([data-section-watched])'));
  const all = Array.from(document.querySelectorAll('[data-landing-section]'));
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        pushDataLayer({ ecommerce: null });
        pushDataLayer({
          event: 'landing_section_view',
          feature_version: TRACKING_VERSION,
          tile_collection: pageListId(),
          section_name: /** @type {HTMLElement} */ (entry.target).dataset.landingSection,
          section_index: all.indexOf(entry.target) + 1,
        });
      });
    },
    // Counted once any part of the section is in the upper 60% of the screen.
    { rootMargin: '0px 0px -40% 0px' }
  );
  sections.forEach((section) => {
    section.setAttribute('data-section-watched', '');
    observer.observe(section);
  });
}

/** Clicks on the page's own links (hero buttons, closing links): where people go next. */
function watchLinks() {
  if (document.documentElement.hasAttribute('data-landing-links')) return;
  document.documentElement.setAttribute('data-landing-links', '');
  document.addEventListener('click', (event) => {
    const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
    const section = link?.closest('[data-landing-section]');
    // Card links open the quick view (select_item); "View the full page" reports itself, with its product.
    if (!link || !section || link.hasAttribute('data-open-quick-view') || link.hasAttribute('data-qv-full-link')) return;
    const dialog = link.closest('dialog');
    pushDataLayer({ ecommerce: null });
    pushDataLayer({
      event: 'landing_link_click',
      feature_version: TRACKING_VERSION,
      tile_collection: pageListId(),
      section_name: dialog
        ? dialog.hasAttribute('data-look-dialog') ? 'look_window' : 'quick_view'
        : /** @type {HTMLElement} */ (section).dataset.landingSection,
      link_text: (link.textContent || '').trim().slice(0, 60),
      link_url: link.getAttribute('href'),
    });
  });
}

function init() {
  document.querySelectorAll('[data-landing-range]:not([data-landing-ready])').forEach((root) => {
    root.setAttribute('data-landing-ready', '');
    try {
      new Range(/** @type {HTMLElement} */ (root));
    } catch (error) {
      console.error('Landing range failed to start', error);
    }
  });
  document.querySelectorAll('[data-landing-looks]:not([data-landing-ready])').forEach((root) => {
    root.setAttribute('data-landing-ready', '');
    try {
      new Looks(/** @type {HTMLElement} */ (root));
    } catch (error) {
      console.error('Landing looks failed to start', error);
    }
  });
  fillPercentNotes();
  watchSections();
  watchLinks();
}

init();
// The theme editor re-renders sections in place.
document.addEventListener('shopify:section:load', init);
