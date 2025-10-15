-- ============================================
-- PRODUCTION DATABASE SCHEMA FIX
-- Fixes schema mismatches between production and development
-- Run this in the PRODUCTION database console
-- ============================================

-- Fix 1: Rename metric_date columns to bucket_date in metrics tables
-- This aligns production with the current codebase

-- pulse_metrics_daily table
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'pulse_metrics_daily' 
        AND column_name = 'metric_date'
    ) THEN
        ALTER TABLE pulse_metrics_daily 
        RENAME COLUMN metric_date TO bucket_date;
        RAISE NOTICE 'Renamed pulse_metrics_daily.metric_date to bucket_date';
    ELSE
        RAISE NOTICE 'pulse_metrics_daily.bucket_date already exists';
    END IF;
END $$;

-- shoutout_metrics_daily table  
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'shoutout_metrics_daily' 
        AND column_name = 'metric_date'
    ) THEN
        ALTER TABLE shoutout_metrics_daily 
        RENAME COLUMN metric_date TO bucket_date;
        RAISE NOTICE 'Renamed shoutout_metrics_daily.metric_date to bucket_date';
    ELSE
        RAISE NOTICE 'shoutout_metrics_daily.bucket_date already exists';
    END IF;
END $$;

-- Fix 2: Add missing columns to aggregation_watermarks if they don't exist
DO $$
BEGIN
    -- Add aggregation_type if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'aggregation_watermarks' 
        AND column_name = 'aggregation_type'
    ) THEN
        ALTER TABLE aggregation_watermarks 
        ADD COLUMN aggregation_type varchar(50) DEFAULT 'daily';
        
        -- Update existing rows to have a default type
        UPDATE aggregation_watermarks 
        SET aggregation_type = 'daily' 
        WHERE aggregation_type IS NULL;
        
        -- Now make it NOT NULL
        ALTER TABLE aggregation_watermarks 
        ALTER COLUMN aggregation_type SET NOT NULL;
        
        RAISE NOTICE 'Added aggregation_watermarks.aggregation_type column';
    END IF;

    -- Add last_processed_date if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'aggregation_watermarks' 
        AND column_name = 'last_processed_date'
    ) THEN
        ALTER TABLE aggregation_watermarks 
        ADD COLUMN last_processed_date date DEFAULT CURRENT_DATE - INTERVAL '7 days';
        
        -- Update existing rows to have a default date
        UPDATE aggregation_watermarks 
        SET last_processed_date = CURRENT_DATE - INTERVAL '7 days' 
        WHERE last_processed_date IS NULL;
        
        -- Now make it NOT NULL
        ALTER TABLE aggregation_watermarks 
        ALTER COLUMN last_processed_date SET NOT NULL;
        
        RAISE NOTICE 'Added aggregation_watermarks.last_processed_date column';
    END IF;
END $$;

-- Fix 3: Add missing columns to one_on_ones if needed
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'one_on_ones' 
        AND column_name = 'created_by'
    ) THEN
        -- First, add the column as nullable
        ALTER TABLE one_on_ones 
        ADD COLUMN created_by varchar(255);
        
        -- Set default value for existing rows (use the manager_id as creator)
        UPDATE one_on_ones 
        SET created_by = manager_id 
        WHERE created_by IS NULL;
        
        -- Now make it NOT NULL
        ALTER TABLE one_on_ones 
        ALTER COLUMN created_by SET NOT NULL;
        
        RAISE NOTICE 'Added one_on_ones.created_by column';
    END IF;
END $$;

-- Fix 4: Add missing columns to KRA tables
DO $$
BEGIN
    -- Fix kra_templates.criteria
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'kra_templates' 
        AND column_name = 'criteria'
    ) THEN
        ALTER TABLE kra_templates 
        ADD COLUMN criteria text DEFAULT '{}';
        
        UPDATE kra_templates 
        SET criteria = '{}' 
        WHERE criteria IS NULL;
        
        ALTER TABLE kra_templates 
        ALTER COLUMN criteria SET NOT NULL;
        
        RAISE NOTICE 'Added kra_templates.criteria column';
    END IF;

    -- Fix user_kras columns
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_kras' 
        AND column_name = 'criteria'
    ) THEN
        ALTER TABLE user_kras 
        ADD COLUMN criteria text DEFAULT '{}';
        
        UPDATE user_kras 
        SET criteria = '{}' 
        WHERE criteria IS NULL;
        
        ALTER TABLE user_kras 
        ALTER COLUMN criteria SET NOT NULL;
        
        RAISE NOTICE 'Added user_kras.criteria column';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_kras' 
        AND column_name = 'quarter'
    ) THEN
        ALTER TABLE user_kras 
        ADD COLUMN quarter integer DEFAULT EXTRACT(QUARTER FROM CURRENT_DATE);
        
        UPDATE user_kras 
        SET quarter = EXTRACT(QUARTER FROM created_at) 
        WHERE quarter IS NULL;
        
        ALTER TABLE user_kras 
        ALTER COLUMN quarter SET NOT NULL;
        
        RAISE NOTICE 'Added user_kras.quarter column';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_kras' 
        AND column_name = 'year'
    ) THEN
        ALTER TABLE user_kras 
        ADD COLUMN year integer DEFAULT EXTRACT(YEAR FROM CURRENT_DATE);
        
        UPDATE user_kras 
        SET year = EXTRACT(YEAR FROM created_at) 
        WHERE year IS NULL;
        
        ALTER TABLE user_kras 
        ALTER COLUMN year SET NOT NULL;
        
        RAISE NOTICE 'Added user_kras.year column';
    END IF;
END $$;

-- Verification: Show the final state of affected columns
SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable
FROM information_schema.columns 
WHERE table_name IN (
    'pulse_metrics_daily', 
    'shoutout_metrics_daily',
    'aggregation_watermarks',
    'one_on_ones',
    'kra_templates',
    'user_kras'
)
AND column_name IN (
    'bucket_date', 
    'metric_date',
    'aggregation_type',
    'last_processed_date',
    'created_by',
    'criteria',
    'quarter',
    'year'
)
ORDER BY table_name, column_name;

-- ============================================
-- END OF PRODUCTION SCHEMA FIX
-- ============================================