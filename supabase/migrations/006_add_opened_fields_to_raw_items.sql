-- Migration 006: Add opened_by and opened_at to raw_items
-- Tracks which editor first opened an item for review.
-- Used as a courtesy indicator in the inbox — not a hard lock.

ALTER TABLE raw_items
  ADD COLUMN IF NOT EXISTS opened_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS opened_at TIMESTAMPTZ;
