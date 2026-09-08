-- Cash custody: waiter pouch, cash drop, cashier drawer, append-only ledger

CREATE TABLE "cashier_financial_sessions" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "cashier_membership_id" UUID NOT NULL,
    "shift_session_id" UUID NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'OPEN',
    "opening_float_amount" NUMERIC(19, 2) NOT NULL DEFAULT 0,
    "currency_code" CHAR(3) NOT NULL DEFAULT 'ETB',
    "opened_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closed_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cashier_financial_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_cashier_financial_sessions__shift" UNIQUE ("shift_session_id"),
    CONSTRAINT "ck_cashier_financial_sessions__float" CHECK ("opening_float_amount" >= 0),
    CONSTRAINT "ck_cashier_financial_sessions__status"
      CHECK ("status" IN ('OPEN', 'RECONCILIATION_PENDING', 'RECONCILED', 'CLOSED')),
    CONSTRAINT "cashier_financial_sessions_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cashier_financial_sessions_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cashier_financial_sessions_cashier_membership_id_fkey"
      FOREIGN KEY ("cashier_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cashier_financial_sessions_shift_session_id_fkey"
      FOREIGN KEY ("shift_session_id") REFERENCES "shift_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "uq_cashier_financial_sessions__one_open"
ON "cashier_financial_sessions"("cashier_membership_id", "branch_id")
WHERE "closed_at" IS NULL AND "status" <> 'CLOSED';

CREATE TABLE "cash_drops" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "waiter_membership_id" UUID NOT NULL,
    "waiter_shift_session_id" UUID NOT NULL,
    "declared_amount" NUMERIC(19, 2) NOT NULL,
    "currency_code" CHAR(3) NOT NULL DEFAULT 'ETB',
    "status" VARCHAR(32) NOT NULL DEFAULT 'INITIATED',
    "initiated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cashier_financial_session_id" UUID,
    "received_by_cashier_membership_id" UUID,
    "counted_amount" NUMERIC(19, 2),
    "received_at" TIMESTAMPTZ(6),
    "resolution_amount" NUMERIC(19, 2),
    "resolved_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_drops_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_cash_drops__declared" CHECK ("declared_amount" > 0),
    CONSTRAINT "ck_cash_drops__status"
      CHECK ("status" IN ('INITIATED', 'RECEIVED', 'DISPUTED', 'RESOLVED', 'CANCELLED_BEFORE_RECEIPT')),
    CONSTRAINT "cash_drops_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cash_drops_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cash_drops_waiter_membership_id_fkey"
      FOREIGN KEY ("waiter_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cash_drops_waiter_shift_session_id_fkey"
      FOREIGN KEY ("waiter_shift_session_id") REFERENCES "shift_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cash_drops_cashier_financial_session_id_fkey"
      FOREIGN KEY ("cashier_financial_session_id") REFERENCES "cashier_financial_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cash_drops_received_by_cashier_membership_id_fkey"
      FOREIGN KEY ("received_by_cashier_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX "ix_cash_drops__waiter_shift"
ON "cash_drops"("waiter_shift_session_id", "status", "initiated_at");

CREATE INDEX "ix_cash_drops__cashier_pending"
ON "cash_drops"("tenant_id", "branch_id", "status", "initiated_at")
WHERE "status" IN ('INITIATED', 'DISPUTED');

CREATE TABLE "cash_drop_disputes" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "cash_drop_id" UUID NOT NULL,
    "declared_amount" NUMERIC(19, 2) NOT NULL,
    "counted_amount" NUMERIC(19, 2) NOT NULL,
    "variance" NUMERIC(19, 2) NOT NULL,
    "waiter_comment" TEXT,
    "cashier_comment" TEXT,
    "status" VARCHAR(40) NOT NULL DEFAULT 'OPEN',
    "resolution_amount" NUMERIC(19, 2),
    "resolution_note" TEXT,
    "resolved_by_membership_id" UUID,
    "resolved_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_drop_disputes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_cash_drop_disputes__drop" UNIQUE ("cash_drop_id"),
    CONSTRAINT "ck_cash_drop_disputes__status"
      CHECK ("status" IN (
        'OPEN',
        'RESOLVED_ACCEPT_COUNTED',
        'RESOLVED_ACCEPT_DECLARED',
        'RESOLVED_OTHER'
      )),
    CONSTRAINT "cash_drop_disputes_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cash_drop_disputes_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cash_drop_disputes_cash_drop_id_fkey"
      FOREIGN KEY ("cash_drop_id") REFERENCES "cash_drops"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cash_drop_disputes_resolved_by_membership_id_fkey"
      FOREIGN KEY ("resolved_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "cash_ledger_entries" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "holder_type" VARCHAR(20) NOT NULL,
    "waiter_shift_session_id" UUID,
    "cashier_financial_session_id" UUID,
    "entry_type" VARCHAR(40) NOT NULL,
    "amount_delta" NUMERIC(19, 2) NOT NULL,
    "currency_code" CHAR(3) NOT NULL DEFAULT 'ETB',
    "source_type" VARCHAR(40) NOT NULL,
    "source_id" UUID NOT NULL,
    "created_by_membership_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_ledger_entries_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_cash_ledger_entries__nonzero" CHECK ("amount_delta" <> 0),
    CONSTRAINT "ck_cash_ledger_entries__holder"
      CHECK (
        ("holder_type" = 'WAITER_SHIFT'
          AND "waiter_shift_session_id" IS NOT NULL
          AND "cashier_financial_session_id" IS NULL)
        OR
        ("holder_type" = 'CASHIER_SESSION'
          AND "cashier_financial_session_id" IS NOT NULL
          AND "waiter_shift_session_id" IS NULL)
      ),
    CONSTRAINT "ck_cash_ledger_entries__entry_type"
      CHECK ("entry_type" IN (
        'CASH_PAYMENT_COLLECTED',
        'CASH_DROP_OUT',
        'OPENING_FLOAT',
        'CASH_DROP_IN',
        'APPROVED_ADJUSTMENT'
      )),
    CONSTRAINT "ck_cash_ledger_entries__source_type"
      CHECK ("source_type" IN ('PAYMENT', 'CASH_DROP', 'FINANCIAL_SESSION', 'ADJUSTMENT')),
    CONSTRAINT "cash_ledger_entries_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cash_ledger_entries_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cash_ledger_entries_waiter_shift_session_id_fkey"
      FOREIGN KEY ("waiter_shift_session_id") REFERENCES "shift_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cash_ledger_entries_cashier_financial_session_id_fkey"
      FOREIGN KEY ("cashier_financial_session_id") REFERENCES "cashier_financial_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cash_ledger_entries_created_by_membership_id_fkey"
      FOREIGN KEY ("created_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "uq_cash_ledger_entries__source_effect_waiter"
ON "cash_ledger_entries"("source_type", "source_id", "entry_type", "waiter_shift_session_id")
WHERE "waiter_shift_session_id" IS NOT NULL;

CREATE UNIQUE INDEX "uq_cash_ledger_entries__source_effect_cashier"
ON "cash_ledger_entries"("source_type", "source_id", "entry_type", "cashier_financial_session_id")
WHERE "cashier_financial_session_id" IS NOT NULL;

CREATE TABLE "cashier_reconciliations" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "cashier_financial_session_id" UUID NOT NULL,
    "currency_code" CHAR(3) NOT NULL DEFAULT 'ETB',
    "expected_cash_amount" NUMERIC(19, 2) NOT NULL,
    "counted_cash_amount" NUMERIC(19, 2) NOT NULL,
    "variance_amount" NUMERIC(19, 2) NOT NULL,
    "cashier_comment" TEXT,
    "status" VARCHAR(32) NOT NULL DEFAULT 'SUBMITTED',
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by_membership_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "review_comment" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "cashier_reconciliations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_cashier_reconciliations__session" UNIQUE ("cashier_financial_session_id"),
    CONSTRAINT "ck_cashier_reconciliations__status"
      CHECK ("status" IN ('SUBMITTED', 'APPROVED', 'FLAGGED', 'RESOLVED')),
    CONSTRAINT "cashier_reconciliations_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cashier_reconciliations_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cashier_reconciliations_cashier_financial_session_id_fkey"
      FOREIGN KEY ("cashier_financial_session_id") REFERENCES "cashier_financial_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "cashier_reconciliations_reviewed_by_membership_id_fkey"
      FOREIGN KEY ("reviewed_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
