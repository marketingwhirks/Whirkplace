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