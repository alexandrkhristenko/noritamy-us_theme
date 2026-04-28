import { Component } from '@theme/component';
import { ThemeEvents } from '@theme/events';

class StickyAddToCart extends Component {
    connectedCallback() {
        this.section = this.closest('.shopify-section');
        this.observer = new IntersectionObserver(this.handleIntersection.bind(this), {
            rootMargin: '0px 0px 0px 0px',
            threshold: 0
        });

        // Find the main product form and observe it
        const mainForm = this.section?.querySelector('.buy-buttons-block') || this.section?.querySelector('.product-details');
        if (mainForm) {
            this.observer.observe(mainForm);
        } else {
            // Fallback: active immediately if no main form found in the same section
            this.classList.add('is-active');
        }

        this.onVariantUpdateBound = this.onVariantUpdate.bind(this);
        this.section?.addEventListener(ThemeEvents.variantUpdate, this.onVariantUpdateBound);

        this.select = this.querySelector('.sticky-add-to-cart__select');
        this.handleSelectChangeBound = this.handleSelectChange.bind(this);
        this.select?.addEventListener('change', this.handleSelectChangeBound);

        this.submitButton = this.querySelector('button[type="submit"]');
        this.handleSubmitClickBound = this.handleSubmitClick.bind(this);
        this.submitButton?.addEventListener('click', this.handleSubmitClickBound);
    }

    disconnectedCallback() {
        this.observer?.disconnect();
        this.section?.removeEventListener(ThemeEvents.variantUpdate, this.onVariantUpdateBound);
        this.select?.removeEventListener('change', this.handleSelectChangeBound);
        this.submitButton?.removeEventListener('click', this.handleSubmitClickBound);
    }

    /**
     * @param {IntersectionObserverEntry[]} entries
     */
    handleIntersection(entries) {
        entries.forEach((entry) => {
            // If it's not intersecting and it's above the viewport (scrolled past it)
            if (!entry.isIntersecting && entry.boundingClientRect.bottom < 0) {
                this.classList.add('is-active');
            } else if (entry.isIntersecting || entry.boundingClientRect.top >= 0) {
                this.classList.remove('is-active');
            }
        });
    }

    /**
     * @param {Event} event
     */
    handleSubmitClick(event) {
        // Removed mobile scroll logic to restore default add to cart behavior
    }

    /**
     * @param {Event} event
     */
    handleSelectChange(event) {
        const target = /** @type {HTMLSelectElement} */ (event.target);
        const selectedOption = target.options[target.selectedIndex];
        if (!selectedOption) return;

        // INSTANTLY update the hidden input for the cart
        const hiddenInput = /** @type {HTMLInputElement | null} */ (this.querySelector('input[name="id"]'));
        if (hiddenInput && target.value) {
            hiddenInput.value = target.value;
        }

        const opt1 = selectedOption.dataset.option1;
        const opt2 = selectedOption.dataset.option2;
        const opt3 = selectedOption.dataset.option3;

        // Find main variant picker
        const mainPicker = this.section?.querySelector('variant-picker');
        if (!mainPicker) return;

        // Identify fieldsets or selects for each option index
        const containers = mainPicker.querySelectorAll('fieldset, .variant-option__select');

        if (containers[0] && opt1) {
            this.setMainPickerValue(containers[0], opt1);
        }
        if (containers[1] && opt2) {
            this.setMainPickerValue(containers[1], opt2);
        }
        if (containers[2] && opt3) {
            this.setMainPickerValue(containers[2], opt3);
        }
    }

    /**
     * @param {Element} container
     * @param {string} value
     */
    setMainPickerValue(container, value) {
        // Find radio matching the value
        // The main picker uses raw values for radio buttons e.g value="Gold plated"
        const radio = /** @type {HTMLInputElement | null} */ (container.querySelector(`input[type="radio"][value="${value.replace(/"/g, '\\"')}"]`));
        if (radio) {
            if (!radio.checked) {
                radio.checked = true;
                // Dispatch change event to trigger variant picker logic
                radio.dispatchEvent(new Event('change', { bubbles: true }));
            }
            return;
        }

        // Find select
        /** @type {HTMLSelectElement | null} */
        let select = null;
        if (container.tagName === 'SELECT') {
            select = /** @type {HTMLSelectElement} */ (container);
        } else {
            select = container.querySelector('select');
        }

        // Helper to handle HTML entity decoding
        /**
         * @param {string} html
         */
        const decodeHTML = (html) => {
            const txt = document.createElement("textarea");
            txt.innerHTML = html;
            return txt.value.trim();
        };

        if (select) {
            // Check if the value matches one of the options, ignore trailing spaces and HTML entities
            const decodedValue = decodeHTML(value);
            const matchedOption = Array.from(select.options).find(opt => decodeHTML(opt.value) === decodedValue);

            if (matchedOption && select.value !== matchedOption.value) {
                select.value = matchedOption.value;
                select.dispatchEvent(new Event('change', { bubbles: true }));
            }
        }
    }

    /**
     * @param {import('@theme/events').VariantUpdateEvent} event
     */
    onVariantUpdate(event) {
        // Update the variant select value when variant is updated from somewhere else
        if (this.select && event.detail.resource?.id) {
            /** @type {HTMLSelectElement} */ (this.select).value = event.detail.resource.id.toString();
        }

        // Update the hidden input that passes variant id to cart
        const hiddenInput = /** @type {HTMLInputElement | null} */ (this.querySelector('input[name="id"]'));
        if (hiddenInput && event.detail.resource?.id) {
            hiddenInput.value = event.detail.resource.id.toString();
        }

        // Update image
        const img = /** @type {HTMLImageElement | null} */ (this.querySelector('.sticky-add-to-cart__image img'));
        if (img && event.detail.resource?.featured_media?.preview_image?.src) {
            img.src = event.detail.resource.featured_media.preview_image.src + '&width=100';
            img.srcset = event.detail.resource.featured_media.preview_image.src + '&width=100 1x, ' + event.detail.resource.featured_media.preview_image.src + '&width=200 2x';
        }
    }
}

if (!customElements.get('sticky-add-to-cart')) {
    customElements.define('sticky-add-to-cart', StickyAddToCart);
}
