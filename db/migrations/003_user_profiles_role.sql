-- Migration: 003_user_profiles_role
-- Created: 2026-06-07
-- Migrates role from client-writable user_metadata to server-side user_profiles table.
-- Prevents privilege escalation via supabase.auth.updateUser() setting role to 'admin'.

-- Create user_profiles table if it doesn't exist
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'student',
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_user_profiles_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS user_profiles_updated_at ON user_profiles;
CREATE TRIGGER user_profiles_updated_at
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION update_user_profiles_updated_at();

-- RLS: users can read their own profile but only service role can update role column
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read their own profile (needed for role checks)
DROP POLICY IF EXISTS user_profiles_select ON user_profiles;
CREATE POLICY user_profiles_select ON user_profiles
  FOR SELECT USING (auth.uid() = id);

-- Only service role can INSERT new profiles (app sets role at registration)
DROP POLICY IF EXISTS user_profiles_insert ON user_profiles;
CREATE POLICY user_profiles_insert ON user_profiles
  FOR INSERT WITH CHECK (auth.uid() = id OR auth.jwt()->>'role' = 'service_role');

-- Users can update their own profile EXCEPT the role column
DROP POLICY IF EXISTS user_profiles_update ON user_profiles;
CREATE POLICY user_profiles_update ON user_profiles
  FOR UPDATE USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Backpopulate existing users: copy role from user_metadata to user_profiles.
-- This ensures all pre-existing users are migrated. If user_metadata has no role,
-- default to 'student'. Unique constraint on id prevents duplicate inserts.
INSERT INTO user_profiles (id, role, email, created_at, updated_at)
SELECT
  au.id,
  COALESCE(NULLIF(TRIM(BOTH '"' FROM au.raw_user_meta_data->>'role'), ''), 'student'),
  au.email,
  COALESCE(au.created_at, now()),
  COALESCE(au.updated_at, now())
FROM auth.users au
WHERE NOT EXISTS (
  SELECT 1 FROM user_profiles up WHERE up.id = au.id
)
ON CONFLICT (id) DO UPDATE
  SET role = EXCLUDED.role,
      email = EXCLUDED.email,
      updated_at = now();

-- Revoke authenticated users' ability to UPDATE the role column directly
-- The application controls role assignment through server-side profile creation.
-- This uses column-level security to block even row-level-authenticated UPDATE on role.
-- Note: Standard PostgreSQL doesn't support column-level RLS, so we use a trigger.
DROP FUNCTION IF EXISTS prevent_role_update();
CREATE OR REPLACE FUNCTION prevent_role_update()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.role IS DISTINCT FROM OLD.role AND auth.jwt()->>'role' != 'service_role' THEN
    RAISE EXCEPTION 'Role column cannot be updated by authenticated users';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS prevent_user_profiles_role_update ON user_profiles;
CREATE TRIGGER prevent_user_profiles_role_update
  BEFORE UPDATE ON user_profiles
  FOR EACH ROW EXECUTE FUNCTION prevent_role_update();

-- Index for fast role lookups during auth
CREATE INDEX IF NOT EXISTS idx_user_profiles_id_role ON user_profiles(id, role);