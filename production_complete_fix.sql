-- COMPLETE PRODUCTION FIX SCRIPT
-- This script creates missing tables and sets up Super Admin

-- Part A: Create Missing Tables
-- ================================

-- Create question_categories table if it doesn't exist
CREATE TABLE IF NOT EXISTS question_categories (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create kra_categories table if it doesn't exist
CREATE TABLE IF NOT EXISTS kra_categories (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  "order" INTEGER NOT NULL DEFAULT 0,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_question_categories_order ON question_categories("order");
CREATE INDEX IF NOT EXISTS idx_kra_categories_order ON kra_categories("order");

-- Part B: Set Up Super Admin Organization and User
-- ================================================

-- Step 1: Ensure the Whirkplace organization exists and is active
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

-- Step 2: Get the organization ID (IMPORTANT: Note this ID for next steps)
SELECT id, name, slug, is_active 
FROM organizations 
WHERE slug = 'whirkplace';

-- Step 3: Update the Super Admin user
-- First, check if user exists
SELECT id, email, organization_id 
FROM users 
WHERE email = 'mpatrick@whirks.com';

-- Step 4: Update existing user or create new one
-- IMPORTANT: Replace YOUR_ORG_ID with the actual organization ID from Step 2
UPDATE users 
SET 
  is_super_admin = true,
  is_account_owner = true,
  role = 'admin',
  is_active = true,
  auth_provider = COALESCE(auth_provider, 'local'),
  password = COALESCE(password, '$2b$10$ZKXHwYqHYpQ7KdZwzRwHauR0c5Wy0XhqEfYhF6vVxX6OkIXzM2uHa')
WHERE email = 'mpatrick@whirks.com';

-- Step 5: If the UPDATE affected 0 rows, create the user
-- IMPORTANT: Only run this if the above UPDATE shows "0 rows affected"
-- Replace YOUR_ORG_ID with the actual organization ID from Step 2
/*
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
  'YOUR_ORG_ID',  -- Replace with actual org ID from Step 2
  'admin',
  true,
  true,
  true,
  NOW(),
  NOW(),
  'local',
  '$2b$10$ZKXHwYqHYpQ7KdZwzRwHauR0c5Wy0XhqEfYhF6vVxX6OkIXzM2uHa'
);
*/

-- Step 6: Verify the Super Admin is properly set up
SELECT 
  u.id, 
  u.email, 
  u.name, 
  u.role, 
  u.is_super_admin,
  u.is_account_owner,
  u.is_active,
  u.organization_id,
  o.name as org_name,
  o.slug as org_slug
FROM users u
LEFT JOIN organizations o ON u.organization_id = o.id
WHERE u.email = 'mpatrick@whirks.com';

-- Step 7: Clear any existing sessions for this user (force re-login)
DELETE FROM user_sessions 
WHERE sess::text LIKE '%mpatrick@whirks.com%';

-- Step 8: Add default categories
-- Get the organization ID for categories
-- Replace YOUR_ORG_ID with the actual organization ID from Step 2
/*
INSERT INTO kra_categories (name, description, is_default, created_at)
VALUES 
  ('General', 'General KRA category', true, NOW()),
  ('Sales', 'Sales and revenue related KRAs', false, NOW()),
  ('Operations', 'Operational excellence KRAs', false, NOW()),
  ('Finance', 'Financial management KRAs', false, NOW())
ON CONFLICT DO NOTHING;

INSERT INTO question_categories (name, description, icon, is_default, created_at)
VALUES 
  ('General', 'General check-in questions', '📝', true, NOW()),
  ('Wellness', 'Personal wellness and work-life balance', '🧘', false, NOW()),
  ('Goals', 'Goal tracking and progress', '🎯', false, NOW()),
  ('Team', 'Team collaboration and dynamics', '👥', false, NOW())
ON CONFLICT DO NOTHING;
*/

-- Step 9: Final verification
SELECT 
  'Setup Status' as check_type,
  (SELECT COUNT(*) FROM organizations WHERE slug = 'whirkplace' AND is_active = true) as whirkplace_org,
  (SELECT COUNT(*) FROM users WHERE email = 'mpatrick@whirks.com' AND is_super_admin = true) as super_admin,
  (SELECT COUNT(*) FROM kra_categories) as kra_categories_count,
  (SELECT COUNT(*) FROM question_categories) as question_categories_count;