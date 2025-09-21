"""
Migration script to initialize Liga Obninska database
Database-only initialization, Google Sheets removed
"""

import os
import sys
from datetime import datetime, timedelta
import pathlib

# Ensure project root on sys.path for package imports when executed via web route
CURRENT_DIR = pathlib.Path(__file__).resolve().parent
ROOT_DIR = CURRENT_DIR.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

try:
    # Correct package-qualified import
    from database.database_models import db_manager, Tournament, Team, Player, Match
except ImportError as e:
    raise ImportError(f"Failed to import database models: {e}. Ensure 'database' package is present and PYTHONPATH includes project root.")

def get_google_sheets_client():
    """Google Sheets removed from project"""
    print("ERROR: Google Sheets functionality has been removed from the project")
    return None

def import_schedule_from_sheets():
    """Google Sheets removed from project"""
    print("[INFO] Google Sheets functionality has been removed from the project")
    print("[INFO] Use create_sample_data() instead or admin panel to add matches")
    return False

def create_sample_data():
    """Create sample data for testing if Google Sheets import fails"""
    print("[INFO] Creating sample data...")
    
    with db_manager.get_session() as session:
        # Create tournament
        tournament = Tournament(
            name='Лига Обнинск',
            season='2025',
            status='active',
            start_date=datetime.now().date(),
            description='Основной турнир сезона 2025'
        )
        session.add(tournament)
        session.flush()
        
        # Create teams based on existing logos
        team_names = [
            'Дождь', 'Звезда', 'Киборги', 'Креатив', 'Полет', 
            'Серпантин', 'ФК Обнинск', 'ФК Setka4Real', 'Ювелиры'
        ]
        
        teams = []
        for team_name in team_names:
            team = Team(
                name=team_name,
                logo_url=f'/static/img/team-logos/{team_name.lower()}.png',
                is_active=True,
                city='Обнинск'
            )
            session.add(team)
            teams.append(team)
        
        session.flush()
        
        # Create sample matches
        for i in range(5):
            home_team = teams[i % len(teams)]
            away_team = teams[(i + 1) % len(teams)]
            
            match = Match(
                tournament_id=tournament.id,
                home_team_id=home_team.id,
                away_team_id=away_team.id,
                match_date=datetime.now() + timedelta(days=i),
                venue='Стадион Обнинск',
                status='scheduled'
            )
            session.add(match)
        
        session.commit()
        print("[INFO] Sample data created successfully")

def main():
    """Main initialization function"""
    print("Liga Obninska Database Initialization")
    print("=" * 40)
    
    # Check if database connection is available
    try:
        db_manager.create_tables()
        print("[INFO] Database tables created/verified")
    except Exception as e:
        print(f"[ERROR] Database connection failed: {e}")
        return 1
    
    # Google Sheets functionality removed, create sample data
    success = import_schedule_from_sheets()
    
    if not success:
        print("[WARN] Schedule import not available, creating sample data...")
        create_sample_data()
    
    print("\n[INFO] Database initialization completed!")
    print("[INFO] Statistics tables are empty and will be populated from match events.")
    print("[INFO] Access admin panel at /admin to manage matches and events.")
    
    return 0

if __name__ == "__main__":
    exit_code = main()
    sys.exit(exit_code)
