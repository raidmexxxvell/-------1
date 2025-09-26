#!/usr/bin/env python3
"""
Player Migration Step 3: Update API endpoints to support dual-read
This script creates new API endpoints and updates existing ones
"""

import os
import sys

def create_api_updates():
    """Create updated API endpoints"""
    
    api_code = '''
# ==================== UPDATED PLAYER API ENDPOINTS ====================
# Added during migration step 3

from sqlalchemy import func, text
from database.database_models import Player, PlayerStatistics, Tournament

@app.route('/api/admin/teams/<int:team_id>/roster/normalized', methods=['GET'])
@require_admin()
def api_admin_team_roster_normalized(team_id):
    """
    New normalized roster endpoint - reads from players table via legacy mapping
    Returns: {status, team: {id, name}, players: [{id, first_name, last_name, ...}]}
    """
    if SessionLocal is None:
        return jsonify({'error': 'Database not available'}), 500

    db = get_db()
    try:
        from database.database_models import Team
        team = db.query(Team).filter(Team.id == team_id, Team.is_active == True).first()
        if not team:
            return jsonify({'error': 'Team not found'}), 404

        # Get players via legacy mapping
        query = text("""
            SELECT DISTINCT
                p.id,
                p.first_name,
                p.last_name,
                p.username,
                p.position,
                COALESCE(ps.matches_played, 0) as matches_played,
                COALESCE(ps.goals_scored, 0) as goals,
                COALESCE(ps.assists, 0) as assists,
                COALESCE(ps.yellow_cards, 0) as yellow_cards,
                COALESCE(ps.red_cards, 0) as red_cards,
                COALESCE(ps.total_points, ps.goals_scored + ps.assists, 0) as total_points
            FROM legacy_player_mapping lpm
            JOIN players p ON p.id = lpm.player_id
            LEFT JOIN team_roster tr ON tr.id = lpm.legacy_id AND lpm.legacy_source = 'team_roster'
            LEFT JOIN player_statistics ps ON ps.player_id = p.id 
            WHERE tr.team = :team_name
              AND p.is_active = TRUE
            ORDER BY p.first_name, p.last_name
        """)
        
        result = db.execute(query, {'team_name': team.name}).fetchall()
        
        players = []
        for row in result:
            players.append({
                'id': row[0],
                'first_name': row[1],
                'last_name': row[2] or '',
                'username': row[3],
                'position': row[4],
                'matches_played': row[5],
                'goals': row[6], 
                'assists': row[7],
                'yellow_cards': row[8],
                'red_cards': row[9],
                'total_points': row[10]
            })

        return jsonify({
            'status': 'success',
            'team': {
                'id': team.id,
                'name': team.name
            },
            'players': players,
            'total': len(players),
            'source': 'normalized'  # indicator for frontend
        })

    except Exception as e:
        app.logger.error(f"Get normalized team roster failed: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()


@app.route('/api/admin/players', methods=['POST'])
@require_admin() 
def api_admin_create_player():
    """
    Create new player (normalized model)
    POST data: {first_name, last_name?, username?, position?, team_id?}
    """
    if SessionLocal is None:
        return jsonify({'error': 'Database not available'}), 500
        
    db = get_db()
    try:
        data = request.get_json() or {}
        
        first_name = (data.get('first_name') or '').strip()
        if not first_name:
            return jsonify({'error': 'first_name is required'}), 400
            
        last_name = (data.get('last_name') or '').strip() or None
        username = (data.get('username') or '').strip() or None
        position = (data.get('position') or '').strip() or None
        
        # Check for duplicates
        existing = db.query(Player).filter(
            func.lower(Player.first_name) == first_name.lower(),
            func.lower(func.coalesce(Player.last_name, '')) == func.lower(func.coalesce(last_name, '')),
            Player.is_active == True
        ).first()
        
        if existing:
            return jsonify({'error': 'Player with this name already exists'}), 400
            
        player = Player(
            first_name=first_name,
            last_name=last_name,
            username=username,
            position=position,
            is_active=True
        )
        
        db.add(player)
        db.commit()
        db.refresh(player)
        
        # Log action
        try:
            from utils.admin_logger import log_admin_action
            log_admin_action(
                admin_id=1,
                action="create_player", 
                description=f"Created player: {first_name} {last_name or ''}",
                endpoint="/api/admin/players",
                request_data=data,
                result_status="success",
                affected_entities=[{"type": "player", "id": player.id}]
            )
        except Exception:
            pass
            
        return jsonify({
            'status': 'success',
            'player': {
                'id': player.id,
                'first_name': player.first_name,
                'last_name': player.last_name,
                'username': player.username,
                'position': player.position,
                'is_active': player.is_active
            }
        }), 201
        
    except Exception as e:
        db.rollback()
        app.logger.error(f"Create player failed: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()


@app.route('/api/admin/players/<int:player_id>', methods=['PUT'])
@require_admin()
def api_admin_update_player(player_id):
    """
    Update player
    PUT data: {first_name?, last_name?, username?, position?}
    """
    if SessionLocal is None:
        return jsonify({'error': 'Database not available'}), 500
        
    db = get_db()
    try:
        player = db.query(Player).filter(Player.id == player_id, Player.is_active == True).first()
        if not player:
            return jsonify({'error': 'Player not found'}), 404
            
        data = request.get_json() or {}
        old_data = {
            'first_name': player.first_name,
            'last_name': player.last_name,
            'username': player.username,
            'position': player.position
        }
        
        if 'first_name' in data:
            first_name = (data['first_name'] or '').strip()
            if not first_name:
                return jsonify({'error': 'first_name cannot be empty'}), 400
            player.first_name = first_name
            
        if 'last_name' in data:
            player.last_name = (data['last_name'] or '').strip() or None
            
        if 'username' in data:
            player.username = (data['username'] or '').strip() or None
            
        if 'position' in data:
            player.position = (data['position'] or '').strip() or None
            
        db.commit()
        
        return jsonify({
            'status': 'success',
            'player': {
                'id': player.id,
                'first_name': player.first_name,
                'last_name': player.last_name,
                'username': player.username, 
                'position': player.position,
                'is_active': player.is_active
            }
        })
        
    except Exception as e:
        db.rollback()
        app.logger.error(f"Update player failed: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()


@app.route('/api/admin/players/<int:player_id>', methods=['DELETE'])
@require_admin()
def api_admin_delete_player(player_id):
    """
    Soft delete player
    """
    if SessionLocal is None:
        return jsonify({'error': 'Database not available'}), 500
        
    db = get_db()
    try:
        player = db.query(Player).filter(Player.id == player_id, Player.is_active == True).first()
        if not player:
            return jsonify({'error': 'Player not found'}), 404
            
        player_name = f"{player.first_name} {player.last_name or ''}".strip()
        player.is_active = False
        db.commit()
        
        return jsonify({
            'status': 'success',
            'message': f'Player "{player_name}" deleted successfully'
        })
        
    except Exception as e:
        db.rollback()
        app.logger.error(f"Delete player failed: {e}")
        return jsonify({'error': str(e)}), 500
    finally:
        db.close()


# ==================== DUAL READ LOGIC UPDATE ====================

def api_admin_team_roster_dual_read(team_id):
    """
    Updated roster endpoint with dual-read capability
    Try normalized first, fallback to legacy if needed
    """
    
    # Check if we have normalized data
    try:
        normalized_response = api_admin_team_roster_normalized(team_id)
        if normalized_response[1] == 200:  # Success
            response_data = normalized_response[0].get_json()
            if response_data and response_data.get('players'):
                return normalized_response
    except Exception as e:
        app.logger.warning(f"Normalized roster failed, falling back to legacy: {e}")
    
    # Fallback to legacy (existing implementation)
    return api_admin_team_roster(team_id)  # Call original function

'''
    
    # Write to a temporary file for review
    with open('c:\\Users\\Administrator\\Desktop\\Футбол локально\\scripts\\api_updates_step3.py', 'w', encoding='utf-8') as f:
        f.write(api_code)
    
    print("API updates written to api_updates_step3.py")
    print("Next: manually integrate these endpoints into app.py")

def main():
    print("=== Player Migration Step 3: API Updates ===")
    create_api_updates()
    
    print("\nManual integration steps:")
    print("1. Review api_updates_step3.py")  
    print("2. Add these endpoints to app.py")
    print("3. Test endpoints: GET /api/admin/teams/<id>/roster/normalized")
    print("4. Update frontend to use new endpoints")
    print("5. Run step 4 for dual-write implementation")

if __name__ == '__main__':
    main()