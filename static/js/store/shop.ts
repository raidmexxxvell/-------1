import type { StoreApi } from './core';

declare global {
  interface ShopCartItem {
    id: string;
    name: string;
    price: number;
    qty: number;
    code?: string; // Код товара для API
  }

  interface ShopOrder {
    id: string;
    items: ShopCartItem[];
    total: number;
    createdAt: number;
    status: 'new' | 'accepted' | 'done' | 'cancelled';
    items_preview?: string;
  }

  interface ShopProduct {
    id: string;
    code: string;
    name: string;
    price: number;
    image?: string;
  }

  interface ShopState {
    cart: ShopCartItem[];
    orders: ShopOrder[];
    products: ShopProduct[];
    ttl: number | null;
    lastCartUpdate: number | null;
    lastOrdersUpdate: number | null;
  }

  interface Window {
    ShopStore?: StoreApi<ShopState>;
    ShopHelpers?: {
      addToCart: (item: { id: string; name: string; price: number; code?: string }) => void;
      removeFromCart: (id: string) => void;
      updateQuantity: (id: string, qty: number) => void;
      clearCart: () => void;
      getCartTotal: () => number;
      getCartCount: () => number;
      placeOrder: () => Promise<{ success: boolean; orderId?: string; error?: string }>;
      validateCartItem: (item: ShopCartItem) => { valid: boolean; errors: string[] };
      updateCartBadge: () => void;
    };
  }
}

(() => {
  const init: ShopState = {
    cart: [],
    orders: [],
    products: [
      {
        id: 'boots',
        code: 'boots',
        name: 'Бутсы',
        price: 500,
        image: '/static/img/shop/boots.png',
      },
      { id: 'ball', code: 'ball', name: 'Мяч', price: 500, image: '/static/img/shop/ball.png' },
      {
        id: 'tshirt',
        code: 'tshirt',
        name: 'Футболка',
        price: 500,
        image: '/static/img/shop/tshirt.png',
      },
      { id: 'cap', code: 'cap', name: 'Кепка', price: 500, image: '/static/img/shop/cap.png' },
    ],
    ttl: null,
    lastCartUpdate: null,
    lastOrdersUpdate: null,
  };

  const shop = window.Store.createStore<ShopState>('shop', init, {
    persistKey: 'store:shop',
    persistPaths: ['cart', 'orders', 'ttl', 'lastCartUpdate', 'lastOrdersUpdate'],
    ttlMs: 1000 * 60 * 60 * 24 * 14, // 14 дней
  });

  // Мигрируем старую корзину из localStorage['shop:cart'] если есть
  try {
    const legacyCart = localStorage.getItem('shop:cart');
    if (legacyCart && shop.get().cart.length === 0) {
      const oldCart = JSON.parse(legacyCart);
      if (Array.isArray(oldCart) && oldCart.length > 0) {
        shop.set({ cart: oldCart, lastCartUpdate: Date.now() });
        localStorage.removeItem('shop:cart'); // Очищаем старый формат
      }
    }
  } catch (e) {
    console.warn('ShopStore: не удалось мигрировать старую корзину:', e);
  }

  // Вспомогательные функции
  const ShopHelpers = {
    addToCart: (item: { id: string; name: string; price: number; code?: string }) => {
      const state = shop.get();
      const existingIndex = state.cart.findIndex(
        (cartItem: ShopCartItem) => cartItem.id === item.id
      );

      if (existingIndex >= 0) {
        const newCart = [...state.cart];
        newCart[existingIndex].qty = Math.min(99, newCart[existingIndex].qty + 1);
        shop.set({ cart: newCart, lastCartUpdate: Date.now() });
      } else {
        const newItem: ShopCartItem = {
          id: item.id,
          name: item.name,
          price: Number(item.price) || 0,
          qty: 1,
          code: item.code || item.id,
        };
        shop.set({
          cart: [...state.cart, newItem],
          lastCartUpdate: Date.now(),
        });
      }
      ShopHelpers.updateCartBadge();
    },

    removeFromCart: (id: string) => {
      const state = shop.get();
      const newCart = state.cart.filter((item: ShopCartItem) => item.id !== id);
      shop.set({ cart: newCart, lastCartUpdate: Date.now() });
      ShopHelpers.updateCartBadge();
    },

    updateQuantity: (id: string, qty: number) => {
      const newQty = Math.max(1, Math.min(99, Number(qty) || 1));
      const state = shop.get();
      const newCart = state.cart.map((item: ShopCartItem) =>
        item.id === id ? { ...item, qty: newQty } : item
      );
      shop.set({ cart: newCart, lastCartUpdate: Date.now() });
      ShopHelpers.updateCartBadge();
    },

    clearCart: () => {
      shop.set({ cart: [], lastCartUpdate: Date.now() });
      ShopHelpers.updateCartBadge();
    },

    getCartTotal: (): number => {
      const state = shop.get();
      return state.cart.reduce(
        (total: number, item: ShopCartItem) => total + item.price * item.qty,
        0
      );
    },

    getCartCount: (): number => {
      const state = shop.get();
      return state.cart.reduce((count: number, item: ShopCartItem) => count + item.qty, 0);
    },

    validateCartItem: (item: ShopCartItem): { valid: boolean; errors: string[] } => {
      const errors: string[] = [];

      if (!item.id || typeof item.id !== 'string') {
        errors.push('Некорректный ID товара');
      }
      if (!item.name || typeof item.name !== 'string') {
        errors.push('Не указано название товара');
      }
      if (typeof item.price !== 'number' || item.price < 0) {
        errors.push('Некорректная цена товара');
      }
      if (typeof item.qty !== 'number' || item.qty < 1 || item.qty > 99) {
        errors.push('Количество должно быть от 1 до 99');
      }

      return { valid: errors.length === 0, errors };
    },

    placeOrder: async (): Promise<{ success: boolean; orderId?: string; error?: string }> => {
      try {
        const state = shop.get();
        if (state.cart.length === 0) {
          return { success: false, error: 'Корзина пуста' };
        }

        // Валидация корзины
        const invalidItems = state.cart.filter(
          (item: ShopCartItem) => !ShopHelpers.validateCartItem(item).valid
        );
        if (invalidItems.length > 0) {
          return { success: false, error: 'В корзине есть некорректные товары' };
        }

        const tg = (window as any).Telegram?.WebApp;
        const formData = new FormData();
        formData.append('initData', tg?.initData || '');

        // Преобразуем в формат API
        const apiItems = state.cart.map((item: ShopCartItem) => ({
          id: item.code || item.id, // Используем code для API
          code: item.code || item.id,
          qty: item.qty,
        }));
        formData.append('items', JSON.stringify(apiItems));

        const response = await fetch('/api/shop/checkout', {
          method: 'POST',
          body: formData,
        });

        const result = await response.json();

        if (!response.ok) {
          return { success: false, error: result.error || 'Ошибка при оформлении заказа' };
        }

        // Создаем заказ в сторе
        const order: ShopOrder = {
          id: String(result.order_id || Date.now()),
          items: [...state.cart],
          total: ShopHelpers.getCartTotal(),
          createdAt: Date.now(),
          status: 'new',
          items_preview: state.cart
            .map((item: ShopCartItem) => `${item.name}×${item.qty}`)
            .join(', '),
        };

        shop.set({
          orders: [order, ...state.orders],
          cart: [], // Очищаем корзину после успешного заказа
          lastCartUpdate: Date.now(),
          lastOrdersUpdate: Date.now(),
        });

        ShopHelpers.updateCartBadge();

        return { success: true, orderId: order.id };
      } catch (error) {
        console.error('ShopHelpers.placeOrder error:', error);
        return { success: false, error: 'Сетевая ошибка' };
      }
    },

    updateCartBadge: () => {
      try {
        const navItem = document.querySelector('.nav-item[data-tab="shop"]');
        if (!navItem) return;

        const count = ShopHelpers.getCartCount();
        const label = navItem.querySelector('.nav-label');
        if (label) {
          label.textContent = count > 0 ? `Магазин (${count})` : 'Магазин';
        }

        let badge = navItem.querySelector('.nav-badge');
        if (count > 0) {
          if (!badge) {
            badge = document.createElement('div');
            badge.className = 'nav-badge';
            navItem.appendChild(badge);
          }
          badge.textContent = String(count);
        } else if (badge) {
          badge.remove();
        }
      } catch (e) {
        console.warn('ShopHelpers.updateCartBadge error:', e);
      }
    },
  };

  window.ShopStore = shop;
  window.ShopHelpers = ShopHelpers;

  // Подписываемся на изменения для автоматического обновления badge
  shop.subscribe(() => {
    ShopHelpers.updateCartBadge();
  });

  // Инициализируем badge при загрузке
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', ShopHelpers.updateCartBadge);
  } else {
    ShopHelpers.updateCartBadge();
  }
})();
