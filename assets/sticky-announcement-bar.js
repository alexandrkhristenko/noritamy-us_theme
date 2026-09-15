/**
 * Keeps the global `--announcement-bar-height` custom property in sync with the
 * height of a sticky announcement bar, so a sticky header can offset itself
 * below the bar instead of overlapping it.
 */
export class StickyAnnouncementBar extends HTMLElement {
  /** @type {ResizeObserver | undefined} */
  #resizeObserver;

  connectedCallback() {
    const bar = this.querySelector(".announcement-bar");
    if (!(bar instanceof HTMLElement)) return;

    this.#setHeight(bar.getBoundingClientRect().height);

    this.#resizeObserver = new ResizeObserver(([entry]) => {
      if (!entry) return;
      this.#setHeight(entry.target.getBoundingClientRect().height);
    });
    this.#resizeObserver.observe(bar);
  }

  disconnectedCallback() {
    this.#resizeObserver?.disconnect();
    this.#resizeObserver = undefined;
    document.body.style.removeProperty("--announcement-bar-height");
    document.dispatchEvent(new CustomEvent("announcementbar:resize"));
  }

  /**
   * @param {number} height
   */
  #setHeight(height) {
    document.body.style.setProperty("--announcement-bar-height", `${height}px`);
    document.dispatchEvent(new CustomEvent("announcementbar:resize"));
  }
}

if (!customElements.get("sticky-announcement-bar")) {
  customElements.define("sticky-announcement-bar", StickyAnnouncementBar);
}
