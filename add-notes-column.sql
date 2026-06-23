-- Add notes column to games table for storing lineup data
ALTER TABLE games ADD COLUMN IF NOT EXISTS notes text;
