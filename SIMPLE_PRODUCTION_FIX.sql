-- =====================================================
-- SIMPLIFIED PRODUCTION FIX - NO MISSING COLUMNS
-- =====================================================

-- STEP 1: CREATE MISSING TABLES
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

-- STEP 2: CREATE OR UPDATE ORGANIZATION (MINIMAL COLUMNS)
-- -----------------------------------------------------

INSERT INTO organizations (id, name, slug, is_active, created_at)
VALUES (
  gen_random_uuid(),
  'Whirkplace', 
  'whirkplace', 
  true, 
  NOW()
)
ON CONFLICT (slug) DO UPDATE SET 
  is_active = true;

-- STEP 3: GET THE ORGANIZATION ID
-- COPY THIS ID FOR THE NEXT STEP!
-- -----------------------------------------------------

SELECT id, name, slug FROM organizations WHERE slug = 'whirkplace';

-- STEP 4: CREATE/UPDATE SUPER ADMIN USER
-- REPLACE YOUR-ORG-ID with the ID from Step 3
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
  'YOUR-ORG-ID',  -- REPLACE THIS WITH ID FROM STEP 3
  'admin',
  true,
  true,
  true,
  NOW(),
  'local',
  '$2b$10$ZKXHwYqHYpQ7KdZwzRwHauR0c5Wy0XhqEfYhF6vVxX6OkIXzM2uHa'
)
ON CONFLICT (email) DO UPDATE SET 
  organization_id = 'YOUR-ORG-ID',  -- REPLACE THIS WITH ID FROM STEP 3
  is_super_admin = true,
  is_account_owner = true,
  role = 'admin',
  is_active = true,
  password = '$2b$10$ZKXHwYqHYpQ7KdZwzRwHauR0c5Wy0XhqEfYhF6vVxX6OkIXzM2uHa';

-- STEP 5: CLEAR OLD SESSIONS
-- -----------------------------------------------------

DELETE FROM user_sessions WHERE sess::text LIKE '%mpatrick@whirks.com%';

-- STEP 6: VERIFY EVERYTHING
-- -----------------------------------------------------

SELECT 
  (SELECT COUNT(*) FROM organizations WHERE slug = 'whirkplace') as org_count,
  (SELECT COUNT(*) FROM users WHERE email = 'mpatrick@whirks.com' AND is_super_admin = true) as super_admin_count;