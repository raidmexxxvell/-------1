#!/usr/bin/env python3
"""
Player Migration Step 2: Create normalized player records and mapping
"""

import os
import sys
import psycopg
from datetime import datetime

def get_db_connection():
    """Get database connection from environment"""
    database_url = os.getenv('DATABASE_URL')
    if not database_url:
        print("ERROR: DATABASE_URL not set")
        sys.exit(1)
    
    if database_url.startswith('postgres://'):
        database_url = database_url.replace('postgres://', 'postgresql://', 1)
    
    return psycopg.connect(database_url)

def log_migration_step(conn, step, status='completed', message='', data_count=0):
    """Log migration step to tracking table"""
    with conn.cursor() as cur:
        cur.execute("""
            INSERT INTO player_migration_log (step, status, message, data_count, created_at)
            VALUES (%s, %s, %s, %s, %s)
        """, (step, status, message, data_count, datetime.now()))
    conn.commit()

def create_players_from_temp_names(conn):
    """Create normalized player records"""
    print("=== Creating normalized player records ===")
    
    with conn.cursor() as cur:
        # First, try to match with existing players
        cur.execute("""
            SELECT 
                tpn.normalized_name,
                tpn.first_name,
                tpn.last_name,
                p.id as existing_player_id
            FROM temp_player_names tpn
            LEFT JOIN players p ON (
                LOWER(TRIM(CONCAT(p.first_name, ' ', COALESCE(p.last_name, '')))) = LOWER(tpn.normalized_name)
            )
            WHERE tpn.needs_review = FALSE
              AND p.is_active = TRUE;
        """)
        
        existing_matches = cur.fetchall()
        print(f"Found {len(existing_matches)} matches with existing players")
        
        # Create new players for unmatched names
        cur.execute("""
            SELECT COUNT(*) FROM temp_player_names 
            WHERE needs_review = FALSE 
              AND first_name IS NOT NULL
              AND NOT EXISTS (
                  SELECT 1 FROM players p 
                  WHERE LOWER(TRIM(CONCAT(p.first_name, ' ', COALESCE(p.last_name, '')))) = LOWER(normalized_name)
                    AND p.is_active = TRUE
              );
        """)
        
        new_players_count = cur.fetchone()[0]
        print(f"Will create {new_players_count} new players")
        
        if new_players_count > 0:
            cur.execute("""
                INSERT INTO players (first_name, last_name, is_active, created_at, updated_at)
                SELECT 
                    tpn.first_name,
                    tpn.last_name,
                    TRUE,
                    CURRENT_TIMESTAMP,
                    CURRENT_TIMESTAMP
                FROM temp_player_names tpn
                WHERE tpn.needs_review = FALSE 
                  AND tpn.first_name IS NOT NULL
                  AND NOT EXISTS (
                      SELECT 1 FROM players p 
                      WHERE LOWER(TRIM(CONCAT(p.first_name, ' ', COALESCE(p.last_name, '')))) = LOWER(tpn.normalized_name)
                        AND p.is_active = TRUE
                  )
                RETURNING id, first_name, last_name;
            """)
            
            new_players = cur.fetchall()
            print(f"Created {len(new_players)} new players")
            
            for player_id, fname, lname in new_players[:5]:  # Show first 5
                full_name = f"{fname} {lname or ''}".strip()
                print(f"  - {full_name} (ID: {player_id})")
                
            if len(new_players) > 5:
                print(f"  ... and {len(new_players) - 5} more")
        
        conn.commit()
        return new_players_count

def create_legacy_mapping(conn):
    """Create mapping between legacy data and new players"""
    print("\n=== Creating legacy mapping ===")
    
    with conn.cursor() as cur:
        # Create mapping table
        cur.execute("""
            CREATE TABLE IF NOT EXISTS legacy_player_mapping (
                id SERIAL PRIMARY KEY,
                legacy_source VARCHAR(50) NOT NULL,
                legacy_id INTEGER,
                legacy_name TEXT NOT NULL,
                player_id INTEGER REFERENCES players(id),
                confidence FLOAT DEFAULT 1.0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            );
        """)
        
        # Create indexes
        cur.execute("CREATE INDEX IF NOT EXISTS idx_legacy_mapping_source_id ON legacy_player_mapping(legacy_source, legacy_id);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_legacy_mapping_player_id ON legacy_player_mapping(player_id);")
        cur.execute("CREATE INDEX IF NOT EXISTS idx_legacy_mapping_name ON legacy_player_mapping(legacy_name);")
        
        # Map team_roster records
        cur.execute("""
            INSERT INTO legacy_player_mapping (legacy_source, legacy_id, legacy_name, player_id, confidence)
            SELECT 
                'team_roster' as legacy_source,
                tr.id as legacy_id,
                tr.player as legacy_name,
                p.id as player_id,
                1.0 as confidence
            FROM team_roster tr
            JOIN temp_player_names tpn ON tpn.normalized_name = TRIM(REGEXP_REPLACE(tr.player, E'\\s+', ' ', 'g'))
            JOIN players p ON (
                p.first_name = tpn.first_name 
                AND COALESCE(p.last_name, '') = COALESCE(tpn.last_name, '')
            )
            WHERE tpn.needs_review = FALSE
              AND p.is_active = TRUE;
        """)
        
        team_roster_mapped = cur.rowcount
        print(f"Mapped {team_roster_mapped} team_roster records")
        
        # Map match_lineups records
        cur.execute("""
            INSERT INTO legacy_player_mapping (legacy_source, legacy_id, legacy_name, player_id, confidence)
            SELECT DISTINCT
                'match_lineups' as legacy_source,
                ml.id as legacy_id,
                ml.player as legacy_name,
                lpm.player_id,
                lpm.confidence
            FROM match_lineups ml
            JOIN legacy_player_mapping lpm ON lpm.legacy_name = ml.player AND lpm.legacy_source = 'team_roster'
            WHERE NOT EXISTS (
                SELECT 1 FROM legacy_player_mapping lpm2 
                WHERE lpm2.legacy_source = 'match_lineups' 
                  AND lpm2.legacy_id = ml.id
            );
        """)
        
        match_lineups_mapped = cur.rowcount
        print(f"Mapped {match_lineups_mapped} match_lineups records")
        
        conn.commit()
        return team_roster_mapped + match_lineups_mapped

def show_mapping_statistics(conn):
    """Show mapping statistics"""
    print("\n=== Mapping Statistics ===")
    
    with conn.cursor() as cur:
        cur.execute("""
            SELECT 
                legacy_source,
                COUNT(*) as total_records,
                COUNT(*) FILTER (WHERE player_id IS NOT NULL) as mapped_records,
                COUNT(*) FILTER (WHERE confidence = 1.0) as high_confidence
            FROM legacy_player_mapping
            GROUP BY legacy_source
            ORDER BY legacy_source;
        """)
        
        results = cur.fetchall()
        print("-" * 60)
        print(f"{'Source':<15} {'Total':<8} {'Mapped':<8} {'High Conf':<12}")
        print("-" * 60)
        
        for source, total, mapped, high_conf in results:
            print(f"{source:<15} {total:<8} {mapped:<8} {high_conf:<12}")
        
        # Show unmapped records
        cur.execute("""
            SELECT legacy_source, legacy_name, COUNT(*) as count
            FROM legacy_player_mapping 
            WHERE player_id IS NULL
            GROUP BY legacy_source, legacy_name
            ORDER BY count DESC, legacy_name
            LIMIT 10;
        """)
        
        unmapped = cur.fetchall()
        if unmapped:
            print("\nTop unmapped names:")
            for source, name, count in unmapped:
                print(f"  - '{name}' from {source} ({count} records)")

def main():
    try:
        conn = get_db_connection()
        print("Connected to database successfully.\n")
        
        log_migration_step(conn, 'step2_python_start', 'started', 'Starting player creation')
        
        # Create normalized players
        new_count = create_players_from_temp_names(conn)
        
        # Create legacy mapping
        mapped_count = create_legacy_mapping(conn)
        
        # Show statistics
        show_mapping_statistics(conn)
        
        log_migration_step(
            conn, 
            'step2_complete', 
            'completed',
            f'Created {new_count} players, mapped {mapped_count} records',
            new_count + mapped_count
        )
        
        print("\n=== Step 2 Complete ===")
        print("Next steps:")
        print("1. Review unmapped records")
        print("2. Run migrate_players_step3.sql to update API endpoints")
        print("3. Test new player endpoints")
        
        conn.close()
        
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()