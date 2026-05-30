-- User Profiles Table for MediScan
-- Run in Supabase SQL Editor

-- Table
CREATE TABLE IF NOT EXISTS user_profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  phone TEXT,
  date_of_birth DATE,
  gender TEXT CHECK (gender IN ('male', 'female', 'other')),
  blood_type TEXT CHECK (blood_type IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  address TEXT,
  city TEXT,
  profile_picture_url TEXT,
  language_preference TEXT DEFAULT 'en' CHECK (language_preference IN ('en', 'am')),
  notification_enabled BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can read their own profile
DROP POLICY IF EXISTS user_profiles_own_read ON user_profiles;
CREATE POLICY user_profiles_own_read ON user_profiles FOR SELECT USING (auth.uid() = id);

-- Users can update their own profile
DROP POLICY IF EXISTS user_profiles_own_update ON user_profiles;
CREATE POLICY user_profiles_own_update ON user_profiles FOR UPDATE USING (auth.uid() = id);

-- Service role can do everything
DROP POLICY IF EXISTS user_profiles_service_all ON user_profiles;
CREATE POLICY user_profiles_service_all ON user_profiles TO service_role USING (true);

-- Index for language preference
CREATE INDEX IF NOT EXISTS user_profiles_language_idx ON user_profiles(language_preference);

-- Auto-create profile on user registration
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.user_profiles (id) VALUES (NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- Grant permissions
GRANT ALL ON user_profiles TO service_role;