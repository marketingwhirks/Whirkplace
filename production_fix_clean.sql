-- PRODUCTION SUPER ADMIN FIX SCRIPT
-- Run this in your production database to fix Super Admin authentication

-- Step 1: Ensure the Whirkplace organization exists and is active
INSERT INTO organizations (id, name, slug, is_active, created_at, updated_at, billing_price_per_user, billing_interval, plan_type)
VALUES (
  'whirkplace-org-id',
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
  plan_type = 'enterprise';

-- Step 2: Get the organization ID
SELECT id, name, slug, is_active FROM organizations WHERE slug = 'whirkplace';

-- Step 3: Create or update the Super Admin user
-- IMPORTANT: Replace 'whirkplace-org-id' with the actual ID from Step 2 if different
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
  'whirkplace-org-id',
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
  organization_id = 'whirkplace-org-id',
  is_super_admin = true,
  is_account_owner = true,
  role = 'admin',
  is_active = true,
  auth_provider = COALESCE(users.auth_provider, 'local');

-- Step 4: Verify the Super Admin is properly set up
SELECT 
  id, 
  email, 
  name, 
  role, 
  is_super_admin,
  is_account_owner,
  is_active,
  organization_id,
  (SELECT name FROM organizations WHERE id = users.organization_id) as org_name
FROM users 
WHERE email = 'mpatrick@whirks.com';

-- Step 5: Clear any existing sessions for this user (force re-login)
DELETE FROM user_sessions 
WHERE sess::text LIKE '%mpatrick@whirks.com%';

-- Step 6: Ensure KRA and Question categories exist for the organization
INSERT INTO kra_categories (id, name, description, organization_id, created_at, updated_at)
VALUES 
  (gen_random_uuid(), 'Default', 'Default KRA category', 'whirkplace-org-id', NOW(), NOW())
ON CONFLICT DO NOTHING;

INSERT INTO question_categories (id, name, description, organization_id, created_at, updated_at)
VALUES 
  (gen_random_uuid(), 'Default', 'Default question category', 'whirkplace-org-id', NOW(), NOW())
ON CONFLICT DO NOTHING;

-- Step 7: Verify everything is set up correctly
SELECT 'Super Admin Setup Complete' as status,
  (SELECT COUNT(*) FROM organizations WHERE slug = 'whirkplace' AND is_active = true) as active_org,
  (SELECT COUNT(*) FROM users WHERE email = 'mpatrick@whirks.com' AND is_super_admin = true) as super_admin_exists,
  (SELECT COUNT(*) FROM kra_categories WHERE organization_id = 'whirkplace-org-id') as kra_categories,
  (SELECT COUNT(*) FROM question_categories WHERE organization_id = 'whirkplace-org-id') as question_categories;