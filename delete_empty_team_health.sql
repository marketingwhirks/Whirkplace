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