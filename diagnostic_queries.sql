-- Fix Manager Relationships in Production Database

-- ============================================
-- STEP 1: First, verify Matthew Patrick's user ID
-- ============================================
SELECT 
    id,
    name,
    email,
    role,
    organization_id
FROM users 
WHERE email = 'mpatrick@patrickaccounting.com';
-- Copy the ID from above (let's call it MATTHEW_ID)

-- ============================================
-- STEP 2: Check ALL users without managers in Patrick Accounting
-- ============================================
SELECT 
    u.id,
    u.name,
    u.email,
    u.role,
    u.manager_id,
    o.name as organization
FROM users u
JOIN organizations o ON u.organization_id = o.id
WHERE o.name = 'Patrick Accounting'
    AND u.manager_id IS NULL
    AND u.is_active = true
ORDER BY u.name;

-- ============================================
-- STEP 3: Update Kim Pope's manager to Matthew Patrick
-- ============================================
-- IMPORTANT: Replace 'MATTHEW_ID' with the actual ID from Step 1
UPDATE users 
SET manager_id = 'MATTHEW_ID'
WHERE email = 'kimpope@patrickaccounting.com';

-- ============================================
-- STEP 4: If you want to set Matthew as manager for ALL team members without one
-- ============================================
-- This will set Matthew as manager for everyone in Patrick Accounting who doesn't have a manager
-- EXCEPT Matthew himself
-- IMPORTANT: Replace 'MATTHEW_ID' with the actual ID from Step 1
/*
UPDATE users 
SET manager_id = 'MATTHEW_ID'
WHERE organization_id = (
    SELECT organization_id FROM users WHERE email = 'mpatrick@patrickaccounting.com'
)
AND manager_id IS NULL
AND email != 'mpatrick@patrickaccounting.com'
AND is_active = true;
*/

-- ============================================
-- STEP 5: Verify the update worked
-- ============================================
SELECT 
    u.name as employee,
    u.email,
    u.role,
    m.name as manager,
    m.email as manager_email
FROM users u
LEFT JOIN users m ON u.manager_id = m.id
WHERE u.organization_id = (
    SELECT organization_id FROM users WHERE email = 'mpatrick@patrickaccounting.com'
)
AND u.is_active = true
ORDER BY u.name;

-- ============================================
-- STEP 6: After fixing managers, check pending reviews again
-- ============================================
SELECT 
    c.id,
    u.name as team_member,
    u.email,
    c.week_of::date,
    c.review_status,
    c.overall_mood
FROM checkins c
JOIN users u ON c.user_id = u.id
WHERE u.manager_id = (
    SELECT id FROM users WHERE email = 'mpatrick@patrickaccounting.com'
)
AND c.review_status = 'pending'
ORDER BY c.submitted_at DESC;