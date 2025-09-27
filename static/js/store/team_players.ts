import { map } from 'nanostores';

export type RosterSource = 'normalized' | 'legacy';

export interface LegacyMetadata {
  row_id?: number | null;
  source?: string | null;
}

export interface RosterPlayerStats {
  tournament_id?: number | null;
  matches_played: number;
  goals: number;
  assists: number;
  goal_actions: number;
  yellow_cards: number;
  red_cards: number;
}

export interface RosterPlayer {
  id: number | null;
  player_id: number | null;
  team_id: number | null;
  first_name: string;
  last_name: string | null;
  full_name: string;
  username: string | null;
  position: string | null;
  primary_position: string | null;
  jersey_number: number | null;
  status: string | null;
  is_captain?: boolean;
  joined_at?: string | null;
  updated_at?: string | null;
  stats?: RosterPlayerStats | null;
  legacy?: LegacyMetadata | null;
}

export interface TeamRosterState {
  players: RosterPlayer[];
  source: RosterSource;
  tournamentId?: number | null;
  fetchedAt: string;
}

export type TeamRosterStore = Record<string, TeamRosterState>;

export const teamRosters = map<TeamRosterStore>({});

function toKey(teamId: string | number): string {
  return String(teamId);
}

function nowIso(): string {
  return new Date().toISOString();
}

export function setTeamRoster(
  teamId: string | number,
  players: RosterPlayer[],
  meta: {
    source?: RosterSource;
    tournamentId?: number | null;
    fetchedAt?: string;
  } = {}
): void {
  const key = toKey(teamId);
  const source = meta.source ?? 'normalized';
  const fetchedAt = meta.fetchedAt ?? nowIso();
  teamRosters.setKey(key, {
    players,
    source,
    tournamentId: meta.tournamentId ?? null,
    fetchedAt,
  });
}

export function upsertTeamPlayer(teamId: string | number, player: RosterPlayer): void {
  const key = toKey(teamId);
  const current = teamRosters.get()[key];
  const list = current?.players ?? [];
  const nextPlayers = list.some(p => p.id === player.id || p.player_id === player.player_id)
    ? list.map(p => (p.id === player.id || p.player_id === player.player_id ? player : p))
    : [...list, player];
  teamRosters.setKey(key, {
    players: nextPlayers,
    source: current?.source ?? 'normalized',
    tournamentId: current?.tournamentId ?? null,
    fetchedAt: nowIso(),
  });
}

export function removeTeamPlayer(
  teamId: string | number,
  predicate: (player: RosterPlayer) => boolean
): void {
  const key = toKey(teamId);
  const current = teamRosters.get()[key];
  if (!current) {
    return;
  }
  const nextPlayers = current.players.filter(player => !predicate(player));
  teamRosters.setKey(key, {
    players: nextPlayers,
    source: current.source,
    tournamentId: current.tournamentId ?? null,
    fetchedAt: nowIso(),
  });
}

export function resetTeamRoster(teamId: string | number): void {
  const key = toKey(teamId);
  teamRosters.setKey(key, {
    players: [],
    source: 'normalized',
    tournamentId: null,
    fetchedAt: nowIso(),
  });
}

export function getTeamRoster(teamId: string | number): TeamRosterState | undefined {
  return teamRosters.get()[toKey(teamId)];
}
