-- Add session_timeout_hours to tenants table
ALTER TABLE tenants ADD COLUMN session_timeout_hours INTEGER NOT NULL DEFAULT 24;
