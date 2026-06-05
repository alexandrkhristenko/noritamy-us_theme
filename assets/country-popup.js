class CountryPopup extends HTMLElement {
  constructor() {
    super();
    this.closeBtn = this.querySelector('.country-popup__close');
    this.dismissBtn = this.querySelector('#country-popup-dismiss');
    this.switchBtn = this.querySelector('#country-popup-switch');
    this.overlay = this.querySelector('.country-popup__overlay');
    this.cookieName = 'country_popup_dismissed';
    this.cookieDays = 30;
  }

  connectedCallback() {
    if (this.#hasCookie()) return;

    const targetCountry = this.getAttribute('data-target-country');
    console.log('ss',targetCountry)
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
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.#dismiss());
    }

    if (this.dismissBtn) {
      this.dismissBtn.addEventListener('click', () => this.#dismiss());
    }

    if (this.switchBtn) {
      this.switchBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.#pushDataLayer({
          event: "country_popup_click",
          popup_action: "accepted_redirect",
          detected_country: this.getAttribute('data-target-country'),
          destination_url: this.switchBtn.href
        });
        this.#setCookie();

        setTimeout(() => {
          window.location.href = this.switchBtn.href;
        }, 300);
      });
    }

    if (this.overlay) {
      this.overlay.addEventListener('click', () => this.#dismiss());
    }
  }

  #dismiss() {
    this.#pushDataLayer({
      event: "country_popup_click",
      popup_action: "declined_redirect",
      detected_country: this.getAttribute('data-target-country'),
      destination_url: this.switchBtn ? this.switchBtn.href : ''
    });
    this.#setCookie();
    this.removeAttribute('open');
  }

  #setCookie() {
    const date = new Date();
    date.setTime(date.getTime() + (this.cookieDays * 24 * 60 * 60 * 1000));
    const expires = "expires=" + date.toUTCString();
    document.cookie = this.cookieName + "=true;" + expires + ";path=/;SameSite=Lax";
  }

  #hasCookie() {
    return document.cookie.split(';').some(c => {
      return c.trim().startsWith(this.cookieName + '=');
    });
  }

  #pushDataLayer(payload) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(payload);
  }
}

if (!customElements.get('country-popup')) {

  customElements.define('country-popup', CountryPopup);
}
