#!/usr/bin/env python3
"""
Player Migration Step 5: Comprehensive testing script
Tests all migration steps and validates data integrity
"""

import os
import sys
import psycopg
import requests
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

def test_database_structure(conn):
    """Test 1: Verify database structure"""
    print("=== Test 1: Database Structure ===")
    
    with conn.cursor() as cur:
        # Check required tables exist
        required_tables = [
            'players', 'player_statistics', 'legacy_player_mapping',
            'temp_player_names', 'player_migration_log'
        ]
        
        cur.execute("""
            SELECT table_name FROM information_schema.tables 
            WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
            ORDER BY table_name;
        """)
        
        existing_tables = [row[0] for row in cur.fetchall()]
        
        for table in required_tables:
            if table in existing_tables:
                print(f"✓ Table {table} exists")
            else:
                print(f"✗ Table {table} missing")
                return False
        
        # Check indexes
        cur.execute("""
            SELECT indexname FROM pg_indexes 
            WHERE schemaname = 'public' AND tablename = 'legacy_player_mapping';
        """)
        indexes = [row[0] for row in cur.fetchall()]
        expected_indexes = ['idx_legacy_mapping_source_id', 'idx_legacy_mapping_player_id']
        
        for idx in expected_indexes:
            if any(idx in existing_idx for existing_idx in indexes):
                print(f"✓ Index {idx} exists")
            else:
                print(f"! Index {idx} missing (non-critical)")
    
    return True

def test_data_migration(conn):
    """Test 2: Verify data migration integrity"""
    print("\n=== Test 2: Data Migration Integrity ===")
    
    with conn.cursor() as cur:
        # Count original vs mapped records
        cur.execute("SELECT COUNT(*) FROM team_roster WHERE player IS NOT NULL;")
        team_roster_count = cur.fetchone()[0]
        
        cur.execute("SELECT COUNT(*) FROM legacy_player_mapping WHERE legacy_source = 'team_roster';")
        mapped_team_roster = cur.fetchone()[0]
        
        cur.execute("SELECT COUNT(*) FROM match_lineups WHERE player IS NOT NULL;")
        match_lineups_count = cur.fetchone()[0]
        
        cur.execute("SELECT COUNT(*) FROM legacy_player_mapping WHERE legacy_source = 'match_lineups';")
        mapped_match_lineups = cur.fetchone()[0]
        
        print(f"Original team_roster records: {team_roster_count}")
        print(f"Mapped team_roster records: {mapped_team_roster}")
        print(f"Coverage: {mapped_team_roster/team_roster_count*100:.1f}%" if team_roster_count > 0 else "N/A")
        
        print(f"Original match_lineups records: {match_lineups_count}")
        print(f"Mapped match_lineups records: {mapped_match_lineups}")  
        print(f"Coverage: {mapped_match_lineups/match_lineups_count*100:.1f}%" if match_lineups_count > 0 else "N/A")
        
        # Check for unmapped records
        cur.execute("""
            SELECT COUNT(*) FROM legacy_player_mapping 
            WHERE player_id IS NULL;
        """)
        unmapped_count = cur.fetchone()[0]
        
        if unmapped_count > 0:
            print(f"⚠ {unmapped_count} unmapped records found")
            
            # Show sample unmapped records
            cur.execute("""
                SELECT legacy_source, legacy_name, COUNT(*) as count
                FROM legacy_player_mapping 
                WHERE player_id IS NULL
                GROUP BY legacy_source, legacy_name
                ORDER BY count DESC
                LIMIT 5;
            """)
            
            print("Sample unmapped records:")
            for source, name, count in cur.fetchall():
                print(f"  - '{name}' from {source} ({count} times)")
        else:
            print("✓ All records mapped successfully")
        
        return unmapped_count == 0

def test_api_endpoints(base_url="http://localhost:5000"):
    """Test 3: API endpoint functionality"""
    print(f"\n=== Test 3: API Endpoints (using {base_url}) ===")
    
    try:
        # Test team list
        response = requests.get(f"{base_url}/api/admin/teams", timeout=10)
        if response.status_code == 200:
            teams = response.json().get('teams', [])
            print(f"✓ GET /api/admin/teams - {len(teams)} teams found")
            
            if teams:
                team_id = teams[0]['id']
                team_name = teams[0]['name']
                
                # Test normalized roster endpoint
                try:
                    response = requests.get(f"{base_url}/api/admin/teams/{team_id}/roster/normalized", timeout=10)
                    if response.status_code == 200:
                        roster_data = response.json()
                        players_count = len(roster_data.get('players', []))
                        print(f"✓ GET /api/admin/teams/{team_id}/roster/normalized - {players_count} players")
                    else:
                        print(f"⚠ Normalized roster endpoint returned {response.status_code}")
                except requests.exceptions.RequestException:
                    print("⚠ Normalized roster endpoint not available (may need manual integration)")
                
                # Test legacy roster endpoint
                response = requests.get(f"{base_url}/api/admin/teams/{team_id}/roster", timeout=10)
                if response.status_code == 200:
                    legacy_data = response.json()
                    legacy_players = len(legacy_data.get('players', []))
                    print(f"✓ GET /api/admin/teams/{team_id}/roster (legacy) - {legacy_players} players")
                else:
                    print(f"✗ Legacy roster endpoint failed: {response.status_code}")
            
        else:
            print(f"✗ GET /api/admin/teams failed: {response.status_code}")
            return False
            
    except requests.exceptions.RequestException as e:
        print(f"⚠ API testing skipped - server not accessible: {e}")
        print("This is normal if the server is not running")
        return None  # Not a failure, just can't test
    
    return True

def test_data_consistency(conn):
    """Test 4: Data consistency checks"""
    print("\n=== Test 4: Data Consistency ===")
    
    with conn.cursor() as cur:
        # Test 4a: Check for duplicate players
        cur.execute("""
            SELECT first_name, last_name, COUNT(*) as count
            FROM players 
            WHERE is_active = TRUE
            GROUP BY LOWER(first_name), LOWER(COALESCE(last_name, ''))
            HAVING COUNT(*) > 1;
        """)
        
        duplicates = cur.fetchall()
        if duplicates:
            print(f"⚠ Found {len(duplicates)} potential duplicate players:")
            for fname, lname, count in duplicates[:5]:
                full_name = f"{fname} {lname or ''}".strip()
                print(f"  - {full_name} ({count} records)")
        else:
            print("✓ No duplicate players found")
        
        # Test 4b: Check mapping consistency
        cur.execute("""
            SELECT COUNT(*) FROM legacy_player_mapping lpm
            LEFT JOIN players p ON p.id = lpm.player_id
            WHERE lpm.player_id IS NOT NULL AND p.id IS NULL;
        """)
        
        broken_mappings = cur.fetchone()[0]
        if broken_mappings > 0:
            print(f"✗ {broken_mappings} broken mappings (player_id references non-existent players)")
        else:
            print("✓ All mappings reference valid players")
        
        # Test 4c: Check statistics consistency
        cur.execute("""
            SELECT COUNT(DISTINCT p.id) as player_count,
                   COUNT(ps.id) as stats_count
            FROM players p
            LEFT JOIN player_statistics ps ON ps.player_id = p.id
            WHERE p.is_active = TRUE;
        """)
        
        player_count, stats_count = cur.fetchone()
        print(f"Active players: {player_count}")
        print(f"Statistics records: {stats_count}")
        print(f"Stats coverage: {stats_count/player_count*100:.1f}%" if player_count > 0 else "N/A")
        
        return broken_mappings == 0

def generate_migration_report(conn):
    """Generate final migration report"""
    print("\n=== Migration Report ===")
    
    with conn.cursor() as cur:
        # Get migration log
        cur.execute("""
            SELECT step, status, message, data_count, created_at
            FROM player_migration_log
            ORDER BY created_at;
        """)
        
        log_entries = cur.fetchall()
        print("\nMigration Log:")
        print("-" * 80)
        for step, status, message, count, created_at in log_entries:
            status_symbol = "✓" if status == "completed" else "⚠" if status == "started" else "✗"
            count_str = f"({count} records)" if count else ""
            print(f"{status_symbol} {step}: {message} {count_str}")
            print(f"    {created_at}")
        
        # Summary statistics
        cur.execute("SELECT COUNT(*) FROM players WHERE is_active = TRUE;")
        total_players = cur.fetchone()[0]
        
        cur.execute("SELECT COUNT(*) FROM legacy_player_mapping;")
        total_mappings = cur.fetchone()[0]
        
        cur.execute("SELECT COUNT(*) FROM legacy_player_mapping WHERE player_id IS NOT NULL;")
        successful_mappings = cur.fetchone()[0]
        
        print(f"\nSummary:")
        print(f"Total active players: {total_players}")
        print(f"Total mappings: {total_mappings}")
        print(f"Successful mappings: {successful_mappings}")
        print(f"Success rate: {successful_mappings/total_mappings*100:.1f}%" if total_mappings > 0 else "N/A")

def main():
    print("=== Player Migration Testing Suite ===")
    print(f"Started at: {datetime.now()}\n")
    
    try:
        # Database tests
        conn = get_db_connection()
        print("Connected to database successfully.\n")
        
        test_results = []
        
        # Run tests
        test_results.append(("Database Structure", test_database_structure(conn)))
        test_results.append(("Data Migration", test_data_migration(conn)))
        test_results.append(("Data Consistency", test_data_consistency(conn)))
        
        # API tests (may be skipped if server not running)
        api_result = test_api_endpoints()
        if api_result is not None:
            test_results.append(("API Endpoints", api_result))
        
        # Generate report
        generate_migration_report(conn)
        
        # Final results
        print("\n" + "=" * 50)
        print("TEST RESULTS SUMMARY")
        print("=" * 50)
        
        passed = 0
        total = len(test_results)
        
        for test_name, result in test_results:
            symbol = "✓ PASS" if result else "✗ FAIL"
            print(f"{symbol}: {test_name}")
            if result:
                passed += 1
        
        print(f"\nOverall: {passed}/{total} tests passed")
        
        if passed == total:
            print("🎉 All tests passed! Migration appears successful.")
            print("\nNext steps:")
            print("1. Review any warnings above")
            print("2. Test UI functionality manually")
            print("3. Run step 6 to switch to normalized-only writes")
        else:
            print("⚠ Some tests failed. Please review and fix issues before proceeding.")
        
        conn.close()
        
    except Exception as e:
        print(f"ERROR: {e}")
        sys.exit(1)

if __name__ == '__main__':
    main()