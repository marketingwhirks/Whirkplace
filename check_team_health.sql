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