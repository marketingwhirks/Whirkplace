-- SQL Queries to Check Your Production Database for Missing Check-ins
-- Run these queries in the Replit Database Pane on your production database

-- ========================================
-- 1. CHECK ALL CHECK-INS FROM THE LAST 2 WEEKS
-- ========================================
-- This will show you ALL check-ins submitted in the last 14 days
SELECT 
    c.id,
    u.name as user_name,
    u.email,
    c.week_of::date as week_of_date,
    c.submitted_at,
    TO_CHAR(c.submitted_at, 'Day, Mon DD, YYYY at HH:MI AM') as submitted_formatted,
    c.overall_mood,
    c.is_complete,
    o.name as org_name
FROM checkins c
JOIN users u ON c.user_id = u.id
JOIN organizations o ON c.organization_id = o.id
WHERE c.submitted_at >= CURRENT_DATE - INTERVAL '14 days'
ORDER BY c.submitted_at DESC;

-- ========================================
-- 2. CHECK LAST WEEK'S CHECK-INS SPECIFICALLY (Oct 19-25, 2025)
-- ========================================
-- Shows check-ins that should be for last week
SELECT 
    u.name as user_name,
    u.email,
    c.week_of::date as stored_week_of,
    c.submitted_at::date as submitted_date,
    c.overall_mood,
    o.name as org_name,
    -- Show what week this SHOULD be for based on submission date
    DATE_TRUNC('week', c.submitted_at - INTERVAL '1 day')::date + INTERVAL '1 day' as calculated_week_start
FROM checkins c
JOIN users u ON c.user_id = u.id
JOIN organizations o ON c.organization_id = o.id
WHERE c.submitted_at >= '2025-10-19'::date 
    AND c.submitted_at <= '2025-10-25 23:59:59'::timestamp
ORDER BY o.name, c.submitted_at DESC;

-- ========================================
-- 3. CHECK CURRENT WEEK'S CHECK-INS (Oct 26 - Nov 1, 2025)
-- ========================================
-- Shows any check-ins for the current week
SELECT 
    u.name as user_name,
    u.email,
    c.week_of::date as stored_week_of,
    c.submitted_at,
    c.overall_mood,
    o.name as org_name
FROM checkins c
JOIN users u ON c.user_id = u.id
JOIN organizations o ON c.organization_id = o.id
WHERE (c.week_of >= '2025-10-26'::date AND c.week_of < '2025-11-02'::date)
   OR (c.submitted_at >= '2025-10-26'::date AND c.submitted_at < '2025-11-02'::date)
ORDER BY c.submitted_at DESC;

-- ========================================
-- 4. CHECK YOUR SPECIFIC CHECK-INS (Matthew and Mandy)
-- ========================================
-- Find check-ins from you and Mandy from the last month
SELECT 
    u.name,
    u.email,
    c.week_of::date as stored_week_of,
    c.submitted_at,
    TO_CHAR(c.submitted_at, 'Day, Mon DD, YYYY') as submitted_day,
    c.overall_mood,
    c.is_complete
FROM checkins c
JOIN users u ON c.user_id = u.id
WHERE u.email IN (
    'mpatrick@patrickaccounting.com', 
    'mandypatrick@patrickaccounting.com',
    'mpatrick@whirks.com'
)
AND c.submitted_at >= '2025-10-01'::date
ORDER BY c.submitted_at DESC;

-- ========================================
-- 5. ANALYZE WEEK_OF DATES VS SUBMISSION DATES
-- ========================================
-- This shows if there's a mismatch between when check-ins were submitted 
-- and what week they're recorded for
SELECT 
    COUNT(*) as count,
    c.week_of::date as stored_week_of,
    MIN(c.submitted_at)::date as earliest_submission,
    MAX(c.submitted_at)::date as latest_submission,
    STRING_AGG(DISTINCT u.name, ', ') as users_submitted
FROM checkins c
JOIN users u ON c.user_id = u.id
WHERE c.submitted_at >= '2025-10-01'::date
GROUP BY c.week_of
ORDER BY c.week_of DESC;

-- ========================================
-- 6. MISSING CHECK-INS REPORT FOR CURRENT WEEK
-- ========================================
-- Shows who has and hasn't submitted for current week (Oct 26-Nov 1)
WITH current_week_checkins AS (
    SELECT user_id 
    FROM checkins 
    WHERE week_of >= '2025-10-26'::date 
        AND week_of < '2025-11-02'::date
)
SELECT 
    o.name as organization,
    t.name as team,
    u.name as user_name,
    u.email,
    CASE 
        WHEN cwc.user_id IS NOT NULL THEN '✓ Submitted'
        ELSE '✗ Missing'
    END as status
FROM users u
JOIN organizations o ON u.organization_id = o.id
LEFT JOIN teams t ON u.team_id = t.id
LEFT JOIN current_week_checkins cwc ON u.id = cwc.user_id
WHERE u.is_active = true
    AND u.role IN ('member', 'manager', 'admin')
    AND o.name = 'Patrick Accounting'  -- Change this to check different orgs
ORDER BY status DESC, u.name;

-- ========================================
-- 7. CHECK IF WEEK_OF DATES ARE WRONG
-- ========================================
-- This checks if check-ins might be saved with incorrect week_of dates
SELECT 
    c.id,
    u.name,
    c.week_of::date as stored_week,
    c.submitted_at::date as submitted,
    EXTRACT(WEEK FROM c.week_of) as stored_week_num,
    EXTRACT(WEEK FROM c.submitted_at) as submitted_week_num,
    CASE 
        WHEN EXTRACT(WEEK FROM c.week_of) != EXTRACT(WEEK FROM c.submitted_at) 
        THEN 'MISMATCH!' 
        ELSE 'OK' 
    END as week_match
FROM checkins c
JOIN users u ON c.user_id = u.id
WHERE c.submitted_at >= '2025-10-15'::date
ORDER BY c.submitted_at DESC;

-- ========================================
-- 8. DEBUG: RAW CHECK-IN DATA
-- ========================================
-- Shows raw data to help identify any date storage issues
SELECT 
    id,
    user_id,
    week_of,
    submitted_at,
    created_at,
    organization_id
FROM checkins
WHERE submitted_at >= '2025-10-19'::date
ORDER BY submitted_at DESC
LIMIT 20;