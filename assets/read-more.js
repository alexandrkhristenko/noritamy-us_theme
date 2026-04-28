class ReadMoreComponent extends HTMLElement {
    constructor() {
        super();
        this.button = this.querySelector('[data-read-more-toggle]');
        this.content = this.querySelector('[data-read-more-content]');
        this.wrapper = this.querySelector('.read-more-wrapper');
        this.isExpanded = false;

        // Default settings
        this.collapsedHeight = parseInt(this.dataset.collapsedHeight) || 100;
    }

    connectedCallback() {
        if (!this.button || !this.content) return;

        // Check if content is actually taller than the limit
        this.checkHeight();

        // Re-check on resize
        window.addEventListener('resize', this.checkHeight.bind(this));

        this.button.addEventListener('click', this.toggle.bind(this));
    }

    checkHeight() {
        if (this.content.scrollHeight <= this.collapsedHeight) {
            this.wrapper.classList.add('no-overflow');
            this.button.style.display = 'none';
            this.wrapper.style.height = 'auto';
            this.wrapper.style.maskImage = 'none';
            this.wrapper.style.webkitMaskImage = 'none';
        } else {
            this.wrapper.classList.remove('no-overflow');
            this.button.style.display = 'inline-flex';
            if (!this.isExpanded) {
                this.collapse();
            }
        }
    }

    toggle() {
        this.isExpanded = !this.isExpanded;
        this.button.setAttribute('aria-expanded', this.isExpanded);

        if (this.isExpanded) {
            this.expand();
        } else {
            this.collapse();
        }
    }

    expand() {
        this.wrapper.style.height = `${this.content.scrollHeight}px`;
        this.wrapper.classList.add('expanded');
        this.button.querySelector('.read-more-text').textContent = this.dataset.readLessText;
    }

    collapse() {
        this.wrapper.style.height = `${this.collapsedHeight}px`;
        this.wrapper.classList.remove('expanded');
        this.button.querySelector('.read-more-text').textContent = this.dataset.readMoreText;

        // Scroll back to top of component if we're far down
        const rect = this.getBoundingClientRect();
        if (rect.top < 0) {
            this.scrollIntoView({ behavior: 'smooth' });
        }
    }
}

customElements.define('read-more-component', ReadMoreComponent);
