// Dev dispatcher: simple store state logger for owner mode
// Phase 1: console logging with toggle

import type { StoreApi } from './core';

declare global {
  interface Window {
    StoreDebugger?: {
      enabled: boolean;
      toggle: () => void;
      logState: (storeName?: string) => void;
    };
  }
}

(() => {
  if (typeof window === 'undefined') return;

  // Check if user is owner/admin (simple heuristic)
  function isOwnerMode(): boolean {
    try {
      const user = window.UserStore?.get();
      return user?.role === 'admin' || user?.role === 'owner';
    } catch (_) {
      return false;
    }
  }

  let enabled = false;
  const loggedStores = new Set<string>();

  function setupStoreLogging(storeName: string, store: StoreApi<any>): void {
    if (loggedStores.has(storeName)) return;
    loggedStores.add(storeName);

    store.subscribe(state => {
      if (!enabled || !isOwnerMode()) return;
      console.group(`🏪 Store [${storeName}] updated`);
      console.log('New state:', state);
      console.log('Timestamp:', new Date().toISOString());
      console.groupEnd();
    });
  }

  function initDebugger(): void {
    if (!window.Store) return;

    // Setup logging for existing stores
    Object.entries(window.Store._stores || {}).forEach(([name, store]) => {
      setupStoreLogging(name, store);
    });

    // Note: New stores will be detected via periodic check if needed
    // Avoiding monkey-patching for type safety
  }

  function toggle(): void {
    if (!isOwnerMode()) {
      console.warn('🚫 Store debugger available only for admin/owner role');
      return;
    }
    enabled = !enabled;
    console.log(`🔧 Store debugger ${enabled ? 'enabled' : 'disabled'}`);
  }

  function logState(storeName?: string): void {
    if (!isOwnerMode()) {
      console.warn('🚫 Store debugger available only for admin/owner role');
      return;
    }

    if (!window.Store) {
      console.warn('🚫 Store not initialized');
      return;
    }

    if (storeName) {
      const store = window.Store.getStore(storeName);
      if (store) {
        console.log(`🏪 Store [${storeName}]:`, store.get());
      } else {
        console.warn(`🚫 Store '${storeName}' not found`);
      }
    } else {
      console.group('🏪 All Store States');
      Object.entries(window.Store._stores || {}).forEach(([name, store]) => {
        console.log(`${name}:`, store.get());
      });
      console.groupEnd();
    }
  }

  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDebugger);
  } else {
    initDebugger();
  }

  // Public API
  window.StoreDebugger = { enabled, toggle, logState };
})();
