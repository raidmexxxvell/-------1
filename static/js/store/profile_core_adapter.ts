// profile_core_adapter.ts
// Адаптер для интеграции profile-core.js с ProfileStore под feature flag

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

// Расширяем Window для ProfileCore
declare global {
  interface Window {
    ProfileCore?: {
      init: () => Promise<void>;
    };
    Telegram?: {
      WebApp?: {
        expand?: () => void;
        ready?: () => void;
        initData?: string;
        initDataUnsafe?: any;
      };
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
    return new Promise<void>(resolve => {
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

  // Новая логика инициализации через стор
  const initWithStore = async () => {
    await waitForStore();

    if (!window.ProfileStore) {
      return;
    }

    const store = window.ProfileStore as ExtendedProfileStore;
    const tg = window.Telegram?.WebApp || null;

    try {
      tg?.expand?.();
      tg?.ready?.();
    } catch (_) {}

    let userLoaded = false;
    let achievementsLoaded = false;

    const checkAllReady = () => {
      if (userLoaded && achievementsLoaded) {
        window.dispatchEvent(new CustomEvent('app:all-ready'));
        console.log('[ProfileStore] All profile data loaded');
      }
    };

    const signalDataReady = () => {
      window.dispatchEvent(new CustomEvent('app:data-ready'));
    };

    // Загрузка пользователя
    const loadUser = async () => {
      try {
        if (window.ProfileUser?.fetchUserData) {
          await window.ProfileUser.fetchUserData();
          userLoaded = true;
          signalDataReady();
          checkAllReady();
        } else {
          // Fallback: ждём загрузки ProfileUser
          setTimeout(loadUser, 100);
        }
      } catch (error) {
        console.error('Profile core: user load error', error);
        userLoaded = true; // не блокируем остальную загрузку
        checkAllReady();
      }
    };

    // Загрузка достижений
    const loadAchievements = async () => {
      try {
        if (window.ProfileAchievements?.fetchAchievements) {
          await window.ProfileAchievements.fetchAchievements();
          achievementsLoaded = true;
          checkAllReady();
        } else {
          // Fallback: ждём загрузки ProfileAchievements
          setTimeout(loadAchievements, 100);
        }
      } catch (error) {
        console.error('Profile core: achievements load error', error);
        achievementsLoaded = true; // не блокируем остальную загрузку
        checkAllReady();
      }
    };

    // Параллельная загрузка
    await Promise.allSettled([loadUser(), loadAchievements()]);

    console.log('[ProfileStore] Core adapter initialized');
  };

  // Интеграция с существующим ProfileCore
  const integrateWithLegacy = async () => {
    // Если есть оригинальный ProfileCore, заменяем его логику
    if (window.ProfileCore) {
      const legacy = window.ProfileCore;

      // Переопределяем init
      legacy.init = initWithStore;

      console.log('[ProfileStore] Core adapter integrated with legacy');
    } else {
      // Создаём новый ProfileCore
      window.ProfileCore = {
        init: initWithStore,
      };

      console.log('[ProfileStore] New Core adapter created');
    }
  };

  // Запускаем интеграцию когда DOM готов
  const initialize = () => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(integrateWithLegacy, 50);
      });
    } else {
      setTimeout(integrateWithLegacy, 50);
    }
  };

  initialize();
})();
