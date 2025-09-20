// static/js/dom-utils.js
// Унифицированные утилиты для работы с DOM элементами
(function(){
  if (window.DOMUtils) { return; } // idempotent

  // Создание элемента с className и опциональными атрибутами
  function createElement(tag, className = '', attributes = {}) {
    const element = document.createElement(tag);
    
    if (className) {
      element.className = className;
    }
    
    // Устанавливаем атрибуты
    Object.entries(attributes).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        if (key === 'textContent' || key === 'innerHTML') {
          element[key] = value;
        } else if (key.startsWith('data-')) {
          element.setAttribute(key, String(value));
        } else if (key === 'style' && typeof value === 'object') {
          Object.entries(value).forEach(([prop, val]) => {
            element.style[prop] = val;
          });
        } else {
          element.setAttribute(key, String(value));
        }
      }
    });
    
    return element;
  }

  // Создание div с классом
  function createDiv(className = '', attributes = {}) {
    return createElement('div', className, attributes);
  }

  // Создание span с классом
  function createSpan(className = '', attributes = {}) {
    return createElement('span', className, attributes);
  }

  // Создание button с классом и обработчиком
  function createButton(text, className = '', onClick = null, attributes = {}) {
    const button = createElement('button', className, {
      textContent: text,
      ...attributes
    });
    
    if (onClick && typeof onClick === 'function') {
      button.addEventListener('click', onClick);
    }
    
    return button;
  }

  // Пакетное добавление элементов в родителя (для производительности)
  function batchAppend(parent, elements, batchSize = 20) {
    if (!parent || !elements || !elements.length) return;
    
    let i = 0;
    function step() {
      if (i >= elements.length) return;
      
      const fragment = document.createDocumentFragment();
      for (let k = 0; k < batchSize && i < elements.length; k++, i++) {
        if (elements[i]) {
          fragment.appendChild(elements[i]);
        }
      }
      parent.appendChild(fragment);
      
      // Используем requestAnimationFrame для плавности
      if (i < elements.length) {
        requestAnimationFrame(step);
      }
    }
    step();
  }

  // Очистка содержимого элемента
  function clearElement(element) {
    if (!element) return;
    while (element.firstChild) {
      element.removeChild(element.firstChild);
    }
  }

  // Установка состояния загрузки для элемента
  function setLoadingState(element, isLoading = true, loadingText = 'Загрузка...') {
    if (!element) return;
    
    if (isLoading) {
      element.dataset.originalText = element.textContent;
      element.textContent = loadingText;
      element.disabled = true;
    } else {
      element.textContent = element.dataset.originalText || element.textContent;
      element.disabled = false;
      delete element.dataset.originalText;
    }
  }

  // Создание иконки (img элемент с fallback)
  function createIcon(primarySrc, fallbackSrcs = [], size = '16px', alt = '') {
    const img = document.createElement('img');
    img.alt = alt;
    img.style.width = size;
    img.style.height = size;
    img.style.objectFit = 'contain';
    
    let currentIndex = 0;
    const srcs = [primarySrc, ...fallbackSrcs];
    
    const tryNextSrc = () => {
      if (currentIndex >= srcs.length) return;
      
      img.onerror = () => {
        currentIndex++;
        tryNextSrc();
      };
      
      img.src = srcs[currentIndex];
    };
    
    tryNextSrc();
    return img;
  }

  // Создание элемента с детьми
  function createWithChildren(tag, className = '', children = [], attributes = {}) {
    const element = createElement(tag, className, attributes);
    
    children.forEach(child => {
      if (child) {
        element.appendChild(child);
      }
    });
    
    return element;
  }

  // Создание таблицы с заголовками
  function createTable(headers = [], className = 'table') {
    const table = createElement('table', className);
    const thead = createElement('thead');
    const tbody = createElement('tbody');
    
    if (headers.length > 0) {
      const headerRow = createElement('tr');
      headers.forEach(headerText => {
        const th = createElement('th', '', { textContent: headerText });
        headerRow.appendChild(th);
      });
      thead.appendChild(headerRow);
    }
    
    table.appendChild(thead);
    table.appendChild(tbody);
    
    return { table, thead, tbody };
  }

  // Создание строки таблицы
  function createTableRow(cells = [], className = '') {
    const row = createElement('tr', className);
    
    cells.forEach(cellContent => {
      const td = createElement('td');
      if (typeof cellContent === 'string') {
        td.textContent = cellContent;
      } else if (cellContent instanceof Node) {
        td.appendChild(cellContent);
      } else {
        td.textContent = String(cellContent);
      }
      row.appendChild(td);
    });
    
    return row;
  }

  // Показать/скрыть элемент с анимацией
  function toggleElement(element, show = null) {
    if (!element) return;
    
    const isVisible = element.style.display !== 'none';
    const shouldShow = show !== null ? show : !isVisible;
    
    if (shouldShow) {
      element.style.display = element.dataset.originalDisplay || 'block';
      element.style.opacity = '0';
      requestAnimationFrame(() => {
        element.style.transition = 'opacity 0.3s ease';
        element.style.opacity = '1';
      });
    } else {
      element.dataset.originalDisplay = getComputedStyle(element).display;
      element.style.transition = 'opacity 0.3s ease';
      element.style.opacity = '0';
      setTimeout(() => {
        element.style.display = 'none';
      }, 300);
    }
  }

  // Экспорт в глобальный объект
  window.DOMUtils = {
    createElement,
    createDiv,
    createSpan,
    createButton,
    batchAppend,
    clearElement,
    setLoadingState,
    createIcon,
    createWithChildren,
    createTable,
    createTableRow,
    toggleElement
  };

  // Удобные глобальные шорткаты для обратной совместимости
  try {
    if (!window.createElement) {
      window.createElement = createElement;
    }
    if (!window.batchAppend) {
      window.batchAppend = batchAppend;
    }
  } catch(_) {}
})();