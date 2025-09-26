#!/usr/bin/env python3
"""
Player Migration Step 1: Analyze and prepare existing data
Run after migrate_players_step1.sql
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
    
    # Normalize URL for psycopg3
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

def analyze_existing_data(conn):
    """Analyze current player data and show report"""
    print("=== Player Migration Step 1: Data Analysis ===\n")
    
    with conn.cursor() as cur:
        # Get analysis results
        cur.execute("""
            SELECT 
                source_table,
                COUNT(*) as total_names,
                COUNT(*) FILTER (WHERE needs_review = FALSE) as clean_names,
                COUNT(*) FILTER (WHERE needs_review = TRUE) as needs_review,
                COUNT(*) FILTER (WHERE last_name IS NULL) as single_names
            FROM temp_player_names
            GROUP BY source_table
            ORDER BY source_table;
        """)
        
        results = cur.fetchall()
        
        print("Data Source Analysis:")
        print("-" * 70)
        print(f"{'Source':<15} {'Total':<8} {'Clean':<8} {'Review':<8} {'Single':<8}")
        print("-" * 70)
        
        total_all = 0
        clean_all = 0
        review_all = 0
        single_all = 0
        
        for row in results:
            source, total, clean, review, single = row
            print(f"{source:<15} {total:<8} {clean:<8} {review:<8} {single:<8}")
            total_all += total
            clean_all += clean
            review_all += review
            single_all += single
        
        print("-" * 70)
        print(f"{'TOTAL':<15} {total_all:<8} {clean_all:<8} {review_all:<8} {single_all:<8}")
        print()
        
        # Show problematic names
        if review_all > 0:
            print("Names needing review:")
            cur.execute("""
                SELECT normalized_name, source_table, source_count
                FROM temp_player_names 
                WHERE needs_review = TRUE 
                ORDER BY source_count DESC, normalized_name;
            """)
            
            problem_names = cur.fetchall()
            for name, source, count in problem_names[:10]:  # Show top 10
                print(f"  - '{name}' (from {source}, used {count} times)")
            
            if len(problem_names) > 10:
                print(f"  ... and {len(problem_names) - 10} more")
            print()
        
        # Check for existing players that might match
        cur.execute("""
            SELECT COUNT(*) FROM players 
            WHERE is_active = TRUE;
        """)
        existing_players = cur.fetchone()[0]
        print(f"Existing active players in database: {existing_players}")
        
        if existing_players > 0:
            print("Sample existing players:")
            cur.execute("""
                SELECT first_name, last_name, username 
                FROM players 
                WHERE is_active = TRUE 
                ORDER BY id 
                LIMIT 5;
            """)
            for fname, lname, username in cur.fetchall():
                full_name = f"{fname} {lname or ''}".strip()
                username_part = f" (@{username})" if username else ""
                print(f"  - {full_name}{username_part}")
        
        print()
        return total_all, clean_all, review_all

def check_potential_matches(conn):
    """Check for potential matches between temp names and existing players"""
    print("=== Checking for potential matches with existing players ===")
    
    with conn.cursor() as cur:
        cur.execute("""
            SELECT 
                tpn.normalized_name as temp_name,
                p.first_name || ' ' || COALESCE(p.last_name, '') as existing_name,
                p.id as player_id,
                p.username,
                similarity(
                    LOWER(tpn.normalized_name), 
                    LOWER(p.first_name || ' ' || COALESCE(p.last_name, ''))
                ) as similarity_score
            FROM temp_player_names tpn
            CROSS JOIN players p
            WHERE p.is_active = TRUE
              AND similarity(
                  LOWER(tpn.normalized_name), 
                  LOWER(p.first_name || ' ' || COALESCE(p.last_name, ''))
              ) > 0.6
            ORDER BY similarity_score DESC
            LIMIT 20;
        """)
        
        matches = cur.fetchall()
        if matches:
            print("Potential matches found (similarity > 0.6):")
            print("-" * 80)
            print(f"{'Temp Name':<25} {'Existing Name':<25} {'Username':<15} {'Score':<8}")
            print("-" * 80)
            
            for temp_name, existing_name, player_id, username, score in matches:
                username_str = f"@{username}" if username else ""
                print(f"{temp_name:<25} {existing_name:<25} {username_str:<15} {score:.3f}")
            
            print()
        else:
            print("No high-similarity matches found with existing players.")
            print()

def main():
    try:
        conn = get_db_connection()
        print("Connected to database successfully.")
        
        # Log step start
        log_migration_step(conn, 'step1_python_start', 'started', 'Starting Python analysis script')
        
        # Analyze data
        total, clean, review = analyze_existing_data(conn)
        
        # Check for matches
        check_potential_matches(conn)
        
        # Log completion
        log_migration_step(
            conn, 
            'step1_python_complete', 
            'completed', 
            f'Analysis complete: {total} names total, {clean} clean, {review} need review',
            total
        )
        
        print("=== Step 1 Analysis Complete ===")
        print("Next steps:")
        print("1. Review problematic names if any")
        print("2. Run migrate_players_step2.sql to create normalized players")
        print("3. Check migration log: SELECT * FROM player_migration_log ORDER BY created_at;")
        
        conn.close()
        
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()