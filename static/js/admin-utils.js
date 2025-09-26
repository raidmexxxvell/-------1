// static/js/admin-utils.js
// Унифицированные утилиты для админских функций и Telegram WebApp интеграции
(function () {
  if (window.AdminUtils) {
    return;
  } // idempotent

  // Получение Telegram WebApp объекта
  function getTelegramWebApp() {
    return window.Telegram?.WebApp || null;
  }

  // Получение initData для API запросов
  function getTelegramInitData() {
    const tg = getTelegramWebApp();
    return tg?.initData || '';
  }

  // Получение текущего пользователя Telegram
  function getTelegramUser() {
    const tg = getTelegramWebApp();
    return tg?.initDataUnsafe?.user || null;
  }

  // Получение ID текущего пользователя как строка
  function getTelegramUserId() {
    const user = getTelegramUser();
    return user?.id ? String(user.id) : '';
  }

  // Проверка является ли текущий пользователь админом
  function isCurrentUserAdmin() {
    try {
      const adminId = document.body.getAttribute('data-admin');
      const currentId = getTelegramUserId();
      return !!(adminId && currentId && String(adminId) === currentId);
    } catch (_) {
      return false;
    }
  }

  // Создание FormData с базовыми полями для админских запросов
  function createAdminFormData(additionalFields = {}) {
    const fd = new FormData();
    const initData = getTelegramInitData();
    if (initData) {
      fd.append('initData', initData);
    }

    // Добавляем дополнительные поля
    Object.entries(additionalFields).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        fd.append(key, String(value));
      }
    });

    return fd;
  }

  // Создание стандартной админской кнопки
  function createAdminButton(text, options = {}) {
    const {
      className = 'details-btn',
      style = { padding: '0 6px', minWidth: 'unset' },
      onClick = null,
    } = options;

    const button = document.createElement('button');
    button.className = className;
    button.textContent = text;

    // Применяем стили
    Object.entries(style).forEach(([prop, value]) => {
      button.style[prop] = value;
    });

    if (onClick && typeof onClick === 'function') {
      button.addEventListener('click', onClick);
    }

    return button;
  }

  // Утилита для безопасного выполнения админских действий с лоадингом
  async function executeWithLoading(button, action) {
    if (!button || typeof action !== 'function') {
      throw new Error('Button element and action function required');
    }

    const originalText = button.textContent;
    const originalDisabled = button.disabled;

    try {
      button.disabled = true;
      button.textContent = 'Загрузка...';

      const result = await action();
      return result;
    } catch (error) {
      console.error('Admin action error:', error);
      throw error;
    } finally {
      button.disabled = originalDisabled;
      button.textContent = originalText;
    }
  }

  // Показать админский алерт (если доступен глобальный showAlert)
  function showAdminAlert(message, type = 'info') {
    if (window.showAlert && typeof window.showAlert === 'function') {
      window.showAlert(message, type);
    } else {
      // Fallback на console
      console.log(`[ADMIN ${type.toUpperCase()}]:`, message);
    }
  }

  // Проверка и показ админского интерфейса
  function showAdminOnlyElement(element) {
    if (!element) return false;

    if (isCurrentUserAdmin()) {
      element.style.display = element.style.display || 'block';
      return true;
    } else {
      element.style.display = 'none';
      return false;
    }
  }

  // Экспорт в глобальный объект
  window.AdminUtils = {
    getTelegramWebApp,
    getTelegramInitData,
    getTelegramUser,
    getTelegramUserId,
    isCurrentUserAdmin,
    createAdminFormData,
    createAdminButton,
    executeWithLoading,
    showAdminAlert,
    showAdminOnlyElement,
  };

  // Удобные глобальные шорткаты для обратной совместимости
  try {
    if (!window.isCurrentUserAdmin) {
      window.isCurrentUserAdmin = isCurrentUserAdmin;
    }
    if (!window.createAdminFormData) {
      window.createAdminFormData = createAdminFormData;
    }
  } catch (_) {}
})();
