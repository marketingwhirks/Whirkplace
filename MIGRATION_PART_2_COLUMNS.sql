-- PART 2: ADD MISSING COLUMNS TO EXISTING TABLES
-- Select all and run

-- Add columns to organizations table
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
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_status TEXT DEFAULT 'not_started';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_current_step TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_completed_at TIMESTAMP;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_workspace_completed BOOLEAN DEFAULT false;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_billing_completed BOOLEAN DEFAULT false;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_roles_completed BOOLEAN DEFAULT false;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_values_completed BOOLEAN DEFAULT false;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_members_completed BOOLEAN DEFAULT false;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS onboarding_settings_completed BOOLEAN DEFAULT false;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Chicago';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS checkin_due_day INTEGER DEFAULT 5;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS checkin_due_time TEXT DEFAULT '17:00';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS checkin_reminder_day INTEGER;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS checkin_reminder_time TEXT DEFAULT '09:00';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS weekly_check_in_schedule TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS review_reminder_day TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS review_reminder_time TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS values TEXT[] DEFAULT '{}';
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS theme_config JSONB;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS enable_custom_theme BOOLEAN DEFAULT false;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS pending_billing_changes JSONB;

-- Add columns to users table  
ALTER TABLE users ADD COLUMN IF NOT EXISTS auth_provider TEXT DEFAULT 'local';
ALTER TABLE users ADD COLUMN IF NOT EXISTS slack_user_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS microsoft_user_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS slack_access_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS slack_refresh_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS microsoft_access_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS microsoft_refresh_token TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reviewer_id VARCHAR;
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_view_all_teams BOOLEAN DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS weekly_reminder_opt_in BOOLEAN DEFAULT true;
ALTER TABLE users ADD COLUMN IF NOT EXISTS review_reminder_opt_in BOOLEAN DEFAULT true;

-- Verify columns were added
SELECT 'Columns Added' as status,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'organizations') as org_columns,
  (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'users') as user_columns;