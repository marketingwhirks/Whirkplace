-- ====================================================
-- PRODUCTION VERIFICATION TEST
-- Run these queries to verify the pending review fix
-- ====================================================

-- ====================================================
-- TEST 1: Verify Manager Relationships
-- ====================================================
-- This should show ALL users with their managers
SELECT 
    u.name as employee_name,
    u.email as employee_email,
    u.manager_id,
    m.name as manager_name,
    m.email as manager_email,
    CASE 
        WHEN u.manager_id IS NULL THEN '❌ NO MANAGER'
        ELSE '✅ HAS MANAGER'
    END as status
FROM users u
LEFT JOIN users m ON u.manager_id = m.id
WHERE u.organization_id = 'dd921655-aee7-45b3-9319-d484a706cfb9'
    AND u.is_active = true
ORDER BY status, u.name;

-- ====================================================
-- TEST 2: Check Pending Reviews Status
-- ====================================================
-- This should show ALL pending check-ins
SELECT 
    c.id,
    u.name as employee,
    u.email,
    m.name as manager,
    m.email as manager_email,
    c.week_of::date,
    c.submitted_at::timestamp,
    c.review_status,
    LOWER(TRIM(c.review_status)) as cleaned_status,
    CASE 
        WHEN LOWER(TRIM(c.review_status)) = 'pending' THEN '✅ Valid Pending'
        ELSE '❌ Invalid Status'
    END as status_check
FROM checkins c
JOIN users u ON c.user_id = u.id
LEFT JOIN users m ON u.manager_id = m.id
WHERE u.organization_id = 'dd921655-aee7-45b3-9319-d484a706cfb9'
    AND LOWER(TRIM(c.review_status)) = 'pending'
ORDER BY c.submitted_at DESC;

-- ====================================================
-- TEST 3: What Matthew Should See
-- ====================================================
-- These are the pending reviews that should appear for Matthew
SELECT 
    'MATTHEW PENDING REVIEWS' as report,
    COUNT(*) as total_pending,
    STRING_AGG(
        u.name || ' (Week: ' || c.week_of::date || ')', 
        ', ' 
        ORDER BY c.submitted_at DESC
    ) as pending_from
FROM checkins c
JOIN users u ON c.user_id = u.id
WHERE u.manager_id = (SELECT id FROM users WHERE email = 'mpatrick@patrickaccounting.com')
    AND LOWER(TRIM(c.review_status)) = 'pending';

-- ====================================================
-- TEST 4: Detailed View for Matthew
-- ====================================================
SELECT 
    c.id as checkin_id,
    u.name as employee,
    c.week_of::date,
    c.submitted_at::timestamp,
    c.overall_mood,
    c.review_status,
    c.reviewed_by,
    c.reviewed_at
FROM checkins c
JOIN users u ON c.user_id = u.id
WHERE u.manager_id = (SELECT id FROM users WHERE email = 'mpatrick@patrickaccounting.com')
    AND LOWER(TRIM(c.review_status)) = 'pending'
ORDER BY c.submitted_at DESC;

-- ====================================================
-- TEST 5: Check Kim Pope Specifically
-- ====================================================
SELECT 
    'KIM POPE CHECK' as report,
    u.name,
    u.email,
    u.manager_id,
    m.name as manager_name,
    COUNT(c.id) as pending_checkins,
    STRING_AGG(
        'Week: ' || c.week_of::date || ' Status: ' || c.review_status,
        '; '
    ) as checkin_details
FROM users u
LEFT JOIN users m ON u.manager_id = m.id
LEFT JOIN checkins c ON c.user_id = u.id AND LOWER(TRIM(c.review_status)) = 'pending'
WHERE u.email = 'kimpope@patrickaccounting.com'
GROUP BY u.id, u.name, u.email, u.manager_id, m.name;

-- ====================================================
-- TEST 6: Organization Summary
-- ====================================================
SELECT 
    'ORGANIZATION SUMMARY' as report,
    (SELECT COUNT(*) FROM users WHERE organization_id = 'dd921655-aee7-45b3-9319-d484a706cfb9' AND is_active = true) as active_users,
    (SELECT COUNT(*) FROM users WHERE organization_id = 'dd921655-aee7-45b3-9319-d484a706cfb9' AND manager_id IS NOT NULL) as users_with_managers,
    (SELECT COUNT(*) FROM checkins c JOIN users u ON c.user_id = u.id WHERE u.organization_id = 'dd921655-aee7-45b3-9319-d484a706cfb9' AND LOWER(TRIM(c.review_status)) = 'pending') as total_pending_reviews,
    (SELECT COUNT(*) FROM checkins c JOIN users u ON c.user_id = u.id WHERE u.manager_id = (SELECT id FROM users WHERE email = 'mpatrick@patrickaccounting.com') AND LOWER(TRIM(c.review_status)) = 'pending') as matthew_pending_reviews;

-- ====================================================
-- IF STILL BROKEN: Emergency Fix
-- ====================================================
-- Run this ONLY if the above tests show issues

-- Fix any case sensitivity issues in review_status
UPDATE checkins 
SET review_status = 'pending'
WHERE LOWER(TRIM(review_status)) = 'pending'
    AND review_status != 'pending';

-- Ensure Kim has Matthew as manager
UPDATE users
SET manager_id = (SELECT id FROM users WHERE email = 'mpatrick@patrickaccounting.com')
WHERE email = 'kimpope@patrickaccounting.com'
    AND (manager_id IS NULL OR manager_id != (SELECT id FROM users WHERE email = 'mpatrick@patrickaccounting.com'));