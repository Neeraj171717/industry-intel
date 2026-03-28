-- Migration 007: content_flags table, space_settings table, sources.notes column

-- Content flags: Industry Admin can flag published articles for editor review
CREATE TABLE IF NOT EXISTS content_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES industry_spaces(id),
  final_item_id UUID NOT NULL REFERENCES final_items(id),
  flagged_by UUID NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  note TEXT,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'resolved')),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Space settings: per-space workflow, AI thresholds, notification prefs
CREATE TABLE IF NOT EXISTS space_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id UUID NOT NULL REFERENCES industry_spaces(id) UNIQUE,
  -- Workflow
  require_second_review_for_critical BOOLEAN DEFAULT FALSE,
  auto_reject_under_chars INTEGER DEFAULT 0,
  expected_turnaround_hours INTEGER DEFAULT 24,
  -- AI Brain thresholds
  duplicate_threshold FLOAT DEFAULT 0.85,
  related_coverage_threshold FLOAT DEFAULT 0.50,
  processing_time_alert_seconds INTEGER DEFAULT 10,
  -- Notifications
  notify_pending_approvals_above INTEGER DEFAULT 5,
  notify_inbox_above INTEGER DEFAULT 20,
  weekly_digest BOOLEAN DEFAULT TRUE,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add notes column to sources
ALTER TABLE sources
  ADD COLUMN IF NOT EXISTS notes TEXT;
