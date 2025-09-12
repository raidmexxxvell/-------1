-- Migration: create admin_backups table
CREATE TABLE IF NOT EXISTS admin_backups (
    id SERIAL PRIMARY KEY,
    action VARCHAR(128) NOT NULL,
    payload_gz BYTEA NOT NULL,
    metadata JSONB,
    created_by VARCHAR(64),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_backups_action_created_at ON admin_backups(action, created_at DESC);
