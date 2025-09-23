// Специальный патч для Telegram WebApp на мобильных устройствах
// Добавляем поддержку псевдо-фуллскрина для видео

(function() {
    // Проверяем, что мы в Telegram WebApp
    if (typeof window.Telegram === 'undefined' || !window.Telegram.WebApp) {
        return;
    }
    
    // Настраиваем Telegram WebApp для лучшей работы с видео
    const tg = window.Telegram.WebApp;
    // Вспомогательная функция сравнения версий '6.0' < '6.1'
    function parseVer(v){
        try { return String(v||'').split('.').map(n=>parseInt(n,10)||0); } catch(_) { return [0,0,0]; }
    }
    function gteVer(v, min){
        const a=parseVer(v), b=parseVer(min);
        for(let i=0;i<Math.max(a.length,b.length);i++){
            const ai=a[i]||0, bi=b[i]||0; if(ai>bi) return true; if(ai<bi) return false;
        }
        return true;
    }
    const BACK_API_MIN_VERSION = '6.1';
    const backApiSupported = !!(tg && tg.BackButton) && gteVer(tg.version, BACK_API_MIN_VERSION);
    
    // Расширяем область просмотра
    if (tg.expand) {
        tg.expand();
        
    }
    
    // Ранее вызывалось tg.enableClosingConfirmation(), что включало системный диалог Telegram
    // «Вы действительно хотите закрыть? / изменения могут быть потеряны». Убираем, чтобы не мешать UX.
    // Если когда‑нибудь понадобится вернуть — раскомментировать ниже.
    // if (tg.enableClosingConfirmation) { tg.enableClosingConfirmation(); }
    
    // Настраиваем viewport для лучшей работы с видео
    if (tg.setHeaderColor) {
        tg.setHeaderColor('#000000');
    }
    
    // Отключаем вертикальные свайпы при просмотре видео в фуллскрине
    let _isVideoFullscreen = false;
    
    function disableSwipes() {
    _isVideoFullscreen = true;
        document.body.style.overflow = 'hidden';
        document.body.style.position = 'fixed';
        document.body.style.width = '100%';
        document.body.style.height = '100%';
        
        // Отключаем свайпы в Telegram
        if (tg.disableVerticalSwipes) {
            tg.disableVerticalSwipes();
        }
    }
    
    function enableSwipes() {
    _isVideoFullscreen = false;
        document.body.style.overflow = '';
        document.body.style.position = '';
        document.body.style.width = '';
        document.body.style.height = '';
        
        // Включаем свайпы обратно
        if (tg.enableVerticalSwipes) {
            tg.enableVerticalSwipes();
        }
    }
    
    // Слушаем изменения псевдо-фуллскрина
    const Observer = window.MutationObserver || window.WebKitMutationObserver || window.MozMutationObserver;
    if (!Observer) { return; }
    const observer = new Observer((mutations) => {
        mutations.forEach((mutation) => {
            if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
                const target = mutation.target;
                if (target.id === 'md-pane-stream') {
                    if (target.classList.contains('fs-mode')) {
                        
                        disableSwipes();
                        
                        // Принудительно поворачиваем в ландшафт если возможно
                        if (window.screen && window.screen.orientation) {
                            window.screen.orientation.lock('landscape').catch(() => {
                                
                            });
                        }
                    } else {
                        
                        enableSwipes();
                        
                        // Разблокируем ориентацию
                        if (window.screen && window.screen.orientation) {
                            window.screen.orientation.unlock();
                        }
                    }
                }
            }
        });
    });
    
    // Наблюдаем за изменениями во всем документе
    observer.observe(document.body, {
        attributes: true,
        childList: true,
        subtree: true,
        attributeFilter: ['class']
    });
    
    // Добавляем обработчик кнопки "Назад" в Telegram
    tg.onEvent('backButtonClicked', () => {
        const streamPane = document.getElementById('md-pane-stream');
        if (streamPane && streamPane.classList.contains('fs-mode')) {
            // Выходим из фуллскрина вместо закрытия приложения
            streamPane.classList.remove('fs-mode');
            enableSwipes();
            
        } else {
            // Обычное поведение кнопки "Назад"
            tg.close();
        }
    });
    
    // Показываем/скрываем кнопку "Назад" только по событиям, без периодического опроса
    let __backWarned = false;
    let __backVisible = null; // tri-state: null (unknown), true (shown), false (hidden)
    function updateBackButton() {
        try {
            // Если API официально не поддержан текущей версией — не дергаем SDK вовсе
            if (!backApiSupported) {
                if (!__backWarned) {
                    __backWarned = true;
                    try { console.warn('[Telegram.WebApp] BackButton is not supported in this version'); } catch(_) {}
                }
                return;
            }
            const streamPane = document.getElementById('md-pane-stream');
            const need = !!(streamPane && streamPane.classList.contains('fs-mode'));
            // Избегаем повторных вызовов show/hide, чтобы не плодить внутренние предупреждения SDK
            if (need === true && __backVisible !== true && tg.BackButton.show) {
                tg.BackButton.show();
                __backVisible = true;
            } else if (need === false && __backVisible !== false && tg.BackButton.hide) {
                tg.BackButton.hide();
                __backVisible = false;
            }
        } catch(_) {}
    }
    // Первичная установка
    updateBackButton();
    // Реагируем на изменения DOM (fs-mode)
    document.addEventListener('transitionend', updateBackButton, true);
    document.addEventListener('animationend', updateBackButton, true);
    document.addEventListener('fullscreenchange', updateBackButton, true);
    
    
})();
