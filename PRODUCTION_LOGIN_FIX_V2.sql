-- PRODUCTION LOGIN FIX V2 - Handles missing unique constraint
-- Run these steps in order

-- STEP 1: Check if user exists
SELECT id, email, name, organization_id, is_super_admin, is_active, auth_provider
FROM users 
WHERE email = 'mpatrick@whirks.com';

-- STEP 2: Get Whirkplace organization ID (SAVE THIS ID!)
SELECT id, name, slug, is_active 
FROM organizations 
WHERE slug = 'whirkplace';

-- STEP 3: Delete existing user if exists (to avoid duplicates)
DELETE FROM users WHERE email = 'mpatrick@whirks.com';

-- STEP 4: Create fresh Super Admin user
-- REPLACE 'YOUR-ORG-ID' with the actual ID from Step 2
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
  'YOUR-ORG-ID',  -- REPLACE WITH ID FROM STEP 2!
  'admin',
  true,
  true,
  true,
  NOW(),
  'local',
  '$2b$10$ZKXHwYqHYpQ7KdZwzRwHauR0c5Wy0XhqEfYhF6vVxX6OkIXzM2uHa'
);

-- STEP 5: Clear sessions
DELETE FROM user_sessions;

-- STEP 6: Verify user was created correctly
SELECT 
  u.id, 
  u.email, 
  u.name, 
  u.organization_id,
  u.is_super_admin,
  u.is_active,
  u.auth_provider,
  u.password IS NOT NULL as has_password,
  o.name as org_name,
  o.slug as org_slug
FROM users u
LEFT JOIN organizations o ON u.organization_id = o.id
WHERE u.email = 'mpatrick@whirks.com';

-- OPTIONAL: Add unique constraint for future (if you want)
-- ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);