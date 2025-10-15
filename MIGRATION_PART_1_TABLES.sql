-- PART 1: CREATE MISSING TABLES ONLY
-- Select all and run

CREATE TABLE IF NOT EXISTS question_categories (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS kra_categories (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

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

CREATE TABLE IF NOT EXISTS team_question_settings (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id VARCHAR NOT NULL,
  question_id VARCHAR NOT NULL,
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  "order" INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(team_id, question_id)
);

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

-- Verify tables were created
SELECT 'Tables Created' as status,
  (SELECT COUNT(*) FROM information_schema.tables WHERE table_name IN ('question_categories', 'kra_categories', 'question_bank', 'kra_templates', 'user_kras', 'team_question_settings', 'one_on_ones')) as table_count;