# Тестирование Shop интеграции

Этот документ описывает процедуры тестирования Shop модуля после интеграции со стором.

## Включение Shop Store

1. Откройте консоль браузера (F12)
2. Выполните команд для включения feature flag:
   ```javascript
   localStorage.setItem('feature:shop_ui_store', '1');
   ```
3. Перезагрузите страницу

## Проверки базовой функциональности

### 1. Проверка загрузки стора
```javascript
// В консоли браузера проверяте наличие объектов
console.log('ShopStore:', window.ShopStore);
console.log('ShopHelpers:', window.ShopHelpers);
console.log('Текущий стат:', window.ShopStore?.get());
```

### 2. Тестирование добавления товаров
```javascript
// Добавить товар в корзину
window.ShopHelpers?.addToCart({
  id: 'boots',
  name: 'Бутсы',
  price: 500,
  code: 'boots'
});

// Проверить состояние корзины
console.log('Корзина:', window.ShopStore?.get().cart);
console.log('Количество товаров:', window.ShopHelpers?.getCartCount());
console.log('Общая сумма:', window.ShopHelpers?.getCartTotal());
```

### 3. Проверка валидаций
```javascript
// Тест валидации товара с некорректными данными
const invalidItem = { id: '', name: '', price: -100, qty: 150 };
const validation = window.ShopValidators?.validateCartItem(invalidItem);
console.log('Результат валидации:', validation);

// Тест добавления с превышением лимитов
for(let i = 0; i < 15; i++) {
  window.ShopHelpers?.addToCart({
    id: `item_${i}`,
    name: `Товар ${i}`,
    price: 1000,
    code: `item_${i}`
  });
}
console.log('Корзина после массового добавления:', window.ShopStore?.get().cart);
```

### 4. Тестирование UI
1. Перейдите на вкладку "Магазин"
2. Нажмите кнопки "Купить" у товаров
3. Проверьте обновление badge в навигации
4. Перейдите на вкладку "Корзина"
5. Измените количество товаров
6. Удалите товары
7. Перейдите на вкладку "Мои заказы"

### 5. Тестирование персистенции
```javascript
// Добавить товары и проверить сохранение
window.ShopHelpers?.addToCart({id: 'test', name: 'Тест', price: 100});

// Перезагрузить страницу и проверить
// localStorage.setItem('feature:shop_ui_store', '1'); // если сбросился флаг
// Корзина должна восстановиться после перезагрузки
```

## Ожидаемое поведение

### ✅ Успешные сценарии
- Товары добавляются в корзину с валидацией
- Badge навигации обновляется автоматически
- Корзина отображается реактивно при изменениях
- Количество товаров ограничивается диапазоном 1-99
- Некорректные товары отклоняются с показом ошибки
- Данные корзины сохраняются между сессиями
- Заказы отображаются из API + локальные данные

### ⚠️ Проблемы для отладки
- Feature flag сбрасывается → переустановить вручную
- Стор не загружается → проверить ошибки TypeScript compilation
- Валидации не работают → проверить загрузку shop_validators.ts
- UI не обновляется → проверить подписки на стор

## API тестирование (требует реального пользователя)

```javascript
// Тест оформления заказа (только при наличии Telegram WebApp)
async function testCheckout() {
  // Добавить товары
  window.ShopHelpers?.addToCart({id: 'boots', name: 'Бутсы', price: 500});
  
  // Попытаться оформить заказ
  const result = await window.ShopHelpers?.placeOrder();
  console.log('Результат заказа:', result);
}

// testCheckout(); // Раскомментировать для теста
```

## Отключение для отката

```javascript
// Отключить Shop Store и вернуться к legacy коду
localStorage.removeItem('feature:shop_ui_store');
// Перезагрузить страницу
```

## Метрики для мониторинга

- Время загрузки Shop модулей (TypeScript compilation)
- Частота ошибок валидации
- Конверсия корзина → заказ при новом UI
- Производительность реактивных обновлений корзины

---

**Статус тестирования**: Готов к проверке на staging окружении Render.com