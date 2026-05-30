-- Migration: 002_schema
-- Description: Create complete MediScan schema with tables, RLS policies, indexes, and triggers
-- Created: 2026-05-30
-- Run this in the Supabase SQL editor.

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Records table (encrypted health data)
CREATE TABLE records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  encrypted_blob TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Audit log table
CREATE TABLE audit (
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
CREATE TRIGGER records_updated_at
  BEFORE UPDATE ON records
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable Row Level Security (RLS)
ALTER TABLE records ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit ENABLE ROW LEVEL SECURITY;

-- RLS policies for records
-- Users can only see and manage their own records
CREATE POLICY records_user_isolation_insert ON records
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY records_user_isolation_select ON records
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY records_user_isolation_update ON records
  FOR UPDATE
  USING (user_id = auth.uid());

CREATE POLICY records_user_isolation_delete ON records
  FOR DELETE
  USING (user_id = auth.uid());

-- RLS policies for audit
-- Users can only see their own audit rows
CREATE POLICY audit_user_isolation_insert ON audit
  FOR INSERT
  WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

CREATE POLICY audit_user_isolation_select ON audit
  FOR SELECT
  USING (user_id = auth.uid() OR user_id IS NULL);

-- Indexes for performance
-- Index for timeline queries (fetches records by user sorted by creation date)
CREATE INDEX IF NOT EXISTS idx_records_user_id_created_at
ON records(user_id, created_at DESC);

-- Index for recent records queries (fetches records by user sorted by update date)
CREATE INDEX IF NOT EXISTS idx_records_user_id_updated_at
ON records(user_id, updated_at DESC);

-- Index for audit log queries (fetches audit entries by user sorted by timestamp)
CREATE INDEX IF NOT EXISTS idx_audit_user_id_timestamp
ON audit(user_id, timestamp DESC);

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
  -- Frontend news card fields
  icon TEXT,
  tag TEXT,
  tagName TEXT,
  date TEXT,
  body TEXT
);

-- Index for fetching fresh news (sorted by fetch time)
CREATE INDEX IF NOT EXISTS news_fetched_at_idx ON news (fetched_at DESC);

-- Index for category filtering
CREATE INDEX IF NOT EXISTS news_category_idx ON news (category);

-- Index for sorting by published_at
CREATE INDEX IF NOT EXISTS news_published_at_idx ON news (published_at DESC);

-- Enable RLS
ALTER TABLE news ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read news (public health content)
CREATE POLICY news_select ON news
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Service role manages news (bypasses RLS)
CREATE POLICY news_service_write ON news
  FOR INSERT WITH CHECK (true);

CREATE POLICY news_service_update ON news
  FOR UPDATE USING (true);

CREATE POLICY news_service_delete ON news
  FOR DELETE USING (true);