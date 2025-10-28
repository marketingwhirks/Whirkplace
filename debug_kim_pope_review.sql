-- SQL Queries to Debug Kim Pope's Pending Review Issue
-- Run these in your production database to understand what's happening

-- ============================================
-- QUERY 1: Find Kim Pope's latest check-in and review status
-- ============================================
SELECT 
    c.id,
    u.name as user_name,
    u.email,
    u.manager_id,
    m.name as manager_name,
    c.week_of,
    c.submitted_at,
    c.review_status,
    c.reviewed_by,
    c.reviewed_at,
    c.review_comments,
    c.overall_mood,
    TO_CHAR(c.week_of, 'YYYY-MM-DD (Day)') as week_formatted,
    TO_CHAR(c.submitted_at, 'YYYY-MM-DD HH24:MI') as submitted_formatted
FROM checkins c
JOIN users u ON c.user_id = u.id
LEFT JOIN users m ON u.manager_id = m.id
WHERE u.email = 'kimpope@patrickaccounting.com'
ORDER BY c.submitted_at DESC
LIMIT 5;

-- ============================================
-- QUERY 2: Check ALL pending reviews for your user (Matthew Patrick)
-- ============================================
SELECT 
    c.id,
    u.name as team_member_name,
    u.email as team_member_email,
    c.week_of,
    c.submitted_at,
    c.review_status,
    c.overall_mood,
    TO_CHAR(c.week_of, 'Week of Mon DD, YYYY') as week_label,
    CASE 
        WHEN c.review_status = 'pending' THEN '⚠️ NEEDS REVIEW'
        WHEN c.review_status = 'reviewed' THEN '✅ Reviewed'
        ELSE c.review_status
    END as status_display
FROM checkins c
JOIN users u ON c.user_id = u.id
WHERE u.manager_id = (
    SELECT id FROM users WHERE email = 'mpatrick@patrickaccounting.com'
)
AND c.review_status = 'pending'
ORDER BY c.submitted_at DESC;

-- ============================================
-- QUERY 3: Verify manager relationships
-- ============================================
SELECT 
    u.id,
    u.name,
    u.email,
    u.role,
    u.manager_id,
    m.name as manager_name,
    m.email as manager_email,
    o.name as organization
FROM users u
LEFT JOIN users m ON u.manager_id = m.id
JOIN organizations o ON u.organization_id = o.id
WHERE u.email IN (
    'kimpope@patrickaccounting.com',
    'mpatrick@patrickaccounting.com'
)
OR u.manager_id = (
    SELECT id FROM users WHERE email = 'mpatrick@patrickaccounting.com'
);

-- ============================================
-- QUERY 4: Check review_status field values
-- ============================================
SELECT 
    c.review_status,
    COUNT(*) as count,
    STRING_AGG(DISTINCT u.name, ', ') as users_with_status
FROM checkins c
JOIN users u ON c.user_id = u.id
JOIN organizations o ON u.organization_id = o.id
WHERE o.name = 'Patrick Accounting'
    AND c.submitted_at >= '2025-10-01'
GROUP BY c.review_status
ORDER BY c.review_status;

-- ============================================
-- QUERY 5: Find ALL pending reviews in organization
-- ============================================
SELECT 
    c.id as checkin_id,
    u.name as employee_name,
    u.email,
    m.name as manager_name,
    m.email as manager_email,
    c.week_of::date,
    c.submitted_at::date,
    c.review_status,
    c.overall_mood
FROM checkins c
JOIN users u ON c.user_id = u.id
LEFT JOIN users m ON u.manager_id = m.id
JOIN organizations o ON u.organization_id = o.id
WHERE o.name = 'Patrick Accounting'
    AND c.review_status = 'pending'
ORDER BY c.submitted_at DESC;

-- ============================================
-- QUERY 6: Debug specific check-in if you have the ID
-- ============================================
-- If you found Kim's check-in ID from above queries, replace 'CHECKIN_ID_HERE'
-- with the actual ID and run this:
/*
SELECT 
    c.*,
    u.name as user_name,
    u.manager_id,
    m.name as manager_name
FROM checkins c
JOIN users u ON c.user_id = u.id
LEFT JOIN users m ON u.manager_id = m.id
WHERE c.id = 'CHECKIN_ID_HERE';
*/

-- ============================================
-- QUERY 7: Check if there's a data type or case sensitivity issue
-- ============================================
SELECT 
    DISTINCT c.review_status,
    LENGTH(c.review_status) as status_length,
    CASE 
        WHEN c.review_status = 'pending' THEN 'exact match pending'
        WHEN LOWER(c.review_status) = 'pending' THEN 'lowercase match'
        WHEN TRIM(c.review_status) = 'pending' THEN 'trimmed match'
        ELSE 'no match'
    END as match_test
FROM checkins c
WHERE c.submitted_at >= '2025-10-20';

-- ============================================
-- QUERY 8: Get pending counts by different criteria
-- ============================================
SELECT 
    'Total pending in org' as criteria,
    COUNT(*) as count
FROM checkins c
JOIN users u ON c.user_id = u.id
JOIN organizations o ON u.organization_id = o.id
WHERE o.name = 'Patrick Accounting'
    AND c.review_status = 'pending'
UNION ALL
SELECT 
    'Pending for Matthew as manager' as criteria,
    COUNT(*) as count
FROM checkins c
JOIN users u ON c.user_id = u.id
WHERE u.manager_id = (SELECT id FROM users WHERE email = 'mpatrick@patrickaccounting.com')
    AND c.review_status = 'pending'
UNION ALL
SELECT 
    'Kim Pope pending reviews' as criteria,
    COUNT(*) as count
FROM checkins c
JOIN users u ON c.user_id = u.id
WHERE u.email = 'kimpope@patrickaccounting.com'
    AND c.review_status = 'pending';