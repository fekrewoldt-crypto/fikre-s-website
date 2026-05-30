-- Migration: 002_schema
-- Description: Create complete MediScan schema with tables, RLS policies, indexes, and triggers
-- Created: 2026-05-30
-- Run this in the Supabase SQL editor.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Records table (encrypted health data)
CREATE TABLE IF NOT EXISTS records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_blob TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Audit log table
CREATE TABLE IF NOT EXISTS audit (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  record_id UUID REFERENCES records(id) ON DELETE SET NULL,
  timestamp TIMESTAMPTZ DEFAULT now()
);

-- Function to auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at on records
DROP TRIGGER IF EXISTS records_updated_at ON records;
CREATE TRIGGER records_updated_at
  BEFORE UPDATE ON records
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE records ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit ENABLE ROW LEVEL SECURITY;

-- RLS policies for records
-- Users can only see and manage their own records
DROP POLICY IF EXISTS records_user_isolation_insert ON records;
CREATE POLICY records_user_isolation_insert ON records
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS records_user_isolation_select ON records;
CREATE POLICY records_user_isolation_select ON records
  FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS records_user_isolation_update ON records;
CREATE POLICY records_user_isolation_update ON records
  FOR UPDATE
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS records_user_isolation_delete ON records;
CREATE POLICY records_user_isolation_delete ON records
  FOR DELETE
  USING (user_id = auth.uid());

-- RLS policies for audit
-- Users can only see their own audit rows
DROP POLICY IF EXISTS audit_user_isolation_insert ON audit;
CREATE POLICY audit_user_isolation_insert ON audit
  FOR INSERT
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS audit_user_isolation_select ON audit;
CREATE POLICY audit_user_isolation_select ON audit
  FOR SELECT
  USING (user_id = auth.uid() OR user_id IS NULL);

-- Drop existing indexes if they exist (for idempotency)
DROP INDEX IF EXISTS idx_records_user_id_created_at;
DROP INDEX IF EXISTS idx_records_user_id_updated_at;
DROP INDEX IF EXISTS idx_audit_user_id_timestamp;

-- Indexes for performance
CREATE INDEX idx_records_user_id_created_at ON records(user_id, created_at DESC);
CREATE INDEX idx_records_user_id_updated_at ON records(user_id, updated_at DESC);
CREATE INDEX idx_audit_user_id_timestamp ON audit(user_id, timestamp DESC);

-- =============================================================================
-- News table for cached health news items
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

-- Drop existing news indexes if they exist
DROP INDEX IF EXISTS news_fetched_at_idx;
DROP INDEX IF EXISTS news_category_idx;
DROP INDEX IF EXISTS news_published_at_idx;

-- Indexes for news
CREATE INDEX news_fetched_at_idx ON news (fetched_at DESC);
CREATE INDEX news_category_idx ON news (category);
CREATE INDEX news_published_at_idx ON news (published_at DESC);

-- Enable RLS
ALTER TABLE news ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read news (public health content)
DROP POLICY IF EXISTS news_select ON news;
CREATE POLICY news_select ON news
  FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS news_service_write ON news;
CREATE POLICY news_service_write ON news
  FOR INSERT TO service_role
  WITH CHECK (true);

DROP POLICY IF EXISTS news_service_update ON news;
CREATE POLICY news_service_update ON news
  FOR UPDATE TO service_role
  USING (true);

DROP POLICY IF EXISTS news_service_delete ON news;
CREATE POLICY news_service_delete ON news
  FOR DELETE TO service_role
  USING (true);