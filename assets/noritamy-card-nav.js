/* Noritamy: self-contained left/right swipe arrows for collection product cards.
   Independent of the theme's slideshow-control mechanism (which the theme hides on
   touch). Drives the scroll by the slides' PHYSICAL positions so it works the same
   in LTR and RTL (in RTL the scroller's scrollLeft runs 0..negative, which broke the
   old +/-clientWidth approach — the right arrow did nothing). */
(function () {
  function arrowFrom(e) {
    return e.target && e.target.closest ? e.target.closest('.noritamy-cardnav__btn') : null;
  }

  function scrollerOf(btn) {
    var gallery = btn.closest('.card-gallery');
    if (!gallery) return null;
    return (
      gallery.querySelector('slideshow-slides') ||
      gallery.querySelector('[ref="scroller"]') ||
      gallery.querySelector('.slideshow-slides')
    );
  }

  // Target slide by sequence (DOM order): step = +1 for the › (next) arrow,
  // -1 for the ‹ (prev) arrow. Current slide = the one nearest the scroller centre.
  function targetSlide(scroller, step) {
    var kids = Array.prototype.filter.call(scroller.children, function (el) {
      return el.getBoundingClientRect().width > 2;
    });
    if (!kids.length) return null;
    var sc = scroller.getBoundingClientRect();
    var center = sc.left + sc.width / 2;
    var curIdx = 0, best = Infinity;
    kids.forEach(function (s, i) {
      var r = s.getBoundingClientRect();
      var d = Math.abs(r.left + r.width / 2 - center);
      if (d < best) { best = d; curIdx = i; }
    });
    var t = curIdx + step;
    if (t < 0 || t >= kids.length) return null;
    return kids[t];
  }

  function activate(btn) {
    var scroller = scrollerOf(btn);
    if (!scroller) return;
    var step = btn.getAttribute('data-dir') === 'next' ? 1 : -1;
    var target = targetSlide(scroller, step);
    if (!target) return;
    // Scroll the SCROLLER only (not the page) by the physical distance from the
    // scroller centre to the target centre — correct in both LTR and RTL.
    var sc = scroller.getBoundingClientRect();
    var tr = target.getBoundingClientRect();
    var delta = (tr.left + tr.width / 2) - (sc.left + sc.width / 2);
    scroller.scrollBy({ left: delta, behavior: 'smooth' });
  }

  // Keep every tap/click on the arrow from reaching the card link (which would
  // otherwise open the PDP), across mouse, pointer and touch event models.
  ['pointerdown', 'pointerup', 'touchstart', 'touchend', 'mousedown', 'mouseup'].forEach(function (evt) {
    document.addEventListener(evt, function (e) {
      if (arrowFrom(e)) e.stopPropagation();
    }, { capture: true, passive: true });
  });

  document.addEventListener('click', function (e) {
    var btn = arrowFrom(e);
    if (!btn) return;
    e.preventDefault();
    e.stopPropagation();
    activate(btn);
  }, true);
})();
