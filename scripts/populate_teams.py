#!/usr/bin/env python3
"""
Скрипт для заполнения БД данными о командах Liga Obninska
"""

import sys
import os

# Добавляем корневую директорию в PYTHONPATH
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app
from config import SessionLocal
from database.database_models import Team

# Данные о 9 командах Liga Obninska (актуально по БД)
TEAMS_DATA = [
    {
        'name': 'Дождь',
        'city': 'Обнинск',
        'logo_url': '/static/img/team-logos/дождь.png',
        'description': None
    },
    {
        'name': 'Звезда',
        'city': 'Обнинск',
        'logo_url': '/static/img/team-logos/звезда.png',
        'description': None
    },
    {
        'name': 'Киборги',
        'city': 'Обнинск',
        'logo_url': '/static/img/team-logos/киборги.png',
        'description': None
    },
    {
        'name': 'Креатив',
        'city': 'Обнинск',
        'logo_url': '/static/img/team-logos/креатив.png',
        'description': None
    },
    {
        'name': 'Полет',
        'city': 'Обнинск',
        'logo_url': '/static/img/team-logos/полет.png',
        'description': None
    },
    {
        'name': 'Серпантин',
        'city': 'Обнинск',
        'logo_url': '/static/img/team-logos/серпантин.png',
        'description': None
    },
    {
        'name': 'ФК Обнинск',
        'city': 'Обнинск',
        'logo_url': 'static/img/team-logos/фкобнинск.png',
        'description': None
    },
    {
        'name': 'ФК Setka4Real',
        'city': 'Обнинск',
        'logo_url': 'static/img/team-logos/фкsetka4real.png',
        'description': None
    },
    {
        'name': 'Ювелиры',
        'city': 'Обнинск',
        'logo_url': '/static/img/team-logos/ювелиры.png',
        'description': None
    }
]

def populate_teams():
    """Заполняет таблицу teams данными о командах."""
    
    if SessionLocal is None:
        print("❌ Database not configured")
        return False
    
    with app.app_context():
        db = SessionLocal()
        try:
            print("🏟️ Заполняение таблицы команд...")
            
            # Проверяем, есть ли уже команды
            existing_count = db.query(Team).count()
            if existing_count > 0:
                print(f"⚠️ В БД уже есть {existing_count} команд")
                response = input("Продолжить? Существующие команды будут обновлены (y/N): ")
                if response.lower() != 'y':
                    print("Отмена")
                    return True
            
            # Добавляем/обновляем команды
            for team_data in TEAMS_DATA:
                # Проверяем, существует ли команда
                existing_team = db.query(Team).filter(Team.name == team_data['name']).first()
                
                if existing_team:
                    # Обновляем существующую команду
                    print(f"🔄 Обновление команды: {team_data['name']}")
                    existing_team.city = team_data['city']
                    existing_team.founded_year = team_data['founded_year']
                    existing_team.logo_url = team_data['logo_url']
                    existing_team.description = team_data['description']
                    existing_team.is_active = True
                else:
                    # Создаем новую команду
                    print(f"➕ Создание команды: {team_data['name']}")
                    new_team = Team(
                        name=team_data['name'],
                        city=team_data['city'],
                        founded_year=team_data['founded_year'],
                        logo_url=team_data['logo_url'],
                        description=team_data['description'],
                        is_active=True
                    )
                    db.add(new_team)
            
            # Сохраняем изменения
            db.commit()
            
            # Проверяем результат
            total_teams = db.query(Team).filter(Team.is_active == True).count()
            print(f"✅ Успешно! В БД {total_teams} активных команд")
            
            # Выводим список команд
            teams = db.query(Team).filter(Team.is_active == True).order_by(Team.name).all()
            print("\n📋 Список команд в БД:")
            for i, team in enumerate(teams, 1):
                print(f"{i:2d}. {team.name} ({team.city}, {team.founded_year})")
            
            return True
            
        except Exception as e:
            db.rollback()
            print(f"❌ Ошибка при заполнении команд: {e}")
            return False
        finally:
            db.close()

if __name__ == '__main__':
    print("=" * 50)
    print("🏆 Liga Obninska - Заполнение команд")
    print("=" * 50)
    
    success = populate_teams()
    
    print("\n" + "=" * 50)
    if success:
        print("✅ Заполнение команд завершено успешно!")
        print("💡 Теперь можно перейти в админ-панель и управлять командами")
        print("🌐 Откройте /admin и перейдите на вкладку 'Команды'")
    else:
        print("❌ Ошибка при заполнении команд")
    print("=" * 50)