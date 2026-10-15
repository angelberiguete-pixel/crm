-- LOOK SOCIAL MEDIA CRM | QA database-integrity audit (READ ONLY)
-- PostgreSQL 17+; safe against production: catalog SELECT only.
-- A composite FK with ON DELETE SET NULL and no column subset attempts
-- to NULL every referencing column, including a NOT NULL tenant_id.
-- Expected release gate: zero rows.
WITH candidate_fks AS (
  SELECT c.oid, c.conname, c.conrelid, c.confrelid, c.conkey,
         c.confdelsetcols, pg_get_constraintdef(c.oid) AS definition
  FROM pg_constraint AS c
  WHERE c.contype = 'f' AND c.confdeltype = 'n'
), nullable_targets AS (
  SELECT f.conname,
         f.conrelid::regclass::text AS child_table,
         f.confrelid::regclass::text AS parent_table,
         f.definition,
         array_agg(a.attname ORDER BY k.ordinality)
           FILTER (WHERE a.attnotnull) AS required_columns_affected,
         count(*) FILTER (WHERE a.attnotnull) AS not_null_targets
  FROM candidate_fks AS f
  CROSS JOIN LATERAL unnest(COALESCE(f.confdelsetcols, f.conkey))
    WITH ORDINALITY AS k(attnum, ordinality)
  JOIN pg_attribute AS a ON a.attrelid = f.conrelid AND a.attnum = k.attnum
  GROUP BY f.conname, f.conrelid, f.confrelid, f.definition
)
SELECT child_table, parent_table, conname, required_columns_affected, definition
FROM nullable_targets
WHERE not_null_targets > 0
ORDER BY child_table, conname;

-- Release rule: do not claim a pass while this query returns rows.
-- Remediate in an isolated database using ON DELETE SET NULL (nullable_column)
-- after verifying each relationship's semantics; preserve tenant_id.
-- Do not execute DDL or DELETE on production as part of this audit.
