-- ============================================================
-- Migration 003 — Add source_type to raw_items
-- The contributor submission form captures source type
-- (blog, official, youtube, ai_tool) as a separate field
-- from source_id (which links to an approved source record).
-- ============================================================

ALTER TABLE raw_items
  ADD COLUMN IF NOT EXISTS source_type TEXT
  CHECK (source_type IN ('blog', 'official', 'youtube', 'ai_tool', 'other'));
