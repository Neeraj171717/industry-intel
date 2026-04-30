-- Migration 017 — add full_content to raw_items
--
-- Stores the cleaned main article body extracted from source_url during
-- RSS enrichment. NULL when extraction fails or for manual submissions
-- that did not go through the enrichment pipeline.
--
-- TEXT has no length limit in PostgreSQL; content is capped at 50 000 chars
-- in application code before insertion.

ALTER TABLE raw_items ADD COLUMN IF NOT EXISTS full_content TEXT;
