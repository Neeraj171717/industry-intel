-- Migration 005: Add rejection fields to raw_items
-- These fields capture why a raw item was rejected by an editor.

ALTER TABLE raw_items
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS rejection_note TEXT,
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES users(id),
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;
