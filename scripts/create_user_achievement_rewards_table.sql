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

-- Индексы для выборок и очистки
CREATE INDEX IF NOT EXISTS idx_user_achievement_rewards_user ON user_achievement_rewards(user_id);
CREATE INDEX IF NOT EXISTS idx_user_achievement_rewards_created_at ON user_achievement_rewards(created_at);
