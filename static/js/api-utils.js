// static/js/api-utils.js
// Унифицированные утилиты для API запросов и обработки ответов
(function(){
  if (window.APIUtils) { return; } // idempotent

  // Безопасное получение JSON из response
  async function safeJsonParse(response) {
    try {
      return await response.json();
    } catch(_) {
      return null;
    }
  }

  // Создание FormData с базовыми полями
  function createFormData(fields = {}) {
    const fd = new FormData();
    
    Object.entries(fields).forEach(([key, value]) => {
      if (value !== null && value !== undefined) {
        fd.append(key, String(value));
      }
    });
    
    return fd;
  }

  // Создание FormData с Telegram initData
  function createTelegramFormData(fields = {}) {
    const tg = window.Telegram?.WebApp || null;
    const initData = tg?.initData || '';
    
    return createFormData({
      initData,
      ...fields
    });
  }

  // Стандартный POST запрос с обработкой ошибок
  async function postRequest(url, data = {}, options = {}) {
    const {
      useFormData = true,
      headers = {},
      timeout = 30000
    } = options;

    let body;
    if (useFormData) {
      body = data instanceof FormData ? data : createFormData(data);
    } else {
      body = JSON.stringify(data);
      headers['Content-Type'] = 'application/json';
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        body,
        headers,
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      const result = await safeJsonParse(response);
      
      return {
        ok: response.ok,
        status: response.status,
        data: result,
        response
      };
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error.name === 'AbortError') {
        throw new Error('Запрос превысил время ожидания');
      }
      throw error;
    }
  }

  // ETag запрос с кэшированием
  async function etagRequest(url, options = {}) {
    const {
      cacheKey = null,
      headers = {},
      onSuccess = null,
      onStale = null
    } = options;

    const etag = cacheKey ? localStorage.getItem(`etag:${cacheKey}`) : null;
    
    if (etag) {
      headers['If-None-Match'] = etag;
    }

    try {
      const response = await fetch(url, { headers });
      const newEtag = response.headers.get('ETag');
      
      if (response.status === 304) {
        // Данные не изменились
        if (onStale && typeof onStale === 'function') {
          onStale();
        }
        return { updated: false, status: 304 };
      }

      const data = await safeJsonParse(response);
      
      // Сохраняем новый ETag
      if (newEtag && cacheKey) {
        localStorage.setItem(`etag:${cacheKey}`, newEtag);
      }

      if (onSuccess && typeof onSuccess === 'function') {
        onSuccess(data);
      }

      return {
        updated: true,
        status: response.status,
        data,
        etag: newEtag
      };
    } catch (error) {
      console.error('ETag request error:', error);
      throw error;
    }
  }

  // Обработчик стандартных ошибок API
  function handleAPIError(error, context = '') {
    let message = 'Произошла ошибка';
    
    if (error?.message) {
      message = error.message;
    } else if (typeof error === 'string') {
      message = error;
    }

    console.error(`API Error ${context}:`, error);
    
    // Показываем ошибку пользователю
    if (window.showAlert && typeof window.showAlert === 'function') {
      window.showAlert(message, 'error');
    }
    
    return message;
  }

  // Обертка для безопасного выполнения API запросов с UI обратной связью
  async function executeAPICall(apiCall, button = null, options = {}) {
    const {
      loadingText = 'Сохранение...',
      successMessage = null,
      errorContext = ''
    } = options;

    if (!apiCall || typeof apiCall !== 'function') {
      throw new Error('API call function is required');
    }

    const originalText = button?.textContent;
    const originalDisabled = button?.disabled;

    try {
      // Устанавливаем состояние загрузки
      if (button) {
        button.disabled = true;
        button.textContent = loadingText;
      }

      const result = await apiCall();
      
      // Проверяем результат
      if (result?.ok === false) {
        throw new Error(result?.data?.error || 'Ошибка API запроса');
      }

      // Показываем успешное сообщение
      if (successMessage && window.showAlert) {
        window.showAlert(successMessage, 'success');
      }

      return result;
    } catch (error) {
      handleAPIError(error, errorContext);
      throw error;
    } finally {
      // Восстанавливаем состояние кнопки
      if (button) {
        button.disabled = originalDisabled || false;
        button.textContent = originalText || 'Готово';
      }
    }
  }

  // Batch запросы с ограничением параллельности
  async function batchRequests(requests, maxConcurrent = 3) {
    const results = [];
    const executing = [];

    for (const [index, request] of requests.entries()) {
      const promise = (async () => {
        try {
          const result = await request();
          return { index, result, error: null };
        } catch (error) {
          return { index, result: null, error };
        }
      })();

      executing.push(promise);

      if (executing.length >= maxConcurrent) {
        const completed = await Promise.race(executing);
        results.push(completed);
        executing.splice(executing.indexOf(completed), 1);
      }
    }

    // Ждем завершения оставшихся запросов
    const remaining = await Promise.all(executing);
    results.push(...remaining);

    // Сортируем результаты по исходному порядку
    return results.sort((a, b) => a.index - b.index);
  }

  // Retry логика для неустойчивых запросов
  async function retryRequest(requestFn, maxRetries = 3, delay = 1000) {
    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await requestFn();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries) {
          break;
        }
        
        // Экспоненциальная задержка
        await new Promise(resolve => setTimeout(resolve, delay * Math.pow(2, attempt)));
      }
    }
    
    throw lastError;
  }

  // Экспорт в глобальный объект
  window.APIUtils = {
    safeJsonParse,
    createFormData,
    createTelegramFormData,
    postRequest,
    etagRequest,
    handleAPIError,
    executeAPICall,
    batchRequests,
    retryRequest
  };

  // Удобные глобальные шорткаты для обратной совместимости
  try {
    if (!window.createFormData) {
      window.createFormData = createFormData;
    }
    if (!window.handleAPIError) {
      window.handleAPIError = handleAPIError;
    }
  } catch(_) {}
})();