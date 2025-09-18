// profile_achievements_adapter.ts
// Адаптер для интеграции profile-achievements.js с ProfileStore под feature flag

import type { StoreApi } from './core';

// Типы для расширенного ProfileStore API
interface ExtendedProfileStore extends StoreApi<ProfileState> {
  updateAchievements: (achievements: Achievement[]) => void;
  updateUser: (userData: Partial<UserProfile>) => void;
  updateSettings: (settings: Partial<UserSettings>) => void;
  setFavoriteTeam: (team: string) => void;
  updateTeams: (teamsData: Partial<TeamData>) => void;
  isTeamsDataFresh: () => boolean;
  withTeamCount: (name: string) => string;
  canCheckin: () => boolean;
  updateCheckin: (checkinData: { checkinDays?: number; currentStreak?: number }) => void;
}

// Расширяем Window для ProfileAchievements
declare global {
  interface Window {
    ProfileAchievements?: {
      fetchAchievements: () => Promise<Achievement[]>;
      renderAchievements: (achievements: Achievement[]) => void;
      forceReload: () => Promise<Achievement[]>;
    };
  }
}

(() => {
  // Проверяем feature flag
  const FEATURE_FLAG = 'feature:profile_store';
  const isEnabled = () => {
    try {
      return localStorage.getItem(FEATURE_FLAG) === '1';
    } catch (_) {
      return false;
    }
  };

  if (!isEnabled()) {
    return; // Выходим, если feature flag не включён
  }

  // Ждём готовности ProfileStore
  const waitForStore = () => {
    return new Promise<void>((resolve) => {
      if (window.ProfileStore) {
        resolve();
        return;
      }
      
      const check = () => {
        if (window.ProfileStore) {
          resolve();
        } else {
          setTimeout(check, 50);
        }
      };
      check();
    });
  };

  // Интеграция с существующим ProfileAchievements
  const integrateWithLegacy = async () => {
    await waitForStore();
    
    if (!window.ProfileAchievements || !window.ProfileStore) {
      return;
    }

    const store = window.ProfileStore as ExtendedProfileStore;
    const legacy = window.ProfileAchievements;

    // Сохраняем оригинальные методы
    const originalFetch = legacy.fetchAchievements.bind(legacy);
    const originalRender = legacy.renderAchievements.bind(legacy);

    // Подписываемся на изменения в сторе
    store.subscribe((state) => {
      // При обновлении достижений в сторе обновляем UI
      if (state.achievements && state.achievements.length > 0) {
        originalRender(state.achievements);
      }
    });

    // Переопределяем fetchAchievements для работы через стор
    legacy.fetchAchievements = async () => {
      try {
        // Проверяем, есть ли свежие данные в сторе
        const state = store.get();
        const now = Date.now();
        const isFresh = state.achievementsLastUpdated && 
                       (now - state.achievementsLastUpdated) < 30000; // 30 секунд

        if (isFresh && state.achievements.length > 0) {
          // Используем данные из стора
          return state.achievements;
        }

        // Загружаем данные через оригинальный метод
        const achievements = await originalFetch();
        
        // Сохраняем в стор
        if (store.updateAchievements) {
          store.updateAchievements(achievements);
        }
        
        return achievements;
      } catch (error) {
        console.error('Profile achievements adapter error:', error);
        // Fallback на оригинальный метод
        return originalFetch();
      }
    };

    // Переопределяем forceReload
    legacy.forceReload = async () => {
      try {
        // Сбрасываем кэш в сторе
        store.update(state => {
          state.achievementsLastUpdated = null;
        });
        
        // Загружаем заново
        return legacy.fetchAchievements();
      } catch (error) {
        console.error('Profile achievements force reload error:', error);
        return originalFetch();
      }
    };

    // Инициализируем данные из стора, если они есть
    const currentState = store.get();
    if (currentState.achievements.length > 0) {
      originalRender(currentState.achievements);
    }

    console.log('[ProfileStore] Achievements adapter integrated');
  };

  // Запускаем интеграцию когда DOM готов и ProfileAchievements загружен
  const initialize = () => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(integrateWithLegacy, 100);
      });
    } else {
      setTimeout(integrateWithLegacy, 100);
    }
  };

  initialize();
})();