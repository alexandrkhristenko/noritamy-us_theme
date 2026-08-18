document.addEventListener('DOMContentLoaded', () => {
  const klaviyoTexts = document.querySelectorAll('.js-klaviyo-announcement');
  
  klaviyoTexts.forEach((el) => {
    el.addEventListener('click', function(e) {
      const formId = this.getAttribute('data-klaviyo-form-id');
      if (formId) {
        window._klOnsite = window._klOnsite || [];
        window._klOnsite.push(['openForm', formId]);
      }
    });
  });
});
