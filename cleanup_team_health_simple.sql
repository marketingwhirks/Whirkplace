-- ========================================
-- SIMPLIFIED CLEANUP SCRIPT FOR REPLIT SQL CONSOLE
-- ========================================
-- Run each section separately in the SQL Console

-- ========================================
-- STEP 1: CHECK WHAT EXISTS
-- ========================================
-- Run this first to see all Team Health categories and their question counts:

SELECT 
    qc.id,
    qc.name,
    qc.description,
    COUNT(DISTINCT q.id) as active_questions_count,
    COUNT(DISTINCT qb.id) as bank_questions_count,
    (COUNT(DISTINCT q.id) + COUNT(DISTINCT qb.id)) as total_questions
FROM question_categories qc
LEFT JOIN questions q ON qc.id = q.category_id
LEFT JOIN question_bank qb ON qc.id = qb.category_id
WHERE LOWER(qc.name) LIKE '%team health%'
GROUP BY qc.id, qc.name, qc.description
ORDER BY total_questions DESC, qc.created_at;

-- ========================================
-- STEP 2: DELETE DUPLICATES WITHOUT QUESTIONS
-- ========================================
-- After reviewing Step 1, run this to delete Team Health categories with 0 questions:
-- IMPORTANT: This will only delete categories named "Team Health" that have ZERO questions

DELETE FROM question_categories
WHERE id IN (
    SELECT qc.id
    FROM question_categories qc
    LEFT JOIN questions q ON qc.id = q.category_id
    LEFT JOIN question_bank qb ON qc.id = qb.category_id
    WHERE LOWER(TRIM(qc.name)) = 'team health'
    GROUP BY qc.id
    HAVING COUNT(q.id) = 0 AND COUNT(qb.id) = 0
);

-- ========================================
-- STEP 3: VERIFY CLEANUP
-- ========================================
-- Run this to confirm only one Team Health category remains:

SELECT 
    qc.id,
    qc.name,
    COUNT(DISTINCT q.id) as active_questions,
    COUNT(DISTINCT qb.id) as bank_questions
FROM question_categories qc
LEFT JOIN questions q ON qc.id = q.category_id
LEFT JOIN question_bank qb ON qc.id = qb.category_id
WHERE LOWER(qc.name) LIKE '%team health%'
GROUP BY qc.id, qc.name
ORDER BY qc.name;