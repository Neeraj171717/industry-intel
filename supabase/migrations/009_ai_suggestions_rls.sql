-- Migration 009 — Explicit RLS for ai_suggestions
--
-- Replaces the existing ai_suggestions_select policy with a version that
-- explicitly joins through raw_items → space_id → users, matching the pattern
-- used by every other space-scoped policy in the schema.
-- The previous policy relied on get_user_space_id() + get_user_role() helpers;
-- this version is self-contained and does not depend on those functions.

-- Drop existing SELECT policy and replace with explicit version
DROP POLICY IF EXISTS "ai_suggestions_select" ON ai_suggestions;

CREATE POLICY "ai_suggestions_select"
  ON ai_suggestions FOR SELECT
  TO authenticated
  USING (
    raw_item_id IN (
      SELECT id FROM raw_items
      WHERE space_id IN (
        SELECT space_id FROM users
        WHERE id = auth.uid()
          AND space_id IS NOT NULL
      )
    )
  );

-- Re-apply UPDATE policy (unchanged — drop + recreate to keep consistent)
DROP POLICY IF EXISTS "ai_suggestions_update" ON ai_suggestions;

CREATE POLICY "ai_suggestions_update"
  ON ai_suggestions FOR UPDATE
  TO authenticated
  USING (
    raw_item_id IN (
      SELECT id FROM raw_items
      WHERE space_id IN (
        SELECT space_id FROM users
        WHERE id = auth.uid()
          AND role IN ('super_admin', 'industry_admin', 'editor')
          AND space_id IS NOT NULL
      )
    )
  );
