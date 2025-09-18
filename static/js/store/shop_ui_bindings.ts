// Shop UI bindings: реактивная интеграция ShopStore с DOM компонентами
// Подключается под feature flag для постепенного перехода от Vanilla JS

(() => {
  // Проверяем feature flag
  const featureEnabled = () => {
    try {
      return localStorage.getItem('feature:shop_ui_store') === '1';
    } catch (e) {
      return false;
    }
  };

  if (!featureEnabled()) return;

  const shopStore = window.ShopStore;
  const shopHelpers = window.ShopHelpers;
  if (!shopStore || !shopHelpers) {
    console.warn('shop_ui_bindings: ShopStore или ShopHelpers не найдены');
    return;
  }

  // Утилиты для работы с DOM
  const escapeHtml = (str: string): string => {
    try {
      return String(str).replace(/[&<>"']/g, (c: string) => 
        ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] || c)
      );
    } catch (e) {
      return String(str || '');
    }
  };

  const formatCurrency = (amount: number): string => {
    return (Number(amount) || 0).toLocaleString() + ' кредитов';
  };

  const formatDate = (timestamp: number): string => {
    try {
      return new Date(timestamp).toLocaleDateString('ru-RU');
    } catch (e) {
      return '';
    }
  };

  // Рендеринг корзины
  const renderCart = () => {
    const host = document.querySelector('#shop-pane-cart');
    if (!host) return;

    const state = shopStore.get();
    const cart = state.cart || [];
    
    host.innerHTML = '';

    if (cart.length === 0) {
      host.innerHTML = '<div style="padding:12px; color: var(--gray);">Корзина пуста.</div>';
      return;
    }

    const list = document.createElement('div');
    list.className = 'cart-list';

    cart.forEach((item: ShopCartItem) => {
      const row = document.createElement('div');
      row.className = 'cart-line';

      const left = document.createElement('div');
      left.className = 'cart-left';

      const right = document.createElement('div');
      right.className = 'cart-right';

      // Название товара
      const name = document.createElement('span');
      name.textContent = item.name;

      // Контролы количества
      const qty = document.createElement('div');
      qty.className = 'qty-control';

      const minus = document.createElement('button');
      minus.type = 'button';
      minus.className = 'qty-btn';
      minus.textContent = '−';
      minus.addEventListener('click', () => {
        const newQty = Math.max(1, item.qty - 1);
        shopHelpers.updateQuantity(item.id, newQty);
      });

      const input = document.createElement('input');
      input.type = 'number';
      input.min = '1';
      input.max = '99';
      input.value = String(item.qty);
      input.className = 'qty-input';
      input.addEventListener('change', () => {
        shopHelpers.updateQuantity(item.id, Number(input.value) || 1);
      });
      input.addEventListener('input', () => {
        const v = input.value.replace(/\D/g, '');
        input.value = v.slice(0, 2);
      });

      const plus = document.createElement('button');
      plus.type = 'button';
      plus.className = 'qty-btn';
      plus.textContent = '+';
      plus.addEventListener('click', () => {
        const newQty = Math.min(99, item.qty + 1);
        shopHelpers.updateQuantity(item.id, newQty);
      });

      qty.append(minus, input, plus);
      left.append(name, qty);

      // Цена и кнопка удаления
      const price = document.createElement('span');
      price.textContent = formatCurrency(item.price * item.qty);

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'details-btn';
      deleteBtn.textContent = 'Убрать';
      deleteBtn.addEventListener('click', () => {
        shopHelpers.removeFromCart(item.id);
      });

      right.append(price, deleteBtn);
      row.append(left, right);
      list.appendChild(row);
    });

    // Контролы корзины (сумма и оформление заказа)
    const controls = document.createElement('div');
    controls.className = 'cart-controls';

    const totalEl = document.createElement('div');
    totalEl.className = 'cart-total';
    totalEl.textContent = 'Итого: ' + formatCurrency(shopHelpers.getCartTotal());

    const checkoutBtn = document.createElement('button');
    checkoutBtn.className = 'details-btn';
    checkoutBtn.textContent = 'Оформить заказ';
    checkoutBtn.addEventListener('click', async () => {
      checkoutBtn.disabled = true;
      checkoutBtn.textContent = 'Оформляем...';
      
      try {
        const result = await shopHelpers.placeOrder();
        if (result.success) {
          try {
            (window as any).Telegram?.WebApp?.showAlert?.('Заказ оформлен');
          } catch (e) {
            alert('Заказ оформлен');
          }
          // Перерендеринг происходит автоматически через подписку на стор
        } else {
          try {
            (window as any).Telegram?.WebApp?.showAlert?.(result.error || 'Ошибка при оформлении заказа');
          } catch (e) {
            alert(result.error || 'Ошибка при оформлении заказа');
          }
        }
      } catch (error) {
        console.error('Checkout error:', error);
        try {
          (window as any).Telegram?.WebApp?.showAlert?.('Произошла ошибка');
        } catch (e) {
          alert('Произошла ошибка');
        }
      } finally {
        checkoutBtn.disabled = false;
        checkoutBtn.textContent = 'Оформить заказ';
      }
    });

    controls.append(totalEl, checkoutBtn);
    host.append(list, controls);
  };

  // Рендеринг заказов
  const renderMyOrders = async () => {
    const host = document.querySelector('#shop-pane-myorders');
    if (!host) return;

    host.innerHTML = '<div style="padding:12px; color: var(--gray);">Загрузка...</div>';

    try {
      // Сначала показываем заказы из стора
      const state = shopStore.get();
      const localOrders = state.orders || [];

      // Потом загружаем актуальные с сервера
      const tg = (window as any).Telegram?.WebApp;
      const formData = new FormData();
      formData.append('initData', tg?.initData || '');

      const response = await fetch('/api/shop/my-orders', {
        method: 'POST',
        body: formData
      });

      const data = await response.json();
      const serverOrders = data?.orders || [];

      // Объединяем заказы (приоритет серверным данным)
      const allOrders = [...serverOrders];
      
      // Добавляем локальные заказы, которых нет на сервере
      localOrders.forEach((localOrder: ShopOrder) => {
        if (!serverOrders.find((so: any) => String(so.id) === String(localOrder.id))) {
          allOrders.push({
            id: localOrder.id,
            total: localOrder.total,
            created_at: new Date(localOrder.createdAt).toISOString(),
            status: localOrder.status,
            items_preview: localOrder.items_preview
          });
        }
      });

      host.innerHTML = '';
      
      if (allOrders.length === 0) {
        host.innerHTML = '<div style="padding:12px; color: var(--gray);">Заказов нет.</div>';
        return;
      }

      const table = document.createElement('table');
      table.className = 'league-table';
      
      const thead = document.createElement('thead');
      thead.innerHTML = '<tr><th>№</th><th>Сумма</th><th>Создан</th><th>Статус</th><th>Товары</th></tr>';
      
      const tbody = document.createElement('tbody');
      
      allOrders.forEach((order: any, index: number) => {
        const tr = document.createElement('tr');
        const sum = Number(order.total || 0);
        
        let created = order.created_at || '';
        try {
          created = formatDate(new Date(created).getTime());
        } catch (e) {
          created = '';
        }

        const statusMap: Record<string, string> = {
          'new': 'новый',
          'accepted': 'принят',
          'done': 'завершен',
          'cancelled': 'отменен'
        };
        const status = statusMap[(order.status || '').toLowerCase()] || (order.status || '');

        let itemsStr = '';
        if (order.items_preview) {
          itemsStr = String(order.items_preview);
        } else if (Array.isArray(order.items)) {
          itemsStr = order.items.map((it: any) => `${it.name || 'Товар'}×${it.qty || 1}`).join(', ');
        }

        tr.innerHTML = `
          <td>${index + 1}</td>
          <td>${formatCurrency(sum)}</td>
          <td>${created}</td>
          <td>${escapeHtml(status)}</td>
          <td>${escapeHtml(itemsStr)}</td>
        `;
        
        tbody.appendChild(tr);
      });

      table.append(thead, tbody);
      host.appendChild(table);

    } catch (error) {
      console.error('Ошибка загрузки заказов:', error);
      host.innerHTML = '<div style="padding:12px; color: var(--gray);">Ошибка загрузки</div>';
    }
  };

  // Инициализация кнопок "Добавить в корзину" в магазине
  const initStoreButtons = () => {
    const storePane = document.querySelector('#shop-pane-store');
    if (!storePane) return;

    storePane.querySelectorAll('.store-item').forEach((card: Element) => {
      const btn = card.querySelector('button');
      if (!btn) return;

      // Удаляем старые обработчики
      const newBtn = btn.cloneNode(true) as HTMLButtonElement;
      btn.parentNode?.replaceChild(newBtn, btn);

      newBtn.addEventListener('click', () => {
        const id = card.getAttribute('data-id') || '';
        const name = card.getAttribute('data-name') || '';
        const price = Number(card.getAttribute('data-price') || 0);

        shopHelpers.addToCart({ id, name, price, code: id });
      });
    });
  };

  // Подписываемся на изменения стора
  shopStore.subscribe((state: ShopState) => {
    // При изменении корзины обновляем UI корзины
    const cartPane = document.querySelector('#shop-pane-cart');
    const activeTab = document.querySelector('#shop-subtabs .subtab-item.active');
    
    if (cartPane && activeTab && activeTab.getAttribute('data-stab') === 'cart') {
      renderCart();
    }

    // Обновляем badge всегда
    shopHelpers.updateCartBadge();
  });

  // Обработчик переключения вкладок (для рендеринга при активации)
  const initTabHandlers = () => {
    const tabs = document.querySelectorAll('#shop-subtabs .subtab-item');
    
    tabs.forEach((tab: Element) => {
      tab.addEventListener('click', () => {
        const key = tab.getAttribute('data-stab');
        
        if (key === 'cart') {
          // Рендерим корзину через небольшую задержку, чтобы панель успела показаться
          setTimeout(renderCart, 10);
        } else if (key === 'myorders') {
          setTimeout(renderMyOrders, 10);
        } else if (key === 'store') {
          setTimeout(initStoreButtons, 10);
        }
      });
    });
  };

  // Инициализация при загрузке
  const init = () => {
    initTabHandlers();
    initStoreButtons();
    shopHelpers.updateCartBadge();
    
    console.log('shop_ui_bindings: инициализировано под feature flag');
  };

  // Запускаем инициализацию
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();