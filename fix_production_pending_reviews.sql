-- Debug and Fix Pending Reviews in Production Database
-- Run these queries in order to identify and fix the issue

-- ============================================
-- 1. CHECK KIM'S PENDING CHECK-IN EXISTS
-- ============================================
SELECT 
    c.id,
    c.user_id,
    u.name as user_name,
    c.week_of::date,
    c.submitted_at,
    c.review_status,
    c.reviewed_by,
    c.reviewed_at,
    u.manager_id,
    m.name as manager_name
FROM checkins c
JOIN users u ON c.user_id = u.id
LEFT JOIN users m ON u.manager_id = m.id
WHERE u.email = 'kimpope@patrickaccounting.com'
    AND c.review_status = 'pending'
ORDER BY c.submitted_at DESC;

-- ============================================
-- 2. VERIFY MANAGER RELATIONSHIP IS CORRECT
-- ============================================
SELECT 
    'Kim Pope' as person,
    kim.id as kim_id,
    kim.manager_id as kim_manager_id,
    'Matthew Patrick' as manager,
    matt.id as matthew_id,
    CASE 
        WHEN kim.manager_id = matt.id THEN '✅ Correct'
        WHEN kim.manager_id IS NULL THEN '❌ No Manager'
        ELSE '⚠️ Different Manager'
    END as status
FROM users kim, users matt
WHERE kim.email = 'kimpope@patrickaccounting.com'
    AND matt.email = 'mpatrick@patrickaccounting.com';

-- ============================================
-- 3. CHECK WHAT PENDING REVIEWS MATTHEW SHOULD SEE
-- ============================================
WITH matthew_id AS (
    SELECT id FROM users WHERE email = 'mpatrick@patrickaccounting.com'
)
SELECT 
    c.id as checkin_id,
    u.name as employee,
    u.email,
    c.week_of::date,
    c.submitted_at::date,
    c.review_status,
    c.overall_mood,
    CASE 
        WHEN u.manager_id = (SELECT id FROM matthew_id) THEN 'Direct Report'
        ELSE 'Not Direct Report'
    END as relationship
FROM checkins c
JOIN users u ON c.user_id = u.id
WHERE c.review_status = 'pending'
    AND u.organization_id = (
        SELECT organization_id FROM users WHERE email = 'mpatrick@patrickaccounting.com'
    )
ORDER BY relationship, c.submitted_at DESC;

-- ============================================
-- 4. CHECK FOR CASE SENSITIVITY OR WHITESPACE ISSUES
-- ============================================
SELECT 
    c.id,
    u.name,
    c.review_status,
    '|' || c.review_status || '|' as padded_status,
    LENGTH(c.review_status) as status_length,
    CASE 
        WHEN c.review_status = 'pending' THEN 'Exact Match'
        WHEN LOWER(c.review_status) = 'pending' THEN 'Case Difference'
        WHEN TRIM(c.review_status) = 'pending' THEN 'Has Whitespace'
        ELSE 'No Match'
    END as match_type
FROM checkins c
JOIN users u ON c.user_id = u.id
WHERE u.email = 'kimpope@patrickaccounting.com'
    AND (c.review_status ILIKE '%pending%' OR c.review_status IS NULL)
ORDER BY c.submitted_at DESC
LIMIT 5;

-- ============================================
-- 5. FIX: UPDATE KIM'S MANAGER IF NOT SET
-- ============================================
-- Only run this if Query 2 shows incorrect manager
UPDATE users
SET manager_id = (SELECT id FROM users WHERE email = 'mpatrick@patrickaccounting.com')
WHERE email = 'kimpope@patrickaccounting.com'
    AND (
        manager_id IS NULL 
        OR manager_id != (SELECT id FROM users WHERE email = 'mpatrick@patrickaccounting.com')
    );

-- ============================================
-- 6. FIX: ENSURE REVIEW STATUS IS CORRECT
-- ============================================
-- If Query 4 shows case or whitespace issues, fix them
UPDATE checkins
SET review_status = 'pending'
WHERE user_id = (SELECT id FROM users WHERE email = 'kimpope@patrickaccounting.com')
    AND (
        LOWER(TRIM(review_status)) = 'pending'
        OR review_status ILIKE '%pending%'
    )
    AND review_status != 'pending';

-- ============================================
-- 7. NUCLEAR OPTION: MANUALLY CREATE SYNC FUNCTION
-- ============================================
-- This does what the Sync Managers button should do
UPDATE users u
SET manager_id = t.leader_id
FROM teams t
WHERE u.team_id = t.id
    AND u.organization_id = (
        SELECT organization_id FROM users WHERE email = 'mpatrick@patrickaccounting.com'
    )
    AND u.manager_id IS NULL
    AND t.leader_id IS NOT NULL
    AND u.is_active = true
    AND u.id != t.leader_id;

-- ============================================
-- 8. FINAL CHECK: COUNT ALL PENDING REVIEWS
-- ============================================
SELECT 
    'Total Pending in Org' as metric,
    COUNT(*) as count
FROM checkins c
JOIN users u ON c.user_id = u.id
WHERE u.organization_id = (
    SELECT organization_id FROM users WHERE email = 'mpatrick@patrickaccounting.com'
)
AND c.review_status = 'pending'

UNION ALL

SELECT 
    'Pending for Matthew' as metric,
    COUNT(*) as count
FROM checkins c
JOIN users u ON c.user_id = u.id
WHERE u.manager_id = (SELECT id FROM users WHERE email = 'mpatrick@patrickaccounting.com')
AND c.review_status = 'pending';

-- ============================================
-- 9. IF STILL NOT WORKING: CHECK FOR OTHER FILTERS
-- ============================================
-- This shows ALL data about Kim's latest check-in
SELECT 
    c.*,
    u.manager_id,
    m.name as manager_name,
    m.email as manager_email
FROM checkins c
JOIN users u ON c.user_id = u.id
LEFT JOIN users m ON u.manager_id = m.id
WHERE u.email = 'kimpope@patrickaccounting.com'
ORDER BY c.submitted_at DESC
LIMIT 1;