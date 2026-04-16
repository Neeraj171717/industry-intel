-- ============================================================
-- 015_auto_activate_users.sql
--
-- Consumer product change: new end-user signups are activated
-- immediately after email confirmation — no admin approval step.
-- Staff roles (editor, contributor, industry_admin, super_admin)
-- are still created pending and must be activated by an admin.
-- ============================================================

-- Update the trigger to set role=user accounts as active immediately
CREATE OR REPLACE FUNCTION handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, name, role, status)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'name', 'User'),
    'user',
    'active'   -- was 'pending'; end-users activate on email confirmation
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- Activate any existing end-users that are stuck in pending
-- (anyone who signed up before this migration)
UPDATE public.users
SET status = 'active'
WHERE role = 'user'
  AND status = 'pending';
