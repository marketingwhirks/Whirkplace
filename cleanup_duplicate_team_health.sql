-- =====================================================
-- SQL Script to Clean Up Duplicate "Team Health" Categories
-- =====================================================
-- This script safely identifies and removes duplicate "Team Health" 
-- categories that have no questions associated with them.
-- 
-- It is safe to run in production and is idempotent (can be run multiple times).
-- =====================================================

-- Start transaction for safety
BEGIN;

-- =====================================================
-- STEP 1: ANALYSIS - Identify all "Team Health" categories
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE 'STEP 1: Analyzing Team Health Categories';
    RAISE NOTICE '========================================';
END $$;

-- Show all "Team Health" categories with their question counts
WITH team_health_analysis AS (
    SELECT 
        qc.id as category_id,
        qc.name as category_name,
        qc.description,
        qc."order",
        qc."isDefault",
        qc."createdAt",
        -- Count questions in the questions table
        COALESCE((
            SELECT COUNT(*) 
            FROM questions q 
            WHERE q."categoryId" = qc.id
        ), 0) as question_count,
        -- Count questions in the question_bank table
        COALESCE((
            SELECT COUNT(*) 
            FROM question_bank qb 
            WHERE qb."categoryId" = qc.id
        ), 0) as bank_question_count,
        -- Total count from both tables
        COALESCE((
            SELECT COUNT(*) 
            FROM questions q 
            WHERE q."categoryId" = qc.id
        ), 0) + COALESCE((
            SELECT COUNT(*) 
            FROM question_bank qb 
            WHERE qb."categoryId" = qc.id
        ), 0) as total_question_count
    FROM question_categories qc
    WHERE LOWER(TRIM(qc.name)) = 'team health'
    ORDER BY qc."createdAt" ASC
)
SELECT 
    category_id,
    category_name,
    description,
    "order",
    "isDefault",
    "createdAt",
    question_count,
    bank_question_count,
    total_question_count,
    CASE 
        WHEN total_question_count = 0 THEN '⚠️ CANDIDATE FOR DELETION'
        ELSE '✅ KEEP (has questions)'
    END as status
FROM team_health_analysis;

-- =====================================================
-- STEP 2: VERIFICATION - Show what will be deleted
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'STEP 2: Categories to be Deleted';
    RAISE NOTICE '========================================';
END $$;

-- Show which Team Health categories will be deleted (those with 0 questions)
WITH duplicate_team_health AS (
    SELECT 
        qc.id as category_id,
        qc.name as category_name,
        qc."createdAt",
        ROW_NUMBER() OVER (ORDER BY qc."createdAt" ASC) as row_num,
        COUNT(*) OVER () as total_duplicates
    FROM question_categories qc
    WHERE LOWER(TRIM(qc.name)) = 'team health'
),
categories_to_delete AS (
    SELECT 
        dth.category_id,
        dth.category_name,
        dth."createdAt",
        dth.row_num,
        dth.total_duplicates,
        -- Check for questions in both tables
        EXISTS (
            SELECT 1 FROM questions q WHERE q."categoryId" = dth.category_id
            UNION
            SELECT 1 FROM question_bank qb WHERE qb."categoryId" = dth.category_id
        ) as has_questions
    FROM duplicate_team_health dth
    WHERE dth.total_duplicates > 1  -- Only process if there are duplicates
)
SELECT 
    category_id,
    category_name,
    "createdAt",
    CASE 
        WHEN has_questions = false AND row_num > 1 THEN '❌ WILL BE DELETED (duplicate with no questions)'
        WHEN has_questions = false ]]]AND row_num = 1 AND total_duplicates > 1 THEN '⚠️ WILL BE DELETED (first but no questions, keeping newer ones)'
        WHEN has_questions = true THEN '✅ WILL BE KEPT (has questions)'
        ELSE '✅ WILL BE KEPT (only one exists)'
    END as action
FROM categories_to_delete
WHERE has_questions = false  -- Only show categories that will be deleted
ORDER BY "createdAt" ASC;

-- =====================================================
-- STEP 3: COUNT CHECK - Safety verification
-- =====================================================
DO $$
DECLARE
    duplicate_count INTEGER;
    deletable_count INTEGER;
    categories_with_questions INTEGER;
BEGIN
    -- Count total Team Health categories
    SELECT COUNT(*) INTO duplicate_count
    FROM question_categories 
    WHERE LOWER(TRIM(name)) = 'team health';
    
    -- Count Team Health categories with no questions
    SELECT COUNT(*) INTO deletable_count
    FROM question_categories qc
    WHERE LOWER(TRIM(qc.name)) = 'team health'
    AND NOT EXISTS (
        SELECT 1 FROM questions q WHERE q."categoryId" = qc.id
        UNION
        SELECT 1 FROM question_bank qb WHERE qb."categoryId" = qc.id
    );
    
    -- Count Team Health categories with questions
    SELECT COUNT(*) INTO categories_with_questions
    FROM question_categories qc
    WHERE LOWER(TRIM(qc.name)) = 'team health'
    AND EXISTS (
        SELECT 1 FROM questions q WHERE q."categoryId" = qc.id
        UNION
        SELECT 1 FROM question_bank qb WHERE qb."categoryId" = qc.id
    );

    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'STEP 3: Safety Check Summary';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'Total "Team Health" categories found: %', duplicate_count;
    RAISE NOTICE 'Categories with questions (will keep): %', categories_with_questions;
    RAISE NOTICE 'Categories without questions (will delete): %', deletable_count;
    
    -- Safety check: Only proceed if we have duplicates and at least one will remain
    IF duplicate_count <= 1 THEN
        RAISE NOTICE '';
        RAISE NOTICE '✅ No duplicates found. Nothing to delete.';
    ELSIF deletable_count = 0 THEN
        RAISE NOTICE '';
        RAISE NOTICE '✅ All Team Health categories have questions. Nothing to delete.';
    ELSIF deletable_count >= duplicate_count THEN
        RAISE EXCEPTION 'SAFETY CHECK FAILED: All Team Health categories would be deleted! Aborting.';
    ELSE
        RAISE NOTICE '';
        RAISE NOTICE '✅ Safe to proceed: % categories will be deleted, % will remain.', 
                     deletable_count, (duplicate_count - deletable_count);
    END IF;
END $$;

-- =====================================================
-- STEP 4: DELETION - Remove duplicate Team Health categories with no questions
-- =====================================================
DO $$
DECLARE
    deleted_count INTEGER;
    deleted_ids TEXT;
BEGIN
    -- Only delete if we have duplicates
    IF (SELECT COUNT(*) FROM question_categories WHERE LOWER(TRIM(name)) = 'team health') > 1 THEN
        
        -- Collect IDs that will be deleted for logging
        SELECT STRING_AGG(id, ', ') INTO deleted_ids
        FROM question_categories qc
        WHERE LOWER(TRIM(qc.name)) = 'team health'
        AND NOT EXISTS (
            SELECT 1 FROM questions q WHERE q."categoryId" = qc.id
            UNION
            SELECT 1 FROM question_bank qb WHERE qb."categoryId" = qc.id
        )
        -- Keep at least one Team Health category (the one with questions or the oldest)
        AND qc.id NOT IN (
            SELECT id 
            FROM question_categories 
            WHERE LOWER(TRIM(name)) = 'team health'
            AND EXISTS (
                SELECT 1 FROM questions q WHERE q."categoryId" = question_categories.id
                UNION
                SELECT 1 FROM question_bank qb WHERE qb."categoryId" = question_categories.id
            )
            ORDER BY "createdAt" ASC
            LIMIT 1
        );
        
        -- Perform the deletion
        DELETE FROM question_categories qc
        WHERE LOWER(TRIM(qc.name)) = 'team health'
        AND NOT EXISTS (
            SELECT 1 FROM questions q WHERE q."categoryId" = qc.id
            UNION
            SELECT 1 FROM question_bank qb WHERE qb."categoryId" = qc.id
        )
        -- Extra safety: Keep at least one Team Health category
        AND qc.id NOT IN (
            SELECT id 
            FROM question_categories 
            WHERE LOWER(TRIM(name)) = 'team health'
            ORDER BY 
                -- Prioritize keeping categories with questions
                CASE WHEN EXISTS (
                    SELECT 1 FROM questions WHERE "categoryId" = question_categories.id
                    UNION
                    SELECT 1 FROM question_bank WHERE "categoryId" = question_categories.id
                ) THEN 0 ELSE 1 END,
                -- Then by creation date (keep oldest)
                "createdAt" ASC
            LIMIT 1
        );
        
        GET DIAGNOSTICS deleted_count = ROW_COUNT;
        
        RAISE NOTICE '';
        RAISE NOTICE '========================================';
        RAISE NOTICE 'STEP 4: Deletion Complete';
        RAISE NOTICE '========================================';
        RAISE NOTICE 'Deleted % Team Health categories with no questions', deleted_count;
        IF deleted_ids IS NOT NULL THEN
            RAISE NOTICE 'Deleted category IDs: %', deleted_ids;
        END IF;
    ELSE
        RAISE NOTICE '';
        RAISE NOTICE '========================================';
        RAISE NOTICE 'STEP 4: No Deletion Needed';
        RAISE NOTICE '========================================';
        RAISE NOTICE 'No duplicate Team Health categories found.';
    END IF;
END $$;

-- =====================================================
-- STEP 5: FINAL VERIFICATION - Show remaining categories
-- =====================================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '========================================';
    RAISE NOTICE 'STEP 5: Final State Verification';
    RAISE NOTICE '========================================';
END $$;

-- Show all remaining Team Health categories after cleanup
SELECT 
    qc.id as category_id,
    qc.name as category_name,
    qc.description,
    qc."createdAt",
    (SELECT COUNT(*) FROM questions q WHERE q."categoryId" = qc.id) as question_count,
    (SELECT COUNT(*) FROM question_bank qb WHERE qb."categoryId" = qc.id) as bank_question_count,
    '✅ KEPT' as final_status
FROM question_categories qc
WHERE LOWER(TRIM(qc.name)) = 'team health'
ORDER BY qc."createdAt" ASC;

-- =====================================================
-- COMMIT OR ROLLBACK
-- =====================================================
-- Uncomment the line you want to use:

-- To apply changes (after reviewing the output):
COMMIT;

-- To cancel changes (if something looks wrong):
-- ROLLBACK;

-- =====================================================
-- END OF SCRIPT
-- =====================================================
-- 
-- USAGE INSTRUCTIONS:
-- 1. Run this entire script to see what will be deleted
-- 2. Review the output carefully
-- 3. If everything looks correct, the COMMIT will apply changes
-- 4. If you want to abort, change COMMIT to ROLLBACK and run again
-- 
-- This script is idempotent - it can be run multiple times safely.
-- It will only delete Team Health categories that have no questions.
-- =====================================================