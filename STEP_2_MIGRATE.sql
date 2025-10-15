-- ============================================================================
-- STEP 2: COMPREHENSIVE DATABASE MIGRATION SCRIPT
-- Purpose: Safely migrate production database to match development schema
-- WARNING: Review STEP_1_AUDIT.sql results before running this script
-- ============================================================================

BEGIN;

-- Set session parameters for safety
SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET client_min_messages = warning;

-- ============================================================================
-- SECTION 1: CREATE MISSING TABLES (SAFE WITH IF NOT EXISTS)
-- ============================================================================

-- Partner Firms table
CREATE TABLE IF NOT EXISTS partner_firms (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    branding_config JSONB,
    plan TEXT NOT NULL DEFAULT 'partner',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    home_organization_id VARCHAR,
    wholesale_rate INTEGER NOT NULL DEFAULT 70,
    stripe_account_id TEXT,
    stripe_customer_id TEXT,
    client_count INTEGER NOT NULL DEFAULT 0,
    commission_paid INTEGER NOT NULL DEFAULT 0,
    commission_pending INTEGER NOT NULL DEFAULT 0,
    stripe_subscription_id TEXT,
    billing_status TEXT NOT NULL DEFAULT 'active',
    metadata JSONB DEFAULT '{}',
    billing_email TEXT,
    enable_cobranding BOOLEAN NOT NULL DEFAULT TRUE,
    max_client_organizations INTEGER NOT NULL DEFAULT -1,
    custom_domain TEXT
);

-- Team Goals table
CREATE TABLE IF NOT EXISTS team_goals (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id VARCHAR NOT NULL,
    team_id VARCHAR,
    title TEXT NOT NULL,
    description TEXT,
    target_value INTEGER NOT NULL,
    current_value INTEGER NOT NULL DEFAULT 0,
    goal_type TEXT NOT NULL,
    metric TEXT NOT NULL,
    prize TEXT,
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    completed_at TIMESTAMP,
    created_by VARCHAR NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Question Categories
CREATE TABLE IF NOT EXISTS question_categories (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    icon TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- KRA Categories
CREATE TABLE IF NOT EXISTS kra_categories (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Question Bank
CREATE TABLE IF NOT EXISTS question_bank (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    text TEXT NOT NULL,
    category_id VARCHAR NOT NULL,
    description TEXT,
    tags TEXT[] NOT NULL DEFAULT '{}',
    usage_count INTEGER NOT NULL DEFAULT 0,
    is_system BOOLEAN NOT NULL DEFAULT FALSE,
    contributed_by VARCHAR,
    contributed_by_org VARCHAR,
    is_approved BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Team Question Settings
CREATE TABLE IF NOT EXISTS team_question_settings (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id VARCHAR NOT NULL,
    organization_id VARCHAR NOT NULL,
    question_id VARCHAR NOT NULL,
    is_disabled BOOLEAN NOT NULL DEFAULT FALSE,
    disabled_by VARCHAR,
    disabled_at TIMESTAMP,
    reason TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- One-on-Ones
CREATE TABLE IF NOT EXISTS one_on_ones (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id VARCHAR NOT NULL,
    participant_one_id VARCHAR NOT NULL,
    participant_two_id VARCHAR NOT NULL,
    scheduled_at TIMESTAMP NOT NULL,
    status TEXT NOT NULL DEFAULT 'scheduled',
    agenda TEXT,
    notes TEXT,
    action_items JSONB NOT NULL DEFAULT '[]',
    kra_ids TEXT[] DEFAULT '{}',
    duration INTEGER DEFAULT 30,
    location TEXT,
    is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
    recurrence_series_id VARCHAR,
    recurrence_pattern TEXT,
    recurrence_interval INTEGER DEFAULT 1,
    recurrence_end_date TIMESTAMP,
    recurrence_end_count INTEGER,
    is_recurrence_template BOOLEAN NOT NULL DEFAULT FALSE,
    outlook_event_id TEXT,
    meeting_url TEXT,
    is_online_meeting BOOLEAN NOT NULL DEFAULT FALSE,
    sync_with_outlook BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    created_by VARCHAR NOT NULL,
    started_at TIMESTAMP,
    ended_at TIMESTAMP,
    cancelled_at TIMESTAMP,
    cancelled_by VARCHAR,
    cancellation_reason TEXT
);

-- KRA Templates
CREATE TABLE IF NOT EXISTS kra_templates (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id VARCHAR,
    name TEXT NOT NULL,
    description TEXT,
    goals JSONB NOT NULL DEFAULT '[]',
    category TEXT NOT NULL DEFAULT 'general',
    job_title TEXT,
    industries TEXT[] NOT NULL DEFAULT '{}',
    is_global BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_by VARCHAR,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    criteria JSONB NOT NULL DEFAULT '[]',
    is_system BOOLEAN NOT NULL DEFAULT FALSE
);

-- User KRAs
CREATE TABLE IF NOT EXISTS user_kras (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id VARCHAR NOT NULL,
    user_id VARCHAR NOT NULL,
    template_id VARCHAR,
    name TEXT NOT NULL,
    description TEXT,
    goals JSONB NOT NULL DEFAULT '[]',
    assigned_by VARCHAR NOT NULL,
    start_date TIMESTAMP NOT NULL,
    end_date TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'active',
    progress INTEGER NOT NULL DEFAULT 0,
    last_updated TIMESTAMP NOT NULL DEFAULT now(),
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    criteria JSONB NOT NULL DEFAULT '[]',
    quarter TEXT NOT NULL,
    year INTEGER NOT NULL,
    self_rating INTEGER,
    self_note TEXT,
    manager_rating INTEGER,
    manager_note TEXT,
    finalized BOOLEAN NOT NULL DEFAULT FALSE,
    finalized_at TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT now(),
    is_active BOOLEAN NOT NULL DEFAULT TRUE
);

-- Action Items
CREATE TABLE IF NOT EXISTS action_items (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id VARCHAR NOT NULL,
    meeting_id VARCHAR,
    one_on_one_id VARCHAR,
    description TEXT NOT NULL,
    assigned_to VARCHAR NOT NULL,
    assigned_by VARCHAR NOT NULL,
    due_date TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'open',
    notes TEXT,
    carry_forward BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    completed_at TIMESTAMP,
    title TEXT NOT NULL
);

-- KRA Ratings
CREATE TABLE IF NOT EXISTS kra_ratings (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id VARCHAR NOT NULL,
    kra_id VARCHAR NOT NULL,
    one_on_one_id VARCHAR,
    rater_id VARCHAR NOT NULL,
    rater_role TEXT NOT NULL,
    rating INTEGER NOT NULL,
    note TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- KRA History
CREATE TABLE IF NOT EXISTS kra_history (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id VARCHAR NOT NULL,
    kra_id VARCHAR NOT NULL,
    user_id VARCHAR NOT NULL,
    change_type TEXT NOT NULL,
    old_value JSONB,
    new_value JSONB,
    reason TEXT,
    changed_by_id VARCHAR NOT NULL,
    changed_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Analytics tables
CREATE TABLE IF NOT EXISTS pulse_metrics_daily (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id VARCHAR NOT NULL,
    metric_date DATE NOT NULL,
    total_checkins INTEGER NOT NULL DEFAULT 0,
    average_mood NUMERIC(3,2),
    mood_1_count INTEGER NOT NULL DEFAULT 0,
    mood_2_count INTEGER NOT NULL DEFAULT 0,
    mood_3_count INTEGER NOT NULL DEFAULT 0,
    mood_4_count INTEGER NOT NULL DEFAULT 0,
    mood_5_count INTEGER NOT NULL DEFAULT 0,
    unique_users INTEGER NOT NULL DEFAULT 0,
    team_breakdown JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS shoutout_metrics_daily (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id VARCHAR NOT NULL,
    metric_date DATE NOT NULL,
    total_shoutouts INTEGER NOT NULL DEFAULT 0,
    public_shoutouts INTEGER NOT NULL DEFAULT 0,
    private_shoutouts INTEGER NOT NULL DEFAULT 0,
    unique_senders INTEGER NOT NULL DEFAULT 0,
    unique_receivers INTEGER NOT NULL DEFAULT 0,
    value_counts JSONB NOT NULL DEFAULT '{}',
    top_senders JSONB NOT NULL DEFAULT '[]',
    top_receivers JSONB NOT NULL DEFAULT '[]',
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS compliance_metrics_daily (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id VARCHAR NOT NULL,
    metric_date DATE NOT NULL,
    total_due INTEGER NOT NULL DEFAULT 0,
    on_time_submissions INTEGER NOT NULL DEFAULT 0,
    late_submissions INTEGER NOT NULL DEFAULT 0,
    missing_submissions INTEGER NOT NULL DEFAULT 0,
    on_time_reviews INTEGER NOT NULL DEFAULT 0,
    late_reviews INTEGER NOT NULL DEFAULT 0,
    pending_reviews INTEGER NOT NULL DEFAULT 0,
    team_breakdown JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS aggregation_watermarks (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id VARCHAR NOT NULL,
    aggregation_type TEXT NOT NULL,
    last_processed_date DATE NOT NULL,
    last_processed_id VARCHAR,
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Billing Events
CREATE TABLE IF NOT EXISTS billing_events (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id VARCHAR NOT NULL,
    event_type TEXT NOT NULL,
    description TEXT,
    user_count INTEGER,
    price_per_user INTEGER,
    total_amount INTEGER,
    stripe_event_id TEXT,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Auth provider tables
CREATE TABLE IF NOT EXISTS organization_auth_providers (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id VARCHAR NOT NULL,
    provider TEXT NOT NULL,
    provider_org_id TEXT,
    provider_org_name TEXT,
    config JSONB NOT NULL DEFAULT '{}',
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_identities (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL,
    provider TEXT NOT NULL,
    provider_user_id TEXT NOT NULL,
    provider_email TEXT,
    profile JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR NOT NULL,
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    used BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Dashboard configuration tables
CREATE TABLE IF NOT EXISTS dashboard_configs (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id VARCHAR NOT NULL,
    user_id VARCHAR,
    role TEXT,
    is_default BOOLEAN NOT NULL DEFAULT FALSE,
    layout JSONB NOT NULL DEFAULT '[]',
    theme JSONB DEFAULT '{}',
    created_by VARCHAR NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dashboard_widget_templates (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,
    component TEXT NOT NULL,
    default_config JSONB NOT NULL DEFAULT '{}',
    min_width INTEGER DEFAULT 1,
    min_height INTEGER DEFAULT 1,
    max_width INTEGER,
    max_height INTEGER,
    required_features TEXT[] DEFAULT '{}',
    required_role TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS dashboard_widget_configs (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    dashboard_id VARCHAR NOT NULL,
    template_id VARCHAR NOT NULL,
    position JSONB NOT NULL,
    size JSONB NOT NULL,
    config JSONB NOT NULL DEFAULT '{}',
    is_visible BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Support tables
CREATE TABLE IF NOT EXISTS bug_reports (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id VARCHAR NOT NULL,
    user_id VARCHAR NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'bug',
    severity TEXT NOT NULL DEFAULT 'medium',
    page_path TEXT,
    metadata JSONB DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'open',
    resolution_note TEXT,
    assigned_to VARCHAR,
    screenshot_url TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    resolved_at TIMESTAMP
);

-- Business and onboarding tables
CREATE TABLE IF NOT EXISTS business_plans (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    display_name TEXT NOT NULL,
    description TEXT,
    price INTEGER NOT NULL DEFAULT 0,
    billing_period TEXT NOT NULL DEFAULT 'monthly',
    features TEXT[] NOT NULL DEFAULT '{}',
    max_users INTEGER,
    max_teams INTEGER,
    has_slack_integration BOOLEAN NOT NULL DEFAULT FALSE,
    has_microsoft_integration BOOLEAN NOT NULL DEFAULT FALSE,
    has_advanced_analytics BOOLEAN NOT NULL DEFAULT FALSE,
    has_api_access BOOLEAN NOT NULL DEFAULT FALSE,
    priority INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS organization_onboarding (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id VARCHAR NOT NULL,
    step TEXT NOT NULL DEFAULT 'signup',
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_steps TEXT[] NOT NULL DEFAULT '{}',
    current_step_data JSONB,
    started_at TIMESTAMP NOT NULL DEFAULT now(),
    completed_at TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_invitations (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id VARCHAR NOT NULL,
    email TEXT NOT NULL,
    name TEXT,
    role TEXT NOT NULL DEFAULT 'member',
    team_id VARCHAR,
    invited_by VARCHAR NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    token TEXT NOT NULL UNIQUE,
    expires_at TIMESTAMP NOT NULL,
    accepted_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS partner_applications (
    id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name TEXT NOT NULL,
    contact_name TEXT NOT NULL,
    contact_email TEXT NOT NULL,
    contact_phone TEXT,
    company_size TEXT,
    industry TEXT,
    expected_clients TEXT,
    use_case TEXT,
    additional_info TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    reviewed_by VARCHAR,
    reviewed_at TIMESTAMP,
    notes TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT now(),
    updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- ============================================================================
-- SECTION 2: ADD MISSING COLUMNS TO EXISTING TABLES
-- ============================================================================

-- Organizations table column additions
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS industry TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS custom_values TEXT[] NOT NULL DEFAULT ARRAY['own it', 'challenge it', 'team first', 'empathy for others', 'passion for our purpose'];
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS discount_code TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS discount_percentage INTEGER;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS partner_firm_id VARCHAR;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT now();
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_interval TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan_type TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_price_per_user INTEGER DEFAULT 0;

-- Slack Integration columns
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS slack_client_id TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS slack_client_secret TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS slack_workspace_id TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS slack_channel_id TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS slack_wins_channel_id TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS slack_bot_token TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS slack_access_token TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS slack_refresh_token TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS slack_token_expires_at TIMESTAMP;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS slack_signing_secret TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS enable_slack_integration BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS slack_connection_status TEXT DEFAULT 'not_configured';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS slack_last_connected TIMESTAMP;

-- Microsoft Integration columns
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS microsoft_client_id TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS microsoft_client_secret TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS microsoft_tenant_id TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS microsoft_teams_webhook_url TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS enable_microsoft_auth BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS enable_teams_integration BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS microsoft_connection_status TEXT DEFAULT 'not_configured';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS microsoft_last_connected TIMESTAMP;

-- Theme Configuration columns
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS theme_config JSONB;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS enable_custom_theme BOOLEAN NOT NULL DEFAULT FALSE;

-- Onboarding Status columns
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_status TEXT NOT NULL DEFAULT 'not_started';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_current_step TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMP;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_workspace_completed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_billing_completed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_roles_completed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_values_completed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_members_completed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_settings_completed BOOLEAN NOT NULL DEFAULT FALSE;

-- Billing columns
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_user_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_period_start TIMESTAMP;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_period_end TIMESTAMP;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS pending_billing_changes JSONB;

-- Schedule Configuration columns
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS checkin_due_day INTEGER NOT NULL DEFAULT 5;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS checkin_due_time TEXT NOT NULL DEFAULT '17:00';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS checkin_reminder_day INTEGER;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS checkin_reminder_time TEXT NOT NULL DEFAULT '09:00';

-- Users table column additions
ALTER TABLE users ADD COLUMN IF NOT EXISTS reviewer_id VARCHAR;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_account_owner BOOLEAN NOT NULL DEFAULT FALSE;

-- Slack integration columns for users
ALTER TABLE users ADD COLUMN IF NOT EXISTS slack_user_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS slack_username TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS slack_display_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS slack_email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS slack_avatar TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS slack_workspace_id TEXT;

-- Microsoft integration columns for users
ALTER TABLE users ADD COLUMN IF NOT EXISTS microsoft_user_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS microsoft_user_principal_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS microsoft_display_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS microsoft_email TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS microsoft_avatar TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS microsoft_tenant_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS microsoft_access_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS microsoft_refresh_token TEXT;

-- Auth provider and preferences columns for users
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT NOT NULL DEFAULT 'local';
ALTER TABLE users ADD COLUMN IF NOT EXISTS personal_review_reminder_day TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS personal_review_reminder_time TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_view_all_teams BOOLEAN NOT NULL DEFAULT FALSE;

-- Teams table column additions (if table exists)
ALTER TABLE teams ADD COLUMN IF NOT EXISTS parent_team_id VARCHAR;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS team_type TEXT NOT NULL DEFAULT 'team';
ALTER TABLE teams ADD COLUMN IF NOT EXISTS depth INTEGER NOT NULL DEFAULT 0;
ALTER TABLE teams ADD COLUMN IF NOT EXISTS path TEXT;

-- Checkins table column additions (if table exists)
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS response_emojis JSONB NOT NULL DEFAULT '{}';
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS response_flags JSONB NOT NULL DEFAULT '{}';
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS review_due_date TIMESTAMP;
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS reviewed_on_time BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE checkins ADD COLUMN IF NOT EXISTS response_comments JSONB NOT NULL DEFAULT '{}';

-- Questions table column additions (if table exists)
ALTER TABLE questions ADD COLUMN IF NOT EXISTS category_id VARCHAR;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS bank_question_id VARCHAR;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS assigned_to_user_id VARCHAR;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS team_id VARCHAR;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS is_from_bank BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS "order" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS add_to_bank BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================================================
-- SECTION 3: CREATE INDEXES FOR PERFORMANCE
-- ============================================================================

-- Partner Firms indexes
CREATE INDEX IF NOT EXISTS partner_firms_slug_idx ON partner_firms(slug);
CREATE INDEX IF NOT EXISTS partner_firms_home_org_idx ON partner_firms(home_organization_id);

-- Team Goals indexes
CREATE INDEX IF NOT EXISTS team_goals_organization_idx ON team_goals(organization_id);
CREATE INDEX IF NOT EXISTS team_goals_team_idx ON team_goals(team_id);
CREATE INDEX IF NOT EXISTS team_goals_status_idx ON team_goals(status);
CREATE INDEX IF NOT EXISTS team_goals_date_range_idx ON team_goals(start_date, end_date);

-- Question Bank indexes
CREATE INDEX IF NOT EXISTS question_bank_category_idx ON question_bank(category_id);
CREATE INDEX IF NOT EXISTS question_bank_approved_idx ON question_bank(is_approved);

-- Team Question Settings indexes
CREATE INDEX IF NOT EXISTS team_question_settings_team_idx ON team_question_settings(team_id);
CREATE INDEX IF NOT EXISTS team_question_settings_question_idx ON team_question_settings(question_id);

-- One-on-Ones indexes
CREATE INDEX IF NOT EXISTS one_on_ones_org_idx ON one_on_ones(organization_id);
CREATE INDEX IF NOT EXISTS one_on_ones_participants_idx ON one_on_ones(participant_one_id, participant_two_id);
CREATE INDEX IF NOT EXISTS one_on_ones_scheduled_idx ON one_on_ones(scheduled_at);
CREATE INDEX IF NOT EXISTS one_on_ones_recurrence_series_idx ON one_on_ones(recurrence_series_id);
CREATE INDEX IF NOT EXISTS one_on_ones_recurrence_template_idx ON one_on_ones(is_recurrence_template);

-- KRA Templates indexes
CREATE INDEX IF NOT EXISTS kra_templates_org_category_idx ON kra_templates(organization_id, category);
CREATE INDEX IF NOT EXISTS kra_templates_active_idx ON kra_templates(is_active);
CREATE INDEX IF NOT EXISTS kra_templates_global_idx ON kra_templates(is_global);

-- User KRAs indexes
CREATE INDEX IF NOT EXISTS user_kras_user_idx ON user_kras(organization_id, user_id);
CREATE INDEX IF NOT EXISTS user_kras_assigned_by_idx ON user_kras(assigned_by);
CREATE INDEX IF NOT EXISTS user_kras_status_idx ON user_kras(status);
CREATE INDEX IF NOT EXISTS user_kras_template_idx ON user_kras(template_id);

-- Action Items indexes
CREATE INDEX IF NOT EXISTS action_items_meeting_idx ON action_items(meeting_id);
CREATE INDEX IF NOT EXISTS action_items_one_on_one_idx ON action_items(one_on_one_id);
CREATE INDEX IF NOT EXISTS action_items_assigned_idx ON action_items(organization_id, assigned_to, status);
CREATE INDEX IF NOT EXISTS action_items_status_idx ON action_items(status);
CREATE INDEX IF NOT EXISTS action_items_due_date_idx ON action_items(due_date);

-- KRA Ratings indexes
CREATE INDEX IF NOT EXISTS kra_ratings_kra_idx ON kra_ratings(kra_id);
CREATE INDEX IF NOT EXISTS kra_ratings_one_on_one_idx ON kra_ratings(one_on_one_id);
CREATE INDEX IF NOT EXISTS kra_ratings_rater_idx ON kra_ratings(rater_id);
CREATE INDEX IF NOT EXISTS kra_ratings_latest_supervisor_idx ON kra_ratings(kra_id, rater_role, created_at);

-- KRA History indexes
CREATE INDEX IF NOT EXISTS kra_history_kra_idx ON kra_history(kra_id);
CREATE INDEX IF NOT EXISTS kra_history_user_idx ON kra_history(user_id);
CREATE INDEX IF NOT EXISTS kra_history_changed_by_idx ON kra_history(changed_by_id);
CREATE INDEX IF NOT EXISTS kra_history_changed_at_idx ON kra_history(changed_at);

-- User indexes for new columns
CREATE INDEX IF NOT EXISTS users_slack_user_id_idx ON users(slack_user_id);
CREATE INDEX IF NOT EXISTS users_slack_username_idx ON users(slack_username);
CREATE INDEX IF NOT EXISTS users_org_slack_workspace_idx ON users(organization_id, slack_workspace_id);
CREATE INDEX IF NOT EXISTS users_auth_provider_idx ON users(auth_provider);

-- Teams indexes for hierarchy
CREATE INDEX IF NOT EXISTS teams_parent_team_idx ON teams(parent_team_id) WHERE parent_team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS teams_path_idx ON teams(path) WHERE path IS NOT NULL;
CREATE INDEX IF NOT EXISTS teams_team_type_idx ON teams(team_type);

-- ============================================================================
-- SECTION 4: CREATE UNIQUE CONSTRAINTS
-- ============================================================================

-- Team Question Settings unique constraint
ALTER TABLE team_question_settings ADD CONSTRAINT team_question_settings_unique UNIQUE (team_id, question_id);

-- KRA Ratings unique constraint
ALTER TABLE kra_ratings ADD CONSTRAINT kra_ratings_unique UNIQUE (kra_id, one_on_one_id, rater_id);

-- Users unique constraints
ALTER TABLE users ADD CONSTRAINT users_username_org_unique UNIQUE (organization_id, username);
ALTER TABLE users ADD CONSTRAINT users_email_org_unique UNIQUE (organization_id, email);
ALTER TABLE users ADD CONSTRAINT users_org_slack_unique UNIQUE (organization_id, slack_user_id);

-- ============================================================================
-- SECTION 5: FIX POTENTIAL DATA ISSUES
-- ============================================================================

-- Update NULL plan values in organizations to default
UPDATE organizations SET plan = 'standard' WHERE plan IS NULL;

-- Update NULL role values in users to default
UPDATE users SET role = 'member' WHERE role IS NULL;

-- Update NULL auth_provider values in users to default
UPDATE users SET auth_provider = 'local' WHERE auth_provider IS NULL;

-- Ensure all checkins have review_due_date
UPDATE checkins 
SET review_due_date = due_date + INTERVAL '3 days' 
WHERE review_due_date IS NULL;

-- ============================================================================
-- SECTION 6: VALIDATION AND SUMMARY
-- ============================================================================

-- Validate critical tables exist
DO $$
DECLARE
    missing_tables TEXT[];
    required_tables TEXT[] := ARRAY[
        'organizations', 'users', 'teams', 'checkins',
        'question_categories', 'kra_categories', 'kra_templates', 'user_kras',
        'one_on_ones', 'action_items', 'partner_firms', 'team_goals'
    ];
    tbl TEXT;
BEGIN
    missing_tables := ARRAY[]::TEXT[];
    
    FOREACH tbl IN ARRAY required_tables
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_name = tbl AND table_schema = 'public'
        ) THEN
            missing_tables := array_append(missing_tables, tbl);
        END IF;
    END LOOP;
    
    IF array_length(missing_tables, 1) > 0 THEN
        RAISE NOTICE 'WARNING: The following critical tables are still missing: %', missing_tables;
    ELSE
        RAISE NOTICE 'SUCCESS: All critical tables exist';
    END IF;
END $$;

-- Summary
SELECT 
    'Migration completed. Run STEP_3_VERIFY.sql to confirm all changes.' AS status,
    NOW() AS completed_at;

COMMIT;

-- ============================================================================
-- END OF MIGRATION SCRIPT
-- Next: Run STEP_3_VERIFY.sql to verify all changes were applied
-- ============================================================================