-- CRITICAL: Find why Kim Pope's review isn't showing for Matthew

-- ============================================
-- 1. CHECK MANAGER RELATIONSHIP
-- ============================================
SELECT 
    u.name as employee_name,
    u.email,
    u.role,
    u.manager_id,
    m.name as manager_name,
    m.email as manager_email
FROM users u
LEFT JOIN users m ON u.manager_id = m.id
WHERE u.email = 'kimpope@patrickaccounting.com';

-- ============================================
-- 2. FIND ALL PENDING REVIEWS IN YOUR ORG (regardless of manager)
-- ============================================
SELECT 
    c.id as checkin_id,
    u.name as employee_name,
    u.email,
    u.manager_id,
    m.name as assigned_manager,
    m.email as manager_email,
    c.week_of::date,
    c.submitted_at::date,
    c.review_status
FROM checkins c
JOIN users u ON c.user_id = u.id
LEFT JOIN users m ON u.manager_id = m.id
WHERE u.organization_id = (
    SELECT organization_id FROM users WHERE email = 'mpatrick@patrickaccounting.com'
)
AND c.review_status = 'pending'
ORDER BY c.submitted_at DESC;

-- ============================================
-- 3. GET MATTHEW'S USER ID
-- ============================================
SELECT 
    id,
    name,
    email,
    role
FROM users 
WHERE email = 'mpatrick@patrickaccounting.com';

-- ============================================
-- 4. FIND KIM'S LATEST CHECK-IN (regardless of status)
-- ============================================
SELECT 
    c.id,
    u.name,
    u.email,
    u.manager_id,
    c.week_of::date,
    c.submitted_at,
    c.review_status,
    c.reviewed_by,
    c.reviewed_at
FROM checkins c
JOIN users u ON c.user_id = u.id
WHERE u.email = 'kimpope@patrickaccounting.com'
ORDER BY c.submitted_at DESC
LIMIT 3;

-- ============================================
-- 5. LIST ALL YOUR DIRECT REPORTS
-- ============================================
SELECT 
    u.id,
    u.name,
    u.email,
    u.role
FROM users u
WHERE u.manager_id = (
    SELECT id FROM users WHERE email = 'mpatrick@patrickaccounting.com'
)
AND u.is_active = true
ORDER BY u.name;