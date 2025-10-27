-- COMPREHENSIVE DIAGNOSTIC QUERIES FOR CHECK-IN ANALYSIS
-- Run each query separately and copy the results back

-- ============================================
-- QUERY 1: Show ALL recent check-ins with full date details
-- ============================================
SELECT 
    c.id,
    u.name as user_name,
    u.email,
    o.name as organization,
    c.week_of,
    c.submitted_at,
    c.overall_mood,
    TO_CHAR(c.week_of, 'YYYY-MM-DD (Day)') as week_of_formatted,
    TO_CHAR(c.submitted_at, 'YYYY-MM-DD HH24:MI (Day)') as submitted_formatted,
    EXTRACT(WEEK FROM c.week_of) as week_number_stored,
    EXTRACT(WEEK FROM c.submitted_at) as week_number_submitted
FROM checkins c
JOIN users u ON c.user_id = u.id
JOIN organizations o ON c.organization_id = o.id
WHERE c.submitted_at >= '2025-10-15'
ORDER BY c.submitted_at DESC
LIMIT 30;

-- ============================================
-- QUERY 2: Group check-ins by week_of to see patterns
-- ============================================
SELECT 
    c.week_of::date,
    TO_CHAR(c.week_of, 'YYYY-MM-DD (Day)') as week_formatted,
    COUNT(*) as total_checkins,
    COUNT(DISTINCT c.user_id) as unique_users,
    STRING_AGG(DISTINCT o.name, ', ') as organizations,
    MIN(c.submitted_at)::date as earliest_submission,
    MAX(c.submitted_at)::date as latest_submission
FROM checkins c
JOIN organizations o ON c.organization_id = o.id
WHERE c.submitted_at >= '2025-10-01'
GROUP BY c.week_of
ORDER BY c.week_of DESC;

-- ============================================
-- QUERY 3: Find Matthew and Mandy's specific check-ins
-- ============================================
SELECT 
    u.name,
    u.email,
    c.week_of,
    c.submitted_at,
    TO_CHAR(c.week_of, 'Week ending: Dy MM/DD/YYYY') as week_ending,
    TO_CHAR(c.submitted_at, 'Submitted: Dy MM/DD/YYYY at HH:MI AM') as when_submitted,
    c.overall_mood,
    c.is_complete
FROM checkins c
JOIN users u ON c.user_id = u.id
WHERE (
    u.email LIKE '%mpatrick%' 
    OR u.email LIKE '%mandypatrick%'
    OR u.name LIKE '%Matthew%'
    OR u.name LIKE '%Mandy%'
)
AND c.submitted_at >= '2025-10-01'
ORDER BY c.submitted_at DESC;

-- ============================================
-- QUERY 4: Check for ANY check-ins between Oct 19-25 (last week)
-- ============================================
SELECT 
    'Week Oct 19-25 Check-ins' as period,
    u.name,
    u.email,
    o.name as org,
    c.week_of::date,
    c.submitted_at::date,
    c.overall_mood
FROM checkins c
JOIN users u ON c.user_id = u.id
JOIN organizations o ON c.organization_id = o.id
WHERE c.submitted_at >= '2025-10-19' 
    AND c.submitted_at < '2025-10-26'
ORDER BY c.submitted_at DESC;

-- ============================================
-- QUERY 5: Check for ANY check-ins between Oct 26-31 (this week so far)
-- ============================================
SELECT 
    'Week Oct 26-31 Check-ins' as period,
    u.name,
    u.email,
    o.name as org,
    c.week_of::date,
    c.submitted_at::date,
    c.overall_mood
FROM checkins c
JOIN users u ON c.user_id = u.id
JOIN organizations o ON c.organization_id = o.id
WHERE c.submitted_at >= '2025-10-26' 
    AND c.submitted_at <= '2025-10-31'
ORDER BY c.submitted_at DESC;

-- ============================================
-- QUERY 6: Show check-ins with week_of dates matching expected weeks
-- ============================================
SELECT 
    'Checking week_of field values' as analysis,
    COUNT(*) as count,
    c.week_of::date,
    CASE 
        WHEN c.week_of::date = '2025-10-19' THEN 'Expected: Week ending Oct 24'
        WHEN c.week_of::date = '2025-10-26' THEN 'Expected: Week ending Oct 31'
        WHEN c.week_of::date BETWEEN '2025-10-19' AND '2025-10-25' THEN 'In last week range'
        WHEN c.week_of::date BETWEEN '2025-10-26' AND '2025-10-31' THEN 'In current week range'
        ELSE 'Other week'
    END as week_classification
FROM checkins c
WHERE c.submitted_at >= '2025-10-15'
GROUP BY c.week_of
ORDER BY c.week_of DESC;

-- ============================================
-- QUERY 7: Database timezone and current time check
-- ============================================
SELECT 
    NOW() as database_current_time,
    CURRENT_DATE as database_current_date,
    TO_CHAR(NOW(), 'YYYY-MM-DD HH24:MI:SS TZ') as formatted_with_timezone,
    DATE_TRUNC('week', CURRENT_DATE) as postgres_week_start,
    DATE_TRUNC('week', CURRENT_DATE) + INTERVAL '6 days' as postgres_week_end;