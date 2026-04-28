class SizeGuideDrawer extends HTMLElement {
  constructor() {
    super();
  }

  connectedCallback() {
    if (this.initialized) return;
    this.initialized = true;

    this.drawer = this.querySelector('.size-guide-drawer');
    this.closeBtn = this.querySelector('.size-guide-drawer__close');
    this.overlay = this.querySelector('.size-guide-drawer'); // The container itself acts as overlay

    this.initVisibilityObserver();
    this.bindEvents();
  }

  initVisibilityObserver() {
    // Check if the dropdown already exists
    this.checkDropdownVisibility();

    // Observe body for changes (since the dropdown is injected dynamically)
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          this.checkDropdownVisibility();
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
  }

  checkDropdownVisibility() {
    const dropdown = document.querySelector('.se-type-dropdown');
    const block = this.closest('.js-size-guide-block') || document.querySelector('.js-size-guide-block');

    if (block instanceof HTMLElement) {
      if (dropdown) {
        block.style.display = 'block';
      }

      const optionTitle = document.querySelector('.se-option-title');
      if (optionTitle && !optionTitle.contains(block)) {
        optionTitle.appendChild(block);
        block.style.display = 'block';
      }

      // Check native variant picker
      const variantOptionLabels = document.querySelectorAll('.variant-option label');
      let targetLabel = null;
      
      for (const label of variantOptionLabels) {
        const text = (label.textContent || '').toLowerCase().trim();
        if (text.includes('size') || text.includes('размер') || text.includes('מידה') || text.includes('מידת') || text.includes('גודל')) {
          targetLabel = label;
          break;
        }
      }

      if (targetLabel && targetLabel instanceof HTMLElement && !targetLabel.parentElement.querySelector('.js-size-guide-block')) {
        // Create a wrapper for the label and size guide if not already wrapped
        if (!targetLabel.parentElement.classList.contains('size-guide-label-wrapper')) {
          const wrapper = document.createElement('div');
          wrapper.className = 'size-guide-label-wrapper';
          wrapper.style.display = 'flex';
          wrapper.style.justifyContent = 'space-between';
          wrapper.style.alignItems = 'center';
          wrapper.style.width = '100%';
          wrapper.style.marginBottom = '8px';

          targetLabel.parentNode.insertBefore(wrapper, targetLabel);
          wrapper.appendChild(targetLabel);
          targetLabel.style.marginBottom = '0';
        }
        
        const wrapper = targetLabel.parentElement;
        wrapper.appendChild(block);
        block.style.display = 'block';
      }
    }
  }

  bindEvents() {
    if (this.closeBtn) {
      this.closeBtn.addEventListener('click', () => this.close());
    }

    if (this.overlay) {
      this.overlay.addEventListener('click', (e) => {
        if (e.target === this.overlay) {
          this.close();
        }
      });
    }

    // Listen for open events from buttons within the same block
    const block = this.closest('.js-size-guide-block') || document.querySelector('.js-size-guide-block');
    if (block) {
      const trigger = block.querySelector('.js-open-size-guide');
      if (trigger) {
        trigger.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.open();
        });
      }
    }
  }

  open() {
    if (this.drawer) this.drawer.classList.add('active');
    document.body.style.overflow = 'hidden';
  }

  close() {
    if (this.drawer) this.drawer.classList.remove('active');
    document.body.style.overflow = '';
  }
}

customElements.define('size-guide-drawer', SizeGuideDrawer);
