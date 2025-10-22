/**
 * Database Synchronization Service
 * Ensures the database schema matches the application's expected structure
 * Runs automatically on application startup to prevent schema mismatch issues
 */

import { db } from '../db';
import { sql } from 'drizzle-orm';

// Track results for reporting
export interface SyncResults {
  success: boolean;
  summary: {
    tablesChecked: number;
    tablesCreated: number;
    columnsAdded: number;
    columnsExisting: number;
    columnsErrored: number;
  };
  errors: { [table: string]: any[] };
  timestamp: string;
  message: string;
}

// Helper function to check if table exists
async function tableExists(tableName: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT EXISTS (
      SELECT FROM information_schema.tables 
      WHERE table_name = ${tableName}
    )
  `);
  return result.rows[0]?.exists === true;
}

// Helper function to check if column exists
async function columnExists(tableName: string, columnName: string): Promise<boolean> {
  const result = await db.execute(sql`
    SELECT EXISTS (
      SELECT FROM information_schema.columns 
      WHERE table_name = ${tableName} AND column_name = ${columnName}
    )
  `);
  return result.rows[0]?.exists === true;
}

// Helper function to add column
async function addColumn(tableName: string, columnName: string, columnDef: string): Promise<string> {
  try {
    const exists = await columnExists(tableName, columnName);
    if (!exists) {
      await db.execute(sql.raw(`ALTER TABLE ${tableName} ADD COLUMN IF NOT EXISTS ${columnName} ${columnDef}`));
      return "ADDED";
    } else {
      return "EXISTS";
    }
  } catch (error: any) {
    if (error.message.includes('already exists')) {
      return "EXISTS";
    }
    throw error;
  }
}

// Define all tables and their columns (extracted from schema)
const tableDefinitions = {
  // Core organizational tables
  partner_firms: {
    columns: [
      { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'name', def: 'TEXT NOT NULL' },
      { name: 'slug', def: 'TEXT NOT NULL UNIQUE' },
      { name: 'branding_config', def: 'JSONB' },
      { name: 'plan', def: "TEXT NOT NULL DEFAULT 'partner'" },
      { name: 'is_active', def: 'BOOLEAN NOT NULL DEFAULT TRUE' },
      { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' },
      { name: 'home_organization_id', def: 'VARCHAR' },
      { name: 'wholesale_rate', def: 'INTEGER NOT NULL DEFAULT 70' },
      { name: 'stripe_account_id', def: 'TEXT' },
      { name: 'stripe_customer_id', def: 'TEXT' },
      { name: 'client_count', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'commission_paid', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'commission_pending', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'stripe_subscription_id', def: 'TEXT' },
      { name: 'billing_status', def: "TEXT NOT NULL DEFAULT 'active'" },
      { name: 'metadata', def: "JSONB DEFAULT '{}'" }
    ]
  },
  organizations: {
    columns: [
      { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'name', def: 'TEXT NOT NULL' },
      { name: 'slug', def: 'TEXT NOT NULL UNIQUE' },
      { name: 'description', def: 'TEXT' },
      { name: 'partner_firm_id', def: 'VARCHAR' },
      { name: 'reseller_code', def: 'TEXT' },
      { name: 'is_reseller_client', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'commission_rate', def: 'INTEGER' },
      { name: 'plan', def: "TEXT NOT NULL DEFAULT 'standard'" },
      { name: 'is_demo', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'values', def: "TEXT[] NOT NULL DEFAULT '{}'" },
      { name: 'logo_url', def: 'TEXT' },
      { name: 'primary_color', def: 'TEXT' },
      // Slack integration fields
      { name: 'slack_workspace_id', def: 'TEXT' },
      { name: 'slack_workspace_name', def: 'TEXT' },
      { name: 'slack_bot_token', def: 'TEXT' },
      { name: 'slack_bot_user_id', def: 'TEXT' },
      { name: 'slack_channel', def: 'TEXT' },
      { name: 'slack_webhook_url', def: 'TEXT' },
      { name: 'enable_slack_notifications', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'slack_auth_provider_enabled', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'slack_connection_status', def: "TEXT DEFAULT 'not_configured'" },
      { name: 'slack_last_connected', def: 'TIMESTAMP' },
      { name: 'slack_bot_scopes', def: "TEXT[] DEFAULT '{}'" },
      { name: 'slack_bot_refresh_token', def: 'TEXT' },
      { name: 'slack_token_expires_at', def: 'TIMESTAMP' },
      // Microsoft integration fields
      { name: 'microsoft_tenant_id', def: 'TEXT' },
      { name: 'microsoft_teams_channel_id', def: 'TEXT' },
      { name: 'microsoft_teams_webhook_url', def: 'TEXT' },
      { name: 'enable_microsoft_auth', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'enable_teams_integration', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'microsoft_connection_status', def: "TEXT DEFAULT 'not_configured'" },
      { name: 'microsoft_last_connected', def: 'TIMESTAMP' },
      // Theme Configuration
      { name: 'theme_config', def: 'JSONB' },
      { name: 'enable_custom_theme', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      // Onboarding Status
      { name: 'onboarding_status', def: "TEXT NOT NULL DEFAULT 'not_started'" },
      { name: 'onboarding_current_step', def: 'TEXT' },
      { name: 'onboarding_completed_at', def: 'TIMESTAMP' },
      { name: 'onboarding_workspace_completed', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'onboarding_billing_completed', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'onboarding_roles_completed', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'onboarding_values_completed', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'onboarding_members_completed', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'onboarding_settings_completed', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      // Stripe Billing
      { name: 'stripe_customer_id', def: 'TEXT' },
      { name: 'stripe_subscription_id', def: 'TEXT' },
      { name: 'stripe_subscription_status', def: 'TEXT' },
      { name: 'stripe_price_id', def: 'TEXT' },
      { name: 'trial_ends_at', def: 'TIMESTAMP' },
      // User-Based Billing
      { name: 'billing_user_count', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'billing_price_per_user', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'billing_period_start', def: 'TIMESTAMP' },
      { name: 'billing_period_end', def: 'TIMESTAMP' },
      { name: 'pending_billing_changes', def: 'JSONB' },
      // Organization Settings
      { name: 'timezone', def: "TEXT NOT NULL DEFAULT 'America/Chicago'" },
      { name: 'checkin_due_day', def: 'INTEGER NOT NULL DEFAULT 5' },
      { name: 'checkin_due_time', def: "TEXT NOT NULL DEFAULT '17:00'" },
      { name: 'checkin_reminder_day', def: 'INTEGER' },
      { name: 'checkin_reminder_time', def: "TEXT NOT NULL DEFAULT '09:00'" },
      // Legacy fields
      { name: 'weekly_check_in_schedule', def: 'TEXT' },
      { name: 'review_reminder_day', def: 'TEXT' },
      { name: 'review_reminder_time', def: 'TEXT' },
      { name: 'is_active', def: 'BOOLEAN NOT NULL DEFAULT TRUE' },
      { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
    ]
  },
  users: {
    columns: [
      { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'username', def: 'TEXT NOT NULL' },
      { name: 'password', def: 'TEXT NOT NULL' },
      { name: 'name', def: 'TEXT NOT NULL' },
      { name: 'email', def: 'TEXT NOT NULL' },
      { name: 'role', def: "TEXT NOT NULL DEFAULT 'member'" },
      { name: 'organization_id', def: 'VARCHAR NOT NULL' },
      { name: 'team_id', def: 'VARCHAR' },
      { name: 'manager_id', def: 'VARCHAR' },
      { name: 'avatar', def: 'TEXT' },
      { name: 'is_account_owner', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      // Slack integration fields
      { name: 'slack_user_id', def: 'TEXT' },
      { name: 'slack_username', def: 'TEXT' },
      { name: 'slack_display_name', def: 'TEXT' },
      { name: 'slack_email', def: 'TEXT' },
      { name: 'slack_avatar', def: 'TEXT' },
      { name: 'slack_workspace_id', def: 'TEXT' },
      // Microsoft integration fields
      { name: 'microsoft_user_id', def: 'TEXT' },
      { name: 'microsoft_user_principal_name', def: 'TEXT' },
      { name: 'microsoft_display_name', def: 'TEXT' },
      { name: 'microsoft_email', def: 'TEXT' },
      { name: 'microsoft_avatar', def: 'TEXT' },
      { name: 'microsoft_tenant_id', def: 'TEXT' },
      { name: 'microsoft_access_token', def: 'TEXT' },
      { name: 'microsoft_refresh_token', def: 'TEXT' },
      { name: 'auth_provider', def: "TEXT NOT NULL DEFAULT 'local'" },
      // Personal preferences
      { name: 'personal_review_reminder_day', def: 'TEXT' },
      { name: 'personal_review_reminder_time', def: 'TEXT' },
      { name: 'can_view_all_teams', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'is_active', def: 'BOOLEAN NOT NULL DEFAULT TRUE' },
      { name: 'is_super_admin', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
    ]
  },
  teams: {
    columns: [
      { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'name', def: 'TEXT NOT NULL' },
      { name: 'description', def: 'TEXT' },
      { name: 'organization_id', def: 'VARCHAR NOT NULL' },
      { name: 'leader_id', def: 'VARCHAR' },
      { name: 'parent_team_id', def: 'VARCHAR' },
      { name: 'team_type', def: "TEXT NOT NULL DEFAULT 'team'" },
      { name: 'depth', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'path', def: 'TEXT' },
      { name: 'is_active', def: 'BOOLEAN NOT NULL DEFAULT TRUE' },
      { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
    ]
  },
  checkins: {
    columns: [
      { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'user_id', def: 'VARCHAR NOT NULL' },
      { name: 'organization_id', def: 'VARCHAR NOT NULL' },
      { name: 'week_of', def: 'TIMESTAMP NOT NULL' },
      { name: 'overall_mood', def: 'INTEGER NOT NULL' },
      { name: 'responses', def: 'JSONB NOT NULL DEFAULT \'{}\'::jsonb' },
      { name: 'response_emojis', def: 'JSONB NOT NULL DEFAULT \'{}\'::jsonb' },
      { name: 'response_flags', def: 'JSONB NOT NULL DEFAULT \'{}\'::jsonb' },
      { name: 'winning_next_week', def: 'TEXT' },
      { name: 'is_complete', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'submitted_at', def: 'TIMESTAMP' },
      { name: 'due_date', def: 'TIMESTAMP NOT NULL' },
      { name: 'submitted_on_time', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'review_status', def: "TEXT NOT NULL DEFAULT 'pending'" },
      { name: 'reviewed_by', def: 'VARCHAR' },
      { name: 'reviewed_at', def: 'TIMESTAMP' },
      { name: 'review_due_date', def: 'TIMESTAMP NOT NULL' },
      { name: 'reviewed_on_time', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'review_comments', def: 'TEXT' },
      { name: 'response_comments', def: 'JSONB NOT NULL DEFAULT \'{}\'::jsonb' },
      { name: 'add_to_one_on_one', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'flag_for_follow_up', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
    ]
  },
  question_categories: {
    columns: [
      { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'name', def: 'TEXT NOT NULL' },
      { name: 'description', def: 'TEXT' },
      { name: 'icon', def: 'TEXT' },
      { name: 'order', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'is_default', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
    ]
  },
  question_bank: {
    columns: [
      { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'text', def: 'TEXT NOT NULL' },
      { name: 'category_id', def: 'VARCHAR NOT NULL' },
      { name: 'description', def: 'TEXT' },
      { name: 'tags', def: "TEXT[] NOT NULL DEFAULT '{}'" },
      { name: 'usage_count', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'is_system', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'contributed_by', def: 'VARCHAR' },
      { name: 'contributed_by_org', def: 'VARCHAR' },
      { name: 'is_approved', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
    ]
  },
  questions: {
    columns: [
      { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'text', def: 'TEXT NOT NULL' },
      { name: 'organization_id', def: 'VARCHAR NOT NULL' },
      { name: 'created_by', def: 'VARCHAR NOT NULL' },
      { name: 'category_id', def: 'VARCHAR' },
      { name: 'bank_question_id', def: 'VARCHAR' },
      { name: 'assigned_to_user_id', def: 'VARCHAR' },
      { name: 'team_id', def: 'VARCHAR' },
      { name: 'is_from_bank', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'is_active', def: 'BOOLEAN NOT NULL DEFAULT TRUE' },
      { name: 'order', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'add_to_bank', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
    ]
  },
  team_question_settings: {
    columns: [
      { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'team_id', def: 'VARCHAR NOT NULL' },
      { name: 'organization_id', def: 'VARCHAR NOT NULL' },
      { name: 'question_id', def: 'VARCHAR NOT NULL' },
      { name: 'is_disabled', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'disabled_by', def: 'VARCHAR' },
      { name: 'disabled_at', def: 'TIMESTAMP' },
      { name: 'reason', def: 'TEXT' },
      { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' },
      { name: 'updated_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
    ]
  },
  wins: {
    columns: [
      { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'title', def: 'TEXT NOT NULL' },
      { name: 'description', def: 'TEXT NOT NULL' },
      { name: 'user_id', def: 'VARCHAR NOT NULL' },
      { name: 'organization_id', def: 'VARCHAR NOT NULL' },
      { name: 'nominated_by', def: 'VARCHAR' },
      { name: 'is_public', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'slack_message_id', def: 'TEXT' },
      { name: 'values', def: "TEXT[] NOT NULL DEFAULT '{}'" },
      { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
    ]
  },
  comments: {
    columns: [
      { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'checkin_id', def: 'VARCHAR NOT NULL' },
      { name: 'user_id', def: 'VARCHAR NOT NULL' },
      { name: 'organization_id', def: 'VARCHAR NOT NULL' },
      { name: 'content', def: 'TEXT NOT NULL' },
      { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
    ]
  },
  shoutouts: {
    columns: [
      { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'from_user_id', def: 'VARCHAR NOT NULL' },
      { name: 'to_user_id', def: 'VARCHAR' },  // Nullable for team shoutouts
      { name: 'to_team_id', def: 'VARCHAR' },  // Nullable for individual shoutouts
      { name: 'organization_id', def: 'VARCHAR NOT NULL' },
      { name: 'message', def: 'TEXT NOT NULL' },
      { name: 'values', def: "TEXT[] NOT NULL DEFAULT '{}'" },
      { name: 'is_public', def: 'BOOLEAN NOT NULL DEFAULT TRUE' },
      { name: 'slack_message_id', def: 'TEXT' },
      { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
    ]
  },
  vacations: {
    columns: [
      { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'organization_id', def: 'VARCHAR NOT NULL' },
      { name: 'user_id', def: 'VARCHAR NOT NULL' },
      { name: 'week_of', def: 'TIMESTAMP NOT NULL' },
      { name: 'note', def: 'TEXT' },
      { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
    ]
  },
  notifications: {
    columns: [
      { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'user_id', def: 'VARCHAR NOT NULL' },
      { name: 'organization_id', def: 'VARCHAR NOT NULL' },
      { name: 'type', def: 'TEXT NOT NULL' },
      { name: 'title', def: 'TEXT NOT NULL' },
      { name: 'message', def: 'TEXT NOT NULL' },
      { name: 'data', def: "JSONB NOT NULL DEFAULT '{}'" },
      { name: 'read', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'read_at', def: 'TIMESTAMP' },
      { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
    ]
  },
  tours: {
    columns: [
      { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'user_id', def: 'VARCHAR NOT NULL' },
      { name: 'organization_id', def: 'VARCHAR NOT NULL' },
      { name: 'tour_id', def: 'VARCHAR NOT NULL' },
      { name: 'status', def: "TEXT NOT NULL DEFAULT 'not_started'" },
      { name: 'current_step', def: 'INTEGER DEFAULT 0' },
      { name: 'completed_steps', def: "TEXT[] DEFAULT '{}'" },
      { name: 'started_at', def: 'TIMESTAMP' },
      { name: 'completed_at', def: 'TIMESTAMP' },
      { name: 'skipped_at', def: 'TIMESTAMP' },
      { name: 'last_interaction', def: 'TIMESTAMP' },
      { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' },
      { name: 'updated_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
    ]
  },
  team_goals: {
    columns: [
      { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'organization_id', def: 'VARCHAR NOT NULL' },
      { name: 'team_id', def: 'VARCHAR' },
      { name: 'title', def: 'TEXT NOT NULL' },
      { name: 'description', def: 'TEXT' },
      { name: 'target_value', def: 'INTEGER NOT NULL' },
      { name: 'current_value', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'goal_type', def: 'TEXT NOT NULL' },
      { name: 'metric', def: 'TEXT NOT NULL' },
      { name: 'prize', def: 'TEXT' },
      { name: 'start_date', def: 'TIMESTAMP NOT NULL' },
      { name: 'end_date', def: 'TIMESTAMP NOT NULL' },
      { name: 'status', def: "TEXT NOT NULL DEFAULT 'active'" },
      { name: 'completed_at', def: 'TIMESTAMP' },
      { name: 'created_by', def: 'VARCHAR NOT NULL' },
      { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' },
      { name: 'updated_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
    ]
  },
  // Analytics and metrics tables
  pulse_metrics_daily: {
    columns: [
      { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'organization_id', def: 'VARCHAR NOT NULL' },
      { name: 'metric_date', def: 'DATE NOT NULL' },
      { name: 'total_checkins', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'average_mood', def: 'NUMERIC(3,2)' },
      { name: 'mood_1_count', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'mood_2_count', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'mood_3_count', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'mood_4_count', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'mood_5_count', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'unique_users', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'team_breakdown', def: "JSONB NOT NULL DEFAULT '{}'" },
      { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
    ]
  },
  shoutout_metrics_daily: {
    columns: [
      { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'organization_id', def: 'VARCHAR NOT NULL' },
      { name: 'metric_date', def: 'DATE DEFAULT CURRENT_DATE' },
      { name: 'total_shoutouts', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'public_shoutouts', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'private_shoutouts', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'unique_senders', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'unique_receivers', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'value_counts', def: "JSONB NOT NULL DEFAULT '{}'" },
      { name: 'top_senders', def: "JSONB NOT NULL DEFAULT '[]'" },
      { name: 'top_receivers', def: "JSONB NOT NULL DEFAULT '[]'" },
      { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
    ]
  },
  compliance_metrics_daily: {
    columns: [
      { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'organization_id', def: 'VARCHAR NOT NULL' },
      { name: 'metric_date', def: 'DATE NOT NULL' },
      { name: 'total_due', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'on_time_submissions', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'late_submissions', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'missing_submissions', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'on_time_reviews', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'late_reviews', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'pending_reviews', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'team_breakdown', def: "JSONB NOT NULL DEFAULT '{}'" },
      { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
    ]
  },
  aggregation_watermarks: {
    columns: [
      { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'organization_id', def: 'VARCHAR NOT NULL' },
      { name: 'aggregation_type', def: 'TEXT NOT NULL' },
      { name: 'last_processed_date', def: 'DATE NOT NULL' },
      { name: 'last_processed_id', def: 'VARCHAR' },
      { name: 'updated_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
    ]
  },
  // Billing tables
  billing_events: {
    columns: [
      { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'organization_id', def: 'VARCHAR NOT NULL' },
      { name: 'event_type', def: 'TEXT NOT NULL' },
      { name: 'description', def: 'TEXT' },
      { name: 'user_count', def: 'INTEGER' },
      { name: 'price_per_user', def: 'INTEGER' },
      { name: 'total_amount', def: 'INTEGER' },
      { name: 'stripe_event_id', def: 'TEXT' },
      { name: 'metadata', def: "JSONB NOT NULL DEFAULT '{}'" },
      { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
    ]
  },
  // Auth provider tables
  organization_auth_providers: {
    columns: [
      { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'organization_id', def: 'VARCHAR NOT NULL' },
      { name: 'provider', def: 'TEXT NOT NULL' },
      { name: 'provider_org_id', def: 'TEXT' },
      { name: 'provider_org_name', def: 'TEXT' },
      { name: 'config', def: "JSONB NOT NULL DEFAULT '{}'" },
      { name: 'enabled', def: 'BOOLEAN NOT NULL DEFAULT TRUE' },
      { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' },
      { name: 'updated_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
    ]
  },
  user_identities: {
    columns: [
      { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'user_id', def: 'VARCHAR NOT NULL' },
      { name: 'provider', def: 'TEXT NOT NULL' },
      { name: 'provider_user_id', def: 'TEXT NOT NULL' },
      { name: 'provider_email', def: 'TEXT' },
      { name: 'profile', def: "JSONB NOT NULL DEFAULT '{}'" },
      { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
    ]
  },
  password_reset_tokens: {
    columns: [
      { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'user_id', def: 'VARCHAR NOT NULL' },
      { name: 'token', def: 'TEXT NOT NULL UNIQUE' },
      { name: 'expires_at', def: 'TIMESTAMP NOT NULL' },
      { name: 'used', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
    ]
  },
  // Dashboard configuration tables
  dashboard_configs: {
    columns: [
      { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'organization_id', def: 'VARCHAR NOT NULL' },
      { name: 'user_id', def: 'VARCHAR' },
      { name: 'role', def: 'TEXT' },
      { name: 'is_default', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'layout', def: "JSONB NOT NULL DEFAULT '[]'" },
      { name: 'theme', def: "JSONB DEFAULT '{}'" },
      { name: 'created_by', def: 'VARCHAR NOT NULL' },
      { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' },
      { name: 'updated_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
    ]
  },
  dashboard_widget_templates: {
    columns: [
      { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'name', def: 'TEXT NOT NULL' },
      { name: 'description', def: 'TEXT' },
      { name: 'category', def: 'TEXT NOT NULL' },
      { name: 'component', def: 'TEXT NOT NULL' },
      { name: 'default_config', def: "JSONB NOT NULL DEFAULT '{}'" },
      { name: 'min_width', def: 'INTEGER DEFAULT 1' },
      { name: 'min_height', def: 'INTEGER DEFAULT 1' },
      { name: 'max_width', def: 'INTEGER' },
      { name: 'max_height', def: 'INTEGER' },
      { name: 'required_features', def: "TEXT[] DEFAULT '{}'" },
      { name: 'required_role', def: 'TEXT' },
      { name: 'is_active', def: 'BOOLEAN NOT NULL DEFAULT TRUE' },
      { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
    ]
  },
  dashboard_widget_configs: {
    columns: [
      { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'dashboard_id', def: 'VARCHAR NOT NULL' },
      { name: 'template_id', def: 'VARCHAR NOT NULL' },
      { name: 'position', def: 'JSONB NOT NULL' },
      { name: 'size', def: 'JSONB NOT NULL' },
      { name: 'config', def: "JSONB NOT NULL DEFAULT '{}'" },
      { name: 'is_visible', def: 'BOOLEAN NOT NULL DEFAULT TRUE' },
      { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' },
      { name: 'updated_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
    ]
  },
  // One-on-One and KRA tables
  one_on_ones: {
    columns: [
      { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'organization_id', def: 'VARCHAR NOT NULL' },
      { name: 'participant_one_id', def: 'VARCHAR NOT NULL' },
      { name: 'participant_two_id', def: 'VARCHAR NOT NULL' },
      { name: 'scheduled_at', def: 'TIMESTAMP NOT NULL' },
      { name: 'status', def: "TEXT NOT NULL DEFAULT 'scheduled'" },
      { name: 'agenda', def: 'TEXT' },
      { name: 'notes', def: 'TEXT' },
      { name: 'location', def: 'TEXT' },
      { name: 'is_online_meeting', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'meeting_link', def: 'TEXT' },
      { name: 'duration', def: 'INTEGER NOT NULL DEFAULT 60' },
      { name: 'started_at', def: 'TIMESTAMP' },
      { name: 'ended_at', def: 'TIMESTAMP' },
      { name: 'is_recurring', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'recurrence_series_id', def: 'TEXT' },
      { name: 'recurrence_pattern', def: 'TEXT' },
      { name: 'recurrence_interval', def: 'INTEGER DEFAULT 1' },
      { name: 'recurrence_end_date', def: 'TIMESTAMP' },
      { name: 'recurrence_end_count', def: 'INTEGER' },
      { name: 'is_recurrence_template', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'created_by', def: 'VARCHAR NOT NULL' },
      { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' },
      { name: 'cancelled_at', def: 'TIMESTAMP' },
      { name: 'cancelled_by', def: 'VARCHAR' },
      { name: 'cancellation_reason', def: 'TEXT' }
    ]
  },
  kra_templates: {
    columns: [
      { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'organization_id', def: 'VARCHAR' },
      { name: 'name', def: 'TEXT NOT NULL' },
      { name: 'description', def: 'TEXT' },
      { name: 'category', def: 'TEXT NOT NULL' },
      { name: 'criteria', def: 'JSONB NOT NULL' },
      { name: 'is_system', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'is_active', def: 'BOOLEAN NOT NULL DEFAULT TRUE' },
      { name: 'created_by', def: 'VARCHAR' },
      { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
    ]
  },
  user_kras: {
    columns: [
      { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'organization_id', def: 'VARCHAR NOT NULL' },
      { name: 'user_id', def: 'VARCHAR NOT NULL' },
      { name: 'template_id', def: 'VARCHAR' },
      { name: 'name', def: 'TEXT NOT NULL' },
      { name: 'description', def: 'TEXT' },
      { name: 'criteria', def: 'JSONB NOT NULL' },
      { name: 'is_active', def: 'BOOLEAN NOT NULL DEFAULT TRUE' },
      { name: 'quarter', def: 'TEXT NOT NULL' },
      { name: 'year', def: 'INTEGER NOT NULL' },
      { name: 'self_rating', def: 'INTEGER' },
      { name: 'self_note', def: 'TEXT' },
      { name: 'manager_rating', def: 'INTEGER' },
      { name: 'manager_note', def: 'TEXT' },
      { name: 'finalized', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'finalized_at', def: 'TIMESTAMP' },
      { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' },
      { name: 'updated_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
    ]
  },
  action_items: {
    columns: [
      { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'organization_id', def: 'VARCHAR NOT NULL' },
      { name: 'one_on_one_id', def: 'VARCHAR NOT NULL' },
      { name: 'title', def: 'TEXT NOT NULL' },
      { name: 'description', def: 'TEXT' },
      { name: 'assigned_to', def: 'VARCHAR NOT NULL' },
      { name: 'due_date', def: 'TIMESTAMP' },
      { name: 'status', def: "TEXT NOT NULL DEFAULT 'open'" },
      { name: 'notes', def: 'TEXT' },
      { name: 'carry_forward', def: 'BOOLEAN NOT NULL DEFAULT TRUE' },
      { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' },
      { name: 'completed_at', def: 'TIMESTAMP' }
    ]
  },
  kra_ratings: {
    columns: [
      { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'organization_id', def: 'VARCHAR NOT NULL' },
      { name: 'kra_id', def: 'VARCHAR NOT NULL' },
      { name: 'one_on_one_id', def: 'VARCHAR' },
      { name: 'rater_id', def: 'VARCHAR NOT NULL' },
      { name: 'rater_role', def: 'TEXT NOT NULL' },
      { name: 'rating', def: 'INTEGER NOT NULL' },
      { name: 'note', def: 'TEXT' },
      { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
    ]
  },
  kra_history: {
    columns: [
      { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'organization_id', def: 'VARCHAR NOT NULL' },
      { name: 'kra_id', def: 'VARCHAR NOT NULL' },
      { name: 'user_id', def: 'VARCHAR NOT NULL' },
      { name: 'change_type', def: 'TEXT NOT NULL' },
      { name: 'old_value', def: 'JSONB' },
      { name: 'new_value', def: 'JSONB' },
      { name: 'reason', def: 'TEXT' },
      { name: 'changed_by_id', def: 'VARCHAR NOT NULL' },
      { name: 'changed_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
    ]
  },
  // Support and other tables
  bug_reports: {
    columns: [
      { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'organization_id', def: 'VARCHAR NOT NULL' },
      { name: 'user_id', def: 'VARCHAR NOT NULL' },
      { name: 'title', def: 'TEXT NOT NULL' },
      { name: 'description', def: 'TEXT NOT NULL' },
      { name: 'category', def: "TEXT NOT NULL DEFAULT 'bug'" },
      { name: 'severity', def: "TEXT NOT NULL DEFAULT 'medium'" },
      { name: 'page_path', def: 'TEXT' },
      { name: 'metadata', def: "JSONB DEFAULT '{}'" },
      { name: 'status', def: "TEXT NOT NULL DEFAULT 'open'" },
      { name: 'resolution_note', def: 'TEXT' },
      { name: 'assigned_to', def: 'VARCHAR' },
      { name: 'screenshot_url', def: 'TEXT' },
      { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' },
      { name: 'resolved_at', def: 'TIMESTAMP' }
    ]
  },
  business_plans: {
    columns: [
      { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'name', def: 'TEXT NOT NULL' },
      { name: 'display_name', def: 'TEXT NOT NULL' },
      { name: 'description', def: 'TEXT' },
      { name: 'price', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'billing_period', def: "TEXT NOT NULL DEFAULT 'monthly'" },
      { name: 'features', def: "TEXT[] NOT NULL DEFAULT '{}'" },
      { name: 'max_users', def: 'INTEGER' },
      { name: 'max_teams', def: 'INTEGER' },
      { name: 'has_slack_integration', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'has_microsoft_integration', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'has_advanced_analytics', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'has_api_access', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'priority', def: 'INTEGER NOT NULL DEFAULT 0' },
      { name: 'is_active', def: 'BOOLEAN NOT NULL DEFAULT TRUE' },
      { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' },
      { name: 'updated_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
    ]
  },
  organization_onboarding: {
    columns: [
      { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'organization_id', def: 'VARCHAR NOT NULL' },
      { name: 'step', def: "TEXT NOT NULL DEFAULT 'signup'" },
      { name: 'is_completed', def: 'BOOLEAN NOT NULL DEFAULT FALSE' },
      { name: 'completed_steps', def: "TEXT[] NOT NULL DEFAULT '{}'" },
      { name: 'current_step_data', def: 'JSONB' },
      { name: 'started_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' },
      { name: 'completed_at', def: 'TIMESTAMP' },
      { name: 'updated_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
    ]
  },
  user_invitations: {
    columns: [
      { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'organization_id', def: 'VARCHAR NOT NULL' },
      { name: 'email', def: 'TEXT NOT NULL' },
      { name: 'name', def: 'TEXT' },
      { name: 'role', def: "TEXT NOT NULL DEFAULT 'member'" },
      { name: 'team_id', def: 'VARCHAR' },
      { name: 'invited_by', def: 'VARCHAR NOT NULL' },
      { name: 'status', def: "TEXT NOT NULL DEFAULT 'pending'" },
      { name: 'token', def: 'TEXT NOT NULL UNIQUE' },
      { name: 'expires_at', def: 'TIMESTAMP NOT NULL' },
      { name: 'accepted_at', def: 'TIMESTAMP' },
      { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
    ]
  },
  partner_applications: {
    columns: [
      { name: 'id', def: 'VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()' },
      { name: 'company_name', def: 'TEXT NOT NULL' },
      { name: 'contact_name', def: 'TEXT NOT NULL' },
      { name: 'contact_email', def: 'TEXT NOT NULL' },
      { name: 'contact_phone', def: 'TEXT' },
      { name: 'company_size', def: 'TEXT' },
      { name: 'industry', def: 'TEXT' },
      { name: 'expected_clients', def: 'TEXT' },
      { name: 'use_case', def: 'TEXT' },
      { name: 'additional_info', def: 'TEXT' },
      { name: 'status', def: "TEXT NOT NULL DEFAULT 'pending'" },
      { name: 'reviewed_by', def: 'VARCHAR' },
      { name: 'reviewed_at', def: 'TIMESTAMP' },
      { name: 'notes', def: 'TEXT' },
      { name: 'created_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' },
      { name: 'updated_at', def: 'TIMESTAMP NOT NULL DEFAULT now()' }
    ]
  }
};

/**
 * Synchronizes the database schema with the application's expected structure
 * This is the main export function that should be called during application startup
 */
export async function syncDatabaseSchema(): Promise<SyncResults> {
  const startTime = Date.now();
  const results: { [table: string]: any[] } = {};
  const errors: { [table: string]: any[] } = {};
  const summary = {
    tablesChecked: 0,
    tablesCreated: 0,
    columnsAdded: 0,
    columnsExisting: 0,
    columnsErrored: 0
  };

  console.log("🔄 DATABASE SYNCHRONIZATION: Starting automatic schema sync...");
  console.log(`📅 Timestamp: ${new Date().toISOString()}`);
  console.log(`📊 Tables to sync: ${Object.keys(tableDefinitions).length}\n`);

  try {
    // Test database connectivity first
    try {
      await db.execute(sql`SELECT 1 as test`);
      console.log("✅ Database connection verified");
    } catch (dbError: any) {
      console.error("❌ Database connection failed:", dbError.message);
      return {
        success: false,
        summary,
        errors: { connection: [{ error: dbError.message }] },
        timestamp: new Date().toISOString(),
        message: "Failed to connect to database"
      };
    }

    // Process each table
    for (const [tableName, tableConfig] of Object.entries(tableDefinitions)) {
      summary.tablesChecked++;
      results[tableName] = [];
      errors[tableName] = [];

      try {
        // Check if table exists
        const exists = await tableExists(tableName);
        
        if (!exists) {
          console.log(`⚠️  Table '${tableName}' does not exist - Creating...`);
          try {
            // Create table with primary key column only first
            const primaryCol = tableConfig.columns.find(c => c.def.includes('PRIMARY KEY'));
            if (primaryCol) {
              await db.execute(sql.raw(`CREATE TABLE IF NOT EXISTS ${tableName} (${primaryCol.name} ${primaryCol.def})`));
              summary.tablesCreated++;
              results[tableName].push({ action: "TABLE_CREATED", status: "SUCCESS" });
              console.log(`✅ Table '${tableName}' created`);
            }
          } catch (createError: any) {
            errors[tableName].push({ action: "TABLE_CREATE", error: createError.message });
            console.error(`❌ Failed to create table '${tableName}':`, createError.message);
            continue;
          }
        }
        
        // Process each column
        let columnCount = 0;
        for (const column of tableConfig.columns) {
          // Skip primary key if we just created it
          if (!exists && column.def.includes('PRIMARY KEY')) {
            continue;
          }
          
          try {
            const status = await addColumn(tableName, column.name, column.def);
            results[tableName].push({ column: column.name, status });
            
            if (status === "ADDED") {
              summary.columnsAdded++;
              columnCount++;
            } else if (status === "EXISTS") {
              summary.columnsExisting++;
            }
          } catch (colError: any) {
            summary.columnsErrored++;
            errors[tableName].push({ column: column.name, error: colError.message });
            console.error(`   ❌ Error with column '${tableName}.${column.name}':`, colError.message);
          }
        }
        
        if (columnCount > 0) {
          console.log(`   ✅ Table '${tableName}': Added ${columnCount} columns`);
        }
        
      } catch (tableError: any) {
        errors[tableName].push({ action: "TABLE_CHECK", error: tableError.message });
        console.error(`❌ Error processing table '${tableName}':`, tableError.message);
      }
    }

    // Determine if critical tables have errors
    const criticalTables = ['organizations', 'users', 'checkins', 'teams'];
    const hasCriticalErrors = criticalTables.some(table => 
      errors[table] && errors[table].length > 0
    );

    // Calculate duration
    const duration = Date.now() - startTime;

    // Log summary
    console.log("\n📊 SYNCHRONIZATION COMPLETE");
    console.log(`⏱️  Duration: ${duration}ms`);
    console.log(`📋 Tables Checked: ${summary.tablesChecked}`);
    console.log(`🆕 Tables Created: ${summary.tablesCreated}`);
    console.log(`➕ Columns Added: ${summary.columnsAdded}`);
    console.log(`✔️  Columns Existing: ${summary.columnsExisting}`);
    
    if (summary.columnsErrored > 0) {
      console.log(`⚠️  Columns with Errors: ${summary.columnsErrored}`);
    }

    // Clean up errors object (only include tables with actual errors)
    const cleanedErrors = Object.keys(errors).reduce((acc, key) => {
      if (errors[key].length > 0) acc[key] = errors[key];
      return acc;
    }, {} as any);

    const hasErrors = Object.keys(cleanedErrors).length > 0;
    
    if (hasCriticalErrors) {
      console.error("\n🚨 CRITICAL: Errors in critical tables! Application may not function properly.");
    } else if (hasErrors) {
      console.warn("\n⚠️  WARNING: Some non-critical schema sync errors occurred. Review the errors if issues arise.");
    } else {
      console.log("\n✨ SUCCESS: Database schema fully synchronized!");
    }

    return {
      success: !hasCriticalErrors, // Only fail on critical errors
      summary,
      errors: cleanedErrors,
      timestamp: new Date().toISOString(),
      message: hasCriticalErrors 
        ? "Critical table synchronization failed - application may not work properly"
        : hasErrors 
          ? "Schema synchronized with minor issues in non-critical tables"
          : "Database schema successfully synchronized"
    };
    
  } catch (error) {
    console.error("❌ DATABASE SYNC FAILED:", error);
    return {
      success: false,
      summary,
      errors: { general: [{ error: error instanceof Error ? error.message : "Unknown error" }] },
      timestamp: new Date().toISOString(),
      message: "Database synchronization failed completely"
    };
  }
}