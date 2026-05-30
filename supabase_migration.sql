-- =============================================================================
-- MediScan Database Schema
-- Run this in Supabase SQL Editor: https://supabase.com/dashboard
-- Project: MediScan (iaylskrenjvcxjdywscv)
-- Created: 2026-05-30
-- =============================================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- RECORDS TABLE (encrypted health data)
-- =============================================================================
CREATE TABLE IF NOT EXISTS records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_blob TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- AUDIT TABLE (action logging)
-- =============================================================================
CREATE TABLE IF NOT EXISTS audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  record_id UUID REFERENCES records(id) ON DELETE SET NULL,
  timestamp TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- NEWS TABLE (cached health news)
-- =============================================================================
CREATE TABLE IF NOT EXISTS news (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  url TEXT UNIQUE NOT NULL,
  source TEXT,
  category TEXT DEFAULT 'general',
  published_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ DEFAULT now(),
  is_AI_generated BOOLEAN DEFAULT true,
  is_curated BOOLEAN DEFAULT false,
  icon TEXT,
  tag TEXT,
  tagName TEXT,
  date TEXT,
  body TEXT
);

-- =============================================================================
-- ANALYZE_LOGS TABLE (for /api/analyze audit)
-- =============================================================================
CREATE TABLE IF NOT EXISTS analyze_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_hash TEXT,
  symptom_hash TEXT,
  body_area TEXT,
  model_used TEXT,
  response_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- AUTO-UPDATE TRIGGER
-- =============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS records_updated_at ON records;
CREATE TRIGGER records_updated_at
  BEFORE UPDATE ON records
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =============================================================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE records ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit ENABLE ROW LEVEL SECURITY;
ALTER TABLE news ENABLE ROW LEVEL SECURITY;
ALTER TABLE analyze_logs ENABLE ROW LEVEL SECURITY;

-- Records: users only see their own data
DROP POLICY IF EXISTS records_user_isolation_insert ON records;
CREATE POLICY records_user_isolation_insert ON records FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS records_user_isolation_select ON records;
CREATE POLICY records_user_isolation_select ON records FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS records_user_isolation_update ON records;
CREATE POLICY records_user_isolation_update ON records FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS records_user_isolation_delete ON records;
CREATE POLICY records_user_isolation_delete ON records FOR DELETE USING (user_id = auth.uid());

-- Audit: users see their own rows, null user_id allowed for system actions
DROP POLICY IF EXISTS audit_user_isolation_insert ON audit;
CREATE POLICY audit_user_isolation_insert ON audit FOR INSERT WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS audit_user_isolation_select ON audit;
CREATE POLICY audit_user_isolation_select ON audit FOR SELECT USING (user_id = auth.uid() OR user_id IS NULL);

-- News: any authenticated user can read, service_role manages
DROP POLICY IF EXISTS news_select ON news;
CREATE POLICY news_select ON news FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS news_service_write ON news;
CREATE POLICY news_service_write ON news FOR INSERT TO service_role WITH CHECK (true);

DROP POLICY IF EXISTS news_service_update ON news;
CREATE POLICY news_service_update ON news FOR UPDATE TO service_role USING (true);

DROP POLICY IF EXISTS news_service_delete ON news;
CREATE POLICY news_service_delete ON news FOR DELETE TO service_role USING (true);

-- Analyze logs: service_role only
DROP POLICY IF EXISTS analyze_logs_service_write ON analyze_logs;
CREATE POLICY analyze_logs_service_write ON analyze_logs FOR INSERT TO service_role WITH CHECK (true);

-- =============================================================================
-- INDEXES (for query performance)
-- =============================================================================

-- Records indexes
DROP INDEX IF EXISTS idx_records_user_id_created_at;
CREATE INDEX idx_records_user_id_created_at ON records(user_id, created_at DESC);

DROP INDEX IF EXISTS idx_records_user_id_updated_at;
CREATE INDEX idx_records_user_id_updated_at ON records(user_id, updated_at DESC);

-- Audit index
DROP INDEX IF EXISTS idx_audit_user_id_timestamp;
CREATE INDEX idx_audit_user_id_timestamp ON audit(user_id, timestamp DESC);

-- News indexes
DROP INDEX IF EXISTS news_fetched_at_idx;
CREATE INDEX news_fetched_at_idx ON news (fetched_at DESC);

DROP INDEX IF EXISTS news_category_idx;
CREATE INDEX news_category_idx ON news (category);

DROP INDEX IF EXISTS news_published_at_idx;
CREATE INDEX news_published_at_idx ON news (published_at DESC);

-- Analyze logs index
DROP INDEX IF EXISTS idx_analyze_logs_created_at;
CREATE INDEX idx_analyze_logs_created_at ON analyze_logs (created_at DESC);