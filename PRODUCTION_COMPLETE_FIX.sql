-- ============================================
-- COMPLETE PRODUCTION DATABASE FIX
-- Addresses all remaining schema issues
-- Run this in the PRODUCTION database console
-- ============================================

-- Fix 1: Handle shoutout_metrics_daily.metric_date
DO $$
BEGIN
    -- Check if metric_date exists and rename to bucket_date
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'shoutout_metrics_daily' 
        AND column_name = 'metric_date'
    ) THEN
        ALTER TABLE shoutout_metrics_daily 
        RENAME COLUMN metric_date TO bucket_date;
        RAISE NOTICE 'Renamed shoutout_metrics_daily.metric_date to bucket_date';
    ELSIF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'shoutout_metrics_daily' 
        AND column_name = 'bucket_date'
    ) THEN
        ALTER TABLE shoutout_metrics_daily 
        ADD COLUMN bucket_date date NOT NULL DEFAULT CURRENT_DATE;
        RAISE NOTICE 'Added shoutout_metrics_daily.bucket_date';
    ELSE
        RAISE NOTICE 'shoutout_metrics_daily.bucket_date already exists';
    END IF;
END $$;

-- Fix 2: Add missing columns to aggregation_watermarks
DO $$
BEGIN
    -- Check and add aggregation_type
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'aggregation_watermarks' 
        AND column_name = 'aggregation_type'
    ) THEN
        ALTER TABLE aggregation_watermarks 
        ADD COLUMN aggregation_type varchar(50) NOT NULL DEFAULT 'daily';
        RAISE NOTICE 'Added aggregation_watermarks.aggregation_type';
    ELSE
        -- Make sure it's NOT NULL with default
        ALTER TABLE aggregation_watermarks 
        ALTER COLUMN aggregation_type SET DEFAULT 'daily';
        UPDATE aggregation_watermarks 
        SET aggregation_type = 'daily' 
        WHERE aggregation_type IS NULL;
        ALTER TABLE aggregation_watermarks 
        ALTER COLUMN aggregation_type SET NOT NULL;
        RAISE NOTICE 'Fixed aggregation_watermarks.aggregation_type constraints';
    END IF;
    
    -- Check and add last_processed_date
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'aggregation_watermarks' 
        AND column_name = 'last_processed_date'
    ) THEN
        ALTER TABLE aggregation_watermarks 
        ADD COLUMN last_processed_date date NOT NULL DEFAULT CURRENT_DATE - INTERVAL '7 days';
        RAISE NOTICE 'Added aggregation_watermarks.last_processed_date';
    ELSE
        -- Make sure it's NOT NULL with default
        ALTER TABLE aggregation_watermarks 
        ALTER COLUMN last_processed_date SET DEFAULT CURRENT_DATE - INTERVAL '7 days';
        UPDATE aggregation_watermarks 
        SET last_processed_date = CURRENT_DATE - INTERVAL '7 days' 
        WHERE last_processed_date IS NULL;
        ALTER TABLE aggregation_watermarks 
        ALTER COLUMN last_processed_date SET NOT NULL;
        RAISE NOTICE 'Fixed aggregation_watermarks.last_processed_date constraints';
    END IF;
END $$;

-- Fix 3: Add missing columns to one_on_ones
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'one_on_ones' 
        AND column_name = 'created_by'
    ) THEN
        ALTER TABLE one_on_ones 
        ADD COLUMN created_by varchar(255);
        
        -- Use manager_id as default creator for existing rows
        UPDATE one_on_ones 
        SET created_by = manager_id 
        WHERE created_by IS NULL;
        
        ALTER TABLE one_on_ones 
        ALTER COLUMN created_by SET NOT NULL;
        RAISE NOTICE 'Added one_on_ones.created_by';
    ELSE
        -- Fix null values if any
        UPDATE one_on_ones 
        SET created_by = manager_id 
        WHERE created_by IS NULL;
        ALTER TABLE one_on_ones 
        ALTER COLUMN created_by SET NOT NULL;
        RAISE NOTICE 'Fixed one_on_ones.created_by constraints';
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
        ADD COLUMN criteria text NOT NULL DEFAULT '{}';
        RAISE NOTICE 'Added kra_templates.criteria';
    ELSE
        UPDATE kra_templates 
        SET criteria = '{}' 
        WHERE criteria IS NULL;
        ALTER TABLE kra_templates 
        ALTER COLUMN criteria SET NOT NULL;
        ALTER TABLE kra_templates 
        ALTER COLUMN criteria SET DEFAULT '{}';
        RAISE NOTICE 'Fixed kra_templates.criteria constraints';
    END IF;
    
    -- Fix user_kras columns
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_kras' 
        AND column_name = 'criteria'
    ) THEN
        ALTER TABLE user_kras 
        ADD COLUMN criteria text NOT NULL DEFAULT '{}';
        RAISE NOTICE 'Added user_kras.criteria';
    ELSE
        UPDATE user_kras 
        SET criteria = '{}' 
        WHERE criteria IS NULL;
        ALTER TABLE user_kras 
        ALTER COLUMN criteria SET NOT NULL;
        ALTER TABLE user_kras 
        ALTER COLUMN criteria SET DEFAULT '{}';
        RAISE NOTICE 'Fixed user_kras.criteria constraints';
    END IF;
    
    -- Fix user_kras.quarter
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_kras' 
        AND column_name = 'quarter'
    ) THEN
        ALTER TABLE user_kras 
        ADD COLUMN quarter integer NOT NULL DEFAULT EXTRACT(QUARTER FROM CURRENT_DATE);
        RAISE NOTICE 'Added user_kras.quarter';
    ELSE
        UPDATE user_kras 
        SET quarter = EXTRACT(QUARTER FROM COALESCE(created_at, CURRENT_DATE))
        WHERE quarter IS NULL;
        ALTER TABLE user_kras 
        ALTER COLUMN quarter SET NOT NULL;
        ALTER TABLE user_kras 
        ALTER COLUMN quarter SET DEFAULT EXTRACT(QUARTER FROM CURRENT_DATE);
        RAISE NOTICE 'Fixed user_kras.quarter constraints';
    END IF;
    
    -- Fix user_kras.year
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_kras' 
        AND column_name = 'year'
    ) THEN
        ALTER TABLE user_kras 
        ADD COLUMN year integer NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE);
        RAISE NOTICE 'Added user_kras.year';
    ELSE
        UPDATE user_kras 
        SET year = EXTRACT(YEAR FROM COALESCE(created_at, CURRENT_DATE))
        WHERE year IS NULL;
        ALTER TABLE user_kras 
        ALTER COLUMN year SET NOT NULL;
        ALTER TABLE user_kras 
        ALTER COLUMN year SET DEFAULT EXTRACT(YEAR FROM CURRENT_DATE);
        RAISE NOTICE 'Fixed user_kras.year constraints';
    END IF;
END $$;

-- Fix 5: Add access_token to organization_auth_providers (NEW CRITICAL FIX)
DO $$
BEGIN
    -- Check if organization_auth_providers table exists
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'organization_auth_providers'
    ) THEN
        -- Add access_token column if missing
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'organization_auth_providers' 
            AND column_name = 'access_token'
        ) THEN
            ALTER TABLE organization_auth_providers 
            ADD COLUMN access_token text;
            RAISE NOTICE 'Added organization_auth_providers.access_token';
        ELSE
            RAISE NOTICE 'organization_auth_providers.access_token already exists';
        END IF;
        
        -- Add refresh_token column if missing
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'organization_auth_providers' 
            AND column_name = 'refresh_token'
        ) THEN
            ALTER TABLE organization_auth_providers 
            ADD COLUMN refresh_token text;
            RAISE NOTICE 'Added organization_auth_providers.refresh_token';
        ELSE
            RAISE NOTICE 'organization_auth_providers.refresh_token already exists';
        END IF;
        
        -- Add token_expires_at column if missing
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'organization_auth_providers' 
            AND column_name = 'token_expires_at'
        ) THEN
            ALTER TABLE organization_auth_providers 
            ADD COLUMN token_expires_at timestamp;
            RAISE NOTICE 'Added organization_auth_providers.token_expires_at';
        ELSE
            RAISE NOTICE 'organization_auth_providers.token_expires_at already exists';
        END IF;
    ELSE
        RAISE NOTICE 'Table organization_auth_providers does not exist';
    END IF;
END $$;

-- Fix 6: Clean up any data issues
DO $$
BEGIN
    -- Clear any watermarks that might be stuck
    DELETE FROM aggregation_watermarks 
    WHERE last_processed_date > CURRENT_DATE;
    
    RAISE NOTICE 'Cleaned up future-dated watermarks';
END $$;

-- Final verification: Show the state of all fixed columns
SELECT 
    'VERIFICATION RESULTS:' as message;

SELECT 
    table_name,
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns 
WHERE table_name IN (
    'pulse_metrics_daily', 
    'shoutout_metrics_daily',
    'aggregation_watermarks',
    'one_on_ones',
    'kra_templates',
    'user_kras',
    'organization_auth_providers'
)
AND column_name IN (
    'bucket_date', 
    'metric_date',
    'aggregation_type',
    'last_processed_date',
    'created_by',
    'criteria',
    'quarter',
    'year',
    'access_token',
    'refresh_token',
    'token_expires_at'
)
ORDER BY table_name, column_name;

-- ============================================
-- END OF COMPLETE PRODUCTION FIX
-- ============================================