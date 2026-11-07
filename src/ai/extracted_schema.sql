-- ALL 107 POSTGRESQL TABLES EXTRACTED FROM DATABASE DUMP

CREATE TYPE public."CustomerVipTier" AS ENUM (
    'REGULAR',
    'VIP',
    'VVIP',
    'BLACKLISTED'
);

CREATE TABLE public._prisma_migrations (
    id character varying(36) NOT NULL,
    checksum character varying(64) NOT NULL,
    finished_at timestamp with time zone,
    migration_name character varying(255) NOT NULL,
    logs text,
    rolled_back_at timestamp with time zone,
    started_at timestamp with time zone DEFAULT now() NOT NULL,
    applied_steps_count integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.app_users (
    id uuid NOT NULL,
    email character varying(255),
    phone character varying(32),
    display_name character varying(160) NOT NULL,
    account_status character varying(24) DEFAULT 'ACTIVE'::character varying NOT NULL,
    auth_provider character varying(40),
    photo_id uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    preferred_branch_id uuid,
    CONSTRAINT ck_app_users__account_status CHECK (((account_status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'DISABLED'::character varying, 'LOCKED'::character varying])::text[])))
);

CREATE TABLE public.audit_events (
    id uuid NOT NULL,
    tenant_id uuid,
    branch_id uuid,
    actor_user_id uuid,
    actor_staff_membership_id uuid,
    actor_platform_role character varying(40),
    actor_restaurant_role character varying(40),
    actor_shift_session_id uuid,
    support_session_id uuid,
    entity_type character varying(60) NOT NULL,
    entity_id uuid,
    action character varying(80) NOT NULL,
    previous_state_json jsonb,
    new_state_json jsonb,
    reason text,
    metadata_json jsonb,
    correlation_id uuid,
    idempotency_command_id uuid,
    occurred_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.auth_sessions (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    hash character varying(255) NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    revoked_at timestamp(6) with time zone
);

CREATE TABLE public.bill_lines (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    bill_id uuid NOT NULL,
    order_item_id uuid,
    item_name_snapshot character varying(180) NOT NULL,
    quantity integer NOT NULL,
    unit_price_snapshot numeric(19,2) NOT NULL,
    modifier_total_snapshot numeric(19,2) DEFAULT 0 NOT NULL,
    line_total numeric(19,2) NOT NULL,
    currency_code character(3) DEFAULT 'ETB'::bpchar NOT NULL,
    charge_status character varying(24) DEFAULT 'CHARGED'::character varying NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT ck_bill_lines__charge_status CHECK (((charge_status)::text = ANY ((ARRAY['CHARGED'::character varying, 'CANCELLED_NO_CHARGE'::character varying, 'ADJUSTED'::character varying])::text[]))),
    CONSTRAINT ck_bill_lines__quantity CHECK ((quantity > 0))
);

CREATE TABLE public.bill_reopen_requests (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    bill_id uuid NOT NULL,
    requested_by_membership_id uuid NOT NULL,
    reason text NOT NULL,
    status character varying(24) DEFAULT 'PENDING'::character varying NOT NULL,
    requested_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    decided_by_membership_id uuid,
    decided_at timestamp(6) with time zone,
    decision_reason text,
    CONSTRAINT ck_bill_reopen_requests__status CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'APPROVED'::character varying, 'REJECTED'::character varying])::text[])))
);

CREATE TABLE public.bill_requests (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    business_date date NOT NULL,
    table_session_id uuid,
    requested_by_membership_id uuid NOT NULL,
    requested_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    status character varying(24) DEFAULT 'PENDING'::character varying NOT NULL,
    warning_json jsonb,
    cancelled_at timestamp(6) with time zone,
    fulfilled_at timestamp(6) with time zone,
    room_session_id uuid,
    outside_order_id uuid,
    CONSTRAINT ck_bill_requests__status CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'CANCELLED'::character varying, 'FULFILLED'::character varying])::text[])))
);

CREATE TABLE public.bills (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    business_date date NOT NULL,
    table_session_id uuid,
    bill_number character varying(60) NOT NULL,
    status character varying(32) DEFAULT 'GENERATED'::character varying NOT NULL,
    currency_code character(3) DEFAULT 'ETB'::bpchar NOT NULL,
    subtotal_amount numeric(19,2) NOT NULL,
    cancelled_amount numeric(19,2) DEFAULT 0 NOT NULL,
    total_amount numeric(19,2) NOT NULL,
    amount_paid numeric(19,2) DEFAULT 0 NOT NULL,
    generated_by_membership_id uuid NOT NULL,
    generated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    paid_at timestamp(6) with time zone,
    closed_at timestamp(6) with time zone,
    closed_by_membership_id uuid,
    reopened_at timestamp(6) with time zone,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    room_session_id uuid,
    outside_order_id uuid,
    CONSTRAINT ck_bills__amounts CHECK (((subtotal_amount >= (0)::numeric) AND (cancelled_amount >= (0)::numeric) AND (total_amount >= (0)::numeric) AND (amount_paid >= (0)::numeric))),
    CONSTRAINT ck_bills__status CHECK (((status)::text = ANY ((ARRAY['GENERATED'::character varying, 'PAYMENT_PENDING'::character varying, 'PAID'::character varying, 'CLOSED'::character varying, 'REOPEN_REQUESTED'::character varying, 'REOPENED'::character varying])::text[])))
);

CREATE TABLE public.branch_settings (
    branch_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    waiter_may_close_paid_table_override boolean,
    cashier_may_collect_customer_payment_override boolean,
    station_delay_default_minutes integer,
    shift_end_warning_minutes integer DEFAULT 15 NOT NULL,
    bill_unresolved_production_policy_override character varying(40),
    settings_version integer DEFAULT 1 NOT NULL,
    updated_by_membership_id uuid,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    rush_mode_buffer_minutes integer DEFAULT 10 NOT NULL,
    rush_mode_enabled boolean DEFAULT false NOT NULL,
    unacknowledged_alert_minutes integer DEFAULT 3 NOT NULL,
    session_idle_warn_minutes integer DEFAULT 240 NOT NULL,
    ticket_stale_warn_minutes integer DEFAULT 180 NOT NULL
);

CREATE TABLE public.branch_staff_assignments (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    staff_membership_id uuid NOT NULL,
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    assigned_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    released_at timestamp(6) with time zone,
    CONSTRAINT ck_branch_staff_assignments__status CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'INACTIVE'::character varying])::text[])))
);

CREATE TABLE public.branches (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    name character varying(180) NOT NULL,
    display_code character varying(40),
    timezone character varying(80) NOT NULL,
    status character varying(20) NOT NULL,
    opening_time time(0) without time zone,
    closing_time time(0) without time zone,
    business_day_cutoff time(0) without time zone NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    archived_at timestamp(6) with time zone,
    version integer DEFAULT 1 NOT NULL,
    service_mode character varying(20) DEFAULT 'RESTAURANT'::character varying NOT NULL,
    CONSTRAINT ck_branches__status CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'INACTIVE'::character varying])::text[])))
);

CREATE TABLE public.cancellation_requests (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    order_item_id uuid NOT NULL,
    requested_by_membership_id uuid NOT NULL,
    reason text NOT NULL,
    state_at_request character varying(40) NOT NULL,
    status character varying(24) DEFAULT 'PENDING'::character varying NOT NULL,
    requested_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    decided_by_membership_id uuid,
    decided_at timestamp(6) with time zone,
    decision_reason text,
    CONSTRAINT ck_cancellation_requests__status CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'APPROVED'::character varying, 'REJECTED'::character varying, 'WITHDRAWN'::character varying])::text[])))
);

CREATE TABLE public.cash_drop_disputes (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    cash_drop_id uuid NOT NULL,
    declared_amount numeric(19,2) NOT NULL,
    counted_amount numeric(19,2) NOT NULL,
    variance numeric(19,2) NOT NULL,
    waiter_comment text,
    cashier_comment text,
    status character varying(40) DEFAULT 'OPEN'::character varying NOT NULL,
    resolution_amount numeric(19,2),
    resolution_note text,
    resolved_by_membership_id uuid,
    resolved_at timestamp(6) with time zone,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT ck_cash_drop_disputes__status CHECK (((status)::text = ANY ((ARRAY['OPEN'::character varying, 'RESOLVED_ACCEPT_COUNTED'::character varying, 'RESOLVED_ACCEPT_DECLARED'::character varying, 'RESOLVED_OTHER'::character varying])::text[])))
);

CREATE TABLE public.cash_drops (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    business_date date NOT NULL,
    waiter_membership_id uuid NOT NULL,
    waiter_shift_session_id uuid NOT NULL,
    declared_amount numeric(19,2) NOT NULL,
    currency_code character(3) DEFAULT 'ETB'::bpchar NOT NULL,
    status character varying(32) DEFAULT 'INITIATED'::character varying NOT NULL,
    initiated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    cashier_financial_session_id uuid,
    received_by_cashier_membership_id uuid,
    counted_amount numeric(19,2),
    received_at timestamp(6) with time zone,
    resolution_amount numeric(19,2),
    resolved_at timestamp(6) with time zone,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT ck_cash_drops__declared CHECK ((declared_amount > (0)::numeric)),
    CONSTRAINT ck_cash_drops__status CHECK (((status)::text = ANY ((ARRAY['INITIATED'::character varying, 'RECEIVED'::character varying, 'DISPUTED'::character varying, 'RESOLVED'::character varying, 'CANCELLED_BEFORE_RECEIPT'::character varying])::text[])))
);

CREATE TABLE public.cash_ledger_entries (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    business_date date NOT NULL,
    holder_type character varying(20) NOT NULL,
    waiter_shift_session_id uuid,
    cashier_financial_session_id uuid,
    entry_type character varying(40) NOT NULL,
    amount_delta numeric(19,2) NOT NULL,
    currency_code character(3) DEFAULT 'ETB'::bpchar NOT NULL,
    source_type character varying(40) NOT NULL,
    source_id uuid NOT NULL,
    created_by_membership_id uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT ck_cash_ledger_entries__entry_type CHECK (((entry_type)::text = ANY ((ARRAY['CASH_PAYMENT_COLLECTED'::character varying, 'CASH_DROP_OUT'::character varying, 'OPENING_FLOAT'::character varying, 'CASH_DROP_IN'::character varying, 'APPROVED_ADJUSTMENT'::character varying, 'SAFE_DROP_OUT'::character varying, 'HANDOVER_OUT'::character varying, 'WAITER_HANDOVER_OUT'::character varying, 'WAITER_HANDOVER_IN'::character varying])::text[]))),
    CONSTRAINT ck_cash_ledger_entries__holder CHECK (((((holder_type)::text = 'WAITER_SHIFT'::text) AND (waiter_shift_session_id IS NOT NULL) AND (cashier_financial_session_id IS NULL)) OR (((holder_type)::text = 'CASHIER_SESSION'::text) AND (cashier_financial_session_id IS NOT NULL) AND (waiter_shift_session_id IS NULL)))),
    CONSTRAINT ck_cash_ledger_entries__nonzero CHECK ((amount_delta <> (0)::numeric)),
    CONSTRAINT ck_cash_ledger_entries__source_type CHECK (((source_type)::text = ANY ((ARRAY['PAYMENT'::character varying, 'CASH_DROP'::character varying, 'FINANCIAL_SESSION'::character varying, 'ADJUSTMENT'::character varying, 'SHIFT_HANDOVER'::character varying, 'WAITER_SHIFT_HANDOVER'::character varying])::text[])))
);

CREATE TABLE public.cashier_financial_sessions (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    business_date date NOT NULL,
    cashier_membership_id uuid NOT NULL,
    shift_session_id uuid NOT NULL,
    status character varying(32) DEFAULT 'OPEN'::character varying NOT NULL,
    opening_float_amount numeric(19,2) DEFAULT 0 NOT NULL,
    currency_code character(3) DEFAULT 'ETB'::bpchar NOT NULL,
    opened_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    closed_at timestamp(6) with time zone,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT ck_cashier_financial_sessions__float CHECK ((opening_float_amount >= (0)::numeric)),
    CONSTRAINT ck_cashier_financial_sessions__status CHECK (((status)::text = ANY ((ARRAY['OPEN'::character varying, 'RECONCILIATION_PENDING'::character varying, 'RECONCILED'::character varying, 'CLOSED'::character varying])::text[])))
);

CREATE TABLE public.cashier_reconciliations (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    business_date date NOT NULL,
    cashier_financial_session_id uuid NOT NULL,
    currency_code character(3) DEFAULT 'ETB'::bpchar NOT NULL,
    expected_cash_amount numeric(19,2) NOT NULL,
    counted_cash_amount numeric(19,2) NOT NULL,
    variance_amount numeric(19,2) NOT NULL,
    cashier_comment text,
    status character varying(32) DEFAULT 'SUBMITTED'::character varying NOT NULL,
    submitted_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    reviewed_by_membership_id uuid,
    reviewed_at timestamp(6) with time zone,
    review_comment text,
    version integer DEFAULT 1 NOT NULL,
    CONSTRAINT ck_cashier_reconciliations__status CHECK (((status)::text = ANY ((ARRAY['SUBMITTED'::character varying, 'APPROVED'::character varying, 'FLAGGED'::character varying, 'RESOLVED'::character varying])::text[])))
);

CREATE TABLE public.customer_biometric_profiles (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    customer_code character varying(64) NOT NULL,
    display_name character varying(160),
    phone character varying(40),
    email character varying(255),
    notes text,
    vip_tier public."CustomerVipTier" DEFAULT 'REGULAR'::public."CustomerVipTier" NOT NULL,
    embedding double precision[],
    avatar_url text,
    total_visits integer DEFAULT 1 NOT NULL,
    first_visit_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    last_visit_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.customer_feedback (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    table_id uuid,
    table_session_id uuid,
    order_id uuid,
    source character varying(20) DEFAULT 'QR_MENU'::character varying NOT NULL,
    rating integer NOT NULL,
    comment text,
    customer_name character varying(120),
    customer_phone character varying(40),
    status character varying(20) DEFAULT 'NEW'::character varying NOT NULL,
    resolved_by_membership_id uuid,
    resolved_at timestamp(6) with time zone,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    outside_order_id uuid
);

CREATE TABLE public.customer_visit_logs (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    customer_id uuid NOT NULL,
    detected_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    match_score double precision NOT NULL,
    camera_location character varying(120),
    table_session_id uuid
);

CREATE TABLE public.daily_close_station_lines (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    daily_close_id uuid NOT NULL,
    station_id uuid NOT NULL,
    station_name_snapshot character varying(120) NOT NULL,
    items_handled_count integer NOT NULL,
    average_queue_seconds integer,
    average_preparation_seconds integer,
    average_ready_to_serve_seconds integer,
    delayed_item_count integer NOT NULL,
    cannot_prepare_count integer NOT NULL
);

CREATE TABLE public.daily_close_waiter_lines (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    daily_close_id uuid NOT NULL,
    waiter_membership_id uuid NOT NULL,
    shift_session_id uuid NOT NULL,
    orders_created_count integer NOT NULL,
    tables_served_count integer NOT NULL,
    gross_attributed_sales numeric(19,2) NOT NULL,
    cancelled_attributed_value numeric(19,2) NOT NULL,
    net_attributed_sales numeric(19,2) NOT NULL,
    cash_collected numeric(19,2) NOT NULL,
    cash_dropped numeric(19,2) NOT NULL,
    undropped_cash numeric(19,2) NOT NULL,
    verified_transfer_amount numeric(19,2) NOT NULL,
    rejected_or_suspicious_transfer_count integer CONSTRAINT daily_close_waiter_lines_rejected_or_suspicious_transf_not_null NOT NULL,
    payment_exception_count integer NOT NULL
);

CREATE TABLE public.dining_table_shift_coverages (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    dining_table_id uuid NOT NULL,
    shift_definition_id uuid NOT NULL,
    waiter_membership_id uuid NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    day_code character varying(3) DEFAULT 'Mon'::character varying NOT NULL
);

CREATE TABLE public.dining_tables (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    location_id uuid NOT NULL,
    display_name character varying(100) NOT NULL,
    display_number character varying(40),
    status character varying(20) DEFAULT 'AVAILABLE'::character varying NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    archived_at timestamp(6) with time zone,
    version integer DEFAULT 1 NOT NULL,
    assigned_waiter_membership_id uuid,
    qr_code_url text,
    is_vip boolean DEFAULT false NOT NULL,
    CONSTRAINT ck_dining_tables__status CHECK (((status)::text = ANY ((ARRAY['AVAILABLE'::character varying, 'OCCUPIED'::character varying, 'INACTIVE'::character varying])::text[])))
);

CREATE TABLE public.drivers (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    display_name character varying(160) NOT NULL,
    phone character varying(32),
    licence_plate character varying(40),
    vehicle_desc character varying(180),
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    registered_by_membership_id uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.file (
    id uuid NOT NULL,
    path character varying NOT NULL
);

CREATE TABLE public.finance_categories (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    direction character varying(10) NOT NULL,
    code character varying(40) NOT NULL,
    name character varying(120) NOT NULL,
    amharic_name character varying(120),
    is_system boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.hotel_rooms (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    room_number character varying(40) NOT NULL,
    floor character varying(40),
    wing character varying(40),
    status character varying(20) DEFAULT 'AVAILABLE'::character varying NOT NULL,
    default_waiter_membership_id uuid,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    archived_at timestamp(6) with time zone
);

CREATE TABLE public.idempotency_commands (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    actor_user_id uuid NOT NULL,
    actor_staff_membership_id uuid,
    command_type character varying(80) NOT NULL,
    idempotency_key character varying(160) NOT NULL,
    request_hash character(64) NOT NULL,
    status character varying(20) NOT NULL,
    resource_type character varying(60),
    resource_id uuid,
    response_status_code integer,
    response_body_json jsonb,
    started_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    completed_at timestamp(6) with time zone,
    expires_at timestamp(6) with time zone,
    CONSTRAINT ck_idempotency_commands__status CHECK (((status)::text = ANY ((ARRAY['IN_PROGRESS'::character varying, 'SUCCEEDED'::character varying, 'FAILED'::character varying])::text[])))
);

CREATE TABLE public.inventory_categories (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid,
    name character varying(120) NOT NULL,
    amharic_name character varying(120),
    code character varying(50) NOT NULL,
    description character varying(255),
    sort_order integer DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.inventory_count_lines (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    count_session_id uuid NOT NULL,
    ingredient_id uuid NOT NULL,
    book_qty_snapshot numeric(19,4) NOT NULL,
    counted_qty numeric(19,4),
    counted_unit character varying(20)
);

CREATE TABLE public.inventory_count_sessions (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    status character varying(20) DEFAULT 'DRAFT'::character varying NOT NULL,
    notes character varying(255),
    created_by_membership_id uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    posted_at timestamp(6) with time zone,
    location_id uuid
);

CREATE TABLE public.inventory_ingredients (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid,
    name character varying(180) NOT NULL,
    unit character varying(20) NOT NULL,
    unit_cost numeric(19,4) DEFAULT 0 NOT NULL,
    par_level numeric(19,4) DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    item_kind character varying(20) DEFAULT 'RAW'::character varying NOT NULL,
    standard_yield_percent numeric(8,2),
    category_id uuid,
    image_url character varying(512)
);

CREATE TABLE public.inventory_ledger_entries (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid,
    ingredient_id uuid NOT NULL,
    entry_type character varying(40) NOT NULL,
    quantity_delta numeric(19,4) NOT NULL,
    unit_cost_snapshot numeric(19,4),
    note character varying(255),
    supplier_note character varying(180),
    invoice_ref character varying(80),
    order_item_id uuid,
    count_session_id uuid,
    created_by_membership_id uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    location_id uuid,
    production_batch_id uuid,
    transfer_id uuid,
    vendor_id uuid
);

CREATE TABLE public.inventory_locations (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid,
    code character varying(40) NOT NULL,
    name character varying(120) NOT NULL,
    type character varying(40) NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.inventory_material_balances (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid,
    location_id uuid,
    material_id uuid NOT NULL,
    on_hand_qty numeric(14,3) DEFAULT 0 NOT NULL,
    issued_qty numeric(14,3) DEFAULT 0 NOT NULL,
    lost_qty numeric(14,3) DEFAULT 0 NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.inventory_materials (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    name character varying(160) NOT NULL,
    amharic_name character varying(160),
    code character varying(60) NOT NULL,
    category character varying(40) DEFAULT 'OTHER'::character varying NOT NULL,
    unit character varying(24) DEFAULT 'pcs'::character varying NOT NULL,
    is_reusable boolean DEFAULT true NOT NULL,
    image_url character varying(400),
    description character varying(400),
    sort_order integer DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.inventory_production_batches (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    location_id uuid NOT NULL,
    output_ingredient_id uuid NOT NULL,
    output_quantity numeric(19,4) NOT NULL,
    note character varying(255),
    posted_by_membership_id uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expected_output_quantity numeric(19,4),
    yield_percent numeric(8,2),
    input_cost_total numeric(19,4) DEFAULT 0 NOT NULL,
    output_unit_cost numeric(19,4) DEFAULT 0 NOT NULL,
    output_unit character varying(20)
);

CREATE TABLE public.inventory_production_inputs (
    id uuid NOT NULL,
    batch_id uuid NOT NULL,
    ingredient_id uuid NOT NULL,
    quantity numeric(19,4) NOT NULL,
    unit character varying(20)
);

CREATE TABLE public.inventory_push_drops (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    from_location_id uuid NOT NULL,
    status character varying(20) DEFAULT 'DRAFT'::character varying NOT NULL,
    label character varying(180),
    note character varying(255),
    scheduled_date date,
    created_by_membership_id uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.inventory_stock_balances (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid,
    ingredient_id uuid NOT NULL,
    on_hand_qty numeric(19,4) DEFAULT 0 NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    location_id uuid
);

CREATE TABLE public.inventory_supply_request_lines (
    id uuid NOT NULL,
    supply_request_id uuid NOT NULL,
    ingredient_id uuid NOT NULL,
    quantity_requested numeric(19,4) NOT NULL,
    unit character varying(20)
);

CREATE TABLE public.inventory_supply_requests (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    from_location_id uuid NOT NULL,
    to_location_id uuid NOT NULL,
    status character varying(24) DEFAULT 'DRAFT'::character varying NOT NULL,
    note character varying(255),
    decision_note character varying(255),
    requested_by_membership_id uuid,
    decided_by_membership_id uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    submitted_at timestamp(6) with time zone,
    decided_at timestamp(6) with time zone,
    auto_approve boolean DEFAULT false NOT NULL
);

CREATE TABLE public.inventory_transfer_lines (
    id uuid NOT NULL,
    transfer_id uuid NOT NULL,
    ingredient_id uuid NOT NULL,
    quantity_sent numeric(19,4) NOT NULL,
    quantity_received numeric(19,4),
    unit_sent character varying(20)
);

CREATE TABLE public.inventory_transfers (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    from_location_id uuid NOT NULL,
    to_location_id uuid NOT NULL,
    status character varying(24) DEFAULT 'DRAFT'::character varying NOT NULL,
    note character varying(255),
    supply_request_id uuid,
    sent_by_membership_id uuid,
    received_by_membership_id uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    sent_at timestamp(6) with time zone,
    received_at timestamp(6) with time zone,
    driver_id uuid,
    push_drop_id uuid,
    dispatched_at timestamp(6) with time zone
);

CREATE TABLE public.inventory_unit_conversions (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    from_unit character varying(20) NOT NULL,
    to_unit character varying(20) NOT NULL,
    factor numeric(19,4) NOT NULL,
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    created_by_membership_id uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.inventory_units (
    id uuid NOT NULL,
    code character varying(20) NOT NULL,
    name character varying(80) NOT NULL,
    category character varying(40) NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    tenant_id uuid,
    CONSTRAINT ck_inventory_units__category CHECK (((category)::text = ANY ((ARRAY['weight'::character varying, 'volume'::character varying, 'count'::character varying, 'pack'::character varying])::text[]))),
    CONSTRAINT ck_inventory_units__status CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'INACTIVE'::character varying])::text[])))
);

CREATE TABLE public.inventory_yield_tests (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    location_id uuid,
    ingredient_id uuid NOT NULL,
    purchased_quantity numeric(19,4) NOT NULL,
    usable_quantity numeric(19,4) NOT NULL,
    trim_quantity numeric(19,4) DEFAULT 0 NOT NULL,
    yield_percent numeric(8,2) NOT NULL,
    ap_unit_cost numeric(19,4) DEFAULT 0 NOT NULL,
    ep_unit_cost numeric(19,4) DEFAULT 0 NOT NULL,
    wrote_off_trim boolean DEFAULT false NOT NULL,
    note character varying(255),
    posted_by_membership_id uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    unit character varying(20)
);

CREATE TABLE public.item_availability_overrides (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    menu_item_id uuid NOT NULL,
    state character varying(32) NOT NULL,
    reason text NOT NULL,
    set_by_membership_id uuid NOT NULL,
    starts_at timestamp(6) with time zone NOT NULL,
    ends_at timestamp(6) with time zone,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    remaining_qty integer,
    initial_qty integer,
    CONSTRAINT ck_item_availability_overrides__state CHECK (((state)::text = ANY ((ARRAY['SOLD_OUT'::character varying, 'TEMPORARILY_DISABLED'::character varying, 'LIMITED'::character varying])::text[])))
);

CREATE TABLE public.leave_types (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    name character varying(80) NOT NULL,
    tracks_balance boolean DEFAULT true NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    default_days numeric(8,2) DEFAULT 0 NOT NULL
);

CREATE TABLE public.manual_finance_entries (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    business_date date NOT NULL,
    direction character varying(10) NOT NULL,
    category_id uuid,
    label character varying(180) NOT NULL,
    amount numeric(19,2) NOT NULL,
    currency_code character(3) DEFAULT 'ETB'::bpchar NOT NULL,
    settled_via character varying(16) DEFAULT 'CASH'::character varying NOT NULL,
    counterparty character varying(160),
    note character varying(500),
    receipt_file_id uuid,
    status character varying(16) DEFAULT 'POSTED'::character varying NOT NULL,
    created_by_membership_id uuid NOT NULL,
    voided_by_membership_id uuid,
    voided_at timestamp(6) with time zone,
    void_reason character varying(300),
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.menu_categories (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    menu_id uuid NOT NULL,
    name character varying(120) NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL
);

CREATE TABLE public.menu_item_modifier_assignments (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    menu_item_id uuid NOT NULL,
    modifier_group_id uuid NOT NULL,
    required_override boolean,
    min_selections_override integer,
    max_selections_override integer,
    sort_order integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.menu_item_period_assignments (
    menu_item_id uuid NOT NULL,
    menu_period_id uuid NOT NULL
);

CREATE TABLE public.menu_item_recipe_lines (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    menu_item_id uuid NOT NULL,
    ingredient_id uuid NOT NULL,
    quantity_per_serving numeric(19,4) NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    unit character varying(20)
);

CREATE TABLE public.menu_items (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    menu_id uuid NOT NULL,
    menu_category_id uuid,
    name character varying(180) NOT NULL,
    description text,
    current_price numeric(19,2) NOT NULL,
    currency_code character(3) DEFAULT 'ETB'::bpchar NOT NULL,
    preparation_station_id uuid NOT NULL,
    expected_prep_minutes integer,
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    sold_out boolean DEFAULT false NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    image_file_id uuid,
    image_key character varying(40),
    badge character varying(40),
    show_on_qr_menu boolean DEFAULT true NOT NULL,
    vip_percent numeric(8,2),
    CONSTRAINT ck_menu_items__price CHECK ((current_price >= (0)::numeric)),
    CONSTRAINT ck_menu_items__status CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'INACTIVE'::character varying])::text[])))
);

CREATE TABLE public.menu_periods (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    menu_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    start_local_time time(0) without time zone NOT NULL,
    end_local_time time(0) without time zone NOT NULL,
    days_of_week integer[],
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.menus (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid,
    name character varying(140) NOT NULL,
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    valid_from timestamp(6) with time zone,
    valid_to timestamp(6) with time zone,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT ck_menus__status CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'ACTIVE'::character varying, 'INACTIVE'::character varying])::text[])))
);

CREATE TABLE public.modifier_groups (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    menu_id uuid,
    name character varying(120) NOT NULL,
    required_default boolean DEFAULT false NOT NULL,
    min_selections integer DEFAULT 0 NOT NULL,
    max_selections integer DEFAULT 1 NOT NULL,
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    CONSTRAINT ck_modifier_groups__selection CHECK (((min_selections >= 0) AND (max_selections >= min_selections)))
);

CREATE TABLE public.modifier_options (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    modifier_group_id uuid NOT NULL,
    name character varying(120) NOT NULL,
    price_delta numeric(19,2) DEFAULT 0 NOT NULL,
    currency_code character(3) DEFAULT 'ETB'::bpchar NOT NULL,
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.notifications (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid,
    recipient_staff_membership_id uuid NOT NULL,
    type character varying(60) NOT NULL,
    severity character varying(20) NOT NULL,
    related_entity_type character varying(50),
    related_entity_id uuid,
    title character varying(180) NOT NULL,
    body text,
    payload_json jsonb,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    read_at timestamp(6) with time zone,
    acknowledged_at timestamp(6) with time zone,
    CONSTRAINT ck_notifications__severity CHECK (((severity)::text = ANY ((ARRAY['INFO'::character varying, 'ATTENTION'::character varying, 'URGENT'::character varying])::text[])))
);

CREATE TABLE public.operational_daily_closes (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    business_date date NOT NULL,
    status character varying(32) DEFAULT 'DRAFT'::character varying NOT NULL,
    currency_code character(3) DEFAULT 'ETB'::bpchar NOT NULL,
    generated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    generated_by_membership_id uuid NOT NULL,
    approved_at timestamp(6) with time zone,
    approved_by_membership_id uuid,
    locked_at timestamp(6) with time zone,
    locked_by_membership_id uuid,
    gross_order_value numeric(19,2) NOT NULL,
    cancelled_value numeric(19,2) NOT NULL,
    net_billed_sales numeric(19,2) NOT NULL,
    cash_sales numeric(19,2) NOT NULL,
    verified_transfer_sales numeric(19,2) NOT NULL,
    pending_transfer_amount numeric(19,2) NOT NULL,
    suspicious_transfer_amount numeric(19,2) NOT NULL,
    cashier_expected_cash numeric(19,2) NOT NULL,
    cashier_counted_cash numeric(19,2) NOT NULL,
    cashier_variance numeric(19,2) NOT NULL,
    undropped_waiter_cash numeric(19,2) NOT NULL,
    table_count integer NOT NULL,
    order_count integer NOT NULL,
    item_count integer NOT NULL,
    manager_override_count integer NOT NULL,
    blocking_issues_json jsonb,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT ck_operational_daily_closes__status CHECK (((status)::text = ANY ((ARRAY['DRAFT'::character varying, 'READY_FOR_REVIEW'::character varying, 'APPROVED'::character varying, 'LOCKED'::character varying])::text[])))
);

CREATE TABLE public.order_change_requests (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    order_item_id uuid NOT NULL,
    requested_by_membership_id uuid NOT NULL,
    requested_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    reason text,
    requested_change_json jsonb NOT NULL,
    state_at_request character varying(40) NOT NULL,
    status character varying(24) DEFAULT 'PENDING'::character varying NOT NULL,
    decided_by_membership_id uuid,
    decided_at timestamp(6) with time zone,
    decision_reason text,
    CONSTRAINT ck_order_change_requests__status CHECK (((status)::text = ANY ((ARRAY['PENDING'::character varying, 'APPROVED'::character varying, 'REJECTED'::character varying, 'APPLIED'::character varying, 'CANCELLED'::character varying])::text[])))
);

CREATE TABLE public.order_item_modifiers (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    order_item_id uuid NOT NULL,
    modifier_group_id uuid,
    modifier_option_id uuid,
    group_name_snapshot character varying(120) NOT NULL,
    option_name_snapshot character varying(120) NOT NULL,
    price_delta_snapshot numeric(19,2) NOT NULL,
    currency_code character(3) DEFAULT 'ETB'::bpchar NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL
);

CREATE TABLE public.order_items (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    business_date date NOT NULL,
    order_id uuid NOT NULL,
    table_session_id uuid,
    menu_item_id uuid,
    item_name_snapshot character varying(180) NOT NULL,
    unit_price_snapshot numeric(19,2) NOT NULL,
    currency_code character(3) DEFAULT 'ETB'::bpchar NOT NULL,
    quantity integer NOT NULL,
    original_preparation_station_id uuid NOT NULL,
    current_preparation_station_id uuid NOT NULL,
    station_name_snapshot character varying(120) NOT NULL,
    expected_prep_minutes_snapshot integer,
    special_instruction text,
    state character varying(40) DEFAULT 'QUEUED'::character varying NOT NULL,
    confirmed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    queued_at timestamp(6) with time zone,
    acknowledged_at timestamp(6) with time zone,
    preparation_started_at timestamp(6) with time zone,
    ready_at timestamp(6) with time zone,
    served_at timestamp(6) with time zone,
    cancelled_at timestamp(6) with time zone,
    cancelled_by_membership_id uuid,
    cancellation_reason text,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    delay_alert_sent_at timestamp(6) with time zone,
    unacknowledged_alert_sent_at timestamp(6) with time zone,
    room_session_id uuid,
    stale_warn_alert_sent_at timestamp(6) with time zone,
    outside_order_id uuid,
    CONSTRAINT ck_order_items__price CHECK ((unit_price_snapshot >= (0)::numeric)),
    CONSTRAINT ck_order_items__quantity CHECK ((quantity > 0)),
    CONSTRAINT ck_order_items__state CHECK (((state)::text = ANY ((ARRAY['CONFIRMED'::character varying, 'QUEUED'::character varying, 'ACKNOWLEDGED'::character varying, 'IN_PREPARATION'::character varying, 'READY'::character varying, 'SERVED'::character varying, 'CANCELLATION_REQUESTED'::character varying, 'CANCELLED'::character varying, 'CHANGE_REQUESTED'::character varying, 'BLOCKED'::character varying, 'REJECTED_BY_STATION'::character varying])::text[])))
);

CREATE TABLE public.order_material_issue_lines (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    issue_id uuid NOT NULL,
    material_id uuid NOT NULL,
    material_name_snapshot character varying(160) NOT NULL,
    qty_issued numeric(14,3) NOT NULL,
    qty_returned numeric(14,3) DEFAULT 0 NOT NULL,
    qty_shortfall numeric(14,3) DEFAULT 0 NOT NULL,
    condition character varying(16) DEFAULT 'OK'::character varying NOT NULL,
    note character varying(400),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.order_material_issues (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    business_date date NOT NULL,
    order_id uuid NOT NULL,
    issued_by_chef_membership_id uuid NOT NULL,
    waiter_membership_id uuid NOT NULL,
    waiter_shift_session_id uuid NOT NULL,
    status character varying(24) DEFAULT 'PENDING'::character varying NOT NULL,
    note text,
    issued_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    acknowledged_at timestamp(6) with time zone,
    returned_at timestamp(6) with time zone,
    approved_by_chef_membership_id uuid,
    approved_at timestamp(6) with time zone,
    dispute_reason text,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.orders (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    business_date date NOT NULL,
    table_session_id uuid,
    created_by_waiter_membership_id uuid NOT NULL,
    waiter_shift_session_id uuid NOT NULL,
    status character varying(32) DEFAULT 'CONFIRMED'::character varying NOT NULL,
    confirmed_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    room_session_id uuid,
    outside_order_id uuid,
    CONSTRAINT ck_orders__status CHECK (((status)::text = ANY ((ARRAY['CONFIRMED'::character varying, 'IN_FULFILLMENT'::character varying, 'PARTIALLY_SERVED'::character varying, 'SERVED'::character varying, 'CANCELLED'::character varying, 'CLOSED'::character varying])::text[])))
);

CREATE TABLE public.outside_orders (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    business_date date NOT NULL,
    destination_type character varying(24) DEFAULT 'OTHER'::character varying NOT NULL,
    destination_name character varying(180) NOT NULL,
    destination_note text,
    customer_name character varying(120),
    customer_phone character varying(40),
    created_by_membership_id uuid NOT NULL,
    waiter_shift_session_id uuid NOT NULL,
    requires_material_return boolean DEFAULT true NOT NULL,
    status character varying(32) DEFAULT 'OPEN'::character varying NOT NULL,
    opened_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    closed_at timestamp(6) with time zone,
    closed_by_membership_id uuid,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.payments (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    business_date date NOT NULL,
    bill_id uuid NOT NULL,
    method character varying(20) NOT NULL,
    transfer_channel character varying(24),
    status character varying(40) NOT NULL,
    currency_code character(3) DEFAULT 'ETB'::bpchar NOT NULL,
    amount numeric(19,2) NOT NULL,
    collector_membership_id uuid NOT NULL,
    collector_shift_session_id uuid NOT NULL,
    cash_tendered_amount numeric(19,2),
    cash_change_amount numeric(19,2),
    initiated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    collected_at timestamp(6) with time zone,
    verified_at timestamp(6) with time zone,
    settled_at timestamp(6) with time zone,
    cancelled_at timestamp(6) with time zone,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT ck_payments__amount CHECK ((amount > (0)::numeric)),
    CONSTRAINT ck_payments__cash_fields CHECK ((((method)::text = 'CASH'::text) OR (((method)::text = 'TRANSFER'::text) AND (cash_tendered_amount IS NULL) AND (cash_change_amount IS NULL)))),
    CONSTRAINT ck_payments__method CHECK (((method)::text = ANY ((ARRAY['CASH'::character varying, 'TRANSFER'::character varying])::text[]))),
    CONSTRAINT ck_payments__status CHECK (((status)::text = ANY ((ARRAY['INITIATED'::character varying, 'COLLECTED'::character varying, 'VERIFICATION_PENDING'::character varying, 'VERIFIED'::character varying, 'FAILED'::character varying, 'AMOUNT_MISMATCH'::character varying, 'DUPLICATE_REFERENCE'::character varying, 'CANCELLED'::character varying, 'SETTLED'::character varying])::text[]))),
    CONSTRAINT ck_payments__transfer_channel CHECK (((transfer_channel IS NULL) OR ((transfer_channel)::text = ANY ((ARRAY['TELEBIRR'::character varying, 'BANK'::character varying])::text[]))))
);

CREATE TABLE public.payroll_lines (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    run_id uuid NOT NULL,
    staff_membership_id uuid NOT NULL,
    staff_name character varying(160) NOT NULL,
    role_code character varying(40),
    pay_type character varying(16),
    base_pay numeric(14,2),
    regular_hours numeric(8,2),
    ot_hours numeric(8,2) DEFAULT 0 NOT NULL,
    ot_rate numeric(14,2),
    ot_amount numeric(14,2) DEFAULT 0 NOT NULL,
    base_gross numeric(14,2) DEFAULT 0 NOT NULL,
    deductions numeric(14,2) DEFAULT 0 NOT NULL,
    gross numeric(14,2) DEFAULT 0 NOT NULL,
    net numeric(14,2) DEFAULT 0 NOT NULL,
    pay_method character varying(16),
    paid_at timestamp(6) with time zone,
    notes character varying(500),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    tip_amount numeric(14,2) DEFAULT 0 NOT NULL
);

CREATE TABLE public.payroll_runs (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid,
    status character varying(20) DEFAULT 'DRAFT'::character varying NOT NULL,
    period_start date NOT NULL,
    period_end date NOT NULL,
    label character varying(120),
    currency_code character(3) DEFAULT 'ETB'::bpchar NOT NULL,
    total_gross numeric(14,2) DEFAULT 0 NOT NULL,
    total_ot numeric(14,2) DEFAULT 0 NOT NULL,
    total_deductions numeric(14,2) DEFAULT 0 NOT NULL,
    total_net numeric(14,2) DEFAULT 0 NOT NULL,
    approved_at timestamp(6) with time zone,
    approved_by_membership_id uuid,
    paid_at timestamp(6) with time zone,
    paid_by_membership_id uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    total_tips numeric(14,2) DEFAULT 0 NOT NULL
);

CREATE TABLE public.permissions (
    id smallint NOT NULL,
    code character varying(100) NOT NULL,
    domain character varying(40) NOT NULL,
    description text
);

CREATE TABLE public.plan_entitlements (
    id uuid NOT NULL,
    plan_id uuid NOT NULL,
    entitlement_key character varying(120) NOT NULL,
    value_json jsonb NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.platform_support_sessions (
    id uuid NOT NULL,
    platform_user_id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    reason text NOT NULL,
    scope_json jsonb NOT NULL,
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    started_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    expires_at timestamp(6) with time zone,
    ended_at timestamp(6) with time zone,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT ck_platform_support_sessions__status CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'EXPIRED'::character varying, 'CLOSED'::character varying, 'REVOKED'::character varying])::text[])))
);

CREATE TABLE public.platform_user_roles (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    role_code character varying(40) NOT NULL,
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    granted_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    granted_by_user_id uuid,
    CONSTRAINT ck_platform_user_roles__role_code CHECK (((role_code)::text = 'PLATFORM_SUPER_ADMIN'::text)),
    CONSTRAINT ck_platform_user_roles__status CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'INACTIVE'::character varying])::text[])))
);

CREATE TABLE public.preparation_stations (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    name character varying(120) NOT NULL,
    code character varying(60),
    status character varying(32) DEFAULT 'ACTIVE'::character varying NOT NULL,
    default_delay_threshold_minutes integer,
    sort_order integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    workflow_mode character varying(20) DEFAULT 'FULL_PREP'::character varying NOT NULL,
    CONSTRAINT ck_preparation_stations__status CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'TEMPORARILY_UNAVAILABLE'::character varying, 'INACTIVE'::character varying])::text[])))
);

CREATE TABLE public.production_exceptions (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    order_item_id uuid NOT NULL,
    station_id uuid NOT NULL,
    reported_by_membership_id uuid NOT NULL,
    reason_code character varying(60) NOT NULL,
    reason_detail text,
    status character varying(24) DEFAULT 'OPEN'::character varying NOT NULL,
    resolution_type character varying(32),
    resolved_by_membership_id uuid,
    resolved_at timestamp(6) with time zone,
    resolution_note text,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT ck_production_exceptions__resolution_type CHECK (((resolution_type IS NULL) OR ((resolution_type)::text = ANY ((ARRAY['CANCEL'::character varying, 'REPLACE'::character varying, 'REROUTE'::character varying, 'CONTINUE'::character varying])::text[])))),
    CONSTRAINT ck_production_exceptions__status CHECK (((status)::text = ANY ((ARRAY['OPEN'::character varying, 'RESOLVED'::character varying])::text[])))
);

CREATE TABLE public.role_permissions (
    role_id smallint NOT NULL,
    permission_id smallint NOT NULL,
    allowed boolean DEFAULT true NOT NULL
);

CREATE TABLE public.roles (
    id smallint NOT NULL,
    code character varying(40) NOT NULL,
    name character varying(80) NOT NULL,
    is_system boolean DEFAULT true NOT NULL,
    CONSTRAINT ck_roles__code CHECK (((code)::text = ANY ((ARRAY['OWNER_ADMIN'::character varying, 'MANAGER'::character varying, 'WAITER'::character varying, 'CASHIER'::character varying, 'STATION_OPERATOR'::character varying, 'DISPATCHER'::character varying, 'STORE_MANAGER'::character varying, 'RECEPTIONIST'::character varying, 'DRIVER'::character varying])::text[])))
);

CREATE TABLE public.room_floor_coverages (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    floor character varying(40) NOT NULL,
    waiter_membership_id uuid NOT NULL,
    shift_definition_id uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.room_sessions (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    hotel_room_id uuid NOT NULL,
    room_stay_id uuid NOT NULL,
    business_date date NOT NULL,
    primary_waiter_membership_id uuid NOT NULL,
    primary_waiter_shift_session_id uuid NOT NULL,
    guest_count integer,
    status character varying(32) DEFAULT 'OPEN'::character varying NOT NULL,
    opened_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    bill_requested_at timestamp(6) with time zone,
    closed_at timestamp(6) with time zone,
    closed_by_membership_id uuid,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    idle_alert_sent_at timestamp(6) with time zone,
    close_reason text
);

CREATE TABLE public.room_stays (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    hotel_room_id uuid NOT NULL,
    guest_name character varying(120) NOT NULL,
    guest_phone character varying(40),
    adults integer DEFAULT 1 NOT NULL,
    kids integer DEFAULT 0 NOT NULL,
    meal_plan character varying(24) DEFAULT 'NONE'::character varying NOT NULL,
    status character varying(24) DEFAULT 'IN_HOUSE'::character varying NOT NULL,
    check_in_at timestamp(6) with time zone NOT NULL,
    planned_check_out_at timestamp(6) with time zone NOT NULL,
    checked_out_at timestamp(6) with time zone,
    checked_in_by_membership_id uuid NOT NULL,
    checked_out_by_membership_id uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.shift_assignments (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    staff_membership_id uuid NOT NULL,
    shift_definition_id uuid,
    scheduled_start_at timestamp(6) with time zone NOT NULL,
    scheduled_end_at timestamp(6) with time zone NOT NULL,
    grace_minutes integer DEFAULT 15 NOT NULL,
    role_id smallint,
    status character varying(20) DEFAULT 'SCHEDULED'::character varying NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT ck_shift_assignments__status CHECK (((status)::text = ANY ((ARRAY['SCHEDULED'::character varying, 'CANCELLED'::character varying, 'COMPLETED'::character varying])::text[])))
);

CREATE TABLE public.shift_definitions (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    name character varying(100) NOT NULL,
    start_local_time time(0) without time zone NOT NULL,
    end_local_time time(0) without time zone NOT NULL,
    grace_minutes integer DEFAULT 15 NOT NULL,
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT ck_shift_definitions__grace CHECK ((grace_minutes >= 0)),
    CONSTRAINT ck_shift_definitions__status CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'INACTIVE'::character varying])::text[])))
);

CREATE TABLE public.shift_sessions (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    shift_assignment_id uuid,
    staff_membership_id uuid NOT NULL,
    role_id smallint,
    scheduled_start_at_snapshot timestamp(6) with time zone,
    scheduled_end_at_snapshot timestamp(6) with time zone,
    grace_minutes_snapshot integer DEFAULT 15 NOT NULL,
    clock_in_at timestamp(6) with time zone NOT NULL,
    clock_out_at timestamp(6) with time zone,
    late_by_minutes integer DEFAULT 0 NOT NULL,
    state character varying(24) DEFAULT 'OPEN'::character varying NOT NULL,
    business_date date NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT ck_shift_sessions__state CHECK (((state)::text = ANY ((ARRAY['OPEN'::character varying, 'GRACE'::character varying, 'SAFE_LOCK_PENDING'::character varying, 'CLOSING'::character varying, 'CLOSED'::character varying])::text[])))
);

CREATE TABLE public.staff_biometric_profiles (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    user_id uuid NOT NULL,
    frontal_embedding double precision[],
    left_angle_embedding double precision[],
    right_angle_embedding double precision[],
    fused_embedding double precision[],
    frontal_photo_url character varying(255),
    left_photo_url character varying(255),
    right_photo_url character varying(255),
    liveness_confidence double precision DEFAULT 0.95 NOT NULL,
    is_active boolean DEFAULT true NOT NULL,
    enrolled_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.staff_day_shifts (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    staff_membership_id uuid NOT NULL,
    day_code character varying(3) NOT NULL,
    shift_definition_id uuid NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.staff_leave_balances (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    staff_membership_id uuid NOT NULL,
    leave_type_id uuid NOT NULL,
    balance_days numeric(8,2) DEFAULT 0 NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    entitlement_days numeric(8,2)
);

CREATE TABLE public.staff_leave_requests (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    staff_membership_id uuid NOT NULL,
    leave_type character varying(80) NOT NULL,
    start_date date NOT NULL,
    end_date date NOT NULL,
    days numeric(6,2) NOT NULL,
    reason character varying(500),
    status character varying(20) DEFAULT 'PENDING'::character varying NOT NULL,
    decided_by_membership_id uuid,
    decided_at timestamp(6) with time zone,
    decision_note character varying(500),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    leave_type_id uuid
);

CREATE TABLE public.staff_role_assignments (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    staff_membership_id uuid NOT NULL,
    role_id smallint NOT NULL,
    branch_id uuid,
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    granted_by_membership_id uuid,
    granted_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    revoked_at timestamp(6) with time zone,
    CONSTRAINT ck_staff_role_assignments__status CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'INACTIVE'::character varying])::text[])))
);

CREATE TABLE public.station_fallback_configurations (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    source_station_id uuid NOT NULL,
    fallback_station_id uuid NOT NULL,
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    created_by_membership_id uuid CONSTRAINT station_fallback_configuratio_created_by_membership_id_not_null NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT ck_station_fallback__different CHECK ((source_station_id <> fallback_station_id))
);

CREATE TABLE public.station_staff_assignments (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    station_id uuid NOT NULL,
    staff_membership_id uuid NOT NULL,
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    assigned_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    released_at timestamp(6) with time zone,
    CONSTRAINT ck_station_staff_assignments__status CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'INACTIVE'::character varying])::text[])))
);

CREATE TABLE public.stay_meal_entitlements (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    room_stay_id uuid NOT NULL,
    meal_type character varying(24) DEFAULT 'BREAKFAST'::character varying NOT NULL,
    business_date date NOT NULL,
    qty_allowed integer NOT NULL,
    qty_used integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.subscription_plans (
    id uuid NOT NULL,
    code character varying(60) NOT NULL,
    name character varying(120) NOT NULL,
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    CONSTRAINT ck_subscription_plans__status CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'INACTIVE'::character varying])::text[])))
);

CREATE TABLE public.table_assignments (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    table_session_id uuid NOT NULL,
    waiter_membership_id uuid NOT NULL,
    shift_session_id uuid NOT NULL,
    assigned_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    released_at timestamp(6) with time zone,
    assigned_by_membership_id uuid,
    reason text
);

CREATE TABLE public.table_locations (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    name character varying(80) NOT NULL,
    code character varying(40) NOT NULL,
    sort_order integer DEFAULT 0 NOT NULL,
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    archived_at timestamp(6) with time zone,
    is_vip boolean DEFAULT false NOT NULL,
    CONSTRAINT ck_table_locations__status CHECK (((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'INACTIVE'::character varying])::text[])))
);

CREATE TABLE public.table_sessions (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    branch_id uuid NOT NULL,
    table_id uuid NOT NULL,
    business_date date NOT NULL,
    primary_waiter_membership_id uuid NOT NULL,
    primary_waiter_shift_session_id uuid NOT NULL,
    guest_count integer,
    status character varying(32) DEFAULT 'OPEN'::character varying NOT NULL,
    opened_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    bill_requested_at timestamp(6) with time zone,
    closed_at timestamp(6) with time zone,
    closed_by_membership_id uuid,
    version integer DEFAULT 1 NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    session_kind character varying(32) DEFAULT 'DINE_IN'::character varying NOT NULL,
    customer_name character varying(120),
    customer_phone character varying(40),
    idle_alert_sent_at timestamp(6) with time zone,
    close_reason text,
    CONSTRAINT ck_table_sessions__guest_count CHECK (((guest_count IS NULL) OR (guest_count > 0))),
    CONSTRAINT ck_table_sessions__status CHECK (((status)::text = ANY ((ARRAY['OPEN'::character varying, 'ACTIVE_ORDER'::character varying, 'ATTENTION_REQUIRED'::character varying, 'BILL_REQUESTED'::character varying, 'BILL_READY'::character varying, 'PAYMENT_PENDING'::character varying, 'PAID'::character varying, 'CLOSED'::character varying])::text[])))
);

CREATE TABLE public.tenant_entitlements (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    entitlement_key character varying(120) NOT NULL,
    value_json jsonb NOT NULL,
    effective_from timestamp(6) with time zone NOT NULL,
    effective_to timestamp(6) with time zone,
    changed_by_user_id uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.tenant_settings (
    tenant_id uuid NOT NULL,
    default_shift_grace_minutes integer DEFAULT 15 NOT NULL,
    waiter_may_close_paid_table boolean DEFAULT true NOT NULL,
    cashier_may_collect_customer_payment boolean DEFAULT false NOT NULL,
    protected_cancellation_policy character varying(40) DEFAULT 'MANAGER_APPROVAL'::character varying NOT NULL,
    unresolved_production_bill_policy character varying(40) DEFAULT 'BLOCK'::character varying NOT NULL,
    settings_version integer DEFAULT 1 NOT NULL,
    updated_by_membership_id uuid,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    calendar_preference character varying(24) DEFAULT 'ETHIOPIAN'::character varying NOT NULL,
    default_vip_percent numeric(8,2) DEFAULT 0 NOT NULL,
    room_service_enabled boolean DEFAULT false NOT NULL,
    breakfast_entitlement_enabled boolean DEFAULT false NOT NULL,
    breakfast_valid_from_local character varying(5) DEFAULT '07:00'::character varying NOT NULL,
    breakfast_valid_to_local character varying(5) DEFAULT '10:30'::character varying NOT NULL,
    breakfast_menu_item_id uuid,
    auto_approve_supply_requests boolean DEFAULT false NOT NULL,
    require_driver_for_dispatch boolean DEFAULT false NOT NULL,
    target_food_cost_percent numeric(5,2) DEFAULT 30 NOT NULL,
    food_cost_alert_percent numeric(5,2) DEFAULT 35 NOT NULL,
    CONSTRAINT ck_tenant_settings__bill_policy CHECK (((unresolved_production_bill_policy)::text = ANY ((ARRAY['BLOCK'::character varying, 'ALLOW_WITH_WARNING'::character varying])::text[]))),
    CONSTRAINT ck_tenant_settings__grace CHECK ((default_shift_grace_minutes >= 0))
);

CREATE TABLE public.tenant_sites (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    slug character varying(80) NOT NULL,
    status character varying(24) DEFAULT 'DRAFT'::character varying NOT NULL,
    theme_json jsonb NOT NULL,
    draft_data_json jsonb NOT NULL,
    published_data_json jsonb,
    published_at timestamp(6) with time zone,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    qr_menu_config_json jsonb,
    branch_id uuid,
    template_id character varying(60)
);

CREATE TABLE public.tenant_staff_memberships (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    user_id uuid NOT NULL,
    employee_display_name character varying(160) NOT NULL,
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    joined_at timestamp(6) with time zone,
    deactivated_at timestamp(6) with time zone,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    working_days text[] DEFAULT ARRAY[]::text[] NOT NULL,
    employee_code character varying(40),
    job_title character varying(120),
    employment_type character varying(24),
    pay_type character varying(16),
    base_pay numeric(14,2),
    hire_date date,
    probation_end_date date,
    emergency_contact_name character varying(160),
    emergency_contact_phone character varying(32),
    hr_notes character varying(1000),
    annual_leave_balance_days numeric(6,2) DEFAULT 0 NOT NULL,
    CONSTRAINT ck_tenant_staff_memberships__status CHECK (((status)::text = ANY ((ARRAY['INVITED'::character varying, 'ACTIVE'::character varying, 'INACTIVE'::character varying, 'SUSPENDED'::character varying])::text[])))
);

CREATE TABLE public.tenant_subscriptions (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    plan_id uuid NOT NULL,
    subscription_status character varying(24) NOT NULL,
    effective_from timestamp(6) with time zone NOT NULL,
    effective_to timestamp(6) with time zone,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    version integer DEFAULT 1 NOT NULL,
    CONSTRAINT ck_tenant_subscriptions__status CHECK (((subscription_status)::text = ANY ((ARRAY['TRIAL'::character varying, 'ACTIVE'::character varying, 'PAST_DUE'::character varying, 'SUSPENDED'::character varying, 'CANCELLED'::character varying])::text[])))
);

CREATE TABLE public.tenants (
    id uuid NOT NULL,
    display_name character varying(180) NOT NULL,
    legal_name character varying(220),
    status character varying(24) NOT NULL,
    default_timezone character varying(80) NOT NULL,
    currency_code character(3) NOT NULL,
    settings_version integer DEFAULT 1 NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    activated_at timestamp(6) with time zone,
    suspended_at timestamp(6) with time zone,
    closed_at timestamp(6) with time zone,
    version integer DEFAULT 1 NOT NULL,
    CONSTRAINT ck_tenants__status CHECK (((status)::text = ANY ((ARRAY['PROVISIONING'::character varying, 'ACTIVE'::character varying, 'SUSPENDED'::character varying, 'CLOSED'::character varying])::text[])))
);

CREATE TABLE public.transfer_receipts (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    payment_id uuid NOT NULL,
    file_id uuid NOT NULL,
    captured_by_membership_id uuid NOT NULL,
    captured_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.user_credentials (
    id uuid NOT NULL,
    user_id uuid NOT NULL,
    password_hash character varying(255),
    auth_provider character varying(40) DEFAULT 'email'::character varying NOT NULL,
    social_id character varying(255),
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE public.vendors (
    id uuid NOT NULL,
    tenant_id uuid NOT NULL,
    type character varying(20) NOT NULL,
    name character varying(160) NOT NULL,
    contact_person character varying(160),
    phone character varying(32),
    address character varying(180),
    status character varying(20) DEFAULT 'ACTIVE'::character varying NOT NULL,
    created_by_membership_id uuid,
    created_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    updated_at timestamp(6) with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
    branch_id uuid
);