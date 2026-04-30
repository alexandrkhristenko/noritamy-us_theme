class CustomGallery extends HTMLElement {
  constructor() {
    super();
    this.dialog = this.querySelector('.custom-gallery__modal');
    this.dialogImg = this.querySelector('.custom-gallery__modal-img');
    this.closeBtn = this.querySelector('.custom-gallery__modal-close');
    this.prevBtn = this.querySelector('.custom-gallery__modal-prev');
    this.nextBtn = this.querySelector('.custom-gallery__modal-next');
    this.items = Array.from(this.querySelectorAll('.custom-gallery__item'));
    
    this.currentIndex = 0;

    this.items.forEach((btn, index) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        this.openModal(index);
      });
    });

    this.closeBtn.addEventListener('click', () => this.closeModal());
    this.dialog.addEventListener('click', (e) => {
      if (e.target === this.dialog) this.closeModal();
    });

    if (this.prevBtn && this.nextBtn) {
      this.prevBtn.addEventListener('click', () => this.navigate(-1));
      this.nextBtn.addEventListener('click', () => this.navigate(1));
    }
    
    // Keyboard navigation
    this.addEventListener('keydown', (e) => {
      if (!this.dialog.open) return;
      if (e.key === 'ArrowLeft') this.navigate(-1);
      if (e.key === 'ArrowRight') this.navigate(1);
      if (e.key === 'Escape') this.closeModal();
    });
  }

  openModal(index) {
    this.currentIndex = index;
    this.updateImage();
    this.dialog.showModal();
    document.body.style.overflow = 'hidden';
  }

  updateImage() {
    const item = this.items[this.currentIndex];
    if (item) {
      this.dialogImg.classList.remove('loaded');
      
      const newSrc = item.dataset.fullUrl;
      
      // If same image, just show it
      if (this.dialogImg.src.includes(newSrc)) {
        this.dialogImg.classList.add('loaded');
      } else {
        // Wait for load before fading in
        this.dialogImg.onload = () => {
          this.dialogImg.classList.add('loaded');
        };
        this.dialogImg.src = newSrc;
      }
      
      this.dialogImg.alt = item.querySelector('img').alt || '';
    }
  }

  navigate(direction) {
    this.currentIndex += direction;
    if (this.currentIndex < 0) this.currentIndex = this.items.length - 1;
    if (this.currentIndex >= this.items.length) this.currentIndex = 0;
    this.updateImage();
  }

  closeModal() {
    this.dialog.close();
    document.body.style.overflow = '';
  }
}
customElements.define('custom-gallery', CustomGallery);
