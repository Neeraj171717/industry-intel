-- Migration 008: Platform settings table (singleton row for Super Admin)

CREATE TABLE IF NOT EXISTS platform_settings (
  id                            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  platform_name                 TEXT        NOT NULL DEFAULT 'Industry Intelligence',
  support_email                 TEXT,
  default_duplicate_threshold   FLOAT       NOT NULL DEFAULT 0.85,
  default_tag_suggestion_count  INTEGER     NOT NULL DEFAULT 5,
  processing_time_alert_secs    INTEGER     NOT NULL DEFAULT 10,
  session_timeout_hours         INTEGER     NOT NULL DEFAULT 24,
  failed_login_limit            INTEGER     NOT NULL DEFAULT 5,
  maintenance_mode              BOOLEAN     NOT NULL DEFAULT FALSE,
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS — only super_admin can read or write platform_settings
ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "platform_settings_select"
  ON platform_settings FOR SELECT
  TO authenticated
  USING (get_user_role() = 'super_admin');

CREATE POLICY "platform_settings_update"
  ON platform_settings FOR UPDATE
  TO authenticated
  USING  (get_user_role() = 'super_admin')
  WITH CHECK (get_user_role() = 'super_admin');

CREATE POLICY "platform_settings_insert"
  ON platform_settings FOR INSERT
  TO authenticated
  WITH CHECK (get_user_role() = 'super_admin');

-- Seed one row so the settings page always has a row to read/update
INSERT INTO platform_settings DEFAULT VALUES;
