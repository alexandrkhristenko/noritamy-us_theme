class KlaviyoDiscountApplier {
  constructor() {
    this.discountCode = 'NORI10';
    this.actionId = '01KSEZ9HAE9BTKJJ1XZP7C3N14';
    this.#init();
  }

  #init() {
    document.addEventListener('click', this.#handleClick.bind(this));
  }

  #handleClick(event) {
    const button = event.target.closest(`button[data-action-id="${this.actionId}"]`) || 
                   event.target.closest('.klaviyo-form-button');

    if (button && (button.dataset.actionId === this.actionId || button.textContent.includes('Unlock 10% OFF'))) {
      this.#applyDiscount();
    }
  }

  async #applyDiscount() {
    try {
      // Shopify natively sets the discount cookie when hitting the /discount/CODE endpoint
      await fetch(`/discount/${this.discountCode}`);
      console.log(`Discount ${this.discountCode} applied successfully.`);
    } catch (error) {
      console.error('Failed to apply discount', error);
    }
  }
}

document.addEventListener('DOMContentLoaded', () => {
  new KlaviyoDiscountApplier();
});
