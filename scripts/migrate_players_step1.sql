-- Migration Step 1: Create helper tables and analyze existing data
-- Date: 26.09.2025

-- Helper table to track migration progress
CREATE TABLE IF NOT EXISTS player_migration_log (
    id SERIAL PRIMARY KEY,
    step VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'started', -- started, completed, failed
    message TEXT,
    data_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Temporary table to store name normalization results
CREATE TABLE IF NOT EXISTS temp_player_names (
    id SERIAL PRIMARY KEY,
    original_name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    first_name VARCHAR(100),
    last_name VARCHAR(100),
    confidence FLOAT DEFAULT 1.0,
    needs_review BOOLEAN DEFAULT FALSE,
    source_table VARCHAR(50),
    source_count INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert start log
INSERT INTO player_migration_log (step, message) 
VALUES ('step1_start', 'Beginning player migration analysis');

-- Analyze existing data from team_roster
INSERT INTO temp_player_names (original_name, normalized_name, source_table, source_count)
SELECT 
    tr.player as original_name,
    TRIM(REGEXP_REPLACE(tr.player, '\s+', ' ', 'g')) as normalized_name,
    'team_roster' as source_table,
    COUNT(*) as source_count
FROM team_roster tr
WHERE tr.player IS NOT NULL AND TRIM(tr.player) != ''
GROUP BY tr.player;

-- Analyze existing data from match_lineups
INSERT INTO temp_player_names (original_name, normalized_name, source_table, source_count)
SELECT 
    ml.player as original_name,
    TRIM(REGEXP_REPLACE(ml.player, '\s+', ' ', 'g')) as normalized_name,
    'match_lineups' as source_table,
    COUNT(*) as source_count
FROM match_lineups ml
WHERE ml.player IS NOT NULL AND TRIM(ml.player) != ''
  AND NOT EXISTS (
    SELECT 1 FROM temp_player_names tpn 
    WHERE tpn.normalized_name = TRIM(REGEXP_REPLACE(ml.player, '\s+', ' ', 'g'))
  )
GROUP BY ml.player;

-- Parse names into first_name/last_name
UPDATE temp_player_names 
SET 
    first_name = CASE 
        WHEN POSITION(' ' IN normalized_name) > 0 
        THEN TRIM(SUBSTRING(normalized_name FROM 1 FOR POSITION(' ' IN normalized_name) - 1))
        ELSE normalized_name
    END,
    last_name = CASE 
        WHEN POSITION(' ' IN normalized_name) > 0 
        THEN TRIM(SUBSTRING(normalized_name FROM POSITION(' ' IN normalized_name) + 1))
        ELSE NULL
    END;

-- Mark problematic names for review
UPDATE temp_player_names 
SET needs_review = TRUE
WHERE 
    LENGTH(first_name) < 2 
    OR first_name ~* '[0-9]'  -- contains digits
    OR normalized_name ~* '(test|тест|admin|админ)';

-- Log completion
INSERT INTO player_migration_log (step, status, message, data_count) 
SELECT 'step1_complete', 'completed', 'Name analysis completed', COUNT(*)
FROM temp_player_names;

-- Show analysis results
SELECT 
    source_table,
    COUNT(*) as total_names,
    COUNT(*) FILTER (WHERE needs_review = FALSE) as clean_names,
    COUNT(*) FILTER (WHERE needs_review = TRUE) as needs_review
FROM temp_player_names
GROUP BY source_table
UNION ALL
SELECT 
    'TOTAL' as source_table,
    COUNT(*) as total_names,
    COUNT(*) FILTER (WHERE needs_review = FALSE) as clean_names,
    COUNT(*) FILTER (WHERE needs_review = TRUE) as needs_review
FROM temp_player_names;