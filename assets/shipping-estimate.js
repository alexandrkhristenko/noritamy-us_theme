class ShippingEstimate extends HTMLElement {
    constructor() {
        super();
        this.dateElement = this.querySelector('[data-shipping-date]');
        this.dateEndElement = this.querySelector('[data-shipping-date-end]');
        this.minDays = parseInt(this.dataset.minDays) || 4;
        this.maxDays = parseInt(this.dataset.maxDays) || 8;
    }

    connectedCallback() {
        if (!this.dateElement) return;
        const startDate = this.calculateBusinessDate(this.minDays);
        const endDate = this.calculateBusinessDate(this.maxDays);
        this.dateElement.textContent = this.formatDate(startDate);
        if (this.dateEndElement) {
            this.dateEndElement.textContent = this.formatDate(endDate);
        }
    }

    calculateBusinessDate(daysToAdd) {
        let currentDate = new Date();
        let addedDays = 0;

        while (addedDays < daysToAdd) {
            currentDate.setDate(currentDate.getDate() + 1);
            // 0 is Sunday, 6 is Saturday. Skip them.
            if (currentDate.getDay() !== 0 && currentDate.getDay() !== 6) {
                addedDays++;
            }
        }

        return currentDate;
    }

    formatDate(date) {
        const lang = document.documentElement.lang || 'en';
        const locale = lang.startsWith('he') ? 'he-IL' : 'en-US';
        const options = { month: 'short', day: 'numeric' };
        return date.toLocaleDateString(locale, options);
    }
}

customElements.define('shipping-estimate', ShippingEstimate);
