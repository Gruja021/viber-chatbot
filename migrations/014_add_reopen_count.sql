-- Add reopen_count to track how many times a conversation was reopened after auto-resolve
ALTER TABLE conversations ADD COLUMN reopen_count INTEGER NOT NULL DEFAULT 0;
