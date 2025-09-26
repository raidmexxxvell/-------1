#!/usr/bin/env python3
"""
Player Migration Step 6: Final transition to normalized-only model
This script migrates all remaining data and removes legacy dependencies
"""

import os
import sys
import psycopg
from datetime import datetime

def get_db_connection():
    """Get database connection"""
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        print("ERROR: DATABASE_URL not set")
        sys.exit(1)
    
    if database_url.startswith('postgres://'):
        database_url = database_url.replace('postgres://', 'postgresql://', 1)
    
    return psycopg.connect(database_url)

def log_migration_step(conn, step, status='completed', message='', data_count=0):
    """Log migration step"""
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO player_migration_log (step, status, message, data_count, created_at)
            VALUES (%s, %s, %s, %s, %s)
        """, (step, status, message, data_count, datetime.now()))
    conn.commit()

def migrate_team_compositions(conn):
    """Migrate match_lineups to team_compositions"""
    print("=== Migrating match lineups to team_compositions ===")
    
    with conn.cursor() as cur:
        # Get current tournament (assuming active tournament exists)
        cur.execute("""
            SELECT id FROM tournaments 
            WHERE status = 'active' 
            ORDER BY created_at DESC 
            LIMIT 1;
        """)
        
        tournament_result = cur.fetchone()
        if not tournament_result:
            print("⚠ No active tournament found, skipping team_compositions migration")
            return 0
        
        tournament_id = tournament_result[0]
        print(f"Using tournament ID: {tournament_id}")
        
        # Create matches table entries for lineup data if needed
        # This is a simplified approach - you may need to adjust based on your match structure
        cur.execute("""
            INSERT INTO matches (tournament_id, home_team_id, away_team_id, match_date, status, created_at)
            SELECT DISTINCT
                %s as tournament_id,
                t1.id as home_team_id,
                t2.id as away_team_id,
                CURRENT_DATE as match_date,
                'scheduled' as status,
                CURRENT_TIMESTAMP
            FROM match_lineups ml
            JOIN teams t1 ON t1.name = ml.home
            JOIN teams t2 ON t2.name = ml.away
            WHERE NOT EXISTS (
                SELECT 1 FROM matches m 
                WHERE m.home_team_id = t1.id 
                  AND m.away_team_id = t2.id
                  AND m.tournament_id = %s
            )
            GROUP BY t1.id, t2.id
            RETURNING id, home_team_id, away_team_id;
        """, (tournament_id, tournament_id))
        
        new_matches = cur.fetchall()
        print(f"Created {len(new_matches)} match records")
        
        # Now migrate lineups to team_compositions
        cur.execute("""
            INSERT INTO team_compositions (
                match_id, team_id, player_id, position, jersey_number, is_captain, created_at
            )
            SELECT DISTINCT
                m.id as match_id,
                CASE WHEN ml.team = 'home' THEN m.home_team_id ELSE m.away_team_id END as team_id,
                lpm.player_id,
                ml.position,
                ml.jersey_number,
                ml.is_captain,
                CURRENT_TIMESTAMP
            FROM match_lineups ml
            JOIN teams t1 ON t1.name = ml.home
            JOIN teams t2 ON t2.name = ml.away  
            JOIN matches m ON m.home_team_id = t1.id AND m.away_team_id = t2.id AND m.tournament_id = %s
            JOIN legacy_player_mapping lpm ON lpm.legacy_name = ml.player AND lpm.legacy_source = 'match_lineups'
            WHERE lpm.player_id IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM team_compositions tc 
                  WHERE tc.match_id = m.id 
                    AND tc.player_id = lpm.player_id
                    AND tc.team_id = CASE WHEN ml.team = 'home' THEN m.home_team_id ELSE m.away_team_id END
              );
        """, (tournament_id,))
        
        compositions_count = cur.rowcount
        print(f"Migrated {compositions_count} lineup entries to team_compositions")
        
        conn.commit()
        return compositions_count

def migrate_player_statistics(conn):
    """Migrate and recalculate player statistics"""
    print("\n=== Migrating player statistics ===")
    
    with conn.cursor() as cur:
        # Get current tournament
        cur.execute("SELECT id FROM tournaments WHERE status = 'active' ORDER BY created_at DESC LIMIT 1;")
        tournament_result = cur.fetchone()
        if not tournament_result:
            print("⚠ No active tournament found")
            return 0
        
        tournament_id = tournament_result[0]
        
        # Recalculate statistics from team_compositions and match_events
        cur.execute("""
            INSERT INTO player_statistics (
                player_id, tournament_id, matches_played, goals_scored, assists, 
                yellow_cards, red_cards, last_updated
            )
            SELECT 
                p.id as player_id,
                %s as tournament_id,
                COUNT(DISTINCT tc.match_id) as matches_played,
                COUNT(CASE WHEN me.event_type = 'goal' THEN 1 END) as goals_scored,
                COUNT(CASE WHEN me.event_type = 'assist' THEN 1 END) as assists,
                COUNT(CASE WHEN me.event_type = 'yellow_card' THEN 1 END) as yellow_cards,
                COUNT(CASE WHEN me.event_type = 'red_card' THEN 1 END) as red_cards,
                CURRENT_TIMESTAMP
            FROM players p
            LEFT JOIN team_compositions tc ON tc.player_id = p.id
            LEFT JOIN matches m ON m.id = tc.match_id AND m.tournament_id = %s
            LEFT JOIN match_events me ON me.player_id = p.id AND me.match_id = tc.match_id
            WHERE p.is_active = TRUE
            GROUP BY p.id
            HAVING COUNT(DISTINCT tc.match_id) > 0
            ON CONFLICT (player_id, tournament_id) 
            DO UPDATE SET
                matches_played = EXCLUDED.matches_played,
                goals_scored = EXCLUDED.goals_scored,
                assists = EXCLUDED.assists,
                yellow_cards = EXCLUDED.yellow_cards,
                red_cards = EXCLUDED.red_cards,
                last_updated = EXCLUDED.last_updated;
        """, (tournament_id, tournament_id))
        
        stats_count = cur.rowcount
        print(f"Updated statistics for {stats_count} players")
        
        conn.commit()
        return stats_count

def cleanup_legacy_tables(conn, confirm=True):
    """Remove legacy tables and data"""
    print("\n=== Cleaning up legacy tables ===")
    
    if confirm:
        response = input("This will permanently delete legacy tables. Continue? (yes/no): ")
        if response.lower() != 'yes':
            print("Cleanup cancelled")
            return False
    
    with conn.cursor() as cur:
        # Drop dynamic team_stats tables
        cur.execute("""
            SELECT tablename FROM pg_tables 
            WHERE tablename LIKE 'team_stats_%' 
              AND schemaname = 'public';
        """)
        
        team_stats_tables = [row[0] for row in cur.fetchall()]
        
        for table in team_stats_tables:
            print(f"Dropping table: {table}")
            cur.execute(f"DROP TABLE IF EXISTS {table} CASCADE;")
        
        # Archive legacy data to backup tables
        backup_tables = [
            ('team_roster', 'team_roster_backup'),
            ('match_lineups', 'match_lineups_backup')
        ]
        
        for source_table, backup_table in backup_tables:
            cur.execute(f"""
                CREATE TABLE {backup_table} AS 
                SELECT *, CURRENT_TIMESTAMP as archived_at 
                FROM {source_table};
            """)
            print(f"Archived {source_table} to {backup_table}")
        
        # Drop original legacy tables
        cur.execute("DROP TABLE IF EXISTS team_roster CASCADE;")
        cur.execute("DROP TABLE IF EXISTS match_lineups CASCADE;")
        print("Dropped legacy tables: team_roster, match_lineups")
        
        # Keep mapping table for reference but mark as archived
        cur.execute("ALTER TABLE legacy_player_mapping ADD COLUMN IF NOT EXISTS archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;")
        
        conn.commit()
        return True

def validate_migration(conn):
    """Final validation of migration"""
    print("\n=== Final Migration Validation ===")
    
    with conn.cursor() as cur:
        # Count players
        cur.execute("SELECT COUNT(*) FROM players WHERE is_active = TRUE;")
        players_count = cur.fetchone()[0]
        
        # Count team compositions
        cur.execute("SELECT COUNT(*) FROM team_compositions;")
        compositions_count = cur.fetchone()[0]
        
        # Count player statistics
        cur.execute("SELECT COUNT(*) FROM player_statistics;")
        stats_count = cur.fetchone()[0]
        
        # Check for missing references
        cur.execute("""
            SELECT COUNT(*) FROM team_compositions tc
            LEFT JOIN players p ON p.id = tc.player_id
            WHERE p.id IS NULL;
        """)
        missing_players = cur.fetchone()[0]
        
        print(f"Active players: {players_count}")
        print(f"Team compositions: {compositions_count}")
        print(f"Player statistics: {stats_count}")
        
        if missing_players > 0:
            print(f"⚠ {missing_players} team compositions reference missing players")
            return False
        else:
            print("✓ All references are valid")
            return True

def generate_final_report(conn):
    """Generate final migration report"""
    print("\n=== Final Migration Report ===")
    
    with conn.cursor() as cur:
        # Get all migration steps
        cur.execute("""
            SELECT step, status, message, data_count, created_at
            FROM player_migration_log
            ORDER BY created_at;
        """)
        
        print("Migration Timeline:")
        print("-" * 80)
        
        for step, status, message, count, created_at in cur.fetchall():
            status_symbol = "✓" if status == "completed" else "⚠" if status == "started" else "✗"
            count_str = f"({count} records)" if count else ""
            print(f"{status_symbol} {step}: {message} {count_str}")
            print(f"    {created_at.strftime('%Y-%m-%d %H:%M:%S')}")
        
        # Final statistics
        cur.execute("""
            SELECT 
                (SELECT COUNT(*) FROM players WHERE is_active = TRUE) as active_players,
                (SELECT COUNT(*) FROM team_compositions) as team_compositions,
                (SELECT COUNT(*) FROM match_events) as match_events,
                (SELECT COUNT(*) FROM player_statistics) as player_stats,
                (SELECT COUNT(*) FROM tournaments WHERE status = 'active') as active_tournaments;
        """)
        
        stats = cur.fetchone()
        
        print(f"\nFinal Database State:")
        print(f"Active players: {stats[0]}")
        print(f"Team compositions: {stats[1]}")
        print(f"Match events: {stats[2]}")
        print(f"Player statistics: {stats[3]}")
        print(f"Active tournaments: {stats[4]}")

def main():
    print("=== Player Migration Step 6: Final Transition ===")
    print("This step will complete the migration and remove legacy tables.\n")
    
    try:
        conn = get_db_connection()
        print("Connected to database successfully.\n")
        
        log_migration_step(conn, 'step6_start', 'started', 'Beginning final migration')
        
        # Migrate remaining data
        compositions_count = migrate_team_compositions(conn)
        stats_count = migrate_player_statistics(conn)
        
        # Validate before cleanup
        if not validate_migration(conn):
            print("⚠ Validation failed. Stopping before cleanup.")
            return
        
        print("\nValidation passed. Ready for cleanup.")
        
        # Cleanup legacy tables (with confirmation)
        if cleanup_legacy_tables(conn, confirm=True):
            print("✓ Legacy tables cleaned up")
        else:
            print("Legacy tables preserved")
        
        # Final validation
        final_valid = validate_migration(conn)
        
        # Generate report
        generate_final_report(conn)
        
        # Log completion
        log_migration_step(
            conn, 
            'step6_complete', 
            'completed' if final_valid else 'completed_with_warnings',
            f'Migration completed. Migrated {compositions_count} compositions, {stats_count} statistics',
            compositions_count + stats_count
        )
        
        print("\n" + "=" * 60)
        if final_valid:
            print("🎉 MIGRATION COMPLETE!")
            print("The system is now running on the normalized player model.")
            print("\nPost-migration tasks:")
            print("1. Update app.py to remove legacy API endpoints")
            print("2. Update frontend to use only normalized endpoints")
            print("3. Remove dynamic table creation functions")
            print("4. Update documentation")
        else:
            print("⚠ Migration completed with warnings.")
            print("Please review issues above before proceeding.")
        
        conn.close()
        
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()