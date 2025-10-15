-- =====================================================
-- REPLIT-COMPATIBLE MIGRATION SCRIPT
-- =====================================================
-- IMPORTANT: To run in a transaction in Replit:
-- 1. Select ALL the SQL statements below (Ctrl+A)
-- 2. Click Run - Replit will automatically wrap in a transaction
-- =====================================================

-- Part A: Create Missing Tables
-- =====================================================

-- Create question_categories table
CREATE TABLE IF NOT EXISTS question_categories (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create kra_categories table
CREATE TABLE IF NOT EXISTS kra_categories (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create question_bank table
CREATE TABLE IF NOT EXISTS question_bank (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  question TEXT NOT NULL,
  category_id VARCHAR,
  contributed_by_org_id VARCHAR,
  is_approved BOOLEAN NOT NULL DEFAULT false,
  usage_count INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create kra_templates table
CREATE TABLE IF NOT EXISTS kra_templates (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id VARCHAR,
  name TEXT NOT NULL,
  description TEXT,
  criteria TEXT,
  measurement_type TEXT NOT NULL DEFAULT 'rating',
  frequency TEXT NOT NULL DEFAULT 'quarterly',
  target_value NUMERIC(10,2),
  min_value NUMERIC(10,2) DEFAULT 0,
  max_value NUMERIC(10,2) DEFAULT 100,
  organization_id VARCHAR,
  is_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create user_kras table
CREATE TABLE IF NOT EXISTS user_kras (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL,
  template_id VARCHAR,
  name TEXT NOT NULL,
  description TEXT,
  criteria TEXT,
  measurement_type TEXT NOT NULL DEFAULT 'rating',
  current_value NUMERIC(10,2),
  target_value NUMERIC(10,2),
  status TEXT NOT NULL DEFAULT 'active',
  quarter TEXT,
  year INTEGER,
  start_date TIMESTAMP,
  end_date TIMESTAMP,
  notes TEXT,
  organization_id VARCHAR NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create team_question_settings table
CREATE TABLE IF NOT EXISTS team_question_settings (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id VARCHAR NOT NULL,
  question_id VARCHAR NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  "order" INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(team_id, question_id)
);

-- Create one_on_ones table
CREATE TABLE IF NOT EXISTS one_on_ones (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  manager_id VARCHAR NOT NULL,
  employee_id VARCHAR NOT NULL,
  scheduled_date TIMESTAMP NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  meeting_link TEXT,
  notes TEXT,
  agenda TEXT,
  completed_date TIMESTAMP,
  organization_id VARCHAR NOT NULL,
  created_by VARCHAR,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Part B: Add Missing Columns to Organizations Table
-- =====================================================

-- Add billing columns
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_interval TEXT DEFAULT 'monthly';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS plan_type TEXT DEFAULT 'standard';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_price_per_user INTEGER DEFAULT 2000;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_user_count INTEGER DEFAULT 0;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_period_start TIMESTAMP;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS billing_period_end TIMESTAMP;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_subscription_status TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS stripe_price_id TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMP;

-- Add onboarding columns
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_status TEXT DEFAULT 'not_started';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_current_step TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMP;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_workspace_completed BOOLEAN DEFAULT false;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_billing_completed BOOLEAN DEFAULT false;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_roles_completed BOOLEAN DEFAULT false;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_values_completed BOOLEAN DEFAULT false;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_members_completed BOOLEAN DEFAULT false;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_settings_completed BOOLEAN DEFAULT false;

-- Add check-in settings columns
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Chicago';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS checkin_due_day INTEGER DEFAULT 5;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS checkin_due_time TEXT DEFAULT '17:00';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS checkin_reminder_day INTEGER;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS checkin_reminder_time TEXT DEFAULT '09:00';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS weekly_check_in_schedule TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS review_reminder_day TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS review_reminder_time TEXT;

-- Add other missing columns
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS values TEXT[] DEFAULT '{}';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS theme_config JSONB;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS enable_custom_theme BOOLEAN DEFAULT false;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS pending_billing_changes JSONB;

-- Part C: Add Missing Columns to Users Table
-- =====================================================

-- Add authentication columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'local';
ALTER TABLE users ADD COLUMN IF NOT EXISTS slack_user_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS microsoft_user_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS slack_access_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS slack_refresh_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS microsoft_access_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS microsoft_refresh_token TEXT;

-- Add review/manager columns
ALTER TABLE users ADD COLUMN IF NOT EXISTS reviewer_id VARCHAR;
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_view_all_teams BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS weekly_reminder_opt_in BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS review_reminder_opt_in BOOLEAN DEFAULT true;

-- Part D: Create Indexes for Performance
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_organization_id ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_question_categories_order ON question_categories("order");
CREATE INDEX IF NOT EXISTS idx_kra_categories_order ON kra_categories("order");

-- Part E: Add Default Categories
-- =====================================================

INSERT INTO kra_categories (name, description, is_default, "order")
VALUES 
  ('General', 'General KRA category', true, 0),
  ('Sales', 'Sales and revenue related KRAs', false, 1),
  ('Operations', 'Operational excellence KRAs', false, 2)
ON CONFLICT DO NOTHING;

INSERT INTO question_categories (name, description, icon, is_default, "order")
VALUES 
  ('General', 'General check-in questions', '📝', true, 0),
  ('Wellness', 'Personal wellness and work-life balance', '🧘', false, 1),
  ('Goals', 'Goal tracking and progress', '🎯', false, 2)
ON CONFLICT DO NOTHING;