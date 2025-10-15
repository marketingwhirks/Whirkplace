-- FIX PRODUCTION LOGIN ISSUE
-- Run these steps in order in your production database

-- STEP 1: Check if the user exists and see their current state
SELECT 
  id, 
  email, 
  name, 
  organization_id,
  is_super_admin,
  is_active,
  auth_provider,
  password IS NOT NULL as has_password
FROM users 
WHERE email = 'mpatrick@whirks.com';

-- STEP 2: Check if Whirkplace organization exists
SELECT id, name, slug, is_active 
FROM organizations 
WHERE slug = 'whirkplace';

-- STEP 3: If user doesn't exist, create it
-- REPLACE 'YOUR-ORG-ID' with the actual organization ID from Step 2
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
  'YOUR-ORG-ID',  -- REPLACE WITH ACTUAL ID FROM STEP 2
  'admin',
  true,
  true,
  true,
  NOW(),
  'local',
  '$2b$10$ZKXHwYqHYpQ7KdZwzRwHauR0c5Wy0XhqEfYhF6vVxX6OkIXzM2uHa'
)
ON CONFLICT (email) DO UPDATE SET 
  organization_id = EXCLUDED.organization_id,
  is_super_admin = true,
  is_account_owner = true,
  role = 'admin',
  is_active = true,
  auth_provider = 'local',
  password = '$2b$10$ZKXHwYqHYpQ7KdZwzRwHauR0c5Wy0XhqEfYhF6vVxX6OkIXzM2uHa';

-- STEP 4: Clear ALL sessions to force fresh login
DELETE FROM user_sessions;

-- STEP 5: Verify the fix worked
SELECT 
  u.id, 
  u.email, 
  u.name, 
  u.organization_id,
  u.is_super_admin,
  u.is_active,
  u.auth_provider,
  o.name as org_name,
  o.slug as org_slug
FROM users u
LEFT JOIN organizations o ON u.organization_id = o.id
WHERE u.email = 'mpatrick@whirks.com';