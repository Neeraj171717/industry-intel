-- ============================================================
-- Industry Intelligence — Fix RLS for end-user role
-- 013_fix_user_rls_for_spaces_and_tags.sql
--
-- Problem: industry_spaces and tags policies only allowed
-- users to see rows that match their own space_id.
-- End users need to read ALL active spaces and tags so they
-- can switch industries in Preferences and see tag options.
-- ============================================================

-- Allow end-users to read all active industry spaces
-- (existing "spaces_select" already covers super_admin + own space;
--  this additional policy covers role='user' reading any active space)
CREATE POLICY "spaces_select_all_users"
  ON industry_spaces FOR SELECT
  TO authenticated
  USING (
    get_user_role() = 'user'
    AND status = 'active'
  );

-- Allow end-users to read all active tags across all spaces
-- (existing "tags_select" only allows own space; this opens read to all active tags)
CREATE POLICY "tags_select_all_users"
  ON tags FOR SELECT
  TO authenticated
  USING (
    get_user_role() = 'user'
    AND status = 'active'
  );
