import { DialogComponent } from '@theme/dialog';
import { CartAddEvent } from '@theme/events';

/**
 * A custom element that manages the cart upsell popup.
 *
 * @extends {DialogComponent}
 */
class CartUpsellPopup extends DialogComponent {
  connectedCallback() {
    super.connectedCallback();
    document.addEventListener(CartAddEvent.eventName, this.#handleCartAdd);

    this.dialog = this.querySelector('dialog');
    this.dialog?.addEventListener('close', this.#handleDialogClose);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener(CartAddEvent.eventName, this.#handleCartAdd);
    this.dialog?.removeEventListener('close', this.#handleDialogClose);
  }

  #handleDialogClose = () => {
    const expiry = new Date().getTime() + 24 * 60 * 60 * 1000;
    localStorage.setItem('cartUpsellPopupClosedUntil', expiry.toString());
  };

  /**
   * Handles the cart add event
   * @param {CartAddEvent} event
   */
  #handleCartAdd = (event) => {
    // Only open if product was successfully added from a product form
    const isError = event.detail?.data?.didError;
    const source = event.detail?.data?.source;

    const closedUntil = localStorage.getItem('cartUpsellPopupClosedUntil');
    if (closedUntil && new Date().getTime() < parseInt(closedUntil)) {
       return; // Already closed recently
    }

    // We only trigger this on actual add-to-cart events, not quantity updates
    if (!isError && source === 'product-form-component') {
      // If the add-to-cart event originated from inside this popup (they clicked the button in the popup), close it!
      if (event.target instanceof Node && this.contains(event.target)) {
        this.closeDialog();
        return;
      }

      // Don't show the upsell popup if they just added the upsell product from somewhere else!
      const addedProductId = event.detail?.data?.productId?.toString();
      const upsellProductId = this.dataset.productId;
      
      if (addedProductId && upsellProductId && addedProductId === upsellProductId) {
        this.closeDialog();
        return;
      }
      
      // Give a tiny delay so UI can update 
      setTimeout(() => {
        this.showDialog();
      }, 500);
    }
  };
}

if (!customElements.get('cart-upsell-popup')) {
  customElements.define('cart-upsell-popup', CartUpsellPopup);
}
