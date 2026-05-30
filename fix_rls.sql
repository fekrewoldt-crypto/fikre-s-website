-- Fix RLS policies to allow service_role to bypass
-- Run this in Supabase SQL Editor

-- Records: service_role can do everything, users only see their own
DROP POLICY IF EXISTS records_service_all ON records;
CREATE POLICY records_service_all ON records TO service_role USING (true);

-- Audit: service_role can do everything
DROP POLICY IF EXISTS audit_service_all ON audit;
CREATE POLICY audit_service_all ON audit TO service_role USING (true);

-- News: keep as is (authenticated read, service_role write)
-- Analyze logs: service_role only
DROP POLICY IF EXISTS analyze_logs_service_all ON analyze_logs;
CREATE POLICY analyze_logs_service_all ON analyze_logs TO service_role USING (true);