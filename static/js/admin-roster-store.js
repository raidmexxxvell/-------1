import {
  teamRosters,
  setTeamRoster,
  upsertTeamPlayer,
  removeTeamPlayer,
  resetTeamRoster,
  getTeamRoster,
} from './dist/store/team_players.js';

const exported = {
  teamRosters,
  setTeamRoster,
  upsertTeamPlayer,
  removeTeamPlayer,
  resetTeamRoster,
  getTeamRoster,
};

window.AdminTeamRosterStore = Object.assign(window.AdminTeamRosterStore || {}, exported);

try {
  document.dispatchEvent(new CustomEvent('admin:team-roster-store:ready'));
} catch (error) {
  console.warn('[AdminRosterStore] Failed to dispatch ready event', error);
}
