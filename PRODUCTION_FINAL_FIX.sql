-- ============================================
-- PRODUCTION FINAL FIX - Remove old columns
-- This removes the old metric_date columns that are causing conflicts
-- Run this in the PRODUCTION database console
-- ============================================

-- Fix 1: Drop the old metric_date column from pulse_metrics_daily
DO $$
BEGIN
    -- Check if BOTH columns exist (bucket_date AND metric_date)
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'pulse_metrics_daily' 
        AND column_name = 'metric_date'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'pulse_metrics_daily' 
        AND column_name = 'bucket_date'
    ) THEN
        -- Both exist, drop the old one
        ALTER TABLE pulse_metrics_daily DROP COLUMN metric_date;
        RAISE NOTICE 'Dropped old pulse_metrics_daily.metric_date column';
    ELSIF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'pulse_metrics_daily' 
        AND column_name = 'metric_date'
    ) THEN
        -- Only metric_date exists, rename it
        ALTER TABLE pulse_metrics_daily RENAME COLUMN metric_date TO bucket_date;
        RAISE NOTICE 'Renamed pulse_metrics_daily.metric_date to bucket_date';
    ELSE
        RAISE NOTICE 'pulse_metrics_daily.bucket_date already correct';
    END IF;
END $$;

-- Fix 2: Drop the old metric_date column from shoutout_metrics_daily
DO $$
BEGIN
    -- Check if BOTH columns exist
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'shoutout_metrics_daily' 
        AND column_name = 'metric_date'
    ) AND EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'shoutout_metrics_daily' 
        AND column_name = 'bucket_date'
    ) THEN
        -- Both exist, drop the old one
        ALTER TABLE shoutout_metrics_daily DROP COLUMN metric_date;
        RAISE NOTICE 'Dropped old shoutout_metrics_daily.metric_date column';
    ELSIF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'shoutout_metrics_daily' 
        AND column_name = 'metric_date'
    ) THEN
        -- Only metric_date exists, rename it
        ALTER TABLE shoutout_metrics_daily RENAME COLUMN metric_date TO bucket_date;
        RAISE NOTICE 'Renamed shoutout_metrics_daily.metric_date to bucket_date';
    ELSE
        RAISE NOTICE 'shoutout_metrics_daily.bucket_date already correct';
    END IF;
END $$;

-- Verification: Show final columns in metrics tables
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name IN ('pulse_metrics_daily', 'shoutout_metrics_daily')
AND column_name IN ('bucket_date', 'metric_date')
ORDER BY table_name, column_name;

-- Should only show bucket_date columns, no metric_date columns

-- ============================================
-- END OF FINAL FIX
-- ============================================