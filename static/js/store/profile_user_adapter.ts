// profile_user_adapter.ts
// Адаптер для интеграции profile-user.js с ProfileStore под feature flag

import type { StoreApi } from './core';

// Типы для расширенного ProfileStore API (повторяем из предыдущего адаптера)
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

// Расширяем Window для ProfileUser
declare global {
  interface Window {
    ProfileUser?: {
      fetchUserData: () => Promise<any>;
      renderUserProfile: (user: any) => void;
      initFavoriteTeamUI: (user: any) => Promise<void>;
      withTeamCount: (name: string) => string;
      getLastUser: () => any;
    };
    ensureAdminUI?: () => void;
    withTeamCount?: (name: string) => string;
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

  // Интеграция с существующим ProfileUser
  const integrateWithLegacy = async () => {
    await waitForStore();

    if (!window.ProfileUser || !window.ProfileStore) {
      return;
    }

    const store = window.ProfileStore as ExtendedProfileStore;
    const legacy = window.ProfileUser;

    // Сохраняем оригинальные методы
    const originalFetchUserData = legacy.fetchUserData.bind(legacy);
    const originalRenderUserProfile = legacy.renderUserProfile.bind(legacy);
    const originalWithTeamCount = legacy.withTeamCount.bind(legacy);

    // Подписываемся на изменения в сторе
    store.subscribe(state => {
      // При обновлении пользователя в сторе обновляем UI
      if (state.user && Object.keys(state.user).length > 0) {
        originalRenderUserProfile(state.user);
      }
    });

    // Переопределяем fetchUserData для работы через стор
    legacy.fetchUserData = async () => {
      try {
        // Проверяем, есть ли свежие данные в сторе
        const state = store.get();
        const now = Date.now();
        const isFresh = state.userLastUpdated && now - state.userLastUpdated < 60000; // 1 минута

        if (isFresh && state.user && Object.keys(state.user).length > 0) {
          // Используем данные из стора
          originalRenderUserProfile(state.user);
          return state.user;
        }

        // Загружаем данные через оригинальный метод
        const userData = await originalFetchUserData();

        // Сохраняем в стор
        if (userData) {
          // Приводим данные к нужному формату
          const profileData: Partial<UserProfile> = {
            id: userData.user_id || userData.id,
            name: userData.display_name || userData.name || userData.username,
            avatar: userData.avatar_url || userData.photo_url,
            credits: userData.credits,
            level: userData.level,
            xp: userData.xp,
            currentLevel: userData.current_level || userData.level,
            currentXp: userData.current_xp || userData.xp,
            xpNeeded: userData.xp_needed,
            checkinDays: userData.consecutive_days || userData.checkin_days,
            currentStreak: userData.current_streak || userData.consecutive_days,
            favoriteTeam: userData.favorite_team || userData.favoriteTeam,
            lastCheckin: userData.last_checkin_date
              ? new Date(userData.last_checkin_date).getTime()
              : undefined,
            canCheckin: store.canCheckin(), // используем логику из стора
          };

          store.updateUser(profileData);

          // Обновляем любимую команду в настройках
          if (userData.favorite_team || userData.favoriteTeam) {
            store.updateSettings({
              favoriteTeam: userData.favorite_team || userData.favoriteTeam,
            });
          }
        }

        return userData;
      } catch (error) {
        console.error('Profile user adapter error:', error);
        // Fallback на оригинальный метод
        return originalFetchUserData();
      }
    };

    // Переопределяем withTeamCount для работы через стор
    legacy.withTeamCount = (name: string) => {
      try {
        // Сначала пытаемся использовать стор
        if (store.isTeamsDataFresh()) {
          return store.withTeamCount(name);
        }
        // Fallback на оригинальный метод
        return originalWithTeamCount(name);
      } catch (error) {
        console.error('withTeamCount adapter error:', error);
        return originalWithTeamCount(name);
      }
    };

    // Добавляем глобальную функцию withTeamCount через стор
    try {
      window.withTeamCount = legacy.withTeamCount;
    } catch (_) {}

    // Слушаем события изменения любимой команды
    const favoriteTeamSelect = document.getElementById('favorite-team') as HTMLSelectElement;
    if (favoriteTeamSelect) {
      const originalChangeHandler = favoriteTeamSelect.onchange;

      favoriteTeamSelect.addEventListener('change', async e => {
        const target = e.target as HTMLSelectElement;
        const selectedTeam = target.value;

        // Обновляем стор
        if (selectedTeam) {
          store.setFavoriteTeam(selectedTeam);
        }
      });
    }

    // Инициализируем данные из стора, если они есть
    const currentState = store.get();
    if (currentState.user && Object.keys(currentState.user).length > 0) {
      originalRenderUserProfile(currentState.user);
    }

    // Интегрируем с чекином
    const checkinBtn = document.getElementById('checkin-btn');
    if (checkinBtn) {
      checkinBtn.addEventListener('click', () => {
        // После чекина обновляем стор
        setTimeout(() => {
          const state = store.get();
          if (state.user.checkinDays !== undefined && state.user.currentStreak !== undefined) {
            store.updateCheckin({
              checkinDays: state.user.checkinDays + 1,
              currentStreak: state.user.currentStreak + 1,
            });
          }
        }, 1000); // даём время серверу обработать чекин
      });
    }

    console.log('[ProfileStore] User adapter integrated');
  };

  // Запускаем интеграцию когда DOM готов и ProfileUser загружен
  const initialize = () => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        setTimeout(integrateWithLegacy, 150);
      });
    } else {
      setTimeout(integrateWithLegacy, 150);
    }
  };

  initialize();
})();
