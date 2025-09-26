// Client-side structured logging for admin dashboard
// Sends logs to server endpoint for centralized viewing

(() => {
  if (typeof window === 'undefined') {
    return;
  }

  class AdminLogger {
    constructor() {
      this.enabled = false;
      this.buffer = [];
      this.maxBufferSize = 100;
      this.flushInterval = 5000; // 5 seconds
      this.endpoint = '/api/admin/client-logs';
      this.sessionId = this.generateSessionId();

      this.checkAdminStatus();
      if (this.enabled) {
        this.startAutoFlush();
      }
    }

    checkAdminStatus() {
      try {
        const user = window.UserStore?.get();
        this.enabled = user?.role === 'admin' || user?.role === 'owner';
      } catch (_) {
        this.enabled = false;
      }
    }

    generateSessionId() {
      return 'sess_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    log(level, category, message, metadata = {}) {
      if (!this.enabled) {
        return;
      }

      const entry = {
        timestamp: new Date().toISOString(),
        sessionId: this.sessionId,
        level, // 'info', 'warn', 'error', 'debug'
        category, // 'store', 'ws', 'etag', 'ui', 'cache'
        message,
        metadata,
        url: window.location.href,
        userAgent: navigator.userAgent,
      };

      this.buffer.push(entry);

      // Also log to console for immediate debugging
      const consoleMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
      console[consoleMethod](`[${category}] ${message}`, metadata);

      // Flush if buffer is full
      if (this.buffer.length >= this.maxBufferSize) {
        this.flush();
      }
    }

    info(category, message, metadata) {
      this.log('info', category, message, metadata);
    }

    warn(category, message, metadata) {
      this.log('warn', category, message, metadata);
    }

    error(category, message, metadata) {
      this.log('error', category, message, metadata);
    }

    debug(category, message, metadata) {
      this.log('debug', category, message, metadata);
    }

    async flush() {
      if (!this.enabled || this.buffer.length === 0) {
        return;
      }

      const logs = [...this.buffer];
      this.buffer = [];

      try {
        await fetch(this.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ logs }),
        });
      } catch (error) {
        console.warn('Failed to send logs to server:', error);
        // Re-add failed logs to buffer (up to limit)
        this.buffer = [...logs.slice(-50), ...this.buffer];
      }
    }

    startAutoFlush() {
      setInterval(() => {
        this.flush();
      }, this.flushInterval);

      // Flush on page unload
      window.addEventListener('beforeunload', () => {
        if (this.buffer.length > 0) {
          // Synchronous flush on unload
          navigator.sendBeacon(this.endpoint, JSON.stringify({ logs: this.buffer }));
        }
      });
    }

    // Convenience methods for common scenarios
    logStoreChange(storeName, action, state) {
      this.debug('стор', `Стор ${storeName} ${this.translateAction(action)}`, {
        storeName,
        action,
        stateKeys: Object.keys(state || {}),
        stateSize: JSON.stringify(state || {}).length,
      });
    }

    logWSEvent(eventType, data) {
      this.info('ws', `WebSocket ${this.translateWSEvent(eventType)}`, {
        eventType,
        hasData: !!data,
        dataKeys: data ? Object.keys(data) : [],
      });
    }

    logETagEvent(cacheKey, event, metadata) {
      this.info('кэш', `ETag ${this.translateETagEvent(event)} для ${cacheKey}`, {
        cacheKey,
        event,
        ...metadata,
      });
    }

    logCacheOperation(operation, key, result) {
      this.debug('кэш', `Кэш ${this.translateCacheOperation(operation)}: ${key}`, {
        operation,
        key,
        result: typeof result === 'object' ? Object.keys(result || {}) : result,
      });
    }

    logError(category, error, context = {}) {
      const translatedCategory = this.translateCategory(category);
      this.error(translatedCategory, error.message || String(error), {
        error: {
          name: error.name,
          message: error.message,
          stack: error.stack,
        },
        context,
      });
    }

    translateAction(action) {
      const translations = {
        updated: 'обновлен',
        initialized: 'инициализирован',
        reset: 'сброшен',
        changed: 'изменен',
        loaded: 'загружен',
      };
      return translations[action] || action;
    }

    translateWSEvent(eventType) {
      const translations = {
        connected: 'подключен',
        disconnected: 'отключен',
        reconnect_scheduled: 'переподключение запланировано',
        reconnecting: 'переподключение',
        error: 'ошибка',
        data_patch: 'обновление данных',
        heartbeat: 'проверка связи',
      };
      return translations[eventType] || eventType;
    }

    translateETagEvent(event) {
      const translations = {
        success: 'успех',
        error: 'ошибка',
        hit: 'попадание',
        miss: 'промах',
        stale: 'устарел',
        refresh: 'обновление',
      };
      return translations[event] || event;
    }

    translateCacheOperation(operation) {
      const translations = {
        get: 'получение',
        set: 'сохранение',
        delete: 'удаление',
        clear: 'очистка',
        hit: 'попадание',
        miss: 'промах',
      };
      return translations[operation] || operation;
    }

    translateCategory(category) {
      const translations = {
        store: 'стор',
        ws: 'ws',
        etag: 'кэш',
        ui: 'интерфейс',
        cache: 'кэш',
        global: 'система',
        promise: 'промис',
        debug: 'отладка',
      };
      return translations[category] || category;
    }
  }

  // Initialize global logger
  window.AdminLogger = new AdminLogger();

  // Integrate with existing systems
  if (window.StoreDebugger) {
    const originalToggle = window.StoreDebugger.toggle;
    window.StoreDebugger.toggle = function () {
      originalToggle.call(this);
      window.AdminLogger.checkAdminStatus();
      window.AdminLogger.info('отладка', `Отладчик стора ${this.enabled ? 'включен' : 'отключен'}`);
    };
  }

  // Integrate with fetch events
  window.addEventListener('etag:success', e => {
    window.AdminLogger?.logETagEvent(e.detail.cacheKey, 'success', {
      fromCache: e.detail.fromCache,
      updated: e.detail.updated,
    });
  });

  window.addEventListener('etag:error', e => {
    window.AdminLogger?.logETagEvent(e.detail.cacheKey, 'error', {
      error: e.detail.error,
    });
  });

  // Integrate with WS events
  window.addEventListener('ws:connected', e => {
    window.AdminLogger?.logWSEvent('connected', e.detail);
  });

  window.addEventListener('ws:disconnected', e => {
    window.AdminLogger?.logWSEvent('disconnected', e.detail);
  });

  window.addEventListener('ws:reconnect_scheduled', e => {
    window.AdminLogger?.logWSEvent('reconnect_scheduled', e.detail);
  });

  // Catch unhandled errors
  window.addEventListener('error', e => {
    window.AdminLogger?.logError('система', e.error || new Error(e.message), {
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
    });
  });

  // Catch unhandled promise rejections
  window.addEventListener('unhandledrejection', e => {
    window.AdminLogger?.logError('промис', e.reason, {
      type: 'unhandledrejection',
    });
  });
})();
