-- Yield test fields on ingredients and production batches
ALTER TABLE "inventory_ingredients"
  ADD COLUMN IF NOT EXISTS "standard_yield_percent" DECIMAL(8, 2);

ALTER TABLE "inventory_production_batches"
  ADD COLUMN IF NOT EXISTS "expected_output_quantity" DECIMAL(19, 4),
  ADD COLUMN IF NOT EXISTS "yield_percent" DECIMAL(8, 2),
  ADD COLUMN IF NOT EXISTS "input_cost_total" DECIMAL(19, 4) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "output_unit_cost" DECIMAL(19, 4) NOT NULL DEFAULT 0;
