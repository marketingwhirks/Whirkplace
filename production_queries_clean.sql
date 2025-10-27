-- QUERY 1: Last 2 Weeks Overview
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


-- QUERY 2: Last Week Check-ins (Oct 19-25, 2025)
SELECT 
    u.name as user_name,
    u.email,
    c.week_of::date as stored_week_of,
    c.submitted_at::date as submitted_date,
    c.overall_mood,
    o.name as org_name,
    DATE_TRUNC('week', c.submitted_at - INTERVAL '1 day')::date + INTERVAL '1 day' as calculated_week_start
FROM checkins c
JOIN users u ON c.user_id = u.id
JOIN organizations o ON c.organization_id = o.id
WHERE c.submitted_at >= '2025-10-19'::date 
    AND c.submitted_at <= '2025-10-25 23:59:59'::timestamp
ORDER BY o.name, c.submitted_at DESC;


-- QUERY 3: Current Week Check-ins (Oct 26 - Nov 1, 2025)
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


-- QUERY 4: Your Specific Check-ins (Matthew and Mandy)
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


-- QUERY 5: Week Analysis - Check for Date Mismatches
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