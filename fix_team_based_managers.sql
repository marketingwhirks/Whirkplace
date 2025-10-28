-- Fix Manager Relationships Based on Team Leadership

-- ============================================
-- STEP 1: Check Kim Pope's team and its leader
-- ============================================
SELECT 
    u.name as employee_name,
    u.email,
    u.team_id,
    t.name as team_name,
    t.leader_id as team_leader_id,
    leader.name as team_leader_name,
    leader.email as team_leader_email,
    u.manager_id as current_manager_id,
    manager.name as current_manager_name
FROM users u
LEFT JOIN teams t ON u.team_id = t.id
LEFT JOIN users leader ON t.leader_id = leader.id
LEFT JOIN users manager ON u.manager_id = manager.id
WHERE u.email = 'kimpope@patrickaccounting.com';

-- ============================================
-- STEP 2: Check what teams Matthew Patrick leads
-- ============================================
SELECT 
    t.id as team_id,
    t.name as team_name,
    t.leader_id,
    leader.name as leader_name,
    leader.email as leader_email,
    COUNT(u.id) as team_members_count
FROM teams t
LEFT JOIN users leader ON t.leader_id = leader.id
LEFT JOIN users u ON u.team_id = t.id AND u.is_active = true
WHERE leader.email = 'mpatrick@patrickaccounting.com'
    OR t.organization_id = (
        SELECT organization_id FROM users WHERE email = 'mpatrick@patrickaccounting.com'
    )
GROUP BY t.id, t.name, t.leader_id, leader.name, leader.email
ORDER BY t.name;

-- ============================================
-- STEP 3: See all team members who should have you as manager
-- ============================================
SELECT 
    u.name as team_member,
    u.email,
    u.role,
    t.name as team_name,
    u.manager_id as current_manager,
    CASE 
        WHEN u.manager_id IS NULL THEN '❌ No Manager'
        WHEN u.manager_id = t.leader_id THEN '✅ Correct (Team Leader)'
        ELSE '⚠️ Different Manager'
    END as status
FROM users u
JOIN teams t ON u.team_id = t.id
WHERE t.leader_id = (
    SELECT id FROM users WHERE email = 'mpatrick@patrickaccounting.com'
)
AND u.is_active = true
ORDER BY t.name, u.name;

-- ============================================
-- STEP 4: UPDATE - Set team leader as manager for all team members without managers
-- ============================================
-- This will set the team leader as manager for anyone on the team who doesn't have a manager
UPDATE users u
SET manager_id = t.leader_id
FROM teams t
WHERE u.team_id = t.id
    AND u.manager_id IS NULL  -- Only update if no manager is set
    AND t.leader_id IS NOT NULL  -- Only if team has a leader
    AND u.is_active = true
    AND u.id != t.leader_id;  -- Don't make someone their own manager

-- ============================================
-- STEP 5: ALTERNATIVE - Set yourself as manager for specific team
-- ============================================
-- If you know the team name, you can be more specific
-- Replace 'Leadership Team' with the actual team name
/*
UPDATE users u
SET manager_id = (SELECT id FROM users WHERE email = 'mpatrick@patrickaccounting.com')
FROM teams t
WHERE u.team_id = t.id
    AND t.name = 'Leadership Team'
    AND u.manager_id IS NULL
    AND u.is_active = true
    AND u.email != 'mpatrick@patrickaccounting.com';
*/

-- ============================================
-- STEP 6: Check if the team needs a leader assigned
-- ============================================
SELECT 
    t.id,
    t.name as team_name,
    t.leader_id,
    leader.name as current_leader,
    COUNT(u.id) as team_size,
    SUM(CASE WHEN u.manager_id IS NULL THEN 1 ELSE 0 END) as members_without_managers
FROM teams t
LEFT JOIN users leader ON t.leader_id = leader.id
LEFT JOIN users u ON u.team_id = t.id AND u.is_active = true
WHERE t.organization_id = (
    SELECT organization_id FROM users WHERE email = 'mpatrick@patrickaccounting.com'
)
GROUP BY t.id, t.name, t.leader_id, leader.name
HAVING COUNT(u.id) > 0
ORDER BY t.name;

-- ============================================
-- STEP 7: If team has no leader, set Matthew as the leader
-- ============================================
-- This will make Matthew the leader of teams that don't have one
-- Replace 'TEAM_ID' with the actual team ID from Step 6
/*
UPDATE teams
SET leader_id = (SELECT id FROM users WHERE email = 'mpatrick@patrickaccounting.com')
WHERE id = 'TEAM_ID'
    AND leader_id IS NULL;
*/

-- ============================================
-- STEP 8: Verify everything is fixed
-- ============================================
SELECT 
    u.name as employee,
    u.email,
    u.role,
    t.name as team,
    leader.name as team_leader,
    manager.name as assigned_manager,
    CASE 
        WHEN c.id IS NOT NULL AND c.review_status = 'pending' THEN '📝 Has Pending Review'
        ELSE ''
    END as pending_review
FROM users u
JOIN teams t ON u.team_id = t.id
LEFT JOIN users leader ON t.leader_id = leader.id
LEFT JOIN users manager ON u.manager_id = manager.id
LEFT JOIN LATERAL (
    SELECT id, review_status 
    FROM checkins 
    WHERE user_id = u.id 
        AND review_status = 'pending' 
    ORDER BY submitted_at DESC 
    LIMIT 1
) c ON true
WHERE u.organization_id = (
    SELECT organization_id FROM users WHERE email = 'mpatrick@patrickaccounting.com'
)
AND u.is_active = true
ORDER BY t.name, u.name;