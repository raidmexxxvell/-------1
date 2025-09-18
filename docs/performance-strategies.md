# Стратегии оптимизации производительности DOM для больших списков

Документ описывает подходы к оптимизации рендеринга больших списков в проекте "Лига Обнинска" без использования внешних библиотек.

## Текущая ситуация

### Существующие техники оптимизации в проекте:

1. **Batch DOM Operations** (`league.js`)
   - Используется `DocumentFragment` для группировки DOM изменений
   - Один `appendChild()` вместо множественных `appendChild()`
   - Минимизирует количество reflow/repaint операций

2. **In-Memory State Caching** (`MatchesStore`)
   - Локальное кэширование счётов матчей и голосов
   - Предотвращает мерцание при повторном рендеринге
   - Избегает повторных сетевых запросов для уже полученных данных

3. **ETag-based SWR Caching** (`etag-fetch.js`)
   - Кэширование HTTP ответов с проверкой актуальности через ETag
   - Мгновенный показ закэшированных данных с последующим обновлением
   - Снижает нагрузку на сервер и время загрузки

## Стратегии DOM виртуализации

### 1. Виртуальный скроллинг (Virtual Scrolling)

**Принцип**: рендерить только видимые элементы списка плюс небольшой буфер.

```javascript
class VirtualList {
  constructor(container, itemHeight, renderItem) {
    this.container = container;
    this.itemHeight = itemHeight;
    this.renderItem = renderItem;
    this.visibleStart = 0;
    this.visibleEnd = 0;
    this.bufferSize = 5; // количество дополнительных элементов для плавности
    
    this.setupScrollHandler();
  }
  
  setData(items) {
    this.items = items;
    this.updateScrollableHeight();
    this.renderVisibleItems();
  }
  
  updateScrollableHeight() {
    // Устанавливаем высоту контейнера равную общей высоте всех элементов
    this.container.style.height = (this.items.length * this.itemHeight) + 'px';
  }
  
  getVisibleRange() {
    const scrollTop = this.container.scrollTop;
    const containerHeight = this.container.offsetHeight;
    
    const start = Math.max(0, Math.floor(scrollTop / this.itemHeight) - this.bufferSize);
    const end = Math.min(this.items.length, Math.ceil((scrollTop + containerHeight) / this.itemHeight) + this.bufferSize);
    
    return { start, end };
  }
  
  renderVisibleItems() {
    const { start, end } = this.getVisibleRange();
    
    // Удаляем элементы, которые больше не видны
    this.clearContainer();
    
    // Создаём фрагмент для batch операции
    const fragment = document.createDocumentFragment();
    
    for (let i = start; i < end; i++) {
      const item = this.renderItem(this.items[i], i);
      item.style.position = 'absolute';
      item.style.top = (i * this.itemHeight) + 'px';
      fragment.appendChild(item);
    }
    
    this.container.appendChild(fragment);
    this.visibleStart = start;
    this.visibleEnd = end;
  }
}
```

**Применение в проекте**: для списков матчей в расписании, если количество превышает 50-100 элементов.

### 2. Lazy Loading с Intersection Observer

**Принцип**: загружать контент элементов только когда они становятся видимыми.

```javascript
class LazyRenderer {
  constructor() {
    this.observer = new IntersectionObserver(this.handleIntersection.bind(this), {
      rootMargin: '100px' // начинать загрузку за 100px до появления
    });
  }
  
  observeElement(element, loadCallback) {
    element.dataset.loadCallback = loadCallback.name;
    this.observer.observe(element);
  }
  
  handleIntersection(entries) {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const element = entry.target;
        const callbackName = element.dataset.loadCallback;
        
        // Вызываем callback для загрузки контента
        if (window[callbackName]) {
          window[callbackName](element);
        }
        
        // Прекращаем наблюдение после загрузки
        this.observer.unobserve(element);
      }
    });
  }
}
```

**Применение в проекте**: для подгрузки детальной информации матчей в больших списках.

### 3. Техника "Content Pooling"

**Принцип**: переиспользование DOM элементов вместо создания новых.

```javascript
class ElementPool {
  constructor(createElement, resetElement) {
    this.createElement = createElement;
    this.resetElement = resetElement;
    this.available = [];
    this.inUse = [];
  }
  
  acquire() {
    let element;
    if (this.available.length > 0) {
      element = this.available.pop();
      this.resetElement(element);
    } else {
      element = this.createElement();
    }
    this.inUse.push(element);
    return element;
  }
  
  release(element) {
    const index = this.inUse.indexOf(element);
    if (index !== -1) {
      this.inUse.splice(index, 1);
      this.available.push(element);
      element.remove(); // убираем из DOM
    }
  }
  
  releaseAll() {
    this.inUse.forEach(element => {
      this.available.push(element);
      element.remove();
    });
    this.inUse = [];
  }
}

// Пример использования для строк таблицы лиги
const tableRowPool = new ElementPool(
  () => {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td></td><td></td><td></td><td></td><td></td><td></td><td></td>';
    return tr;
  },
  (tr) => {
    Array.from(tr.cells).forEach(cell => cell.textContent = '');
    tr.className = '';
  }
);
```

### 4. Debounced Updates для реалтайм данных

**Принцип**: группировать множественные обновления в один batch для плавности UI.

```javascript
class DebouncedUpdater {
  constructor(updateFunction, delay = 16) { // 60 FPS
    this.updateFunction = updateFunction;
    this.delay = delay;
    this.pendingUpdates = new Map();
    this.rafId = null;
  }
  
  scheduleUpdate(key, data) {
    this.pendingUpdates.set(key, data);
    
    if (!this.rafId) {
      this.rafId = requestAnimationFrame(() => {
        this.flush();
      });
    }
  }
  
  flush() {
    if (this.pendingUpdates.size > 0) {
      // Применяем все накопленные обновления одним batch'ем
      this.updateFunction(this.pendingUpdates);
      this.pendingUpdates.clear();
    }
    this.rafId = null;
  }
}

// Использование для обновления счётов матчей
const matchScoreUpdater = new DebouncedUpdater((updates) => {
  const fragment = document.createDocumentFragment();
  updates.forEach((scoreData, matchKey) => {
    // Обновляем DOM элементы через DocumentFragment
  });
});
```

## Практические рекомендации для проекта

### Когда применять виртуализацию:

1. **League Table**: если команд > 20
2. **Match Schedule**: если матчей > 50
3. **Predictions List**: если предиктов > 100

### Мониторинг производительности:

```javascript
// Добавить в debugger.js
const PerformanceMonitor = {
  measureRender(name, renderFn) {
    const start = performance.now();
    const result = renderFn();
    const end = performance.now();
    console.log(`Render ${name}: ${(end - start).toFixed(2)}ms`);
    return result;
  },
  
  observeMemory() {
    if (performance.memory) {
      const mb = (bytes) => (bytes / 1024 / 1024).toFixed(2);
      console.log(`Memory: ${mb(performance.memory.usedJSHeapSize)}MB / ${mb(performance.memory.totalJSHeapSize)}MB`);
    }
  }
};
```

### Интеграция с текущим стором:

```javascript
// В league_ui_bindings.ts добавить виртуализацию
function renderLargeLeagueTable(state: LeagueState): void {
  const table = getLeagueTable();
  if (!table || !state.table) return;
  
  // Если команд больше 15, используем виртуализацию
  if (state.table.length > 15) {
    if (!table.virtualList) {
      table.virtualList = new VirtualList(table, 45, renderTableRow);
    }
    table.virtualList.setData(state.table);
  } else {
    // Обычный рендеринг для небольших списков
    renderStandardTable(table, state.table);
  }
}
```

## Выводы

1. **Batch операции** - базовая техника, применяется везде
2. **Virtual Scrolling** - для списков > 50 элементов 
3. **Lazy Loading** - для тяжёлого контента
4. **Element Pooling** - для часто обновляемых списков
5. **Debounced Updates** - для реалтайм обновлений

Все техники интегрируются с существующей архитектурой стора и не требуют внешних зависимостей.