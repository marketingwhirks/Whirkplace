-- Emergency script to add missing Slack token columns to production database
-- Run this script in your production database to fix the login issue

-- Check if columns exist before adding them (safe to run multiple times)
DO $$ 
BEGIN
    -- Add slackAccessToken column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'organizations' 
        AND column_name = 'slack_access_token'
    ) THEN
        ALTER TABLE organizations 
        ADD COLUMN slack_access_token TEXT;
    END IF;

    -- Add slackRefreshToken column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'organizations' 
        AND column_name = 'slack_refresh_token'
    ) THEN
        ALTER TABLE organizations 
        ADD COLUMN slack_refresh_token TEXT;
    END IF;

    -- Add slackTokenExpiresAt column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'organizations' 
        AND column_name = 'slack_token_expires_at'
    ) THEN
        ALTER TABLE organizations 
        ADD COLUMN slack_token_expires_at TIMESTAMP;
    END IF;

    -- Add slackConnectionStatus column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'organizations' 
        AND column_name = 'slack_connection_status'
    ) THEN
        ALTER TABLE organizations 
        ADD COLUMN slack_connection_status TEXT DEFAULT 'not_connected';
    END IF;

    RAISE NOTICE 'Successfully added missing Slack token columns';
END $$;

-- Verify the columns were added
SELECT 
    column_name, 
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'organizations'
AND column_name IN ('slack_access_token', 'slack_refresh_token', 'slack_token_expires_at', 'slack_connection_status')
ORDER BY column_name;