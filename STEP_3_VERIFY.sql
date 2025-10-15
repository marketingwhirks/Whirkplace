-- ============================================================================
-- STEP 3: DATABASE MIGRATION VERIFICATION SCRIPT
-- Purpose: Verify that all migrations were successfully applied
-- Run this after STEP_2_MIGRATE.sql to confirm the schema is correct
-- ============================================================================

-- ============================================================================
-- SECTION 1: VERIFY ALL REQUIRED TABLES EXIST
-- ============================================================================
SELECT '=== VERIFYING TABLE EXISTENCE ===' AS verification_step;

WITH required_tables AS (
    SELECT unnest(ARRAY[
        -- Core tables
        'organizations', 'users', 'teams', 'checkins',
        -- Question and KRA tables
        'question_categories', 'kra_categories', 'question_bank', 
        'questions', 'team_question_settings',
        'kra_templates', 'user_kras', 'kra_ratings', 'kra_history',
        -- Feature tables
        'wins', 'comments', 'shoutouts', 'vacations', 
        'notifications', 'tours',
        -- Goal and meeting tables
        'team_goals', 'one_on_ones', 'action_items',
        -- Analytics tables
        'pulse_metrics_daily', 'shoutout_metrics_daily', 
        'compliance_metrics_daily', 'aggregation_watermarks',
        -- Billing and partner tables
        'partner_firms', 'billing_events', 'business_plans',
        -- Auth and session tables
        'organization_auth_providers', 'user_identities', 
        'password_reset_tokens',
        -- Dashboard tables
        'dashboard_configs', 'dashboard_widget_templates', 
        'dashboard_widget_configs',
        -- Support and onboarding tables
        'bug_reports', 'organization_onboarding', 
        'user_invitations', 'partner_applications'
    ]) AS table_name
),
verification_results AS (
    SELECT 
        rt.table_name,
        CASE 
            WHEN t.table_name IS NOT NULL THEN '✓ EXISTS'
            ELSE '✗ MISSING'
        END AS status,
        CASE WHEN t.table_name IS NOT NULL THEN 1 ELSE 0 END AS exists_flag
    FROM required_tables rt
    LEFT JOIN information_schema.tables t 
        ON t.table_name = rt.table_name 
        AND t.table_schema = 'public'
)
SELECT 
    table_name,
    status
FROM verification_results
WHERE status = '✗ MISSING'
UNION ALL
SELECT 
    'SUMMARY' AS table_name,
    COUNT(*) || ' of ' || 
    (SELECT COUNT(*) FROM required_tables) || 
    ' tables exist (' ||
    ROUND(COUNT(*)::numeric / (SELECT COUNT(*) FROM required_tables) * 100, 1) || 
    '% complete)' AS status
FROM verification_results
WHERE exists_flag = 1;

-- ============================================================================
-- SECTION 2: VERIFY ORGANIZATIONS TABLE COLUMNS
-- ============================================================================
SELECT '=== VERIFYING ORGANIZATIONS TABLE COLUMNS ===' AS verification_step;

WITH required_columns AS (
    SELECT unnest(ARRAY[
        -- Basic columns
        'id', 'name', 'slug', 'plan', 'is_active', 'created_at',
        -- New columns from migration
        'industry', 'custom_values', 'discount_code', 'discount_percentage',
        'partner_firm_id', 'updated_at', 'billing_interval', 'plan_type',
        'billing_price_per_user',
        -- Slack integration
        'slack_client_id', 'slack_client_secret', 'slack_workspace_id',
        'slack_channel_id', 'slack_wins_channel_id', 'slack_bot_token',
        'slack_access_token', 'slack_refresh_token', 'slack_token_expires_at',
        'slack_signing_secret', 'enable_slack_integration', 
        'slack_connection_status', 'slack_last_connected',
        -- Microsoft integration  
        'microsoft_client_id', 'microsoft_client_secret', 'microsoft_tenant_id',
        'microsoft_teams_webhook_url', 'enable_microsoft_auth',
        'enable_teams_integration', 'microsoft_connection_status',
        'microsoft_last_connected',
        -- Theme
        'theme_config', 'enable_custom_theme',
        -- Onboarding
        'onboarding_status', 'onboarding_current_step', 'onboarding_completed_at',
        'onboarding_workspace_completed', 'onboarding_billing_completed',
        'onboarding_roles_completed', 'onboarding_values_completed',
        'onboarding_members_completed', 'onboarding_settings_completed',
        -- Billing
        'stripe_customer_id', 'stripe_subscription_id',
        'stripe_subscription_status', 'stripe_price_id', 'trial_ends_at',
        'billing_user_count', 'billing_period_start', 'billing_period_end',
        'pending_billing_changes',
        -- Schedule
        'timezone', 'checkin_due_day', 'checkin_due_time',
        'checkin_reminder_day', 'checkin_reminder_time'
    ]) AS column_name
),
column_verification AS (
    SELECT 
        rc.column_name,
        CASE 
            WHEN c.column_name IS NOT NULL THEN '✓'
            ELSE '✗'
        END AS exists
    FROM required_columns rc
    LEFT JOIN information_schema.columns c
        ON c.column_name = rc.column_name
        AND c.table_name = 'organizations'
        AND c.table_schema = 'public'
)
SELECT 
    column_name,
    exists AS status
FROM column_verification
WHERE exists = '✗'
UNION ALL
SELECT 
    'TOTAL' AS column_name,
    COUNT(*) FILTER (WHERE exists = '✓') || ' of ' ||
    COUNT(*) || ' columns exist' AS status
FROM column_verification;

-- ============================================================================
-- SECTION 3: VERIFY USERS TABLE COLUMNS
-- ============================================================================
SELECT '=== VERIFYING USERS TABLE COLUMNS ===' AS verification_step;

WITH required_columns AS (
    SELECT unnest(ARRAY[
        -- Basic columns
        'id', 'username', 'password', 'name', 'email', 'role',
        'organization_id', 'team_id', 'manager_id', 'avatar',
        'is_active', 'is_super_admin', 'created_at',
        -- New columns from migration
        'reviewer_id', 'is_account_owner',
        -- Slack integration
        'slack_user_id', 'slack_username', 'slack_display_name',
        'slack_email', 'slack_avatar', 'slack_workspace_id',
        -- Microsoft integration
        'microsoft_user_id', 'microsoft_user_principal_name',
        'microsoft_display_name', 'microsoft_email', 'microsoft_avatar',
        'microsoft_tenant_id', 'microsoft_access_token',
        'microsoft_refresh_token',
        -- Auth and preferences
        'auth_provider', 'personal_review_reminder_day',
        'personal_review_reminder_time', 'can_view_all_teams'
    ]) AS column_name
),
column_verification AS (
    SELECT 
        rc.column_name,
        CASE 
            WHEN c.column_name IS NOT NULL THEN '✓'
            ELSE '✗'
        END AS exists
    FROM required_columns rc
    LEFT JOIN information_schema.columns c
        ON c.column_name = rc.column_name
        AND c.table_name = 'users'
        AND c.table_schema = 'public'
)
SELECT 
    column_name,
    exists AS status
FROM column_verification
WHERE exists = '✗'
UNION ALL
SELECT 
    'TOTAL' AS column_name,
    COUNT(*) FILTER (WHERE exists = '✓') || ' of ' ||
    COUNT(*) || ' columns exist' AS status
FROM column_verification;

-- ============================================================================
-- SECTION 4: VERIFY INDEX CREATION
-- ============================================================================
SELECT '=== VERIFYING INDEXES ===' AS verification_step;

WITH expected_indexes AS (
    SELECT unnest(ARRAY[
        'partner_firms_slug_idx',
        'partner_firms_home_org_idx',
        'team_goals_organization_idx',
        'team_goals_team_idx',
        'team_goals_status_idx',
        'question_bank_category_idx',
        'question_bank_approved_idx',
        'one_on_ones_org_idx',
        'one_on_ones_participants_idx',
        'kra_templates_org_category_idx',
        'user_kras_user_idx',
        'action_items_assigned_idx',
        'kra_ratings_kra_idx',
        'users_slack_user_id_idx',
        'users_auth_provider_idx'
    ]) AS index_name
)
SELECT 
    ei.index_name,
    CASE 
        WHEN i.indexname IS NOT NULL THEN '✓ EXISTS'
        ELSE '✗ MISSING'
    END AS status
FROM expected_indexes ei
LEFT JOIN pg_indexes i
    ON i.indexname = ei.index_name
    AND i.schemaname = 'public'
WHERE i.indexname IS NULL;

-- ============================================================================
-- SECTION 5: VERIFY UNIQUE CONSTRAINTS
-- ============================================================================
SELECT '=== VERIFYING UNIQUE CONSTRAINTS ===' AS verification_step;

WITH expected_constraints AS (
    SELECT unnest(ARRAY[
        'team_question_settings_unique',
        'kra_ratings_unique',
        'users_username_org_unique',
        'users_email_org_unique',
        'users_org_slack_unique'
    ]) AS constraint_name
)
SELECT 
    ec.constraint_name,
    CASE 
        WHEN tc.constraint_name IS NOT NULL THEN '✓ EXISTS'
        ELSE '✗ MISSING'
    END AS status
FROM expected_constraints ec
LEFT JOIN information_schema.table_constraints tc
    ON tc.constraint_name = ec.constraint_name
    AND tc.table_schema = 'public'
WHERE tc.constraint_name IS NULL;

-- ============================================================================
-- SECTION 6: DATA INTEGRITY CHECKS
-- ============================================================================
SELECT '=== DATA INTEGRITY CHECKS ===' AS verification_step;

-- Check for NULL values in critical NOT NULL columns
SELECT 'Organizations with NULL plan' AS check_type, 
       COUNT(*) AS count
FROM organizations 
WHERE plan IS NULL
HAVING COUNT(*) > 0
UNION ALL
SELECT 'Users with NULL auth_provider' AS check_type,
       COUNT(*) AS count
FROM users 
WHERE auth_provider IS NULL
HAVING COUNT(*) > 0
UNION ALL
SELECT 'Users with NULL role' AS check_type,
       COUNT(*) AS count
FROM users 
WHERE role IS NULL
HAVING COUNT(*) > 0
UNION ALL
SELECT 'Checkins without review_due_date' AS check_type,
       COUNT(*) AS count
FROM checkins 
WHERE review_due_date IS NULL
HAVING COUNT(*) > 0;

-- ============================================================================
-- SECTION 7: FINAL VERIFICATION SUMMARY
-- ============================================================================
SELECT '=== MIGRATION VERIFICATION SUMMARY ===' AS verification_step;

WITH verification_counts AS (
    SELECT 
        (SELECT COUNT(*) FROM information_schema.tables 
         WHERE table_schema = 'public' 
         AND table_name IN (
            'partner_firms', 'team_goals', 'question_categories',
            'kra_categories', 'kra_templates', 'user_kras',
            'one_on_ones', 'action_items', 'kra_ratings', 'kra_history'
         )) AS new_tables_count,
        (SELECT COUNT(*) FROM information_schema.columns
         WHERE table_schema = 'public' 
         AND table_name = 'organizations'
         AND column_name IN (
            'slack_client_id', 'microsoft_client_id', 'theme_config',
            'onboarding_status', 'billing_user_count', 'checkin_due_day'
         )) AS new_org_columns_count,
        (SELECT COUNT(*) FROM information_schema.columns
         WHERE table_schema = 'public' 
         AND table_name = 'users'
         AND column_name IN (
            'slack_user_id', 'microsoft_user_id', 'auth_provider',
            'reviewer_id', 'can_view_all_teams'
         )) AS new_user_columns_count
)
SELECT 
    'New Tables Created' AS metric,
    new_tables_count || ' tables' AS value
FROM verification_counts
UNION ALL
SELECT 
    'New Organizations Columns' AS metric,
    new_org_columns_count || ' columns' AS value
FROM verification_counts
UNION ALL
SELECT 
    'New Users Columns' AS metric,
    new_user_columns_count || ' columns' AS value
FROM verification_counts;

-- ============================================================================
-- SECTION 8: RECOMMENDATIONS
-- ============================================================================
SELECT '=== POST-MIGRATION RECOMMENDATIONS ===' AS verification_step;

SELECT 
    CASE 
        WHEN COUNT(*) > 0 THEN 
            '⚠️ WARNING: Some verifications failed. Review the results above.'
        ELSE 
            '✓ SUCCESS: All verifications passed! Proceed to STEP_4_SUPERADMIN.sql'
    END AS recommendation
FROM (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' 
    AND table_name = 'kra_templates'
    HAVING COUNT(*) = 0
) AS missing_check;

-- Final timestamp
SELECT 
    'Verification completed at: ' || NOW()::TEXT AS status,
    'Next step: Run STEP_4_SUPERADMIN.sql to set up super admin access' AS next_action;