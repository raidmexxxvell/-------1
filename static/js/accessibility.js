// A11y утилиты для улучшения доступности
(() => {
  if (typeof window === 'undefined') {
    return;
  }

  class AccessibilityManager {
    constructor() {
      this.focusTrapStack = [];
      this.init();
    }

    init() {
      this.setupNavigationA11y();
      this.setupModalA11y();
      this.setupKeyboardNavigation();
      this.setupAriaLiveRegions();
    }

    // Настройка доступности навигации
    setupNavigationA11y() {
      const nav = document.getElementById('bottom-nav');
      if (!nav) {
        return;
      }

      // Добавляем role и aria-атрибуты для основной навигации
      nav.setAttribute('role', 'navigation');
      nav.setAttribute('aria-label', 'Основная навигация');

      // Настраиваем nav-items как кнопки
      const navItems = nav.querySelectorAll('.nav-item');
      navItems.forEach((item, index) => {
        item.setAttribute('role', 'button');
        item.setAttribute('tabindex', '0');
        item.setAttribute('aria-pressed', item.classList.contains('active') ? 'true' : 'false');

        const label = item.querySelector('.nav-label');
        if (label) {
          item.setAttribute('aria-label', label.textContent.trim());
        }

        // Keyboard navigation
        item.addEventListener('keydown', e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            item.click();
          } else if (e.key === 'ArrowLeft') {
            e.preventDefault();
            this.focusPreviousNavItem(navItems, index);
          } else if (e.key === 'ArrowRight') {
            e.preventDefault();
            this.focusNextNavItem(navItems, index);
          }
        });

        // Обновляем aria-pressed при клике
        item.addEventListener('click', () => {
          navItems.forEach(ni => ni.setAttribute('aria-pressed', 'false'));
          item.setAttribute('aria-pressed', 'true');
        });
      });

      // Настройка подтабов
      this.setupSubtabsA11y();
    }

    setupSubtabsA11y() {
      const subtabContainers = document.querySelectorAll('.subtabs');

      subtabContainers.forEach(container => {
        container.setAttribute('role', 'tablist');

        const subtabs = container.querySelectorAll('.subtab-item');
        subtabs.forEach((subtab, index) => {
          subtab.setAttribute('role', 'tab');
          subtab.setAttribute('tabindex', subtab.classList.contains('active') ? '0' : '-1');
          subtab.setAttribute(
            'aria-selected',
            subtab.classList.contains('active') ? 'true' : 'false'
          );
          subtab.setAttribute('id', `subtab-${container.id}-${index}`);

          // Keyboard navigation for subtabs
          subtab.addEventListener('keydown', e => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              subtab.click();
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault();
              this.focusPreviousSubtab(subtabs, index);
            } else if (e.key === 'ArrowRight') {
              e.preventDefault();
              this.focusNextSubtab(subtabs, index);
            }
          });

          // Update aria-selected on click
          subtab.addEventListener('click', () => {
            subtabs.forEach(st => {
              st.setAttribute('aria-selected', 'false');
              st.setAttribute('tabindex', '-1');
            });
            subtab.setAttribute('aria-selected', 'true');
            subtab.setAttribute('tabindex', '0');
          });
        });
      });
    }

    // Настройка модальных окон
    setupModalA11y() {
      const modals = document.querySelectorAll('.modal');

      modals.forEach(modal => {
        modal.setAttribute('aria-hidden', 'true');
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');

        // Focus trap для модальных окон
        modal.addEventListener('keydown', e => {
          if (e.key === 'Escape') {
            this.closeModal(modal);
          } else if (e.key === 'Tab') {
            this.trapFocus(e, modal);
          }
        });

        // Закрытие по клику на backdrop
        const backdrop = modal.querySelector('.modal-backdrop');
        if (backdrop) {
          backdrop.addEventListener('click', () => {
            this.closeModal(modal);
          });
        }
      });
    }

    // Глобальная клавиатурная навигация
    setupKeyboardNavigation() {
      document.addEventListener('keydown', e => {
        // Skip navigation (Alt + S)
        if (e.altKey && e.key === 's') {
          e.preventDefault();
          this.skipToMainContent();
        }

        // Focus navigation panel (Alt + N)
        if (e.altKey && e.key === 'n') {
          e.preventDefault();
          this.focusNavigation();
        }
      });
    }

    // Настройка live regions для динамического контента
    setupAriaLiveRegions() {
      // Добавляем aria-live для областей с динамическим контентом
      const newsContainer = document.getElementById('news-list');
      if (newsContainer && !newsContainer.getAttribute('aria-live')) {
        newsContainer.setAttribute('aria-live', 'polite');
      }

      // Для error messages
      const errorContainers = document.querySelectorAll('.error-message, .alert');
      errorContainers.forEach(container => {
        if (!container.getAttribute('aria-live')) {
          container.setAttribute('aria-live', 'assertive');
        }
      });
    }

    // Утилиты навигации
    focusPreviousNavItem(items, currentIndex) {
      const prevIndex = currentIndex === 0 ? items.length - 1 : currentIndex - 1;
      items[prevIndex].focus();
    }

    focusNextNavItem(items, currentIndex) {
      const nextIndex = currentIndex === items.length - 1 ? 0 : currentIndex + 1;
      items[nextIndex].focus();
    }

    focusPreviousSubtab(items, currentIndex) {
      const prevIndex = currentIndex === 0 ? items.length - 1 : currentIndex - 1;
      items[prevIndex].focus();
    }

    focusNextSubtab(items, currentIndex) {
      const nextIndex = currentIndex === items.length - 1 ? 0 : currentIndex + 1;
      items[nextIndex].focus();
    }

    // Модальные окна
    openModal(modal) {
      modal.setAttribute('aria-hidden', 'false');
      modal.style.display = 'flex';

      // Сохраняем текущий фокус
      this.focusTrapStack.push(document.activeElement);

      // Фокусируем первый focusable элемент в модалке
      const firstFocusable = this.getFocusableElements(modal)[0];
      if (firstFocusable) {
        firstFocusable.focus();
      }
    }

    closeModal(modal) {
      modal.setAttribute('aria-hidden', 'true');
      modal.style.display = 'none';

      // Возвращаем фокус
      const previousFocus = this.focusTrapStack.pop();
      if (previousFocus) {
        previousFocus.focus();
      }
    }

    // Focus trap для модальных окон
    trapFocus(e, modal) {
      const focusableElements = this.getFocusableElements(modal);
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    }

    getFocusableElements(container) {
      const focusableSelectors = [
        'button:not([disabled])',
        'input:not([disabled])',
        'select:not([disabled])',
        'textarea:not([disabled])',
        'a[href]',
        '[tabindex]:not([tabindex="-1"])',
      ];

      return Array.from(container.querySelectorAll(focusableSelectors.join(', '))).filter(el => {
        return (
          !el.hidden &&
          el.offsetWidth > 0 &&
          el.offsetHeight > 0 &&
          getComputedStyle(el).visibility !== 'hidden'
        );
      });
    }

    // Skip navigation
    skipToMainContent() {
      const mainContent =
        document.getElementById('app-content') ||
        document.querySelector('main') ||
        document.querySelector('[role="main"]');
      if (mainContent) {
        mainContent.focus();
        mainContent.scrollIntoView();
      }
    }

    focusNavigation() {
      const nav = document.getElementById('bottom-nav');
      if (nav) {
        const firstNavItem = nav.querySelector('.nav-item');
        if (firstNavItem) {
          firstNavItem.focus();
        }
      }
    }

    // Announce to screen readers
    announce(message, priority = 'polite') {
      const announcer = document.createElement('div');
      announcer.setAttribute('aria-live', priority);
      announcer.setAttribute('aria-atomic', 'true');
      announcer.classList.add('sr-only');
      announcer.textContent = message;

      document.body.appendChild(announcer);

      setTimeout(() => {
        document.body.removeChild(announcer);
      }, 1000);
    }

    // Проверка наличия reduce motion
    prefersReducedMotion() {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    }
  }

  // Инициализация
  document.addEventListener('DOMContentLoaded', () => {
    window.A11yManager = new AccessibilityManager();
  });

  // Если DOM уже загружен
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.A11yManager = new AccessibilityManager();
    });
  } else {
    window.A11yManager = new AccessibilityManager();
  }
})();
