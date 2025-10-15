-- FINAL SUPER ADMIN SETUP
-- Now that schema is synchronized, this should work perfectly

-- Step 1: Get the Whirkplace organization ID
SELECT id, name, slug FROM organizations WHERE slug = 'whirkplace';

-- Step 2: Update or create Super Admin
-- REPLACE 'YOUR-ORG-ID' with the ID from Step 1
UPDATE users 
SET 
  organization_id = 'YOUR-ORG-ID',  -- REPLACE THIS
  is_super_admin = true,
  is_account_owner = true,
  role = 'admin',
  is_active = true,
  auth_provider = 'local',
  password = '$2b$10$ZKXHwYqHYpQ7KdZwzRwHauR0c5Wy0XhqEfYhF6vVxX6OkIXzM2uHa'
WHERE email = 'mpatrick@whirks.com';

-- If UPDATE affected 0 rows, run this INSERT instead:
/*
INSERT INTO users (
  id, email, name, username, organization_id, role, 
  is_super_admin, is_account_owner, is_active, 
  created_at, auth_provider, password
)
VALUES (
  gen_random_uuid(),
  'mpatrick@whirks.com',
  'Matthew Patrick',
  'mpatrickSA',
  'YOUR-ORG-ID',  -- REPLACE THIS
  'admin',
  true,
  true,
  true,
  NOW(),
  'local',
  '$2b$10$ZKXHwYqHYpQ7KdZwzRwHauR0c5Wy0XhqEfYhF6vVxX6OkIXzM2uHa'
);
*/

-- Step 3: Clear old sessions
DELETE FROM user_sessions WHERE sess::text LIKE '%mpatrick@whirks.com%';

-- Step 4: Verify setup
SELECT 
  u.id, 
  u.email, 
  u.name, 
  u.is_super_admin,
  u.is_account_owner,
  u.organization_id,
  o.name as org_name
FROM users u
JOIN organizations o ON u.organization_id = o.id
WHERE u.email = 'mpatrick@whirks.com';