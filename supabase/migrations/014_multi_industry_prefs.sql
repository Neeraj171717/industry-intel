-- ============================================================
-- 014_multi_industry_prefs.sql
-- Adds space_ids UUID[] to user_preferences so users can
-- follow up to 2 industries (with up to 3 tags each).
-- Backfills from existing space_id column.
-- ============================================================

ALTER TABLE user_preferences
  ADD COLUMN IF NOT EXISTS space_ids UUID[] DEFAULT '{}';

-- Backfill from existing single space_id
UPDATE user_preferences
SET space_ids = ARRAY[space_id]
WHERE space_id IS NOT NULL
  AND (space_ids IS NULL OR array_length(space_ids, 1) IS NULL OR array_length(space_ids, 1) = 0);
