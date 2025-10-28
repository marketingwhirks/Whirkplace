-- ========================================
-- COMPREHENSIVE PRODUCTION FIX QUERIES
-- Run these in order to fix all issues
-- ========================================

-- ========================================
-- 1. CHECK CURRENT STATE
-- ========================================

-- Check all pending reviews and manager relationships
SELECT 
    c.id as checkin_id,
    u.name as employee_name,
    u.email as employee_email,
    u.manager_id,
    m.name as manager_name,
    m.email as manager_email,
    c.week_of::date,
    c.submitted_at::date,
    c.review_status,
    c.reviewed_by,
    c.reviewed_at,
    c.overall_mood,
    CASE 
        WHEN u.manager_id IS NULL THEN '❌ NO MANAGER'
        WHEN c.review_status = 'pending' THEN '⚠️ PENDING'
        WHEN c.review_status = 'reviewed' THEN '✅ REVIEWED'
        ELSE '❓ UNKNOWN'
    END as status
FROM checkins c
JOIN users u ON c.user_id = u.id
LEFT JOIN users m ON u.manager_id = m.id
WHERE u.organization_id = 'dd921655-aee7-45b3-9319-d484a706cfb9'
    AND c.week_of >= '2025-10-20'  -- Last 2 weeks
ORDER BY c.week_of DESC, u.name;

-- ========================================
-- 2. CHECK TEAM LEADERSHIP STRUCTURE
-- ========================================

-- Show teams and their leaders
SELECT 
    t.name as team_name,
    t.leader_id,
    l.name as leader_name,
    l.email as leader_email,
    COUNT(u.id) as member_count,
    STRING_AGG(
        CASE 
            WHEN u.manager_id IS NULL THEN u.name || ' (NO MANAGER)'
            ELSE u.name
        END, 
        ', '
    ) as members
FROM teams t
LEFT JOIN users l ON t.leader_id = l.id
LEFT JOIN users u ON u.team_id = t.id AND u.id != t.leader_id
WHERE t.organization_id = 'dd921655-aee7-45b3-9319-d484a706cfb9'
GROUP BY t.id, t.name, t.leader_id, l.name, l.email
ORDER BY t.name;

-- ========================================
-- 3. FIX KIM POPE'S MANAGER
-- ========================================

-- First check Kim's current state
SELECT 
    'Before Fix' as state,
    id, 
    name, 
    email, 
    manager_id,
    team_id
FROM users 
WHERE email = 'kimpope@patrickaccounting.com';

-- Fix Kim's manager
UPDATE users
SET manager_id = (SELECT id FROM users WHERE email = 'mpatrick@patrickaccounting.com')
WHERE email = 'kimpope@patrickaccounting.com'
    AND (manager_id IS NULL OR manager_id != (SELECT id FROM users WHERE email = 'mpatrick@patrickaccounting.com'));

-- Verify the fix
SELECT 
    'After Fix' as state,
    u.id, 
    u.name, 
    u.email, 
    u.manager_id,
    m.name as manager_name
FROM users u
LEFT JOIN users m ON u.manager_id = m.id
WHERE u.email = 'kimpope@patrickaccounting.com';

-- ========================================
-- 4. FIX ALL USERS WITHOUT MANAGERS
-- ========================================

-- Show who will be affected
SELECT 
    u.name,
    u.email,
    t.name as team_name,
    l.name as will_be_manager
FROM users u
JOIN teams t ON u.team_id = t.id
LEFT JOIN users l ON t.leader_id = l.id
WHERE u.organization_id = 'dd921655-aee7-45b3-9319-d484a706cfb9'
    AND u.manager_id IS NULL
    AND t.leader_id IS NOT NULL
    AND u.id != t.leader_id
    AND u.is_active = true;

-- Fix all users without managers by assigning team leader
UPDATE users u
SET manager_id = t.leader_id
FROM teams t
WHERE u.team_id = t.id
    AND u.organization_id = 'dd921655-aee7-45b3-9319-d484a706cfb9'
    AND u.manager_id IS NULL
    AND t.leader_id IS NOT NULL
    AND u.is_active = true
    AND u.id != t.leader_id;

-- ========================================
-- 5. CHECK IF TEAM LEADERS NEED SETTING
-- ========================================

-- Show teams without leaders
SELECT 
    t.name as team_name,
    t.id as team_id,
    COUNT(u.id) as member_count,
    STRING_AGG(u.name || ' (' || u.role || ')', ', ') as members
FROM teams t
LEFT JOIN users u ON u.team_id = t.id
WHERE t.organization_id = 'dd921655-aee7-45b3-9319-d484a706cfb9'
    AND t.leader_id IS NULL
GROUP BY t.id, t.name
ORDER BY t.name;

-- ========================================
-- 6. MANUALLY SET TEAM LEADERS
-- ========================================

-- Set Matthew Patrick as leader of Leadership team if not set
UPDATE teams
SET leader_id = (SELECT id FROM users WHERE email = 'mpatrick@patrickaccounting.com')
WHERE organization_id = 'dd921655-aee7-45b3-9319-d484a706cfb9'
    AND name = 'Leadership'
    AND leader_id IS NULL;

-- Set Kim Pope as leader of Accounting team if not set  
UPDATE teams
SET leader_id = (SELECT id FROM users WHERE email = 'kimpope@patrickaccounting.com')
WHERE organization_id = 'dd921655-aee7-45b3-9319-d484a706cfb9'
    AND name = 'Accounting'
    AND leader_id IS NULL;

-- Set Shelby Betts as leader of Sales team if not set
UPDATE teams
SET leader_id = (SELECT id FROM users WHERE email = 'shelbyb@patrickaccounting.com')
WHERE organization_id = 'dd921655-aee7-45b3-9319-d484a706cfb9'
    AND name = 'Sales'
    AND leader_id IS NULL;

-- ========================================
-- 7. VERIFY ALL PENDING REVIEWS
-- ========================================

-- Count all pending reviews by manager
SELECT 
    m.name as manager_name,
    m.email as manager_email,
    COUNT(c.id) as pending_count,
    STRING_AGG(u.name || ' (' || c.week_of::date || ')', ', ') as pending_from
FROM checkins c
JOIN users u ON c.user_id = u.id
LEFT JOIN users m ON u.manager_id = m.id
WHERE u.organization_id = 'dd921655-aee7-45b3-9319-d484a706cfb9'
    AND c.review_status = 'pending'
    AND m.id IS NOT NULL
GROUP BY m.id, m.name, m.email
ORDER BY pending_count DESC;

-- ========================================
-- 8. FINAL VERIFICATION
-- ========================================

-- Show final state of all relationships
SELECT 
    'Organization Summary' as report,
    COUNT(DISTINCT u.id) as total_users,
    COUNT(DISTINCT u.id) FILTER (WHERE u.manager_id IS NOT NULL) as users_with_managers,
    COUNT(DISTINCT u.id) FILTER (WHERE u.manager_id IS NULL) as users_without_managers,
    COUNT(DISTINCT t.id) as total_teams,
    COUNT(DISTINCT t.id) FILTER (WHERE t.leader_id IS NOT NULL) as teams_with_leaders,
    COUNT(DISTINCT c.id) FILTER (WHERE c.review_status = 'pending') as total_pending_reviews
FROM users u
CROSS JOIN teams t
CROSS JOIN checkins c
JOIN users cu ON c.user_id = cu.id
WHERE u.organization_id = 'dd921655-aee7-45b3-9319-d484a706cfb9'
    AND t.organization_id = 'dd921655-aee7-45b3-9319-d484a706cfb9'
    AND cu.organization_id = 'dd921655-aee7-45b3-9319-d484a706cfb9';

-- ========================================
-- 9. SHOW MATTHEW'S PENDING REVIEWS
-- ========================================

-- What Matthew should see as pending reviews
SELECT 
    c.id,
    u.name as employee,
    u.email,
    c.week_of::date,
    c.submitted_at::date,
    c.overall_mood,
    c.review_status,
    'Direct Report' as relationship
FROM checkins c
JOIN users u ON c.user_id = u.id
WHERE u.manager_id = (SELECT id FROM users WHERE email = 'mpatrick@patrickaccounting.com')
    AND c.review_status = 'pending'
ORDER BY c.submitted_at DESC;