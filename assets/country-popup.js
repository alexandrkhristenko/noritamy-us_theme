class CountryPopup extends HTMLElement {
  constructor() {
    super();
    this.storageKey = 'country_popup_dismissed';
  }

  connectedCallback() {

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
        e.target.closest('#country-popup-dismiss') ||
        e.target.classList.contains('country-popup__overlay')
      ) {
        this.#dismiss();
      }

      const switchBtn = e.target.closest('#country-popup-switch');
      if (switchBtn) {
        e.preventDefault();
        this.#pushDataLayer({
          event: "country_popup_click",
          popup_action: "accepted_redirect",
          detected_country: this.getAttribute('data-target-country'),
          destination_url: switchBtn.href
        });
        this.#setStorage();

        setTimeout(() => {
          window.location.href = switchBtn.href;
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
    console.log(this)
  }

  #setStorage() {
    sessionStorage.setItem(this.storageKey, 'true');
  }

  #hasStorage() {
    return sessionStorage.getItem(this.storageKey) === 'true';
  }

  #pushDataLayer(payload) {
    window.dataLayer = window.dataLayer || [];
    window.dataLayer.push(payload);
  }
}

if (!customElements.get('country-popup')) {

  customElements.define('country-popup', CountryPopup);
}
