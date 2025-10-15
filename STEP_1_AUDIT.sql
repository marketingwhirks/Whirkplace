-- ============================================================================
-- STEP 1: PRODUCTION DATABASE AUDIT SCRIPT
-- Purpose: Analyze the current state of the production database
-- Run this first to understand what exists and what needs migration
-- ============================================================================

-- Basic connection test
SELECT version() AS postgresql_version;
SELECT current_database() AS database_name;
SELECT current_user AS connected_user;
SELECT NOW() AS audit_timestamp;

-- ============================================================================
-- 1. LIST ALL EXISTING TABLES IN THE DATABASE
-- ============================================================================
SELECT '=== ALL TABLES IN DATABASE ===' AS section;
SELECT 
    table_name,
    table_type
FROM information_schema.tables 
WHERE table_schema = 'public' 
ORDER BY table_name;

-- Count total tables
SELECT COUNT(*) AS total_tables_count
FROM information_schema.tables 
WHERE table_schema = 'public';

-- ============================================================================
-- 2. CHECK FOR EXISTENCE OF SPECIFIC TABLES (CRITICAL AND NEW)
-- ============================================================================
SELECT '=== TABLE EXISTENCE CHECK ===' AS section;
WITH expected_tables AS (
    SELECT unnest(ARRAY[
        -- Core tables
        'organizations', 'users', 'teams', 'checkins',
        -- Question and KRA tables
        'question_categories', 'kra_categories', 'question_bank', 'questions', 'team_question_settings',
        'kra_templates', 'user_kras', 'kra_ratings', 'kra_history',
        -- Feature tables
        'wins', 'comments', 'shoutouts', 'vacations', 'notifications', 'tours',
        -- Goal and meeting tables
        'team_goals', 'one_on_ones', 'action_items',
        -- Analytics tables
        'pulse_metrics_daily', 'shoutout_metrics_daily', 'compliance_metrics_daily', 'aggregation_watermarks',
        -- Billing and partner tables
        'partner_firms', 'billing_events', 'business_plans',
        -- Auth and session tables
        'organization_auth_providers', 'user_identities', 'password_reset_tokens',
        -- Dashboard tables
        'dashboard_configs', 'dashboard_widget_templates', 'dashboard_widget_configs',
        -- Support and onboarding tables
        'bug_reports', 'organization_onboarding', 'user_invitations', 'partner_applications'
    ]) AS table_name
)
SELECT 
    et.table_name,
    CASE 
        WHEN t.table_name IS NOT NULL THEN '✓ EXISTS'
        ELSE '✗ MISSING'
    END AS status
FROM expected_tables et
LEFT JOIN information_schema.tables t 
    ON t.table_name = et.table_name 
    AND t.table_schema = 'public'
ORDER BY 
    CASE WHEN t.table_name IS NULL THEN 0 ELSE 1 END,
    et.table_name;

-- ============================================================================
-- 3. ANALYZE ORGANIZATIONS TABLE COLUMNS
-- ============================================================================
SELECT '=== ORGANIZATIONS TABLE COLUMNS ===' AS section;
SELECT 
    column_name,
    data_type,
    character_maximum_length,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'organizations' 
    AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check for missing critical columns in organizations
SELECT '=== MISSING ORGANIZATIONS COLUMNS ===' AS section;
WITH expected_columns AS (
    SELECT unnest(ARRAY[
        'updated_at', 'billing_interval', 'plan_type', 'billing_price_per_user',
        'industry', 'custom_values', 'discount_code', 'discount_percentage',
        'partner_firm_id', 
        -- Slack fields
        'slack_client_id', 'slack_client_secret', 'slack_workspace_id', 
        'slack_channel_id', 'slack_wins_channel_id', 'slack_access_token',
        'slack_refresh_token', 'slack_token_expires_at', 'slack_signing_secret',
        'enable_slack_integration', 'slack_connection_status', 'slack_last_connected',
        -- Microsoft fields
        'microsoft_client_id', 'microsoft_client_secret', 'microsoft_tenant_id',
        'microsoft_teams_webhook_url', 'enable_microsoft_auth', 'enable_teams_integration',
        'microsoft_connection_status', 'microsoft_last_connected',
        -- Theme fields
        'theme_config', 'enable_custom_theme',
        -- Onboarding fields
        'onboarding_status', 'onboarding_current_step', 'onboarding_completed_at',
        'onboarding_workspace_completed', 'onboarding_billing_completed',
        'onboarding_roles_completed', 'onboarding_values_completed',
        'onboarding_members_completed', 'onboarding_settings_completed',
        -- Billing fields
        'billing_user_count', 'billing_period_start', 'billing_period_end',
        'pending_billing_changes',
        -- Schedule fields
        'checkin_due_day', 'checkin_due_time', 'checkin_reminder_day',
        'checkin_reminder_time'
    ]) AS column_name
)
SELECT 
    ec.column_name,
    CASE 
        WHEN c.column_name IS NOT NULL THEN '✓ EXISTS'
        ELSE '✗ MISSING'
    END AS status
FROM expected_columns ec
LEFT JOIN information_schema.columns c
    ON c.column_name = ec.column_name
    AND c.table_name = 'organizations'
    AND c.table_schema = 'public'
WHERE c.column_name IS NULL
ORDER BY ec.column_name;

-- ============================================================================
-- 4. ANALYZE USERS TABLE COLUMNS  
-- ============================================================================
SELECT '=== USERS TABLE COLUMNS ===' AS section;
SELECT 
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'users' 
    AND table_schema = 'public'
ORDER BY ordinal_position;

-- Check for missing user columns
SELECT '=== MISSING USER COLUMNS ===' AS section;
WITH expected_columns AS (
    SELECT unnest(ARRAY[
        'reviewer_id', 'is_account_owner', 
        -- Slack fields
        'slack_user_id', 'slack_username', 'slack_display_name', 
        'slack_email', 'slack_avatar', 'slack_workspace_id',
        -- Microsoft fields
        'microsoft_user_id', 'microsoft_user_principal_name', 
        'microsoft_display_name', 'microsoft_email', 'microsoft_avatar',
        'microsoft_tenant_id', 'microsoft_access_token', 'microsoft_refresh_token',
        -- Other fields
        'auth_provider', 'personal_review_reminder_day', 
        'personal_review_reminder_time', 'can_view_all_teams'
    ]) AS column_name
)
SELECT 
    ec.column_name,
    CASE 
        WHEN c.column_name IS NOT NULL THEN '✓ EXISTS'
        ELSE '✗ MISSING'
    END AS status
FROM expected_columns ec
LEFT JOIN information_schema.columns c
    ON c.column_name = ec.column_name
    AND c.table_name = 'users'
    AND c.table_schema = 'public'
WHERE c.column_name IS NULL
ORDER BY ec.column_name;

-- ============================================================================
-- 5. COUNT RECORDS IN EXISTING TABLES (DATA VOLUME ASSESSMENT)
-- ============================================================================
SELECT '=== RECORD COUNTS IN KEY TABLES ===' AS section;

-- Dynamic record counting for all tables
DO $$
DECLARE
    r RECORD;
    cnt INTEGER;
BEGIN
    FOR r IN 
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
        ORDER BY table_name
    LOOP
        EXECUTE 'SELECT COUNT(*) FROM ' || quote_ident(r.table_name) INTO cnt;
        RAISE NOTICE '% : % records', rpad(r.table_name, 30), cnt;
    END LOOP;
END $$;

-- ============================================================================
-- 6. CHECK DATABASE CONSTRAINTS AND INDEXES
-- ============================================================================
SELECT '=== UNIQUE CONSTRAINTS ===' AS section;
SELECT 
    tc.table_name,
    tc.constraint_name,
    string_agg(kcu.column_name, ', ') AS columns
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
WHERE tc.constraint_type = 'UNIQUE'
    AND tc.table_schema = 'public'
GROUP BY tc.table_name, tc.constraint_name
ORDER BY tc.table_name, tc.constraint_name;

SELECT '=== FOREIGN KEY CONSTRAINTS ===' AS section;
SELECT 
    tc.table_name,
    tc.constraint_name,
    kcu.column_name,
    ccu.table_name AS foreign_table,
    ccu.column_name AS foreign_column
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu 
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage ccu 
    ON ccu.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
ORDER BY tc.table_name, tc.constraint_name;

-- ============================================================================
-- 7. CHECK FOR POTENTIAL ISSUES
-- ============================================================================
SELECT '=== POTENTIAL DATA ISSUES ===' AS section;

-- Check for NULL values in columns that should become NOT NULL
SELECT 'Checking critical columns for NULL values...' AS check_type;

-- Check organizations table
SELECT 
    'organizations' AS table_name,
    'plan' AS column_name,
    COUNT(*) AS null_count
FROM organizations 
WHERE plan IS NULL
HAVING COUNT(*) > 0;

-- Check users table
SELECT 
    'users' AS table_name,
    'organization_id' AS column_name,
    COUNT(*) AS null_count
FROM users 
WHERE organization_id IS NULL
HAVING COUNT(*) > 0;

-- ============================================================================
-- 8. SUMMARY REPORT
-- ============================================================================
SELECT '=== AUDIT SUMMARY ===' AS section;
WITH table_status AS (
    SELECT 
        COUNT(*) FILTER (WHERE t.table_name IS NOT NULL) AS existing_tables,
        COUNT(*) FILTER (WHERE t.table_name IS NULL) AS missing_tables,
        COUNT(*) AS total_expected
    FROM (
        SELECT unnest(ARRAY[
            'organizations', 'users', 'teams', 'checkins',
            'question_categories', 'kra_categories', 'kra_templates', 'user_kras',
            'one_on_ones', 'action_items', 'kra_ratings', 'kra_history',
            'partner_firms', 'team_goals'
        ]) AS table_name
    ) expected
    LEFT JOIN information_schema.tables t 
        ON t.table_name = expected.table_name 
        AND t.table_schema = 'public'
)
SELECT 
    existing_tables,
    missing_tables,
    total_expected,
    ROUND(existing_tables::numeric / total_expected * 100, 2) AS completion_percentage
FROM table_status;

SELECT '=== END OF AUDIT - Review results above before proceeding to STEP 2 ===' AS status;