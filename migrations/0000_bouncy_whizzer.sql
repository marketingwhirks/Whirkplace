CREATE TABLE "action_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"meeting_id" varchar,
	"one_on_one_id" varchar,
	"description" text NOT NULL,
	"assigned_to" varchar NOT NULL,
	"assigned_by" varchar NOT NULL,
	"due_date" timestamp,
	"status" text DEFAULT 'open' NOT NULL,
	"notes" text,
	"carry_forward" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "aggregation_watermarks" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"last_processed_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "aggregation_watermarks_org_unique" UNIQUE("organization_id")
);
--> statement-breakpoint
CREATE TABLE "bug_reports" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"category" text DEFAULT 'bug' NOT NULL,
	"severity" text DEFAULT 'medium' NOT NULL,
	"page_path" text,
	"metadata" jsonb DEFAULT '{}'::jsonb,
	"status" text DEFAULT 'open' NOT NULL,
	"resolution_note" text,
	"assigned_to" varchar,
	"screenshot_url" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "business_plans" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"display_name" text NOT NULL,
	"description" text,
	"price" integer DEFAULT 0 NOT NULL,
	"billing_period" text DEFAULT 'monthly' NOT NULL,
	"features" text[] DEFAULT '{}' NOT NULL,
	"max_users" integer,
	"max_teams" integer,
	"has_slack_integration" boolean DEFAULT false NOT NULL,
	"has_microsoft_integration" boolean DEFAULT false NOT NULL,
	"has_advanced_analytics" boolean DEFAULT false NOT NULL,
	"has_api_access" boolean DEFAULT false NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checkins" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"organization_id" varchar NOT NULL,
	"week_of" timestamp NOT NULL,
	"overall_mood" integer NOT NULL,
	"responses" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"response_emojis" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"response_flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"winning_next_week" text,
	"is_complete" boolean DEFAULT false NOT NULL,
	"submitted_at" timestamp,
	"due_date" timestamp NOT NULL,
	"submitted_on_time" boolean DEFAULT false NOT NULL,
	"review_status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" varchar,
	"reviewed_at" timestamp,
	"review_due_date" timestamp NOT NULL,
	"reviewed_on_time" boolean DEFAULT false NOT NULL,
	"review_comments" text,
	"response_comments" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"add_to_one_on_one" boolean DEFAULT false NOT NULL,
	"flag_for_follow_up" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "comments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checkin_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"organization_id" varchar NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compliance_metrics_daily" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"team_id" varchar,
	"bucket_date" date NOT NULL,
	"checkin_compliance_count" integer DEFAULT 0 NOT NULL,
	"checkin_on_time_count" integer DEFAULT 0 NOT NULL,
	"review_compliance_count" integer DEFAULT 0 NOT NULL,
	"review_on_time_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "compliance_metrics_org_user_bucket_date_unique" UNIQUE("organization_id","user_id","bucket_date")
);
--> statement-breakpoint
CREATE TABLE "dashboard_configs" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"organization_id" varchar NOT NULL,
	"name" text DEFAULT 'My Dashboard' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"layout" jsonb DEFAULT '{"type": "grid", "columns": 12, "rows": []}' NOT NULL,
	"widgets" jsonb DEFAULT '[]' NOT NULL,
	"theme_preferences" jsonb DEFAULT '{"colorScheme": "system", "compactMode": false}',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dashboard_widget_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category" text NOT NULL,
	"widget_type" text NOT NULL,
	"default_config" jsonb NOT NULL,
	"required_role" text DEFAULT 'member',
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discount_code_usage" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"discount_code_id" varchar NOT NULL,
	"organization_id" varchar NOT NULL,
	"user_id" varchar,
	"order_amount" integer NOT NULL,
	"discount_amount" integer NOT NULL,
	"used_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "discount_codes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"discount_type" text NOT NULL,
	"discount_value" integer NOT NULL,
	"minimum_amount" integer,
	"maximum_discount" integer,
	"usage_limit" integer,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"valid_from" timestamp NOT NULL,
	"valid_to" timestamp,
	"applicable_plans" jsonb DEFAULT '[]'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "discount_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "kra_history" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"kra_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"change_type" text NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb,
	"reason" text,
	"changed_by_id" varchar NOT NULL,
	"changed_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "kra_ratings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"kra_id" varchar NOT NULL,
	"one_on_one_id" varchar,
	"rater_id" varchar NOT NULL,
	"rater_role" text NOT NULL,
	"rating" integer NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "kra_ratings_unique" UNIQUE("kra_id","one_on_one_id","rater_id")
);
--> statement-breakpoint
CREATE TABLE "kra_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"goals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"category" text DEFAULT 'general' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"organization_id" varchar NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"type" text DEFAULT 'info' NOT NULL,
	"related_entity_type" text,
	"related_entity_id" text,
	"is_read" boolean DEFAULT false NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_assignments" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"template_id" varchar NOT NULL,
	"assigned_by" varchar NOT NULL,
	"start_date" timestamp DEFAULT now() NOT NULL,
	"target_completion_date" timestamp NOT NULL,
	"actual_completion_date" timestamp,
	"status" text DEFAULT 'in_progress' NOT NULL,
	"completion_percentage" integer DEFAULT 0 NOT NULL,
	"manager_notes" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_assignments_user_template_unique" UNIQUE("user_id","template_id")
);
--> statement-breakpoint
CREATE TABLE "onboarding_progress" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"assignment_id" varchar NOT NULL,
	"template_item_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"completed_at" timestamp,
	"notes" text,
	"manager_approval_status" text DEFAULT 'not_required',
	"approved_by" varchar,
	"approved_at" timestamp,
	"rejection_reason" text,
	"time_spent_hours" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "onboarding_progress_assignment_item_unique" UNIQUE("assignment_id","template_item_id")
);
--> statement-breakpoint
CREATE TABLE "onboarding_template_items" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"template_id" varchar NOT NULL,
	"organization_id" varchar NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"category" text,
	"estimated_hours" integer,
	"day_target" integer,
	"is_required" boolean DEFAULT true NOT NULL,
	"requires_manager_approval" boolean DEFAULT false NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"resource_links" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "onboarding_templates" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"target_role" text,
	"target_team_id" varchar,
	"duration_days" integer DEFAULT 30 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_by" varchar NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "one_on_ones" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"participant_one_id" varchar NOT NULL,
	"participant_two_id" varchar NOT NULL,
	"scheduled_at" timestamp NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"agenda" text,
	"notes" text,
	"action_items" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"duration" integer DEFAULT 30,
	"location" text,
	"is_recurring" boolean DEFAULT false NOT NULL,
	"recurrence_series_id" varchar,
	"recurrence_pattern" text,
	"recurrence_interval" integer DEFAULT 1,
	"recurrence_end_date" timestamp,
	"recurrence_end_count" integer,
	"is_recurrence_template" boolean DEFAULT false NOT NULL,
	"outlook_event_id" text,
	"meeting_url" text,
	"is_online_meeting" boolean DEFAULT false NOT NULL,
	"sync_with_outlook" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_auth_providers" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"provider" text NOT NULL,
	"provider_org_id" text,
	"provider_org_name" text,
	"client_id" text,
	"client_secret" text,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "org_auth_providers_org_provider_unique" UNIQUE("organization_id","provider")
);
--> statement-breakpoint
CREATE TABLE "organization_onboarding" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"step" text DEFAULT 'signup' NOT NULL,
	"is_completed" boolean DEFAULT false NOT NULL,
	"completed_steps" text[] DEFAULT '{}' NOT NULL,
	"current_step_data" jsonb,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"industry" text,
	"custom_values" text[] DEFAULT '{"own it","challenge it","team first","empathy for others","passion for our purpose"}' NOT NULL,
	"plan" text DEFAULT 'standard' NOT NULL,
	"discount_code" text,
	"discount_percentage" integer,
	"partner_firm_id" varchar,
	"slack_client_id" text,
	"slack_client_secret" text,
	"slack_workspace_id" text,
	"slack_channel_id" text,
	"slack_wins_channel_id" text,
	"slack_bot_token" text,
	"slack_signing_secret" text,
	"enable_slack_integration" boolean DEFAULT false NOT NULL,
	"slack_connection_status" text DEFAULT 'not_configured',
	"slack_last_connected" timestamp,
	"microsoft_client_id" text,
	"microsoft_client_secret" text,
	"microsoft_tenant_id" text,
	"microsoft_teams_webhook_url" text,
	"enable_microsoft_auth" boolean DEFAULT false NOT NULL,
	"enable_teams_integration" boolean DEFAULT false NOT NULL,
	"microsoft_connection_status" text DEFAULT 'not_configured',
	"microsoft_last_connected" timestamp,
	"theme_config" jsonb,
	"enable_custom_theme" boolean DEFAULT false NOT NULL,
	"onboarding_status" text DEFAULT 'not_started' NOT NULL,
	"onboarding_current_step" text,
	"onboarding_completed_at" timestamp,
	"onboarding_workspace_completed" boolean DEFAULT false NOT NULL,
	"onboarding_billing_completed" boolean DEFAULT false NOT NULL,
	"onboarding_roles_completed" boolean DEFAULT false NOT NULL,
	"onboarding_values_completed" boolean DEFAULT false NOT NULL,
	"onboarding_members_completed" boolean DEFAULT false NOT NULL,
	"onboarding_settings_completed" boolean DEFAULT false NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"stripe_subscription_status" text,
	"stripe_price_id" text,
	"trial_ends_at" timestamp,
	"timezone" text DEFAULT 'America/Chicago' NOT NULL,
	"weekly_check_in_schedule" text DEFAULT 'friday' NOT NULL,
	"check_in_reminder_time" text DEFAULT '09:00' NOT NULL,
	"review_reminder_day" text DEFAULT 'monday' NOT NULL,
	"review_reminder_time" text DEFAULT '16:00' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "organizations_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "partner_applications" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"company" text NOT NULL,
	"website" text,
	"expected_seats" integer,
	"partnership_type" text NOT NULL,
	"message" text,
	"status" text DEFAULT 'pending',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_firms" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"branding_config" jsonb,
	"plan" text DEFAULT 'partner' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"home_organization_id" varchar,
	"wholesale_rate" integer DEFAULT 70 NOT NULL,
	"stripe_account_id" text,
	"billing_email" text,
	"enable_cobranding" boolean DEFAULT true NOT NULL,
	"max_client_organizations" integer DEFAULT -1 NOT NULL,
	"custom_domain" text,
	CONSTRAINT "partner_firms_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "pricing_plans" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"price" integer NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"billing_period" text NOT NULL,
	"stripe_price_id" text,
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_popular" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pulse_metrics_daily" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"team_id" varchar,
	"bucket_date" date NOT NULL,
	"mood_sum" integer DEFAULT 0 NOT NULL,
	"checkin_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pulse_metrics_org_user_bucket_date_unique" UNIQUE("organization_id","user_id","bucket_date")
);
--> statement-breakpoint
CREATE TABLE "question_bank" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"text" text NOT NULL,
	"category_id" varchar NOT NULL,
	"description" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"usage_count" integer DEFAULT 0 NOT NULL,
	"is_system" boolean DEFAULT false NOT NULL,
	"contributed_by" varchar,
	"contributed_by_org" varchar,
	"is_approved" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_categories" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"order" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "questions" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"text" text NOT NULL,
	"organization_id" varchar NOT NULL,
	"created_by" varchar NOT NULL,
	"category_id" varchar,
	"bank_question_id" varchar,
	"assigned_to_user_id" varchar,
	"is_from_bank" boolean DEFAULT false NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"add_to_bank" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shoutout_metrics_daily" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"team_id" varchar,
	"bucket_date" date NOT NULL,
	"received_count" integer DEFAULT 0 NOT NULL,
	"given_count" integer DEFAULT 0 NOT NULL,
	"public_count" integer DEFAULT 0 NOT NULL,
	"private_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "shoutout_metrics_org_user_bucket_date_unique" UNIQUE("organization_id","user_id","bucket_date")
);
--> statement-breakpoint
CREATE TABLE "shoutouts" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from_user_id" varchar NOT NULL,
	"to_user_id" varchar NOT NULL,
	"message" text NOT NULL,
	"organization_id" varchar NOT NULL,
	"values" text[] DEFAULT '{}' NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"slack_message_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_settings" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key" text NOT NULL,
	"value" jsonb NOT NULL,
	"description" text,
	"category" text DEFAULT 'general' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "system_settings_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"organization_id" varchar NOT NULL,
	"leader_id" varchar,
	"parent_team_id" varchar,
	"team_type" text DEFAULT 'team' NOT NULL,
	"depth" integer DEFAULT 0 NOT NULL,
	"path" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_identities" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"organization_id" varchar NOT NULL,
	"provider" text NOT NULL,
	"provider_user_id" text NOT NULL,
	"provider_email" text,
	"provider_username" text,
	"provider_display_name" text,
	"provider_avatar" text,
	"profile" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp,
	"last_login_at" timestamp,
	"created_at" timestamp DEFAULT gen_random_uuid() NOT NULL,
	CONSTRAINT "user_identities_user_provider_unique" UNIQUE("user_id","provider"),
	CONSTRAINT "user_identities_org_provider_user_unique" UNIQUE("organization_id","provider","provider_user_id")
);
--> statement-breakpoint
CREATE TABLE "user_invitations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"email" text NOT NULL,
	"name" text,
	"role" text DEFAULT 'member' NOT NULL,
	"team_id" varchar,
	"invited_by" varchar NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"token" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"accepted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_invitations_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user_kras" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"template_id" varchar,
	"name" text NOT NULL,
	"description" text,
	"goals" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assigned_by" varchar NOT NULL,
	"start_date" timestamp NOT NULL,
	"end_date" timestamp,
	"status" text DEFAULT 'active' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"last_updated" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_tours" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" varchar NOT NULL,
	"organization_id" varchar NOT NULL,
	"tour_id" text NOT NULL,
	"status" text DEFAULT 'not_started' NOT NULL,
	"current_step" integer DEFAULT 0 NOT NULL,
	"completed_at" timestamp,
	"skipped_at" timestamp,
	"last_shown_at" timestamp,
	"version" text DEFAULT '1.0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_tours_user_tour_version_unique" UNIQUE("user_id","tour_id","version")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"organization_id" varchar NOT NULL,
	"team_id" varchar,
	"manager_id" varchar,
	"avatar" text,
	"is_account_owner" boolean DEFAULT false NOT NULL,
	"slack_user_id" text,
	"slack_username" text,
	"slack_display_name" text,
	"slack_email" text,
	"slack_avatar" text,
	"slack_workspace_id" text,
	"microsoft_user_id" text,
	"microsoft_user_principal_name" text,
	"microsoft_display_name" text,
	"microsoft_email" text,
	"microsoft_avatar" text,
	"microsoft_tenant_id" text,
	"microsoft_access_token" text,
	"microsoft_refresh_token" text,
	"auth_provider" text DEFAULT 'local' NOT NULL,
	"personal_review_reminder_day" text,
	"personal_review_reminder_time" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_super_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_org_unique" UNIQUE("organization_id","username"),
	CONSTRAINT "users_email_org_unique" UNIQUE("organization_id","email"),
	CONSTRAINT "users_org_slack_unique" UNIQUE("organization_id","slack_user_id")
);
--> statement-breakpoint
CREATE TABLE "vacations" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" varchar NOT NULL,
	"user_id" varchar NOT NULL,
	"week_of" timestamp NOT NULL,
	"note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "vacations_org_user_week_of_unique" UNIQUE("organization_id","user_id","week_of")
);
--> statement-breakpoint
CREATE TABLE "wins" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"user_id" varchar NOT NULL,
	"organization_id" varchar NOT NULL,
	"nominated_by" varchar,
	"is_public" boolean DEFAULT false NOT NULL,
	"slack_message_id" text,
	"values" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "organization_onboarding" ADD CONSTRAINT "organization_onboarding_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_invitations" ADD CONSTRAINT "user_invitations_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "action_items_meeting_idx" ON "action_items" USING btree ("meeting_id");--> statement-breakpoint
CREATE INDEX "action_items_one_on_one_idx" ON "action_items" USING btree ("one_on_one_id");--> statement-breakpoint
CREATE INDEX "action_items_assigned_idx" ON "action_items" USING btree ("organization_id","assigned_to","status");--> statement-breakpoint
CREATE INDEX "action_items_status_idx" ON "action_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "action_items_due_date_idx" ON "action_items" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "aggregation_watermarks_org_idx" ON "aggregation_watermarks" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "bug_reports_org_status_idx" ON "bug_reports" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "bug_reports_org_created_at_idx" ON "bug_reports" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "checkins_org_week_of_idx" ON "checkins" USING btree ("organization_id","week_of");--> statement-breakpoint
CREATE INDEX "checkins_org_user_week_of_idx" ON "checkins" USING btree ("organization_id","user_id","week_of");--> statement-breakpoint
CREATE INDEX "checkins_org_review_status_idx" ON "checkins" USING btree ("organization_id","review_status");--> statement-breakpoint
CREATE INDEX "checkins_reviewed_by_date_idx" ON "checkins" USING btree ("reviewed_by","reviewed_at");--> statement-breakpoint
CREATE INDEX "checkins_due_date_idx" ON "checkins" USING btree ("due_date");--> statement-breakpoint
CREATE INDEX "checkins_org_submitted_on_time_idx" ON "checkins" USING btree ("organization_id","submitted_on_time");--> statement-breakpoint
CREATE INDEX "checkins_org_reviewed_on_time_idx" ON "checkins" USING btree ("organization_id","reviewed_on_time");--> statement-breakpoint
CREATE INDEX "compliance_metrics_org_bucket_date_idx" ON "compliance_metrics_daily" USING btree ("organization_id","bucket_date");--> statement-breakpoint
CREATE INDEX "compliance_metrics_org_user_bucket_date_idx" ON "compliance_metrics_daily" USING btree ("organization_id","user_id","bucket_date");--> statement-breakpoint
CREATE INDEX "compliance_metrics_org_team_bucket_date_idx" ON "compliance_metrics_daily" USING btree ("organization_id","team_id","bucket_date");--> statement-breakpoint
CREATE INDEX "dashboard_configs_user_idx" ON "dashboard_configs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "dashboard_configs_org_idx" ON "dashboard_configs" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "widget_templates_category_idx" ON "dashboard_widget_templates" USING btree ("category");--> statement-breakpoint
CREATE INDEX "widget_templates_type_idx" ON "dashboard_widget_templates" USING btree ("widget_type");--> statement-breakpoint
CREATE INDEX "discount_usage_code_idx" ON "discount_code_usage" USING btree ("discount_code_id");--> statement-breakpoint
CREATE INDEX "discount_usage_org_idx" ON "discount_code_usage" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "discount_codes_code_idx" ON "discount_codes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "discount_codes_validity_idx" ON "discount_codes" USING btree ("valid_from","valid_to");--> statement-breakpoint
CREATE INDEX "kra_history_kra_idx" ON "kra_history" USING btree ("kra_id");--> statement-breakpoint
CREATE INDEX "kra_history_user_idx" ON "kra_history" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "kra_history_changed_by_idx" ON "kra_history" USING btree ("changed_by_id");--> statement-breakpoint
CREATE INDEX "kra_history_changed_at_idx" ON "kra_history" USING btree ("changed_at");--> statement-breakpoint
CREATE INDEX "kra_ratings_kra_idx" ON "kra_ratings" USING btree ("kra_id");--> statement-breakpoint
CREATE INDEX "kra_ratings_one_on_one_idx" ON "kra_ratings" USING btree ("one_on_one_id");--> statement-breakpoint
CREATE INDEX "kra_ratings_rater_idx" ON "kra_ratings" USING btree ("rater_id");--> statement-breakpoint
CREATE INDEX "kra_ratings_latest_supervisor_idx" ON "kra_ratings" USING btree ("kra_id","rater_role","created_at");--> statement-breakpoint
CREATE INDEX "kra_templates_org_category_idx" ON "kra_templates" USING btree ("organization_id","category");--> statement-breakpoint
CREATE INDEX "kra_templates_active_idx" ON "kra_templates" USING btree ("is_active");--> statement-breakpoint
CREATE INDEX "notifications_org_user_idx" ON "notifications" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "notifications_org_user_unread_idx" ON "notifications" USING btree ("organization_id","user_id","is_read");--> statement-breakpoint
CREATE INDEX "notifications_created_at_idx" ON "notifications" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "onboarding_assignments_org_idx" ON "onboarding_assignments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "onboarding_assignments_org_user_idx" ON "onboarding_assignments" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "onboarding_assignments_org_status_idx" ON "onboarding_assignments" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "onboarding_assignments_user_template_idx" ON "onboarding_assignments" USING btree ("user_id","template_id");--> statement-breakpoint
CREATE INDEX "onboarding_assignments_assigned_by_idx" ON "onboarding_assignments" USING btree ("assigned_by");--> statement-breakpoint
CREATE INDEX "onboarding_progress_org_idx" ON "onboarding_progress" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "onboarding_progress_assignment_idx" ON "onboarding_progress" USING btree ("assignment_id");--> statement-breakpoint
CREATE INDEX "onboarding_progress_user_idx" ON "onboarding_progress" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "onboarding_progress_status_idx" ON "onboarding_progress" USING btree ("status");--> statement-breakpoint
CREATE INDEX "onboarding_progress_approval_status_idx" ON "onboarding_progress" USING btree ("manager_approval_status");--> statement-breakpoint
CREATE INDEX "onboarding_progress_approved_by_idx" ON "onboarding_progress" USING btree ("approved_by");--> statement-breakpoint
CREATE INDEX "onboarding_template_items_template_idx" ON "onboarding_template_items" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "onboarding_template_items_template_order_idx" ON "onboarding_template_items" USING btree ("template_id","order_index");--> statement-breakpoint
CREATE INDEX "onboarding_template_items_category_idx" ON "onboarding_template_items" USING btree ("category");--> statement-breakpoint
CREATE INDEX "onboarding_template_items_day_target_idx" ON "onboarding_template_items" USING btree ("day_target");--> statement-breakpoint
CREATE INDEX "onboarding_templates_org_idx" ON "onboarding_templates" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "onboarding_templates_org_active_idx" ON "onboarding_templates" USING btree ("organization_id","is_active");--> statement-breakpoint
CREATE INDEX "onboarding_templates_org_default_idx" ON "onboarding_templates" USING btree ("organization_id","is_default");--> statement-breakpoint
CREATE INDEX "onboarding_templates_target_team_idx" ON "onboarding_templates" USING btree ("target_team_id");--> statement-breakpoint
CREATE INDEX "one_on_ones_org_idx" ON "one_on_ones" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "one_on_ones_participants_idx" ON "one_on_ones" USING btree ("participant_one_id","participant_two_id");--> statement-breakpoint
CREATE INDEX "one_on_ones_scheduled_idx" ON "one_on_ones" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "one_on_ones_recurrence_series_idx" ON "one_on_ones" USING btree ("recurrence_series_id");--> statement-breakpoint
CREATE INDEX "one_on_ones_recurrence_template_idx" ON "one_on_ones" USING btree ("is_recurrence_template");--> statement-breakpoint
CREATE INDEX "org_auth_providers_org_provider_idx" ON "organization_auth_providers" USING btree ("organization_id","provider");--> statement-breakpoint
CREATE INDEX "org_auth_providers_provider_org_id_idx" ON "organization_auth_providers" USING btree ("provider_org_id");--> statement-breakpoint
CREATE INDEX "org_auth_providers_org_enabled_idx" ON "organization_auth_providers" USING btree ("organization_id","enabled");--> statement-breakpoint
CREATE INDEX "onboarding_organization_idx" ON "organization_onboarding" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "onboarding_step_idx" ON "organization_onboarding" USING btree ("step");--> statement-breakpoint
CREATE INDEX "partner_firms_slug_idx" ON "partner_firms" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "partner_firms_home_org_idx" ON "partner_firms" USING btree ("home_organization_id");--> statement-breakpoint
CREATE INDEX "pricing_plans_active_sort_idx" ON "pricing_plans" USING btree ("is_active","sort_order");--> statement-breakpoint
CREATE INDEX "pulse_metrics_org_bucket_date_idx" ON "pulse_metrics_daily" USING btree ("organization_id","bucket_date");--> statement-breakpoint
CREATE INDEX "pulse_metrics_org_user_bucket_date_idx" ON "pulse_metrics_daily" USING btree ("organization_id","user_id","bucket_date");--> statement-breakpoint
CREATE INDEX "pulse_metrics_org_team_bucket_date_idx" ON "pulse_metrics_daily" USING btree ("organization_id","team_id","bucket_date");--> statement-breakpoint
CREATE INDEX "question_bank_category_idx" ON "question_bank" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "question_bank_approved_idx" ON "question_bank" USING btree ("is_approved");--> statement-breakpoint
CREATE INDEX "shoutout_metrics_org_bucket_date_idx" ON "shoutout_metrics_daily" USING btree ("organization_id","bucket_date");--> statement-breakpoint
CREATE INDEX "shoutout_metrics_org_user_bucket_date_idx" ON "shoutout_metrics_daily" USING btree ("organization_id","user_id","bucket_date");--> statement-breakpoint
CREATE INDEX "shoutout_metrics_org_team_bucket_date_idx" ON "shoutout_metrics_daily" USING btree ("organization_id","team_id","bucket_date");--> statement-breakpoint
CREATE INDEX "shoutouts_org_user_created_at_idx" ON "shoutouts" USING btree ("organization_id","from_user_id","created_at");--> statement-breakpoint
CREATE INDEX "shoutouts_org_to_user_created_at_idx" ON "shoutouts" USING btree ("organization_id","to_user_id","created_at");--> statement-breakpoint
CREATE INDEX "system_settings_category_idx" ON "system_settings" USING btree ("category");--> statement-breakpoint
CREATE INDEX "teams_parent_team_idx" ON "teams" USING btree ("parent_team_id");--> statement-breakpoint
CREATE INDEX "teams_path_idx" ON "teams" USING btree ("path");--> statement-breakpoint
CREATE INDEX "teams_team_type_idx" ON "teams" USING btree ("team_type");--> statement-breakpoint
CREATE INDEX "user_identities_user_provider_idx" ON "user_identities" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "user_identities_org_provider_user_idx" ON "user_identities" USING btree ("organization_id","provider","provider_user_id");--> statement-breakpoint
CREATE INDEX "user_identities_provider_email_idx" ON "user_identities" USING btree ("provider_email");--> statement-breakpoint
CREATE INDEX "user_identities_last_login_idx" ON "user_identities" USING btree ("last_login_at");--> statement-breakpoint
CREATE INDEX "invitations_organization_idx" ON "user_invitations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitations_email_idx" ON "user_invitations" USING btree ("email");--> statement-breakpoint
CREATE INDEX "invitations_token_idx" ON "user_invitations" USING btree ("token");--> statement-breakpoint
CREATE INDEX "invitations_status_idx" ON "user_invitations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "user_kras_user_idx" ON "user_kras" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "user_kras_assigned_by_idx" ON "user_kras" USING btree ("assigned_by");--> statement-breakpoint
CREATE INDEX "user_kras_status_idx" ON "user_kras" USING btree ("status");--> statement-breakpoint
CREATE INDEX "user_kras_template_idx" ON "user_kras" USING btree ("template_id");--> statement-breakpoint
CREATE INDEX "user_tours_user_idx" ON "user_tours" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "user_tours_org_idx" ON "user_tours" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "user_tours_tour_idx" ON "user_tours" USING btree ("tour_id");--> statement-breakpoint
CREATE INDEX "user_tours_user_tour_idx" ON "user_tours" USING btree ("user_id","tour_id");--> statement-breakpoint
CREATE INDEX "users_slack_user_id_idx" ON "users" USING btree ("slack_user_id");--> statement-breakpoint
CREATE INDEX "users_slack_username_idx" ON "users" USING btree ("slack_username");--> statement-breakpoint
CREATE INDEX "users_org_slack_workspace_idx" ON "users" USING btree ("organization_id","slack_workspace_id");--> statement-breakpoint
CREATE INDEX "users_auth_provider_idx" ON "users" USING btree ("auth_provider");--> statement-breakpoint
CREATE INDEX "vacations_org_idx" ON "vacations" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "vacations_org_user_idx" ON "vacations" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE INDEX "vacations_org_week_of_idx" ON "vacations" USING btree ("organization_id","week_of");--> statement-breakpoint
CREATE INDEX "vacations_org_user_week_of_idx" ON "vacations" USING btree ("organization_id","user_id","week_of");