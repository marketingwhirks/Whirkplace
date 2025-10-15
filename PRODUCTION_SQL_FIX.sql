-- =====================================================
-- PRODUCTION DATABASE FIX - COPY AND PASTE THIS
-- =====================================================

-- PART 1: CREATE MISSING TABLES
-- Run this first to create the tables that don't exist
-- -----------------------------------------------------

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

-- PART 2: CREATE OR UPDATE ORGANIZATION
-- Run this to ensure Whirkplace organization exists
-- -----------------------------------------------------

INSERT INTO organizations (id, name, slug, is_active, created_at, updated_at, billing_price_per_user, billing_interval, plan_type)
VALUES (
  gen_random_uuid(),
  'Whirkplace', 
  'whirkplace', 
  true, 
  NOW(), 
  NOW(),
  2000,
  'monthly',
  'enterprise'
)
ON CONFLICT (slug) DO UPDATE SET 
  is_active = true,
  plan_type = 'enterprise',
  updated_at = NOW();

-- PART 3: GET THE ORGANIZATION ID
-- Run this and SAVE THE ID that appears
-- -----------------------------------------------------

SELECT id FROM organizations WHERE slug = 'whirkplace';

-- PART 4: CREATE OR UPDATE SUPER ADMIN
-- Replace XXX-YOUR-ORG-ID-XXX with the ID from Part 3
-- -----------------------------------------------------

INSERT INTO users (
  id, 
  email, 
  name, 
  username, 
  organization_id, 
  role, 
  is_super_admin, 
  is_account_owner, 
  is_active, 
  created_at, 
  updated_at, 
  auth_provider,
  password
)
VALUES (
  gen_random_uuid(),
  'mpatrick@whirks.com',
  'Matthew Patrick',
  'mpatrickSA',
  'XXX-YOUR-ORG-ID-XXX',  -- REPLACE THIS WITH ID FROM PART 3
  'admin',
  true,
  true,
  true,
  NOW(),
  NOW(),
  'local',
  '$2b$10$ZKXHwYqHYpQ7KdZwzRwHauR0c5Wy0XhqEfYhF6vVxX6OkIXzM2uHa'
)
ON CONFLICT (email) DO UPDATE SET 
  organization_id = 'XXX-YOUR-ORG-ID-XXX',  -- REPLACE THIS WITH ID FROM PART 3
  is_super_admin = true,
  is_account_owner = true,
  role = 'admin',
  is_active = true,
  password = '$2b$10$ZKXHwYqHYpQ7KdZwzRwHauR0c5Wy0XhqEfYhF6vVxX6OkIXzM2uHa';

-- PART 5: CLEAR OLD SESSIONS
-- Run this to force a fresh login
-- -----------------------------------------------------

DELETE FROM user_sessions WHERE sess::text LIKE '%mpatrick@whirks.com%';

-- PART 6: ADD DEFAULT CATEGORIES
-- Run this to add some starter categories
-- -----------------------------------------------------

INSERT INTO kra_categories (name, description, is_default, "order")
VALUES 
  ('General', 'General KRA category', true, 0),
  ('Sales', 'Sales and revenue related KRAs', false, 1),
  ('Operations', 'Operational excellence KRAs', false, 2),
  ('Finance', 'Financial management KRAs', false, 3)
ON CONFLICT DO NOTHING;

INSERT INTO question_categories (name, description, icon, is_default, "order")
VALUES 
  ('General', 'General check-in questions', '📝', true, 0),
  ('Wellness', 'Personal wellness and work-life balance', '🧘', false, 1),
  ('Goals', 'Goal tracking and progress', '🎯', false, 2),
  ('Team', 'Team collaboration and dynamics', '👥', false, 3)
ON CONFLICT DO NOTHING;

-- PART 7: VERIFY EVERYTHING WORKED
-- Run this last to check all is set up correctly
-- -----------------------------------------------------

SELECT 
  'Verification Results:' as status,
  (SELECT COUNT(*) FROM organizations WHERE slug = 'whirkplace' AND is_active = true) as organization_exists,
  (SELECT COUNT(*) FROM users WHERE email = 'mpatrick@whirks.com' AND is_super_admin = true) as super_admin_exists,
  (SELECT COUNT(*) FROM kra_categories) as kra_categories_count,
  (SELECT COUNT(*) FROM question_categories) as question_categories_count;