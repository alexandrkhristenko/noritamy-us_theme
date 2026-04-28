(function () {
  const hideSingleOptions = () => {
    // Находим все контейнеры опций
    const seOptions = document.querySelectorAll('.se-option');

    seOptions.forEach((option) => {
      // Считаем количество именно оберток вариантов (swatch-wrapper)
      // Это самые мелкие единицы выбора (Gold, Silver и т.д.)
      const variants = option.querySelectorAll('.se-swatch-wrapper');
      if (variants.length === 1) {
        if (option.style.display !== 'none') {
          option.style.setProperty('display', 'none', 'important');
        }
      } else if (variants.length > 1) {
        // Если вариантов больше 1, убеждаемся, что блок НЕ скрыт
        // (важно, если скрипт отрабатывает повторно после смены фильтров)
        if (option.style.display === 'none') {
          option.style.display = '';
        }
      }
    });
  };

  // Наблюдатель за динамическими изменениями
  const observer = new MutationObserver(() => {
    hideSingleOptions();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: false, // Отключаем слежение за атрибутами, чтобы избежать циклической ошибки
  });

  // Первый запуск
  hideSingleOptions();
})();
