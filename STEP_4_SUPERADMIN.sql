-- ============================================================================
-- STEP 4: SUPER ADMIN SETUP SCRIPT
-- Purpose: Set up super admin access after schema synchronization
-- Run this after STEP_3_VERIFY.sql confirms the migration is complete
-- ============================================================================

-- ============================================================================
-- SECTION 1: ENVIRONMENT CHECK
-- ============================================================================
SELECT '=== SUPER ADMIN SETUP - ENVIRONMENT CHECK ===' AS setup_step;
SELECT current_database() AS database_name,
       current_user AS connected_user,
       NOW() AS setup_timestamp;

-- Verify critical tables exist before proceeding
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables 
                   WHERE table_name = 'organizations' AND table_schema = 'public') THEN
        RAISE EXCEPTION 'Organizations table not found. Run STEP_2_MIGRATE.sql first.';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables 
                   WHERE table_name = 'users' AND table_schema = 'public') THEN
        RAISE EXCEPTION 'Users table not found. Run STEP_2_MIGRATE.sql first.';
    END IF;
    
    RAISE NOTICE 'Environment check passed. Proceeding with super admin setup.';
END $$;

-- ============================================================================
-- SECTION 2: CREATE OR UPDATE WHIRKPLACE ORGANIZATION
-- ============================================================================
SELECT '=== SETTING UP WHIRKPLACE ORGANIZATION ===' AS setup_step;

-- First, check if whirkplace organization exists
SELECT 
    id,
    name,
    slug,
    plan,
    stripe_subscription_status,
    is_active
FROM organizations 
WHERE slug = 'whirkplace';

-- Insert or update the Whirkplace organization
INSERT INTO organizations (
    id,
    name,
    slug,
    plan,
    custom_values,
    is_active,
    created_at,
    -- Billing setup
    billing_user_count,
    billing_price_per_user,
    stripe_subscription_status,
    -- Features enabled
    enable_slack_integration,
    enable_microsoft_auth,
    enable_teams_integration,
    enable_custom_theme,
    -- Onboarding status
    onboarding_status,
    onboarding_workspace_completed,
    onboarding_billing_completed,
    onboarding_roles_completed,
    onboarding_values_completed,
    onboarding_members_completed,
    onboarding_settings_completed,
    onboarding_completed_at,
    -- Schedule settings
    timezone,
    checkin_due_day,
    checkin_due_time,
    checkin_reminder_time
) 
VALUES (
    'whirkplace-org-id',  -- Fixed ID for consistency
    'Whirkplace',
    'whirkplace',
    'enterprise',
    ARRAY['own it', 'challenge it', 'team first', 'empathy for others', 'passion for our purpose'],
    true,
    NOW(),
    -- Billing
    0, -- No billing for internal org
    0,
    'active',
    -- All features enabled for enterprise
    true,
    true,
    true,
    true,
    -- Mark onboarding as completed
    'completed',
    true,
    true,
    true,
    true,
    true,
    true,
    NOW(),
    -- Default schedule
    'America/Chicago',
    5, -- Friday
    '17:00',
    '09:00'
)
ON CONFLICT (slug) 
DO UPDATE SET
    plan = 'enterprise',
    is_active = true,
    stripe_subscription_status = 'active',
    enable_slack_integration = true,
    enable_microsoft_auth = true,
    enable_teams_integration = true,
    enable_custom_theme = true,
    onboarding_status = 'completed',
    onboarding_workspace_completed = true,
    onboarding_billing_completed = true,
    onboarding_roles_completed = true,
    onboarding_values_completed = true,
    onboarding_members_completed = true,
    onboarding_settings_completed = true,
    onboarding_completed_at = CASE 
        WHEN organizations.onboarding_completed_at IS NULL THEN NOW()
        ELSE organizations.onboarding_completed_at
    END;

-- Get the organization ID for further operations
DO $$
DECLARE
    org_id VARCHAR;
BEGIN
    SELECT id INTO org_id FROM organizations WHERE slug = 'whirkplace';
    RAISE NOTICE 'Whirkplace organization ID: %', org_id;
END $$;

-- ============================================================================
-- SECTION 3: CREATE SUPER ADMIN USER
-- ============================================================================
SELECT '=== CREATING SUPER ADMIN USER ===' AS setup_step;

-- Check if super admin already exists
SELECT 
    id,
    email,
    name,
    role,
    is_super_admin,
    is_active
FROM users 
WHERE email = 'mpatrick@whirks.com' 
   OR is_super_admin = true;

-- Create or update super admin user
-- Password: SuperAdmin2025! (hashed using bcrypt)
INSERT INTO users (
    id,
    username,
    password,
    name,
    email,
    role,
    organization_id,
    is_account_owner,
    is_super_admin,
    is_active,
    auth_provider,
    can_view_all_teams,
    created_at
) 
VALUES (
    'super-admin-user-id',  -- Fixed ID for consistency
    'superadmin',
    '$2a$10$RhQxi1V4JnNRVx1HQpHeguM06FyFu4H4Iou4IQjSk7LS9c8sZy6LK', -- SuperAdmin2025!
    'Super Administrator',
    'mpatrick@whirks.com',
    'admin',
    (SELECT id FROM organizations WHERE slug = 'whirkplace'),
    true,  -- is_account_owner
    true,  -- is_super_admin
    true,  -- is_active
    'local',
    true,  -- can_view_all_teams
    NOW()
)
ON CONFLICT (organization_id, email)
DO UPDATE SET
    password = '$2a$10$RhQxi1V4JnNRVx1HQpHeguM06FyFu4H4Iou4IQjSk7LS9c8sZy6LK',
    name = 'Super Administrator',
    role = 'admin',
    is_account_owner = true,
    is_super_admin = true,
    is_active = true,
    can_view_all_teams = true;

-- Also ensure username is unique for the super admin
UPDATE users 
SET username = 'superadmin'
WHERE email = 'mpatrick@whirks.com'
  AND username != 'superadmin';

-- ============================================================================
-- SECTION 4: CREATE BACKUP SUPER ADMIN
-- ============================================================================
SELECT '=== CREATING BACKUP SUPER ADMIN ===' AS setup_step;

-- Create a backup super admin account for emergency access
-- Password: BackupAdmin2025! (hashed using bcrypt)
INSERT INTO users (
    username,
    password,
    name,
    email,
    role,
    organization_id,
    is_account_owner,
    is_super_admin,
    is_active,
    auth_provider,
    can_view_all_teams,
    created_at
) 
VALUES (
    'backupadmin',
    '$2a$10$tPwZj2xdQpDqCKrEgNEVj.TNQO/sDwlqJsP5vJL.7VyaQzHyqXzEi', -- BackupAdmin2025!
    'Backup Administrator',
    'backup.admin@whirkplace.com',
    'admin',
    (SELECT id FROM organizations WHERE slug = 'whirkplace'),
    false, -- Not the primary account owner
    true,  -- is_super_admin
    true,  -- is_active
    'local',
    true,  -- can_view_all_teams
    NOW()
)
ON CONFLICT (organization_id, email)
DO UPDATE SET
    password = '$2a$10$tPwZj2xdQpDqCKrEgNEVj.TNQO/sDwlqJsP5vJL.7VyaQzHyqXzEi',
    is_super_admin = true,
    is_active = true;

-- ============================================================================
-- SECTION 5: GRANT SUPER ADMIN PRIVILEGES TO EXISTING ADMINS
-- ============================================================================
SELECT '=== CHECKING EXISTING ADMIN USERS ===' AS setup_step;

-- List all existing admin users
SELECT 
    u.id,
    u.email,
    u.name,
    u.role,
    u.is_super_admin,
    u.is_account_owner,
    o.name AS organization_name,
    o.slug AS organization_slug
FROM users u
JOIN organizations o ON u.organization_id = o.id
WHERE u.role IN ('admin', 'partner_admin')
ORDER BY u.is_super_admin DESC, u.created_at;

-- Grant super admin to specific known administrators if they exist
UPDATE users 
SET is_super_admin = true
WHERE email IN (
    'mpatrick@whirks.com',
    'admin@whirkplace.com'
) AND is_super_admin = false;

-- ============================================================================
-- SECTION 6: CREATE DEFAULT TEAMS FOR WHIRKPLACE
-- ============================================================================
SELECT '=== CREATING DEFAULT TEAMS ===' AS setup_step;

-- Create Leadership team
INSERT INTO teams (
    name,
    description,
    organization_id,
    team_type,
    depth,
    is_active,
    created_at
)
VALUES (
    'Leadership',
    'Executive leadership team',
    (SELECT id FROM organizations WHERE slug = 'whirkplace'),
    'team',
    0,
    true,
    NOW()
)
ON CONFLICT DO NOTHING;

-- Create Engineering team
INSERT INTO teams (
    name,
    description,
    organization_id,
    team_type,
    depth,
    is_active,
    created_at
)
VALUES (
    'Engineering',
    'Product and engineering team',
    (SELECT id FROM organizations WHERE slug = 'whirkplace'),
    'team',
    0,
    true,
    NOW()
)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- SECTION 7: VERIFY SUPER ADMIN ACCESS
-- ============================================================================
SELECT '=== VERIFYING SUPER ADMIN SETUP ===' AS setup_step;

-- Verify super admin users
SELECT 
    'Super Admin Users' AS check_type,
    COUNT(*) AS count,
    string_agg(email, ', ') AS emails
FROM users 
WHERE is_super_admin = true
  AND is_active = true;

-- Verify Whirkplace organization
SELECT 
    'Whirkplace Organization' AS check_type,
    CASE 
        WHEN COUNT(*) = 1 THEN 'SUCCESS'
        ELSE 'FAILED'
    END AS status,
    COUNT(*) AS count
FROM organizations 
WHERE slug = 'whirkplace'
  AND plan = 'enterprise'
  AND is_active = true;

-- ============================================================================
-- SECTION 8: SUMMARY AND CREDENTIALS
-- ============================================================================
SELECT '=== SUPER ADMIN SETUP COMPLETE ===' AS setup_step;

SELECT 
    '================== LOGIN CREDENTIALS ==================' AS separator
UNION ALL
SELECT 
    'Primary Super Admin:' AS credential_type
UNION ALL
SELECT 
    '  Email: mpatrick@whirks.com' AS credential_type
UNION ALL
SELECT 
    '  Username: superadmin' AS credential_type
UNION ALL
SELECT 
    '  Password: SuperAdmin2025!' AS credential_type
UNION ALL
SELECT 
    '' AS credential_type
UNION ALL
SELECT 
    'Backup Super Admin:' AS credential_type
UNION ALL
SELECT 
    '  Email: backup.admin@whirkplace.com' AS credential_type
UNION ALL
SELECT 
    '  Username: backupadmin' AS credential_type
UNION ALL
SELECT 
    '  Password: BackupAdmin2025!' AS credential_type
UNION ALL
SELECT 
    '======================================================' AS separator;

-- Final status
SELECT 
    'Setup completed successfully at: ' || NOW()::TEXT AS status,
    'You can now login with the super admin credentials above' AS next_action;

-- ============================================================================
-- OPTIONAL: TROUBLESHOOTING QUERIES
-- ============================================================================
-- Uncomment these queries if you need to troubleshoot login issues:

/*
-- Check if user exists and is active
SELECT id, email, username, role, is_super_admin, is_active, auth_provider
FROM users 
WHERE email = 'mpatrick@whirks.com';

-- Check organization status
SELECT id, name, slug, plan, is_active
FROM organizations 
WHERE slug = 'whirkplace';

-- Reset password manually if needed (generates new bcrypt hash)
-- You'll need to generate a new hash externally and update here
-- UPDATE users 
-- SET password = 'YOUR_NEW_BCRYPT_HASH_HERE'
-- WHERE email = 'mpatrick@whirks.com';

-- List all super admins
SELECT u.*, o.name as org_name, o.slug as org_slug
FROM users u
JOIN organizations o ON u.organization_id = o.id
WHERE u.is_super_admin = true;
*/

-- ============================================================================
-- END OF SUPER ADMIN SETUP SCRIPT
-- ============================================================================