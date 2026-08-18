function initSizeValidation() {
  const sizeSelects = Array.from(document.querySelectorAll('.variant-option__select[name="options[Size]"], .variant-option__select[name="options[Ring size]"], .variant-option__select[name="options[Ring Size]"], .variant-option__select[name="options[Размер]"], .variant-option__select[name="options[מידה]"], .variant-option__select[name="options[גודל]"]'));
  if (sizeSelects.length === 0) return;

  const isHebrew = document.documentElement.lang.startsWith('he');
  console.log('isHebrew', isHebrew);
  const buttonText = isHebrew ? "בחרי מידה" : "Choose Size";
  const errorText = isHebrew ? "יש צורך במידת טבעת" : "Choose Size";

  const selectPlaceholder = isHebrew ? "יש צורך במידת טבעת" : "Choose a size";

  // Always force the "Choose a size" option on page load
  sizeSelects.forEach(select => {
    select.value = "";
    const emptyOption = select.querySelector('option[value=""]');
    if (emptyOption) {
      emptyOption.textContent = selectPlaceholder;
    }
  });

  const style = document.createElement('style');
  style.innerHTML = `
    .size-unselected .add-to-cart-text__content {
      display: none !important;
    }
    .size-unselected .add-to-cart-text::after {
      content: "${buttonText}" !important;
    }
    .size-unselected button[type="submit"],
    .size-unselected .shopify-payment-button__button {
      opacity: 0.6 !important;
      pointer-events: none !important;
    }
    .size-unselected add-to-cart-component,
    .size-unselected .accelerated-checkout-block,
    .size-unselected .sticky-add-to-cart__controls {
      cursor: not-allowed !important;
    }
    .size-validation-error-label {
      color: #ff4a4a;
      font-size: var(--font-size--sm, 14px);
      margin-top: 8px;
      display: none;
    }
    .size-unselected-show {
      display: block !important;
    }
  `;
  document.head.appendChild(style);

  const sectionMap = new Map();

  sizeSelects.forEach(select => {
    const picker = select.closest('variant-picker');
    if (!picker) return;
    const sectionId = picker.dataset.sectionId;
    if (!sectionId) return;

    if (!sectionMap.has(sectionId)) {
      sectionMap.set(sectionId, {
        selects: [],
        forms: [],
        labels: []
      });
    }
    sectionMap.get(sectionId).selects.push(select);
  });

  document.querySelectorAll('product-form-component, sticky-add-to-cart').forEach(form => {
    const sectionId = form.dataset.sectionId;
    if (sectionId && sectionMap.has(sectionId)) {
      sectionMap.get(sectionId).forms.push(form);
    }
  });

  document.querySelectorAll('.js-size-guide-block').forEach(block => {
    const section = block.closest('.shopify-section');
    if (!section) return;
    const picker = section.querySelector('variant-picker');
    if (picker && picker.dataset.sectionId && sectionMap.has(picker.dataset.sectionId)) {
      const label = document.createElement('div');
      label.className = 'size-validation-error-label';
      label.textContent = errorText;
      block.parentNode.insertBefore(label, block.nextSibling);
      sectionMap.get(picker.dataset.sectionId).labels.push(label);
    }
  });

  let isUpdating = false;

  const updateSectionUI = (sectionData) => {
    isUpdating = true;
    const isSelected = sectionData.selects.every(select => select.value !== "");

    if (!isSelected) {
      sectionData.forms.forEach(form => form.classList.add('size-unselected'));
    } else {
      sectionData.forms.forEach(form => form.classList.remove('size-unselected'));
      sectionData.labels.forEach(label => label.classList.remove('size-unselected-show'));
    }
    setTimeout(() => { isUpdating = false; }, 0);
  };

  sectionMap.forEach(data => updateSectionUI(data));

  const blockAndFeedback = (e, sectionData) => {
    const isSelected = sectionData.selects.every(select => select.value !== "");
    if (!isSelected) {
      e.preventDefault();
      e.stopImmediatePropagation();
      updateSectionUI(sectionData);

      // Explicitly show the label because the user attempted to click
      sectionData.labels.forEach(label => label.classList.add('size-unselected-show'));

      const firstEmpty = sectionData.selects.find(s => s.value === "");
      if (firstEmpty) {
        firstEmpty.focus();
        const wrapper = firstEmpty.closest('.variant-option__select-wrapper');
        if (wrapper) {
          wrapper.style.outline = '2px solid #ff4a4a';
          wrapper.style.outlineOffset = '2px';
        }
      }
      return true;
    }
    return false;
  };

  document.addEventListener('click', (e) => {
    // 1. Try to catch click on the wrappers (since buttons have pointer-events: none)
    const wrapper = e.target.closest('add-to-cart-component, .accelerated-checkout-block, .sticky-add-to-cart__controls');
    if (wrapper) {
      const form = wrapper.closest('product-form-component, sticky-add-to-cart');
      if (form && form.classList.contains('size-unselected')) {
        const sectionId = form.dataset.sectionId;
        if (sectionId && sectionMap.has(sectionId)) {
          blockAndFeedback(e, sectionMap.get(sectionId));
        }
      }
    } else {
      // 2. Try to catch click on buttons directly in case pointer-events is overridden
      const btn = e.target.closest('product-form-component button[type="submit"], sticky-add-to-cart button[type="submit"], .shopify-payment-button__button');
      if (btn) {
        const form = btn.closest('product-form-component, sticky-add-to-cart');
        if (form && form.classList.contains('size-unselected')) {
          const sectionId = form.dataset.sectionId;
          if (sectionId && sectionMap.has(sectionId)) {
            blockAndFeedback(e, sectionMap.get(sectionId));
          }
        }
      }
    }
  }, true);

  document.addEventListener('submit', (e) => {
    const form = e.target.closest('product-form-component, sticky-add-to-cart');
    if (form && form.classList.contains('size-unselected')) {
      const sectionId = form.dataset.sectionId;
      if (sectionId && sectionMap.has(sectionId)) {
        blockAndFeedback(e, sectionMap.get(sectionId));
      }
    }
  }, true);

  sectionMap.forEach((data) => {
    data.selects.forEach(select => {
      select.addEventListener('change', () => {
        updateSectionUI(data);
        const isSelected = data.selects.every(s => s.value !== "");
        if (isSelected) {
          const wrapper = select.closest('.variant-option__select-wrapper');
          if (wrapper) {
            wrapper.style.outline = '';
            wrapper.style.outlineOffset = '';
          }
        }
      });
    });
  });

  const observer = new MutationObserver((mutations) => {
    if (isUpdating) return;

    // Check if the mutation requires an update
    let needsUpdate = false;
    const sectionsToUpdate = new Set();

    mutations.forEach(mutation => {
      const form = mutation.target.closest('product-form-component, sticky-add-to-cart');
      if (form) {
        const sectionId = form.dataset.sectionId;
        if (sectionId && sectionMap.has(sectionId)) {
          sectionsToUpdate.add(sectionId);
        }
      }
    });

    sectionsToUpdate.forEach(sectionId => {
      const data = sectionMap.get(sectionId);
      const isSelected = data.selects.every(s => s.value !== "");
      if (!isSelected) {
        updateSectionUI(data);
      }
    });
  });

  document.querySelectorAll('product-form-component, sticky-add-to-cart').forEach(form => {
    observer.observe(form, { childList: true, subtree: true, attributes: true, attributeFilter: ['disabled'] });
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initSizeValidation);
} else {
  initSizeValidation();
}
