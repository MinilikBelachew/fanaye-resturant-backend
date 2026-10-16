-- Pre-migration: make ingredient names unique per tenant before new constraint.
UPDATE inventory_ingredients i
SET name = i.name || ' (' || COALESCE(b.display_code, LEFT(i.branch_id::text, 8)) || ')'
FROM branches b
WHERE i.branch_id = b.id
  AND EXISTS (
    SELECT 1
    FROM inventory_ingredients i2
    WHERE i2.tenant_id = i.tenant_id
      AND lower(i2.name) = lower(regexp_replace(i.name, ' \([^)]+\)$', ''))
      AND i2.id <> i.id
  )
  AND i.id NOT IN (
    SELECT DISTINCT ON (tenant_id, lower(name)) id
    FROM inventory_ingredients
    ORDER BY tenant_id, lower(name), created_at ASC
  );
