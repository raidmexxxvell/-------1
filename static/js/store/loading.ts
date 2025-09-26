interface LoadingState {
  [key: string]: boolean;
}

interface LoadingOptions {
  overlay?: boolean;
  message?: string;
  skeleton?: boolean;
}

/**
 * Централизованное управление состояниями загрузки
 * Обеспечивает единообразный UX для всех асинхронных операций
 */
class LoadingManager {
  private loadingStates: LoadingState = {};
  private listeners: Set<(states: LoadingState) => void> = new Set();
  private overlayElement: HTMLElement | null = null;

  constructor() {
    this.createOverlayElement();
  }

  /**
   * Создает overlay элемент для глобальных загрузок
   */
  private createOverlayElement(): void {
    this.overlayElement = document.createElement('div');
    this.overlayElement.id = 'loading-overlay';
    this.overlayElement.className = 'loading-overlay hidden';
    this.overlayElement.innerHTML = `
      <div class="loading-content">
        <div class="loading-spinner"></div>
        <div class="loading-message">Загрузка...</div>
      </div>
    `;
    this.overlayElement.setAttribute('role', 'status');
    this.overlayElement.setAttribute('aria-live', 'polite');
    this.overlayElement.setAttribute('aria-label', 'Загрузка контента');
    document.body.appendChild(this.overlayElement);
  }

  /**
   * Запускает состояние загрузки
   */
  start(key: string, options: LoadingOptions = {}): void {
    this.loadingStates[key] = true;
    this.notifyListeners();

    if (options.overlay && this.overlayElement) {
      const messageEl = this.overlayElement.querySelector('.loading-message');
      if (messageEl && options.message) {
        messageEl.textContent = options.message;
      }
      this.overlayElement.classList.remove('hidden');
      this.overlayElement.setAttribute('aria-hidden', 'false');
    }

    if (options.skeleton) {
      this.showSkeleton(key);
    }

    // Автоматический timeout для предотвращения зависших состояний
    setTimeout(() => {
      if (this.loadingStates[key]) {
        console.warn(`Loading state '${key}' не был завершен за 30 секунд`);
        this.stop(key);
      }
    }, 30000);
  }

  /**
   * Останавливает состояние загрузки
   */
  stop(key: string): void {
    delete this.loadingStates[key];
    this.notifyListeners();

    // Скрываем overlay если нет активных загрузок с overlay
    const hasOverlayLoading = Object.keys(this.loadingStates).some(k =>
      document.querySelector(`[data-loading="${k}"][data-overlay="true"]`)
    );

    if (!hasOverlayLoading && this.overlayElement) {
      this.overlayElement.classList.add('hidden');
      this.overlayElement.setAttribute('aria-hidden', 'true');
    }

    this.hideSkeleton(key);
  }

  /**
   * Проверяет, активна ли загрузка
   */
  isLoading(key: string): boolean {
    return this.loadingStates[key] || false;
  }

  /**
   * Получает все активные загрузки
   */
  getActiveLoadings(): string[] {
    return Object.keys(this.loadingStates);
  }

  /**
   * Подписка на изменения состояний загрузки
   */
  subscribe(listener: (states: LoadingState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Уведомляет подписчиков об изменениях
   */
  private notifyListeners(): void {
    const states = { ...this.loadingStates };
    this.listeners.forEach(listener => listener(states));
  }

  /**
   * Показывает skeleton загрузку для конкретного элемента
   */
  private showSkeleton(key: string): void {
    const targetElement = document.querySelector(`[data-loading-target="${key}"]`);
    if (targetElement) {
      targetElement.classList.add('loading-skeleton');
      targetElement.setAttribute('aria-busy', 'true');
    }
  }

  /**
   * Скрывает skeleton загрузку
   */
  private hideSkeleton(key: string): void {
    const targetElement = document.querySelector(`[data-loading-target="${key}"]`);
    if (targetElement) {
      targetElement.classList.remove('loading-skeleton');
      targetElement.setAttribute('aria-busy', 'false');
    }
  }

  /**
   * Обертка для асинхронных операций с автоматическим управлением загрузкой
   */
  async withLoading<T>(
    key: string,
    operation: () => Promise<T>,
    options: LoadingOptions = {}
  ): Promise<T> {
    try {
      this.start(key, options);
      const result = await operation();
      return result;
    } finally {
      this.stop(key);
    }
  }

  /**
   * Очищает все состояния загрузки (для экстренных ситуаций)
   */
  clearAll(): void {
    this.loadingStates = {};
    this.notifyListeners();

    if (this.overlayElement) {
      this.overlayElement.classList.add('hidden');
      this.overlayElement.setAttribute('aria-hidden', 'true');
    }

    // Очищаем все skeleton состояния
    document.querySelectorAll('.loading-skeleton').forEach(el => {
      el.classList.remove('loading-skeleton');
      el.setAttribute('aria-busy', 'false');
    });
  }
}

// Создаем глобальный экземпляр
const loadingManager = new LoadingManager();

// TypeScript декларации для существующих модулей
declare global {
  interface Window {
    loadingManager: LoadingManager;
  }
}

// Экспортируем для использования в других модулях
window.loadingManager = loadingManager;

export { LoadingManager, loadingManager };
export type { LoadingState, LoadingOptions };
