-- ============================================
-- CORRECTED PRODUCTION DATABASE FIX
-- Fixed column references for one_on_ones table
-- Run this in the PRODUCTION database console
-- ============================================

-- Fix 1: Handle shoutout_metrics_daily.metric_date
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
        RAISE NOTICE 'shoutout_metrics_daily already has bucket_date';
    END IF;
END $$;

-- Fix 2: Add missing columns to aggregation_watermarks
DO $$
BEGIN
    -- Add aggregation_type if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'aggregation_watermarks' 
        AND column_name = 'aggregation_type'
    ) THEN
        ALTER TABLE aggregation_watermarks 
        ADD COLUMN aggregation_type varchar(50) NOT NULL DEFAULT 'daily';
        RAISE NOTICE 'Added aggregation_watermarks.aggregation_type';
    END IF;
    
    -- Add last_processed_date if missing
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'aggregation_watermarks' 
        AND column_name = 'last_processed_date'
    ) THEN
        ALTER TABLE aggregation_watermarks 
        ADD COLUMN last_processed_date date NOT NULL DEFAULT (CURRENT_DATE - INTERVAL '7 days');
        RAISE NOTICE 'Added aggregation_watermarks.last_processed_date';
    END IF;
END $$;

-- Fix 3: Add created_by to one_on_ones (using correct column name)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'one_on_ones' 
        AND column_name = 'created_by'
    ) THEN
        ALTER TABLE one_on_ones 
        ADD COLUMN created_by varchar(255);
        
        -- Use participantOneId (the manager) as default creator
        UPDATE one_on_ones 
        SET created_by = participant_one_id 
        WHERE created_by IS NULL;
        
        ALTER TABLE one_on_ones 
        ALTER COLUMN created_by SET NOT NULL;
        RAISE NOTICE 'Added one_on_ones.created_by';
    ELSE
        -- Fix any null values
        UPDATE one_on_ones 
        SET created_by = participant_one_id 
        WHERE created_by IS NULL;
        RAISE NOTICE 'Fixed one_on_ones.created_by null values';
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
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_kras' 
        AND column_name = 'quarter'
    ) THEN
        ALTER TABLE user_kras 
        ADD COLUMN quarter integer NOT NULL DEFAULT EXTRACT(QUARTER FROM CURRENT_DATE)::integer;
        RAISE NOTICE 'Added user_kras.quarter';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'user_kras' 
        AND column_name = 'year'
    ) THEN
        ALTER TABLE user_kras 
        ADD COLUMN year integer NOT NULL DEFAULT EXTRACT(YEAR FROM CURRENT_DATE)::integer;
        RAISE NOTICE 'Added user_kras.year';
    END IF;
END $$;

-- Fix 5: Add access_token columns to organization_auth_providers (CRITICAL)
DO $$
BEGIN
    -- Check if the table exists first
    IF EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_name = 'organization_auth_providers'
    ) THEN
        -- Add access_token
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'organization_auth_providers' 
            AND column_name = 'access_token'
        ) THEN
            ALTER TABLE organization_auth_providers 
            ADD COLUMN access_token text;
            RAISE NOTICE 'Added organization_auth_providers.access_token';
        END IF;
        
        -- Add refresh_token
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'organization_auth_providers' 
            AND column_name = 'refresh_token'
        ) THEN
            ALTER TABLE organization_auth_providers 
            ADD COLUMN refresh_token text;
            RAISE NOTICE 'Added organization_auth_providers.refresh_token';
        END IF;
        
        -- Add token_expires_at
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns 
            WHERE table_name = 'organization_auth_providers' 
            AND column_name = 'token_expires_at'
        ) THEN
            ALTER TABLE organization_auth_providers 
            ADD COLUMN token_expires_at timestamp;
            RAISE NOTICE 'Added organization_auth_providers.token_expires_at';
        END IF;
    END IF;
END $$;

-- Verification: Show what columns exist now
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
    'token_expires_at',
    'participant_one_id',
    'participant_two_id'
)
ORDER BY table_name, column_name;

-- ============================================
-- END OF CORRECTED FIX
-- ============================================