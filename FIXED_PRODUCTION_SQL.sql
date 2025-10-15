-- =====================================================
-- FIXED PRODUCTION DATABASE SCRIPT
-- =====================================================

-- PART 1: CREATE MISSING TABLES
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
-- -----------------------------------------------------

INSERT INTO organizations (id, name, slug, is_active, created_at, billing_price_per_user, billing_interval, plan_type)
VALUES (
  gen_random_uuid(),
  'Whirkplace', 
  'whirkplace', 
  true, 
  NOW(),
  2000,
  'monthly',
  'enterprise'
)
ON CONFLICT (slug) DO UPDATE SET 
  is_active = true,
  plan_type = 'enterprise';

-- PART 3: GET THE ORGANIZATION ID - IMPORTANT!
-- -----------------------------------------------------

SELECT id, name, slug FROM organizations WHERE slug = 'whirkplace';

-- PART 4: FIX SUPER ADMIN USER
-- REPLACE BOTH INSTANCES OF YOUR-ORG-ID-HERE with the ID from Part 3
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
  auth_provider,
  password
)
VALUES (
  gen_random_uuid(),
  'mpatrick@whirks.com',
  'Matthew Patrick',
  'mpatrickSA',
  'YOUR-ORG-ID-HERE',
  'admin',
  true,
  true,
  true,
  NOW(),
  'local',
  '$2b$10$ZKXHwYqHYpQ7KdZwzRwHauR0c5Wy0XhqEfYhF6vVxX6OkIXzM2uHa'
)
ON CONFLICT (email) DO UPDATE SET 
  organization_id = 'YOUR-ORG-ID-HERE',
  is_super_admin = true,
  is_account_owner = true,
  role = 'admin',
  is_active = true,
  password = '$2b$10$ZKXHwYqHYpQ7KdZwzRwHauR0c5Wy0XhqEfYhF6vVxX6OkIXzM2uHa';

-- PART 5: CLEAR OLD SESSIONS
-- -----------------------------------------------------

DELETE FROM user_sessions WHERE sess::text LIKE '%mpatrick@whirks.com%';

-- PART 6: ADD DEFAULT CATEGORIES
-- -----------------------------------------------------

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

-- PART 7: VERIFY EVERYTHING
-- -----------------------------------------------------

SELECT 
  (SELECT COUNT(*) FROM organizations WHERE slug = 'whirkplace' AND is_active = true) as org_exists,
  (SELECT COUNT(*) FROM users WHERE email = 'mpatrick@whirks.com' AND is_super_admin = true) as super_admin,
  (SELECT COUNT(*) FROM kra_categories) as kra_cats,
  (SELECT COUNT(*) FROM question_categories) as q_cats;