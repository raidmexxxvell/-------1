/**
 * Local Admin Authentication Patch
 * Добавляет поддержку локальной авторизации администратора без Telegram WebApp
 */

(function() {
    'use strict';
    
    console.log('[LocalAuth] Инициализация локальной авторизации администратора');
    
    // Проверяем статус администратора через API
    async function checkAdminStatusViaAPI() {
        try {
            const response = await fetch('/api/admin/status');
            const data = await response.json();
            console.log('[LocalAuth] API ответ:', data);
            return data.isAdmin === true ? data : null;
        } catch (error) {
            console.warn('[LocalAuth] Ошибка API проверки:', error);
            return null;
        }
    }
    
    // Функция для проверки cookie админ-авторизации
    function hasAdminCookie() {
        try {
            const cookies = document.cookie.split(';');
            for (let cookie of cookies) {
                const [name, value] = cookie.trim().split('=');
                if (name === 'admin_auth' && value) {
                    return true;
                }
            }
        } catch (e) {
            console.warn('[LocalAuth] Ошибка при проверке cookie:', e);
        }
        return false;
    }
    
    // Функция для получения админ ID из data-admin атрибута
    function getAdminId() {
        try {
            return document.body.getAttribute('data-admin');
        } catch (e) {
            console.warn('[LocalAuth] Ошибка при получении admin ID:', e);
            return null;
        }
    }
    
    // Глобальная переменная для хранения статуса админа
    window.__ADMIN_STATUS__ = null;
    
    // Функция инициализации статуса администратора
    async function initializeAdminStatus() {
        console.log('[LocalAuth] Проверяем статус администратора...');
        
        const adminStatus = await checkAdminStatusViaAPI();
        if (adminStatus) {
            window.__ADMIN_STATUS__ = adminStatus;
            
            // Создаем фальшивый Telegram WebApp объект для совместимости
            if (!window.Telegram) {
                window.Telegram = {};
            }
            if (!window.Telegram.WebApp) {
                window.Telegram.WebApp = {};
            }
            if (!window.Telegram.WebApp.initDataUnsafe) {
                window.Telegram.WebApp.initDataUnsafe = {};
            }
            if (!window.Telegram.WebApp.initDataUnsafe.user) {
                window.Telegram.WebApp.initDataUnsafe.user = {
                    id: parseInt(adminStatus.userId),
                    first_name: 'Local Admin',
                    username: 'local_admin'
                };
                console.log('[LocalAuth] Создан фальшивый Telegram user для администратора:', window.Telegram.WebApp.initDataUnsafe.user);
            }
            
            // Уведомляем приложение об изменении статуса
            document.dispatchEvent(new CustomEvent('adminStatusChanged', {
                detail: { isAdmin: true, authType: adminStatus.authType }
            }));
            
            return true;
        }
        
        console.log('[LocalAuth] Пользователь не является администратором');
        return false;
    }
    
    // Патчим глобальную проверку администратора
    window.__LOCAL_ADMIN_CHECK__ = function() {
        const adminId = getAdminId();
        
        console.log('[LocalAuth] Локальная проверка администратора:', {
            adminId,
            adminStatus: window.__ADMIN_STATUS__,
            telegramAvailable: !!(window.Telegram?.WebApp?.initDataUnsafe?.user?.id)
        });
        
        if (!adminId) {
            console.log('[LocalAuth] Admin ID не задан');
            return false;
        }
        
        // Проверяем API статус (приоритет)
        if (window.__ADMIN_STATUS__ && window.__ADMIN_STATUS__.isAdmin) {
            console.log('[LocalAuth] API авторизация успешна');
            return true;
        }
        
        // Проверяем Telegram авторизацию (fallback)
        const telegramId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
        if (telegramId && String(telegramId) === String(adminId)) {
            console.log('[LocalAuth] Telegram авторизация успешна');
            return true;
        }
        
        console.log('[LocalAuth] Авторизация не пройдена');
        return false;
    };
    
    // Патчим существующие проверки администратора в коде
    const originalIsAdmin = window.isAdmin;
    window.isAdmin = function() {
        if (originalIsAdmin && typeof originalIsAdmin === 'function') {
            const result = originalIsAdmin();
            if (result) return result;
        }
        return window.__LOCAL_ADMIN_CHECK__();
    };
    
    // Инициализация при загрузке DOM
    async function initialize() {
        try {
            const isAdmin = await initializeAdminStatus();
            if (isAdmin) {
                console.log('[LocalAuth] Администратор успешно авторизован');
                
                // Принудительно обновляем UI элементы администратора
                setTimeout(() => {
                    document.dispatchEvent(new CustomEvent('adminUIRefresh'));
                }, 500);
            }
        } catch (error) {
            console.error('[LocalAuth] Ошибка инициализации:', error);
        }
    }
    
    // Запускаем инициализацию
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initialize);
    } else {
        // DOM уже загружен
        setTimeout(initialize, 100);
    }
    
})();