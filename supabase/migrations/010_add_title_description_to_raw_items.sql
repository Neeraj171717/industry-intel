-- Add title and description columns to raw_items
-- These store og:title and og:description fetched during URL submission
-- so the editor draft builder can pre-fill fields without AI cost.

ALTER TABLE raw_items ADD COLUMN IF NOT EXISTS title TEXT;
ALTER TABLE raw_items ADD COLUMN IF NOT EXISTS description TEXT;
