import type { StoreApi } from './core';

declare global {
  // Типы для достижений (на основе profile-achievements.js)
  interface Achievement {
    id?: string;
    name: string;
    key?: string;
    code?: string;
    group?: string;
    iconKey?: string;
    unlocked: boolean;
    icon?: string;
    tier?: number;
    best_tier?: number;
    value?: number;
    next_target?: number;
    all_targets?: number[];
    description?: string;
    desc?: string;
    full_description?: string;
    fullDesc?: string;
    long_description?: string;
    longDesc?: string;
    ts?: number;
  }

  // Типы для пользовательских данных (на основе profile-user.js)
  interface UserProfile {
    id?: string;
    name?: string;
    avatar?: string;
    credits?: number;
    level?: number;
    xp?: number;
    currentLevel?: number;
    currentXp?: number;
    xpNeeded?: number;
    checkinDays?: number;
    currentStreak?: number;
    favoriteTeam?: string;
    lastCheckin?: number;
    canCheckin?: boolean;
  }

  // Настройки пользователя
  interface UserSettings {
    favoriteTeam?: string;
    notifications?: {
      achievements?: boolean;
      matches?: boolean;
      checkin?: boolean;
    };
    theme?: string;
    language?: string;
  }

  // Данные команд с количеством болельщиков
  interface TeamData {
    byTeam: Record<string, number>;
    teams: (string | { name?: string; title?: string; team?: string; team_name?: string })[];
    ts: number;
  }

  // Полное состояние профиля
  interface ProfileState {
    // Достижения
    achievements: Achievement[];
    badges: string[];
    achievementsLastUpdated: number | null;

    // Данные пользователя
    user: UserProfile;
    userLastUpdated: number | null;

    // Настройки пользователя (будут персиститься)
    settings: UserSettings;
    settingsLastUpdated: number | null;

    // Данные команд (кэш с TTL)
    teams: TeamData;

    // Общие метки времени
    lastUpdated: number | null;
  }

  interface Window {
    ProfileStore?: StoreApi<ProfileState>;
  }
}

(() => {
  const init: ProfileState = {
    achievements: [],
    badges: [],
    achievementsLastUpdated: null,

    user: {},
    userLastUpdated: null,

    settings: {
      notifications: {
        achievements: true,
        matches: true,
        checkin: true,
      },
    },
    settingsLastUpdated: null,

    teams: {
      byTeam: {},
      teams: [],
      ts: 0,
    },

    lastUpdated: null,
  };

  // Создаём стор с персистенцией настроек пользователя
  const profile = window.Store.createStore<ProfileState>('profile', init, {
    persistKey: 'profile:state:v1',
    persistPaths: ['settings', 'settingsLastUpdated'],
    ttlMs: 14 * 24 * 60 * 60 * 1000, // 14 дней
  });

  // Добавляем удобные методы для работы с профилем
  const profileApi = {
    ...profile,

    // Обновление достижений
    updateAchievements(achievements: Achievement[]) {
      profile.update(state => {
        state.achievements = achievements;
        state.achievementsLastUpdated = Date.now();
        state.lastUpdated = Date.now();
      });
    },

    // Обновление данных пользователя
    updateUser(userData: Partial<UserProfile>) {
      profile.update(state => {
        state.user = { ...state.user, ...userData };
        state.userLastUpdated = Date.now();
        state.lastUpdated = Date.now();
      });
    },

    // Обновление настроек (с автоперсистенцией)
    updateSettings(settings: Partial<UserSettings>) {
      profile.update(state => {
        state.settings = { ...state.settings, ...settings };
        state.settingsLastUpdated = Date.now();
        state.lastUpdated = Date.now();
      });
    },

    // Обновление любимой команды
    setFavoriteTeam(team: string) {
      profile.update(state => {
        state.user.favoriteTeam = team;
        state.settings.favoriteTeam = team;
        state.userLastUpdated = Date.now();
        state.settingsLastUpdated = Date.now();
        state.lastUpdated = Date.now();
      });
    },

    // Обновление данных команд (с TTL)
    updateTeams(teamsData: Partial<TeamData>) {
      profile.update(state => {
        state.teams = { ...state.teams, ...teamsData, ts: Date.now() };
      });
    },

    // Проверка актуальности данных команд (5 минут)
    isTeamsDataFresh(): boolean {
      const state = profile.get();
      return Date.now() - state.teams.ts < 5 * 60 * 1000;
    },

    // Получение названия команды с количеством болельщиков
    withTeamCount(name: string): string {
      const state = profile.get();
      const count = state.teams.byTeam[name];
      return count ? `${name} (${count})` : name;
    },

    // Проверка возможности чекина
    canCheckin(): boolean {
      const state = profile.get();
      const lastCheckin = state.user.lastCheckin || 0;
      const now = Date.now();
      const oneDayMs = 24 * 60 * 60 * 1000;
      return now - lastCheckin >= oneDayMs;
    },

    // Обновление чекина
    updateCheckin(checkinData: { checkinDays?: number; currentStreak?: number }) {
      profile.update(state => {
        state.user = { ...state.user, ...checkinData, lastCheckin: Date.now(), canCheckin: false };
        state.userLastUpdated = Date.now();
        state.lastUpdated = Date.now();
      });
    },
  };

  window.ProfileStore = profileApi;
})();
