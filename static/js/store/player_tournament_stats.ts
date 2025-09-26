import { map } from 'nanostores';

export interface PlayerTournamentStats {
  id: string;
  player_id: string;
  tournament_id: string;
  team_id: string;
  games: number;
  goals: number;
  assists: number;
  yellow_card: number;
  red_card: number;
  created_at?: string;
  updated_at?: string;
}

export interface PlayerTournamentStatsState {
  [playerId: string]: PlayerTournamentStats[];
}

export const playerTournamentStats = map<PlayerTournamentStatsState>({});

export function setPlayerStats(playerId: string, stats: PlayerTournamentStats[]) {
  playerTournamentStats.setKey(playerId, stats);
}

export function updatePlayerStats(playerId: string, stat: PlayerTournamentStats) {
  const current = playerTournamentStats.get()[playerId] || [];
  playerTournamentStats.setKey(
    playerId,
    current.map((s: PlayerTournamentStats) => (s.id === stat.id ? stat : s))
  );
}

export function addPlayerStats(playerId: string, stat: PlayerTournamentStats) {
  const current = playerTournamentStats.get()[playerId] || [];
  playerTournamentStats.setKey(playerId, [...current, stat]);
}

export function removePlayerStats(playerId: string, statId: string) {
  const current = playerTournamentStats.get()[playerId] || [];
  playerTournamentStats.setKey(
    playerId,
    current.filter((s: PlayerTournamentStats) => s.id !== statId)
  );
}
