-- ============================================================
-- Migration 016 — RSS ingestion support
--
-- 1. Allow submitted_by to be NULL so automated (system-generated)
--    raw_items don't require a real user account.
--    Existing rows and manual submissions are unaffected.
--
-- 2. Extend the source_type check to include 'auto_rss' so the
--    RSS ingest pipeline can tag its rows distinctly from the
--    contributor-submitted types.
-- ============================================================

-- Allow NULL submitted_by for system/automated submissions
ALTER TABLE raw_items ALTER COLUMN submitted_by DROP NOT NULL;

-- Add 'auto_rss' to the source_type allowed values
ALTER TABLE raw_items DROP CONSTRAINT IF EXISTS raw_items_source_type_check;
ALTER TABLE raw_items
  ADD CONSTRAINT raw_items_source_type_check
  CHECK (source_type IN ('blog', 'official', 'youtube', 'ai_tool', 'other', 'auto_rss'));
