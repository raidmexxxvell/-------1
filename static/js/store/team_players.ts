import { atom, map } from 'nanostores';

export interface Player {
  id: string;
  team_id: string;
  name: string;
  number: number;
  position?: string;
  created_at?: string;
  updated_at?: string;
}

export interface TeamPlayersState {
  [teamId: string]: Player[];
}

export const teamPlayers = map<TeamPlayersState>({});

export function setPlayers(teamId: string, players: Player[]) {
  teamPlayers.setKey(teamId, players);
}

export function addPlayer(teamId: string, player: Player) {
  const current = teamPlayers.get()[teamId] || [];
  teamPlayers.setKey(teamId, [...current, player]);
}

export function updatePlayer(teamId: string, player: Player) {
  const current = teamPlayers.get()[teamId] || [];
  teamPlayers.setKey(
    teamId,
    current.map((p: Player) => (p.id === player.id ? player : p))
  );
}

export function removePlayer(teamId: string, playerId: string) {
  const current = teamPlayers.get()[teamId] || [];
  teamPlayers.setKey(
    teamId,
    current.filter((p: Player) => p.id !== playerId)
  );
}
