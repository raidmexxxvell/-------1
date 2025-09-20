"""Add user_achievement_rewards table

Revision ID: 20250920_add_user_achievement_rewards
Revises: 20250914_create_user_achievements
Create Date: 2025-09-20
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '20250920_add_user_achievement_rewards'
down_revision = '20250914_create_user_achievements'
branch_labels = None
depends_on = None

def upgrade():
    op.execute(
        sa.text(
            """
            CREATE TABLE IF NOT EXISTS user_achievement_rewards (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL,
                "group" VARCHAR(32) NOT NULL,
                tier INTEGER NOT NULL,
                xp INTEGER DEFAULT 0,
                credits INTEGER DEFAULT 0,
                created_at TIMESTAMPTZ DEFAULT NOW(),
                CONSTRAINT uq_user_reward_group_tier UNIQUE (user_id, "group", tier)
            );
            CREATE INDEX IF NOT EXISTS idx_user_achievement_rewards_user ON user_achievement_rewards(user_id);
            CREATE INDEX IF NOT EXISTS idx_user_achievement_rewards_created_at ON user_achievement_rewards(created_at);
            """
        )
    )


def downgrade():
    op.execute('DROP TABLE IF EXISTS user_achievement_rewards CASCADE;')
