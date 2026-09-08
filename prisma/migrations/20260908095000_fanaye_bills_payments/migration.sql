-- Bills + waiter-collected payments.
-- Transfer proof is a photo we store. No third-party verify in this slice.

CREATE TABLE "bill_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "table_session_id" UUID NOT NULL,
    "requested_by_membership_id" UUID NOT NULL,
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    "warning_json" JSONB,
    "cancelled_at" TIMESTAMPTZ(6),
    "fulfilled_at" TIMESTAMPTZ(6),

    CONSTRAINT "bill_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_bill_requests__status"
      CHECK ("status" IN ('PENDING', 'CANCELLED', 'FULFILLED')),
    CONSTRAINT "bill_requests_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "bill_requests_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "bill_requests_table_session_id_fkey"
      FOREIGN KEY ("table_session_id") REFERENCES "table_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "bill_requests_requested_by_membership_id_fkey"
      FOREIGN KEY ("requested_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "uq_bill_requests__one_pending"
ON "bill_requests"("table_session_id")
WHERE "status" = 'PENDING';

CREATE TABLE "bills" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "table_session_id" UUID NOT NULL,
    "bill_number" VARCHAR(60) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'GENERATED',
    "currency_code" CHAR(3) NOT NULL DEFAULT 'ETB',
    "subtotal_amount" NUMERIC(19, 2) NOT NULL,
    "cancelled_amount" NUMERIC(19, 2) NOT NULL DEFAULT 0,
    "total_amount" NUMERIC(19, 2) NOT NULL,
    "amount_paid" NUMERIC(19, 2) NOT NULL DEFAULT 0,
    "generated_by_membership_id" UUID NOT NULL,
    "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paid_at" TIMESTAMPTZ(6),
    "closed_at" TIMESTAMPTZ(6),
    "closed_by_membership_id" UUID,
    "reopened_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bills_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_bills__table_session" UNIQUE ("table_session_id"),
    CONSTRAINT "uq_bills__branch_number" UNIQUE ("branch_id", "bill_number"),
    CONSTRAINT "ck_bills__amounts"
      CHECK (
        "subtotal_amount" >= 0
        AND "cancelled_amount" >= 0
        AND "total_amount" >= 0
        AND "amount_paid" >= 0
      ),
    CONSTRAINT "ck_bills__status"
      CHECK ("status" IN ('GENERATED', 'PAYMENT_PENDING', 'PAID', 'CLOSED', 'REOPEN_REQUESTED', 'REOPENED')),
    CONSTRAINT "bills_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "bills_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "bills_table_session_id_fkey"
      FOREIGN KEY ("table_session_id") REFERENCES "table_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "bills_generated_by_membership_id_fkey"
      FOREIGN KEY ("generated_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "bills_closed_by_membership_id_fkey"
      FOREIGN KEY ("closed_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "bill_lines" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "bill_id" UUID NOT NULL,
    "order_item_id" UUID,
    "item_name_snapshot" VARCHAR(180) NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit_price_snapshot" NUMERIC(19, 2) NOT NULL,
    "modifier_total_snapshot" NUMERIC(19, 2) NOT NULL DEFAULT 0,
    "line_total" NUMERIC(19, 2) NOT NULL,
    "currency_code" CHAR(3) NOT NULL DEFAULT 'ETB',
    "charge_status" VARCHAR(24) NOT NULL DEFAULT 'CHARGED',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bill_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_bill_lines__quantity" CHECK ("quantity" > 0),
    CONSTRAINT "ck_bill_lines__charge_status"
      CHECK ("charge_status" IN ('CHARGED', 'CANCELLED_NO_CHARGE', 'ADJUSTED')),
    CONSTRAINT "bill_lines_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "bill_lines_bill_id_fkey"
      FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "bill_lines_order_item_id_fkey"
      FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "uq_bill_lines__order_item"
ON "bill_lines"("order_item_id")
WHERE "order_item_id" IS NOT NULL;

CREATE TABLE "bill_reopen_requests" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "bill_id" UUID NOT NULL,
    "requested_by_membership_id" UUID NOT NULL,
    "reason" TEXT NOT NULL,
    "status" VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    "requested_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decided_by_membership_id" UUID,
    "decided_at" TIMESTAMPTZ(6),
    "decision_reason" TEXT,

    CONSTRAINT "bill_reopen_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_bill_reopen_requests__status"
      CHECK ("status" IN ('PENDING', 'APPROVED', 'REJECTED')),
    CONSTRAINT "bill_reopen_requests_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "bill_reopen_requests_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "bill_reopen_requests_bill_id_fkey"
      FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "bill_reopen_requests_requested_by_membership_id_fkey"
      FOREIGN KEY ("requested_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "bill_reopen_requests_decided_by_membership_id_fkey"
      FOREIGN KEY ("decided_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "uq_bill_reopen_requests__one_pending"
ON "bill_reopen_requests"("bill_id")
WHERE "status" = 'PENDING';

CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "branch_id" UUID NOT NULL,
    "business_date" DATE NOT NULL,
    "bill_id" UUID NOT NULL,
    "method" VARCHAR(20) NOT NULL,
    "transfer_channel" VARCHAR(24),
    "status" VARCHAR(40) NOT NULL,
    "currency_code" CHAR(3) NOT NULL DEFAULT 'ETB',
    "amount" NUMERIC(19, 2) NOT NULL,
    "collector_membership_id" UUID NOT NULL,
    "collector_shift_session_id" UUID NOT NULL,
    "cash_tendered_amount" NUMERIC(19, 2),
    "cash_change_amount" NUMERIC(19, 2),
    "initiated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "collected_at" TIMESTAMPTZ(6),
    "verified_at" TIMESTAMPTZ(6),
    "settled_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ck_payments__amount" CHECK ("amount" > 0),
    CONSTRAINT "ck_payments__method" CHECK ("method" IN ('CASH', 'TRANSFER')),
    CONSTRAINT "ck_payments__transfer_channel"
      CHECK (
        "transfer_channel" IS NULL
        OR "transfer_channel" IN ('TELEBIRR', 'BANK')
      ),
    CONSTRAINT "ck_payments__cash_fields"
      CHECK (
        ("method" = 'CASH')
        OR
        ("method" = 'TRANSFER' AND "cash_tendered_amount" IS NULL AND "cash_change_amount" IS NULL)
      ),
    CONSTRAINT "ck_payments__status"
      CHECK ("status" IN (
        'INITIATED',
        'COLLECTED',
        'VERIFICATION_PENDING',
        'VERIFIED',
        'FAILED',
        'AMOUNT_MISMATCH',
        'DUPLICATE_REFERENCE',
        'CANCELLED',
        'SETTLED'
      )),
    CONSTRAINT "payments_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "payments_branch_id_fkey"
      FOREIGN KEY ("branch_id") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "payments_bill_id_fkey"
      FOREIGN KEY ("bill_id") REFERENCES "bills"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "payments_collector_membership_id_fkey"
      FOREIGN KEY ("collector_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "payments_collector_shift_session_id_fkey"
      FOREIGN KEY ("collector_shift_session_id") REFERENCES "shift_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "ix_payments__bill"
ON "payments"("tenant_id", "bill_id", "created_at");

CREATE INDEX "ix_payments__collector_business_date"
ON "payments"("tenant_id", "branch_id", "business_date", "collector_membership_id");

CREATE INDEX "ix_payments__exceptions"
ON "payments"("tenant_id", "branch_id", "status", "created_at")
WHERE "status" IN (
  'VERIFICATION_PENDING',
  'FAILED',
  'AMOUNT_MISMATCH',
  'DUPLICATE_REFERENCE'
);

CREATE TABLE "transfer_receipts" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "file_id" UUID NOT NULL,
    "captured_by_membership_id" UUID NOT NULL,
    "captured_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transfer_receipts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "uq_transfer_receipts__payment" UNIQUE ("payment_id"),
    CONSTRAINT "transfer_receipts_tenant_id_fkey"
      FOREIGN KEY ("tenant_id") REFERENCES "tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "transfer_receipts_payment_id_fkey"
      FOREIGN KEY ("payment_id") REFERENCES "payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "transfer_receipts_file_id_fkey"
      FOREIGN KEY ("file_id") REFERENCES "file"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "transfer_receipts_captured_by_membership_id_fkey"
      FOREIGN KEY ("captured_by_membership_id") REFERENCES "tenant_staff_memberships"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
