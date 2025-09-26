-- Migration Step 2: Create normalized player records
-- Date: 26.09.2025

-- Log step start
INSERT INTO player_migration_log (step, message) 
VALUES ('step2_start', 'Creating normalized player records');

-- Create players from clean temp names (exact matches with existing players first)
WITH exact_matches AS (
    SELECT 
        tpn.id as temp_id,
        p.id as existing_player_id,
        tpn.normalized_name
    FROM temp_player_names tpn
    JOIN players p ON (
        LOWER(TRIM(p.first_name || ' ' || COALESCE(p.last_name, ''))) = LOWER(tpn.normalized_name)
        OR (p.username IS NOT NULL AND LOWER(tpn.normalized_name) LIKE '%' || LOWER(p.username) || '%')
    )
    WHERE p.is_active = TRUE
      AND tpn.needs_review = FALSE
)
INSERT INTO temp_player_names (id, original_name, normalized_name, first_name, last_name, confidence, source_table, source_count)
SELECT 
    -temp_id as id,  -- negative ID to mark as matched
    'MATCHED: ' || normalized_name,
    normalized_name,
    NULL,
    NULL,
    1.0,
    'existing_match',
    existing_player_id  -- store existing player_id in source_count field
FROM exact_matches;

-- Create new players for non-matching clean names
INSERT INTO players (
    first_name, 
    last_name, 
    username, 
    position, 
    is_active, 
    created_at, 
    updated_at
)
SELECT 
    tpn.first_name,
    tpn.last_name,
    NULL as username,  -- will be filled later if needed
    NULL as position,  -- will be filled from match data if available
    TRUE as is_active,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM temp_player_names tpn
LEFT JOIN temp_player_names matched ON matched.id = -tpn.id  -- check if already matched
WHERE tpn.needs_review = FALSE 
  AND matched.id IS NULL  -- not already matched to existing player
  AND tpn.first_name IS NOT NULL;

-- Log player creation
INSERT INTO player_migration_log (step, status, message, data_count)
SELECT 
    'step2_players_created', 
    'completed',
    'New players created from clean names',
    COUNT(*)
FROM players p
WHERE p.created_at >= (
    SELECT created_at FROM player_migration_log 
    WHERE step = 'step2_start' 
    ORDER BY created_at DESC LIMIT 1
);

-- Create mapping table to link legacy data to new players
CREATE TABLE IF NOT EXISTS legacy_player_mapping (
    id SERIAL PRIMARY KEY,
    legacy_source VARCHAR(50) NOT NULL,  -- 'team_roster' or 'match_lineups'
    legacy_id INTEGER,                   -- original record ID
    legacy_name TEXT NOT NULL,
    player_id INTEGER REFERENCES players(id),
    confidence FLOAT DEFAULT 1.0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Map team_roster records to players
INSERT INTO legacy_player_mapping (legacy_source, legacy_id, legacy_name, player_id, confidence)
SELECT 
    'team_roster' as legacy_source,
    tr.id as legacy_id,
    tr.player as legacy_name,
    CASE 
        -- First try exact match with new players
        WHEN p_new.id IS NOT NULL THEN p_new.id
        -- Then try matched existing players
        WHEN tpn_matched.source_count IS NOT NULL THEN tpn_matched.source_count
        ELSE NULL
    END as player_id,
    CASE 
        WHEN p_new.id IS NOT NULL OR tpn_matched.source_count IS NOT NULL THEN 1.0
        ELSE 0.0
    END as confidence
FROM team_roster tr
LEFT JOIN temp_player_names tpn ON tpn.normalized_name = TRIM(REGEXP_REPLACE(tr.player, '\s+', ' ', 'g'))
LEFT JOIN players p_new ON (
    p_new.first_name = tpn.first_name 
    AND COALESCE(p_new.last_name, '') = COALESCE(tpn.last_name, '')
    AND p_new.created_at >= (
        SELECT created_at FROM player_migration_log 
        WHERE step = 'step2_start' 
        ORDER BY created_at DESC LIMIT 1
    )
)
LEFT JOIN temp_player_names tpn_matched ON tpn_matched.id = -tpn.id AND tpn_matched.source_table = 'existing_match';

-- Map match_lineups records to players
INSERT INTO legacy_player_mapping (legacy_source, legacy_id, legacy_name, player_id, confidence)
SELECT DISTINCT
    'match_lineups' as legacy_source,
    ml.id as legacy_id,
    ml.player as legacy_name,
    lpm.player_id,
    lpm.confidence
FROM match_lineups ml
JOIN legacy_player_mapping lpm ON lpm.legacy_name = ml.player AND lpm.legacy_source = 'team_roster'
WHERE NOT EXISTS (
    SELECT 1 FROM legacy_player_mapping lpm2 
    WHERE lpm2.legacy_source = 'match_lineups' 
      AND lpm2.legacy_id = ml.id
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_legacy_player_mapping_source_id ON legacy_player_mapping(legacy_source, legacy_id);
CREATE INDEX IF NOT EXISTS idx_legacy_player_mapping_player_id ON legacy_player_mapping(player_id);
CREATE INDEX IF NOT EXISTS idx_legacy_player_mapping_name ON legacy_player_mapping(legacy_name);

-- Log mapping completion
INSERT INTO player_migration_log (step, status, message, data_count)
SELECT 
    'step2_mapping_complete',
    'completed', 
    'Legacy mapping created',
    COUNT(*)
FROM legacy_player_mapping;

-- Show mapping statistics
SELECT 
    legacy_source,
    COUNT(*) as total_records,
    COUNT(*) FILTER (WHERE player_id IS NOT NULL) as mapped_records,
    COUNT(*) FILTER (WHERE confidence = 1.0) as high_confidence,
    COUNT(*) FILTER (WHERE confidence < 1.0) as low_confidence
FROM legacy_player_mapping
GROUP BY legacy_source
UNION ALL
SELECT 
    'TOTAL' as legacy_source,
    COUNT(*) as total_records,
    COUNT(*) FILTER (WHERE player_id IS NOT NULL) as mapped_records,
    COUNT(*) FILTER (WHERE confidence = 1.0) as high_confidence,
    COUNT(*) FILTER (WHERE confidence < 1.0) as low_confidence
FROM legacy_player_mapping;