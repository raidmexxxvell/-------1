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


import re

def parse_team_name(filename):
    # Удаляем расширение, заменяем дефисы/подчеркивания на пробелы, нормализуем регистр
    name = os.path.splitext(filename)[0]
    name = re.sub(r'[-_]', ' ', name)
    name = name.strip()
    # Первая буква каждого слова заглавная (с учетом кириллицы)
    name = name.title()
    return name

def get_teams_from_logos():
    logos_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'static', 'img', 'team-logos')
    files = [f for f in os.listdir(logos_dir) if os.path.isfile(os.path.join(logos_dir, f)) and f.lower().endswith(('.png', '.jpg', '.jpeg', '.svg'))]
    teams = []
    for f in files:
        name = parse_team_name(f)
        logo_url = f'/static/img/team-logos/{f}'
        teams.append({
            'name': name,
            'city': 'Обнинск',
            'logo_url': logo_url
        })
    return teams


def populate_teams():
    """Автоматически заполняет таблицу teams по файлам логотипов."""
    if SessionLocal is None:
        print("❌ Database not configured")
        return False
    with app.app_context():
        db = SessionLocal()
        try:
            print("🏟️ Автоматическое заполнение таблицы команд по логотипам...")
            teams_data = get_teams_from_logos()
            if not teams_data:
                print("❌ Не найдено ни одного логотипа команд в static/img/team-logos/")
                return False
            existing_count = db.query(Team).count()
            if existing_count > 0:
                print(f"⚠️ В БД уже есть {existing_count} команд")
                response = input("Продолжить? Существующие команды будут обновлены (y/N): ")
                if response.lower() != 'y':
                    print("Отмена")
                    return True
            for team_data in teams_data:
                existing_team = db.query(Team).filter(Team.name == team_data['name']).first()
                if existing_team:
                    print(f"🔄 Обновление команды: {team_data['name']}")
                    existing_team.city = team_data['city']
                    existing_team.logo_url = team_data['logo_url']
                    existing_team.is_active = True
                else:
                    print(f"➕ Создание команды: {team_data['name']}")
                    new_team = Team(
                        name=team_data['name'],
                        city=team_data['city'],
                        logo_url=team_data['logo_url'],
                        is_active=True
                    )
                    db.add(new_team)
            db.commit()
            total_teams = db.query(Team).filter(Team.is_active == True).count()
            print(f"✅ Успешно! В БД {total_teams} активных команд")
            teams = db.query(Team).filter(Team.is_active == True).order_by(Team.name).all()
            print("\n📋 Список команд в БД:")
            for i, team in enumerate(teams, 1):
                print(f"{i:2d}. {team.name} ({team.city})")
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