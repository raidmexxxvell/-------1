"""Create team_players and legacy_player_mapping tables

Revision ID: 20250927_add_team_players
Revises: 20250920_add_user_achievement_rewards
Create Date: 2025-09-27
"""
from alembic import op
import sqlalchemy as sa

revision = '20250927_add_team_players'
down_revision = '20250920_add_user_achievement_rewards'
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        sa.text(
            """
            CREATE TABLE IF NOT EXISTS team_players (
                id SERIAL PRIMARY KEY,
                team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
                player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
                jersey_number INTEGER,
                position VARCHAR(50),
                status VARCHAR(20) DEFAULT 'active',
                is_captain BOOLEAN DEFAULT false,
                joined_at TIMESTAMPTZ DEFAULT NOW(),
                left_at TIMESTAMPTZ,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW(),
                CONSTRAINT uq_team_player_unique UNIQUE (team_id, player_id)
            );
            CREATE INDEX IF NOT EXISTS ix_team_players_team ON team_players(team_id);
            CREATE INDEX IF NOT EXISTS ix_team_players_player ON team_players(player_id);
            CREATE INDEX IF NOT EXISTS ix_team_players_status ON team_players(status);

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
                    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_team_players_updated_at'
                ) THEN
                    CREATE TRIGGER trg_team_players_updated_at
                    BEFORE UPDATE ON team_players
                    FOR EACH ROW
                    EXECUTE FUNCTION set_updated_at();
                END IF;
            END $$;

            CREATE TABLE IF NOT EXISTS player_migration_log (
                id SERIAL PRIMARY KEY,
                step VARCHAR(50) NOT NULL,
                status VARCHAR(20) DEFAULT 'started',
                message TEXT,
                data_count INTEGER DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS legacy_player_mapping (
                id SERIAL PRIMARY KEY,
                legacy_source VARCHAR(50) NOT NULL,
                legacy_id INTEGER,
                team_id INTEGER REFERENCES teams(id) ON DELETE CASCADE,
                legacy_name TEXT NOT NULL,
                player_id INTEGER REFERENCES players(id) ON DELETE SET NULL,
                confidence DOUBLE PRECISION DEFAULT 0.0,
                notes TEXT,
                needs_review BOOLEAN DEFAULT TRUE,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                updated_at TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS idx_legacy_player_mapping_source_id ON legacy_player_mapping(legacy_source, legacy_id);
            CREATE INDEX IF NOT EXISTS idx_legacy_player_mapping_player ON legacy_player_mapping(player_id);
            CREATE INDEX IF NOT EXISTS idx_legacy_player_mapping_team ON legacy_player_mapping(team_id);
            CREATE INDEX IF NOT EXISTS idx_legacy_player_mapping_name ON legacy_player_mapping(legacy_name);

            DO $$
            BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_legacy_player_mapping_updated_at'
                ) THEN
                    CREATE TRIGGER trg_legacy_player_mapping_updated_at
                    BEFORE UPDATE ON legacy_player_mapping
                    FOR EACH ROW
                    EXECUTE FUNCTION set_updated_at();
                END IF;
            END $$;
            """
        )
    )


def downgrade():
    op.execute("DROP TABLE IF EXISTS legacy_player_mapping CASCADE;")
    op.execute("DROP TABLE IF EXISTS team_players CASCADE;")
    op.execute("DROP TABLE IF EXISTS player_migration_log CASCADE;")
