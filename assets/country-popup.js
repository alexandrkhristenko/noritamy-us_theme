const TRACKING_PARAM =
  /^(utm_[a-z_]+|gclid|gbraid|wbraid|dclid|fbclid|ttclid|twclid|msclkid|li_fat_id|epik|irclickid|awc|rdt_cid|srsltid|mc_cid|mc_eid)$/i;

// GA's cross domain linker params are short lived, so they are only ever copied from the
// URL the visitor is on right now - never replayed from an earlier page in the session.
const SESSION_PARAM = /^(_ga|_gl)$/i;

const INTERNAL_HOSTS = /(^|\.)noritamy\.(com|co\.il)$/i;
const FIRST_TOUCH_KEY = 'noritamy_first_touch';
const MAX_VALUE_LENGTH = 200;

class CountryPopup extends HTMLElement {
  constructor() {
    super();
    this.storageKey = 'country_popup_dismissed';
  }

  connectedCallback() {
    this.#captureFirstTouch();

    const switchBtn = this.querySelector('#country-popup-switch');
    if (switchBtn) {
      // Decorate up front so a hover, a middle click or a copied link carries the same
      // attribution the scripted redirect does.
      switchBtn.href = this.#destinationUrl(switchBtn.getAttribute('href'));
    }

    if (this.#hasStorage()) return;

    const targetCountry = this.getAttribute('data-target-country');

    if (!targetCountry) return;

    fetch('https://get.geojs.io/v1/ip/country.json')
        .then(response => response.json())
        .then(data => {
          if (data.country === targetCountry) {
            this.setAttribute('open', '');
            this.#pushDataLayer({
              event: 'country_popup_impression',
              detected_country: targetCountry,
              current_domain: window.location.hostname.replace('www.', '')
            });
          }
        })
        .catch(err => console.warn('GeoIP fetch failed:', err));

    this.#setupListeners();
  }

  #setupListeners() {
    this.addEventListener('click', (e) => {
      if (
        e.target.closest('.country-popup__close') ||
        e.target.closest('#country-popup-dismiss')
      ) {
        this.#dismiss();
      }

      const switchBtn = e.target.closest('#country-popup-switch');
      if (switchBtn) {
        e.preventDefault();
        const destination = this.#destinationUrl(switchBtn.href);
        this.#pushDataLayer({
          event: "country_popup_click",
          popup_action: "accepted_redirect",
          detected_country: this.getAttribute('data-target-country'),
          destination_url: destination
        });
        this.#setStorage();

        setTimeout(() => {
          window.location.href = destination;
        }, 300);
      }
    });
  }

  #dismiss() {
    const switchBtn = this.querySelector('#country-popup-switch');
    this.#pushDataLayer({
      event: "country_popup_click",
      popup_action: "declined_redirect",
      detected_country: this.getAttribute('data-target-country'),
      destination_url: switchBtn ? switchBtn.href : ''
    });
    this.#setStorage();
    this.removeAttribute('open');
  }

  /**
   * Rebuilds the Israeli store link so it carries the campaign that brought the visitor
   * to noritamy.com. Without this the Israeli store only ever sees noritamy.com as the
   * referrer and books every one of these sessions as its own traffic.
   */
  #destinationUrl(href) {
    const base = href || this.getAttribute('data-target-url');
    if (!base) return '';

    let url;
    try {
      url = new URL(base, window.location.href);
    } catch (err) {
      return base;
    }

    const current = new URLSearchParams(window.location.search);
    const firstTouch = this.#firstTouch();
    const attribution = { ...firstTouch.params };

    // A campaign on the current URL is the most recent click, so it wins over the one
    // stored when the session started.
    current.forEach((value, key) => {
      if (TRACKING_PARAM.test(key)) attribution[key] = value;
    });

    // Google's own click IDs already tell GA4 where the visit came from, so leave them to
    // it rather than stamping a referral source on top of a paid click.
    const hasGoogleClickId = ['gclid', 'gbraid', 'wbraid', 'dclid', 'srsltid']
      .some((key) => attribution[key]);

    if (!attribution.utm_source && !hasGoogleClickId) {
      const referrer = this.#externalReferrer(firstTouch.referrer || document.referrer);
      if (referrer) {
        attribution.utm_source = referrer.hostname.replace(/^www\./, '');
        attribution.utm_medium = attribution.utm_medium || 'referral';
        attribution.ref = referrer.href;
      } else {
        attribution.utm_source = 'direct';
        attribution.utm_medium = attribution.utm_medium || 'none';
      }
    }

    current.forEach((value, key) => {
      if (SESSION_PARAM.test(key)) url.searchParams.set(key, value);
    });

    Object.keys(attribution).forEach((key) => {
      const value = String(attribution[key]).slice(0, MAX_VALUE_LENGTH);
      if (value) url.searchParams.set(key, value);
    });

    url.searchParams.set('country_popup', 'us_to_il');

    return url.toString();
  }

  /**
   * The campaign and referrer of the page the visitor first landed on. Reading
   * document.referrer at click time is not enough - after one internal navigation it is
   * noritamy.com itself, which is exactly the source we are trying not to report.
   */
  #captureFirstTouch() {
    if (this.#readFirstTouch()) return;

    const params = {};
    new URLSearchParams(window.location.search).forEach((value, key) => {
      if (TRACKING_PARAM.test(key)) params[key] = value.slice(0, MAX_VALUE_LENGTH);
    });

    const referrer = this.#externalReferrer(document.referrer);

    try {
      sessionStorage.setItem(FIRST_TOUCH_KEY, JSON.stringify({
        params,
        referrer: referrer ? referrer.href : ''
      }));
    } catch (err) {
      this.inMemoryFirstTouch = { params, referrer: referrer ? referrer.href : '' };
    }
  }

  #firstTouch() {
    return this.#readFirstTouch() || { params: {}, referrer: '' };
  }

  #readFirstTouch() {
    try {
      const stored = sessionStorage.getItem(FIRST_TOUCH_KEY);
      if (stored) return JSON.parse(stored);
    } catch (err) {
      // Storage blocked or holding malformed JSON - fall through to the in-memory copy.
    }
    return this.inMemoryFirstTouch || null;
  }

  #externalReferrer(referrer) {
    if (!referrer) return null;
    try {
      const url = new URL(referrer);
      if (INTERNAL_HOSTS.test(url.hostname)) return null;
      return url;
    } catch (err) {
      return null;
    }
  }

  #setStorage() {
    try {
      sessionStorage.setItem(this.storageKey, 'true');
    } catch (err) {
      this.dismissed = true;
    }
  }

  #hasStorage() {
    try {
      return sessionStorage.getItem(this.storageKey) === 'true';
    } catch (err) {
      return Boolean(this.dismissed);
    }
  }

  #pushDataLayer(payload) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(payload);
  }
}

if (!customElements.get('country-popup')) {

  customElements.define('country-popup', CountryPopup);
}
