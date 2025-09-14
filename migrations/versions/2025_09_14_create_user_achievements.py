"""Create user_achievements table

Revision ID: 20250914_create_user_achievements
Revises: 
Create Date: 2025-09-14 00:00:00.000000
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '20250914_create_user_achievements'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create table if not exists (safe to run multiple times)
    op.execute('''
    CREATE TABLE IF NOT EXISTS user_achievements (
        user_id INTEGER PRIMARY KEY,
        best_streak_tier INTEGER DEFAULT 0,
        best_credits_tier INTEGER DEFAULT 0,
        best_level_tier INTEGER DEFAULT 0,
        best_invited_tier INTEGER DEFAULT 0,
        best_betcount_tier INTEGER DEFAULT 0,
        best_betwins_tier INTEGER DEFAULT 0,
        best_bigodds_tier INTEGER DEFAULT 0,
        best_markets_tier INTEGER DEFAULT 0,
        best_weeks_tier INTEGER DEFAULT 0,
        streak_unlocked_at TIMESTAMPTZ NULL,
        credits_unlocked_at TIMESTAMPTZ NULL,
        level_unlocked_at TIMESTAMPTZ NULL,
        invited_unlocked_at TIMESTAMPTZ NULL,
        betcount_unlocked_at TIMESTAMPTZ NULL,
        betwins_unlocked_at TIMESTAMPTZ NULL,
        bigodds_unlocked_at TIMESTAMPTZ NULL,
        markets_unlocked_at TIMESTAMPTZ NULL,
        weeks_unlocked_at TIMESTAMPTZ NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    -- trigger function to update updated_at
    DO $$
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at') THEN
            CREATE OR REPLACE FUNCTION set_updated_at()
            RETURNS TRIGGER AS $$
            BEGIN
                NEW.updated_at = NOW();
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        END IF;
    END $$;

    DO $$
    BEGIN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.triggers 
            WHERE event_object_table = 'user_achievements' AND trigger_name = 'trg_user_achievements_updated_at'
        ) THEN
            CREATE TRIGGER trg_user_achievements_updated_at
            BEFORE UPDATE ON user_achievements
            FOR EACH ROW
            EXECUTE FUNCTION set_updated_at();
        END IF;
    END $$;
    ''')


def downgrade() -> None:
    # Drop table (use with caution)
    op.execute('DROP TABLE IF EXISTS user_achievements CASCADE;')
