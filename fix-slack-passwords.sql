-- SQL script to fix Slack users in production who have empty passwords
-- This script should be run in the production database

-- First, let's check what Slack users exist and their password status
SELECT 
    name,
    email,
    auth_provider,
    CASE 
        WHEN password IS NULL THEN 'NULL'
        WHEN password = '' THEN 'EMPTY STRING'
        ELSE 'HAS PASSWORD'
    END as password_status,
    slack_user_id
FROM users 
WHERE organization_id = (
    SELECT id FROM organizations WHERE name = 'Patrick Accounting'
)
AND auth_provider = 'slack'
ORDER BY name;

-- If the above query shows Slack users with 'HAS PASSWORD' status,
-- and you want to allow them to set new passwords, you can update them:
-- 
-- UPDATE users 
-- SET password = ''
-- WHERE organization_id = (
--     SELECT id FROM organizations WHERE name = 'Patrick Accounting'
-- )
-- AND auth_provider = 'slack'
-- AND password IS NOT NULL
-- AND password != '';

-- Note: Only uncomment and run the UPDATE if you're sure you want to reset passwords for Slack users