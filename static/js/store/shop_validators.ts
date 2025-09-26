// Shop validation utilities: клиентские валидации для Shop с TypeScript типизацией
// Отдельный модуль для переиспользуемых валидаций

interface ValidationResult {
  valid: boolean;
  errors: string[];
}

interface ShopValidationRules {
  maxQty: number;
  minQty: number;
  maxCartItems: number;
  maxOrderTotal: number;
  allowedProductCodes: string[];
}

(() => {
  // Правила валидации - можно конфигурировать через переменные окружения или настройки
  const validationRules: ShopValidationRules = {
    maxQty: 99,
    minQty: 1,
    maxCartItems: 50,
    maxOrderTotal: 999999,
    allowedProductCodes: ['boots', 'ball', 'tshirt', 'cap'],
  };

  // Основные валидаторы
  const ShopValidators = {
    // Валидация одного товара в корзине
    validateCartItem: (item: ShopCartItem): ValidationResult => {
      const errors: string[] = [];

      // Проверка ID
      if (!item.id || typeof item.id !== 'string' || item.id.trim().length === 0) {
        errors.push('Некорректный ID товара');
      } else if (item.id.length > 100) {
        errors.push('Слишком длинный ID товара');
      }

      // Проверка названия
      if (!item.name || typeof item.name !== 'string' || item.name.trim().length === 0) {
        errors.push('Не указано название товара');
      } else if (item.name.length > 200) {
        errors.push('Слишком длинное название товара');
      }

      // Проверка цены
      const price = ShopValidators.sanitizePrice(item.price);
      if (price < 0) {
        errors.push('Цена не может быть отрицательной');
      } else if (price > 100000) {
        errors.push('Слишком высокая цена товара');
      }

      // Проверка количества
      const qty = ShopValidators.sanitizeQty(item.qty);
      if (qty < validationRules.minQty) {
        errors.push(`Минимальное количество: ${validationRules.minQty}`);
      } else if (qty > validationRules.maxQty) {
        errors.push(`Максимальное количество: ${validationRules.maxQty}`);
      }

      // Проверка кода товара (если указан)
      if (item.code && typeof item.code === 'string') {
        if (
          validationRules.allowedProductCodes.length > 0 &&
          !validationRules.allowedProductCodes.includes(item.code)
        ) {
          errors.push('Недопустимый код товара');
        }
      }

      return { valid: errors.length === 0, errors };
    },

    // Валидация всей корзины
    validateCart: (cart: ShopCartItem[]): ValidationResult => {
      const errors: string[] = [];

      // Проверка базовых ограничений
      if (!Array.isArray(cart)) {
        errors.push('Корзина должна быть массивом');
        return { valid: false, errors };
      }

      if (cart.length === 0) {
        errors.push('Корзина пуста');
        return { valid: false, errors };
      }

      if (cart.length > validationRules.maxCartItems) {
        errors.push(`Слишком много товаров в корзине (максимум: ${validationRules.maxCartItems})`);
      }

      // Проверка каждого товара
      const productIds = new Set<string>();
      let totalAmount = 0;

      cart.forEach((item, index) => {
        const itemValidation = ShopValidators.validateCartItem(item);
        if (!itemValidation.valid) {
          itemValidation.errors.forEach(error => {
            errors.push(`Товар ${index + 1}: ${error}`);
          });
        }

        // Проверка на дубликаты
        if (productIds.has(item.id)) {
          errors.push(`Дублирующийся товар: ${item.name || item.id}`);
        } else {
          productIds.add(item.id);
        }

        // Подсчет общей суммы
        const price = ShopValidators.sanitizePrice(item.price);
        const qty = ShopValidators.sanitizeQty(item.qty);
        totalAmount += price * qty;
      });

      // Проверка общей суммы заказа
      if (totalAmount > validationRules.maxOrderTotal) {
        errors.push(
          `Сумма заказа превышает максимально допустимую: ${validationRules.maxOrderTotal.toLocaleString()}`
        );
      }

      return { valid: errors.length === 0, errors };
    },

    // Валидация заказа с учетом баланса пользователя
    validateOrder: (cart: ShopCartItem[], userCredits?: number): ValidationResult => {
      const cartValidation = ShopValidators.validateCart(cart);
      if (!cartValidation.valid) {
        return cartValidation;
      }

      const errors: string[] = [];

      // Расчет общей суммы
      const totalAmount = cart.reduce((sum, item) => {
        const price = ShopValidators.sanitizePrice(item.price);
        const qty = ShopValidators.sanitizeQty(item.qty);
        return sum + price * qty;
      }, 0);

      // Проверка баланса (если указан)
      if (typeof userCredits === 'number' && userCredits >= 0) {
        if (totalAmount > userCredits) {
          errors.push(
            `Недостаточно кредитов. Нужно: ${totalAmount.toLocaleString()}, доступно: ${userCredits.toLocaleString()}`
          );
        }
      }

      // Дополнительные бизнес-правила
      if (totalAmount <= 0) {
        errors.push('Сумма заказа должна быть больше нуля');
      }

      return { valid: errors.length === 0, errors };
    },

    // Утилиты для нормализации данных
    sanitizeQty: (qty: any): number => {
      const num = Number(qty);
      if (isNaN(num) || num < validationRules.minQty) return validationRules.minQty;
      if (num > validationRules.maxQty) return validationRules.maxQty;
      return Math.floor(num);
    },

    sanitizePrice: (price: any): number => {
      const num = Number(price);
      if (isNaN(num) || num < 0) return 0;
      return Math.floor(num);
    },

    // Форматирование ошибок для пользователя
    formatValidationErrors: (errors: string[]): string => {
      if (errors.length === 0) return '';
      if (errors.length === 1) return errors[0];

      return `Обнаружены ошибки:\n• ${errors.join('\n• ')}`;
    },

    // Получение текущих правил валидации
    getValidationRules: (): ShopValidationRules => {
      return { ...validationRules };
    },
  };

  // Экспортируем в глобальную область
  (window as any).ShopValidators = ShopValidators;

  // Расширяем ShopHelpers дополнительными методами валидации
  if ((window as any).ShopHelpers) {
    // Заменяем базовый validateCartItem на расширенный
    (window as any).ShopHelpers.validateCartItem = ShopValidators.validateCartItem;

    // Добавляем новые методы
    (window as any).ShopHelpers.validateCart = ShopValidators.validateCart;
    (window as any).ShopHelpers.validateOrder = ShopValidators.validateOrder;
    (window as any).ShopHelpers.sanitizeQty = ShopValidators.sanitizeQty;
    (window as any).ShopHelpers.sanitizePrice = ShopValidators.sanitizePrice;

    // Обновляем addToCart с валидацией
    const originalAddToCart = (window as any).ShopHelpers.addToCart;
    (window as any).ShopHelpers.addToCart = (item: {
      id: string;
      name: string;
      price: number;
      code?: string;
    }) => {
      // Создаем временный объект для валидации
      const tempItem: ShopCartItem = {
        id: item.id,
        name: item.name,
        price: ShopValidators.sanitizePrice(item.price),
        qty: 1,
        code: item.code,
      };

      const validation = ShopValidators.validateCartItem(tempItem);
      if (!validation.valid) {
        console.warn('ShopHelpers.addToCart: валидация не прошла:', validation.errors);
        try {
          const errorMsg = ShopValidators.formatValidationErrors(validation.errors);
          (window as any).Telegram?.WebApp?.showAlert?.(errorMsg);
        } catch (e) {
          console.error('Ошибка валидации товара:', validation.errors.join(', '));
        }
        return;
      }

      // Проверяем, не превысит ли добавление лимиты корзины
      if ((window as any).ShopStore) {
        const currentCart = (window as any).ShopStore.get().cart;
        const testCart = [...currentCart];

        const existingIndex = testCart.findIndex(
          (cartItem: ShopCartItem) => cartItem.id === item.id
        );
        if (existingIndex >= 0) {
          testCart[existingIndex] = {
            ...testCart[existingIndex],
            qty: Math.min(validationRules.maxQty, testCart[existingIndex].qty + 1),
          };
        } else {
          testCart.push(tempItem);
        }

        const cartValidation = ShopValidators.validateCart(testCart);
        if (!cartValidation.valid) {
          console.warn(
            'ShopHelpers.addToCart: валидация корзины не прошла:',
            cartValidation.errors
          );
          try {
            const errorMsg = ShopValidators.formatValidationErrors(cartValidation.errors);
            (window as any).Telegram?.WebApp?.showAlert?.(errorMsg);
          } catch (e) {
            console.error('Ошибка валидации корзины:', cartValidation.errors.join(', '));
          }
          return;
        }
      }

      // Если валидация прошла, вызываем оригинальный метод
      originalAddToCart(item);
    };

    // Обновляем placeOrder с валидацией
    const originalPlaceOrder = (window as any).ShopHelpers.placeOrder;
    (window as any).ShopHelpers.placeOrder = async (): Promise<{
      success: boolean;
      orderId?: string;
      error?: string;
    }> => {
      if (!(window as any).ShopStore) {
        return { success: false, error: 'Стор не найден' };
      }

      const state = (window as any).ShopStore.get();
      const orderValidation = ShopValidators.validateOrder(state.cart);

      if (!orderValidation.valid) {
        const errorMsg = ShopValidators.formatValidationErrors(orderValidation.errors);
        return { success: false, error: errorMsg };
      }

      return originalPlaceOrder();
    };
  }

  console.log('ShopValidators: модуль валидации инициализирован');
})();
