-- Migration: 001_indexes
-- Description: Add performance indexes to records and audit tables
-- Created: 2026-05-30

-- Index for timeline queries (fetches records by user sorted by creation date)
CREATE INDEX idx_records_user_id_created_at
ON records(user_id, created_at DESC);

-- Index for recent records queries (fetches records by user sorted by update date)
CREATE INDEX idx_records_user_id_updated_at
ON records(user_id, updated_at DESC);

-- Index for audit log queries (fetches audit entries by user sorted by timestamp)
CREATE INDEX idx_audit_user_id_timestamp
ON audit(user_id, timestamp DESC);