/**
 * After adding to cart via the quick-add modal, close the modal
 * but do NOT open the cart drawer. The user stays on the collection.
 *
 * Mechanism: the cart drawer opens when 'cart:update' bubbles to document
 * and the drawer has the 'auto-open' attribute. We intercept in capture phase
 * (before the drawer's bubble listener), temporarily remove 'auto-open',
 * then restore it after the event cycle so future non-quick-add adds still open.
 */
document.addEventListener(
  'cart:update',
  (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const fromQuickAdd =
      target?.closest('#quick-add-dialog') ||
      target?.closest('.noritamy-quick-add-inline');
    if (!fromQuickAdd) return;

    const drawer = document.querySelector('cart-drawer-component');
    if (!drawer || !drawer.hasAttribute('auto-open')) return;

    drawer.removeAttribute('auto-open');
    // Restore after the current event has fully propagated
    setTimeout(() => drawer.setAttribute('auto-open', ''), 0);
  },
  { capture: true }
);
