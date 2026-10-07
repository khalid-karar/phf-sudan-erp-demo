CREATE TYPE "public"."account_type" AS ENUM('asset', 'liability', 'net_assets', 'revenue', 'expense');--> statement-breakpoint
CREATE TYPE "public"."activity_type" AS ENUM('medical_day', 'clinic', 'distribution', 'training', 'transport', 'awareness', 'other');--> statement-breakpoint
CREATE TYPE "public"."advance_status" AS ENUM('open', 'settled');--> statement-breakpoint
CREATE TYPE "public"."approval_kind" AS ENUM('spend', 'reallocation');--> statement-breakpoint
CREATE TYPE "public"."control_mode" AS ENUM('hard', 'soft');--> statement-breakpoint
CREATE TYPE "public"."currency" AS ENUM('USD', 'SDG');--> statement-breakpoint
CREATE TYPE "public"."data_scope" AS ENUM('office', 'all');--> statement-breakpoint
CREATE TYPE "public"."fund_type" AS ENUM('cash', 'inkind');--> statement-breakpoint
CREATE TYPE "public"."journal_source" AS ENUM('opening', 'payment', 'receipt', 'advance', 'settlement', 'fx', 'transfer', 'payroll', 'stock', 'manual', 'reversal');--> statement-breakpoint
CREATE TYPE "public"."office_type" AS ENUM('hq', 'office', 'warehouse');--> statement-breakpoint
CREATE TYPE "public"."pay_method" AS ENUM('cash', 'bank', 'bankak', 'advance', 'transfer');--> statement-breakpoint
CREATE TYPE "public"."report_channel" AS ENUM('online', 'offline', 'excel');--> statement-breakpoint
CREATE TYPE "public"."request_status" AS ENUM('pending', 'approved', 'rejected', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."step_status" AS ENUM('waiting', 'pending', 'approved', 'rejected', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."voucher_kind" AS ENUM('payment', 'receipt');--> statement-breakpoint
CREATE TABLE "accounts" (
	"code" text PRIMARY KEY NOT NULL,
	"parent_code" text,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"type" "account_type" NOT NULL,
	"postable" boolean DEFAULT true NOT NULL,
	"currency" "currency" DEFAULT 'USD' NOT NULL,
	"office_id" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"office_id" text NOT NULL,
	"project_id" text NOT NULL,
	"line_id" text NOT NULL,
	"title_ar" text NOT NULL,
	"title_en" text NOT NULL,
	"type" "activity_type" DEFAULT 'other' NOT NULL,
	"planned_date" date NOT NULL,
	"location" text,
	"planned_usd" numeric(18, 2),
	"in_kind" boolean DEFAULT false NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "activities_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "advance_items" (
	"id" text PRIMARY KEY NOT NULL,
	"advance_id" text NOT NULL,
	"description" text NOT NULL,
	"receipt_no" text,
	"amount" numeric(20, 2) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "advances" (
	"id" text PRIMARY KEY NOT NULL,
	"no" text NOT NULL,
	"holder_name" text NOT NULL,
	"holder_user_id" text,
	"office_id" text NOT NULL,
	"project_id" text NOT NULL,
	"line_id" text NOT NULL,
	"activity_id" text,
	"request_id" text,
	"amount_usd" numeric(18, 2) NOT NULL,
	"currency" "currency" DEFAULT 'USD' NOT NULL,
	"amount" numeric(20, 2) DEFAULT '0' NOT NULL,
	"issue_rate" numeric(14, 4),
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	"due_at" date NOT NULL,
	"status" "advance_status" DEFAULT 'open' NOT NULL,
	"settled_at" timestamp with time zone,
	"spent" numeric(20, 2),
	"spent_usd" numeric(18, 2),
	"returned_usd" numeric(18, 2),
	"reimbursed_usd" numeric(18, 2),
	"report_id" text,
	"issue_entry_id" text,
	"settle_entry_id" text,
	CONSTRAINT "advances_no_unique" UNIQUE("no"),
	CONSTRAINT "advances_request_id_unique" UNIQUE("request_id")
);
--> statement-breakpoint
CREATE TABLE "approval_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"kind" "approval_kind" NOT NULL,
	"min_usd" numeric(18, 2) NOT NULL,
	"max_usd" numeric(18, 2),
	"office_id" text,
	"chain" text[] NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approval_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"request_id" text,
	"reallocation_id" text,
	"seq" integer NOT NULL,
	"role_id" text NOT NULL,
	"status" "step_status" NOT NULL,
	"by_id" text,
	"at" timestamp with time zone,
	"note" text,
	CONSTRAINT "approval_steps_one_parent" CHECK (("approval_steps"."request_id" is null) <> ("approval_steps"."reallocation_id" is null))
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text,
	"data" jsonb,
	"ip" text
);
--> statement-breakpoint
CREATE TABLE "budget_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"pillar_id" text NOT NULL,
	"code" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"ceiling_usd" numeric(18, 2) NOT NULL,
	"expense_account_code" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "doc_counters" (
	"key" text PRIMARY KEY NOT NULL,
	"next" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchange_rates" (
	"date" date PRIMARY KEY NOT NULL,
	"rate" numeric(14, 4) NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "field_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"no" text NOT NULL,
	"activity_id" text NOT NULL,
	"client_id" text,
	"done_on" date,
	"beneficiaries" integer NOT NULL,
	"men" integer,
	"women" integer,
	"children" integer,
	"summary" text NOT NULL,
	"issues" text,
	"actual_usd" numeric(18, 2),
	"lat" double precision,
	"lon" double precision,
	"via" "report_channel" DEFAULT 'online' NOT NULL,
	"submitted_by_id" text,
	"submitted_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "field_reports_no_unique" UNIQUE("no"),
	CONSTRAINT "field_reports_activity_id_unique" UNIQUE("activity_id"),
	CONSTRAINT "field_reports_client_id_unique" UNIQUE("client_id")
);
--> statement-breakpoint
CREATE TABLE "funds" (
	"id" text PRIMARY KEY NOT NULL,
	"type" "fund_type" NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"donor_ar" text NOT NULL,
	"donor_en" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"no" text NOT NULL,
	"date" date NOT NULL,
	"period" text NOT NULL,
	"memo" text NOT NULL,
	"source" "journal_source" NOT NULL,
	"ref" text,
	"reversal_of_id" text,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_entries_no_unique" UNIQUE("no"),
	CONSTRAINT "journal_entries_reversal_of_id_unique" UNIQUE("reversal_of_id")
);
--> statement-breakpoint
CREATE TABLE "journal_lines" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"entry_id" text NOT NULL,
	"account_code" text NOT NULL,
	"debit" numeric(18, 2) DEFAULT '0' NOT NULL,
	"credit" numeric(18, 2) DEFAULT '0' NOT NULL,
	"sdg" numeric(20, 2),
	"office_id" text NOT NULL,
	"project_id" text,
	"budget_line_id" text,
	"activity_id" text,
	"memo" text,
	CONSTRAINT "journal_lines_non_negative" CHECK ("journal_lines"."debit" >= 0 and "journal_lines"."credit" >= 0),
	CONSTRAINT "journal_lines_one_side" CHECK (("journal_lines"."debit" = 0) <> ("journal_lines"."credit" = 0))
);
--> statement-breakpoint
CREATE TABLE "ledger_accounts" (
	"key" text PRIMARY KEY NOT NULL,
	"account_code" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offices" (
	"id" text PRIMARY KEY NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"state_ar" text NOT NULL,
	"state_en" text NOT NULL,
	"type" "office_type" DEFAULT 'office' NOT NULL,
	"lat" double precision,
	"lon" double precision,
	"phone" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"short_name_ar" text NOT NULL,
	"short_name_en" text NOT NULL,
	"hq_name_ar" text NOT NULL,
	"hq_name_en" text NOT NULL,
	"logo_url" text,
	"base_currency" text DEFAULT 'USD' NOT NULL,
	"local_currency" text DEFAULT 'SDG' NOT NULL,
	"fiscal_year_start_month" integer DEFAULT 1 NOT NULL,
	"default_lang" text DEFAULT 'ar' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "period_closes" (
	"period" text NOT NULL,
	"office_id" text NOT NULL,
	"cash_counted" boolean DEFAULT false NOT NULL,
	"closed_at" timestamp with time zone,
	"closed_by_id" text,
	CONSTRAINT "period_closes_period_office_id_pk" PRIMARY KEY("period","office_id")
);
--> statement-breakpoint
CREATE TABLE "pillars" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"code" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"ceiling_usd" numeric(18, 2) NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"donor_ar" text NOT NULL,
	"donor_en" text NOT NULL,
	"fund_id" text,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	"ceiling_usd" numeric(18, 2) NOT NULL,
	"control_mode" "control_mode" DEFAULT 'hard' NOT NULL,
	"tolerance_pct" numeric(5, 2) DEFAULT '0' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "projects_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "reallocations" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"project_id" text NOT NULL,
	"from_line_id" text NOT NULL,
	"to_line_id" text NOT NULL,
	"amount_usd" numeric(18, 2) NOT NULL,
	"reason" text NOT NULL,
	"status" "request_status" DEFAULT 'pending' NOT NULL,
	"requester_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "reallocations_code_unique" UNIQUE("code"),
	CONSTRAINT "reallocations_amount_pos" CHECK ("reallocations"."amount_usd" > 0),
	CONSTRAINT "reallocations_distinct_lines" CHECK ("reallocations"."from_line_id" <> "reallocations"."to_line_id")
);
--> statement-breakpoint
CREATE TABLE "refresh_tokens" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"family" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"user_agent" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "refresh_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "roles" (
	"id" text PRIMARY KEY NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"desc_ar" text DEFAULT '' NOT NULL,
	"desc_en" text DEFAULT '' NOT NULL,
	"permissions" jsonb NOT NULL,
	"scope" "data_scope" DEFAULT 'office' NOT NULL,
	"can_approve" boolean DEFAULT false NOT NULL,
	"system" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "spend_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"office_id" text NOT NULL,
	"project_id" text NOT NULL,
	"line_id" text NOT NULL,
	"activity_id" text,
	"purpose" text NOT NULL,
	"amount" numeric(20, 2) NOT NULL,
	"currency" "currency" NOT NULL,
	"rate" numeric(14, 4) NOT NULL,
	"amount_usd" numeric(18, 2) NOT NULL,
	"over_ceiling" boolean DEFAULT false NOT NULL,
	"status" "request_status" DEFAULT 'pending' NOT NULL,
	"rule_id" text,
	"requester_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	CONSTRAINT "spend_requests_code_unique" UNIQUE("code"),
	CONSTRAINT "spend_requests_amount_pos" CHECK ("spend_requests"."amount_usd" > 0)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"phone" text,
	"password_hash" text NOT NULL,
	"must_change_password" boolean DEFAULT false NOT NULL,
	"role_id" text NOT NULL,
	"office_id" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "vouchers" (
	"id" text PRIMARY KEY NOT NULL,
	"no" text NOT NULL,
	"kind" "voucher_kind" NOT NULL,
	"date" date NOT NULL,
	"method" "pay_method" NOT NULL,
	"account_code" text NOT NULL,
	"currency" "currency" NOT NULL,
	"amount" numeric(20, 2) NOT NULL,
	"rate" numeric(14, 4) NOT NULL,
	"amount_usd" numeric(18, 2) NOT NULL,
	"party" text NOT NULL,
	"memo" text NOT NULL,
	"office_id" text NOT NULL,
	"project_id" text,
	"line_id" text,
	"request_id" text,
	"journal_entry_id" text NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vouchers_no_unique" UNIQUE("no"),
	CONSTRAINT "vouchers_request_id_unique" UNIQUE("request_id"),
	CONSTRAINT "vouchers_journal_entry_id_unique" UNIQUE("journal_entry_id")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_line_id_budget_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."budget_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advance_items" ADD CONSTRAINT "advance_items_advance_id_advances_id_fk" FOREIGN KEY ("advance_id") REFERENCES "public"."advances"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advances" ADD CONSTRAINT "advances_holder_user_id_users_id_fk" FOREIGN KEY ("holder_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advances" ADD CONSTRAINT "advances_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advances" ADD CONSTRAINT "advances_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advances" ADD CONSTRAINT "advances_line_id_budget_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."budget_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advances" ADD CONSTRAINT "advances_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advances" ADD CONSTRAINT "advances_request_id_spend_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."spend_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advances" ADD CONSTRAINT "advances_report_id_field_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."field_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advances" ADD CONSTRAINT "advances_issue_entry_id_journal_entries_id_fk" FOREIGN KEY ("issue_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "advances" ADD CONSTRAINT "advances_settle_entry_id_journal_entries_id_fk" FOREIGN KEY ("settle_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_rules" ADD CONSTRAINT "approval_rules_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_request_id_spend_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."spend_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_reallocation_id_reallocations_id_fk" FOREIGN KEY ("reallocation_id") REFERENCES "public"."reallocations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approval_steps" ADD CONSTRAINT "approval_steps_by_id_users_id_fk" FOREIGN KEY ("by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_pillar_id_pillars_id_fk" FOREIGN KEY ("pillar_id") REFERENCES "public"."pillars"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_expense_account_code_accounts_code_fk" FOREIGN KEY ("expense_account_code") REFERENCES "public"."accounts"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_reports" ADD CONSTRAINT "field_reports_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "field_reports" ADD CONSTRAINT "field_reports_submitted_by_id_users_id_fk" FOREIGN KEY ("submitted_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_account_code_accounts_code_fk" FOREIGN KEY ("account_code") REFERENCES "public"."accounts"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_budget_line_id_budget_lines_id_fk" FOREIGN KEY ("budget_line_id") REFERENCES "public"."budget_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_account_code_accounts_code_fk" FOREIGN KEY ("account_code") REFERENCES "public"."accounts"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_closes" ADD CONSTRAINT "period_closes_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_closes" ADD CONSTRAINT "period_closes_closed_by_id_users_id_fk" FOREIGN KEY ("closed_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pillars" ADD CONSTRAINT "pillars_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_fund_id_funds_id_fk" FOREIGN KEY ("fund_id") REFERENCES "public"."funds"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reallocations" ADD CONSTRAINT "reallocations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reallocations" ADD CONSTRAINT "reallocations_from_line_id_budget_lines_id_fk" FOREIGN KEY ("from_line_id") REFERENCES "public"."budget_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reallocations" ADD CONSTRAINT "reallocations_to_line_id_budget_lines_id_fk" FOREIGN KEY ("to_line_id") REFERENCES "public"."budget_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reallocations" ADD CONSTRAINT "reallocations_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_requests" ADD CONSTRAINT "spend_requests_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_requests" ADD CONSTRAINT "spend_requests_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_requests" ADD CONSTRAINT "spend_requests_line_id_budget_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."budget_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_requests" ADD CONSTRAINT "spend_requests_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_requests" ADD CONSTRAINT "spend_requests_rule_id_approval_rules_id_fk" FOREIGN KEY ("rule_id") REFERENCES "public"."approval_rules"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "spend_requests" ADD CONSTRAINT "spend_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_account_code_accounts_code_fk" FOREIGN KEY ("account_code") REFERENCES "public"."accounts"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_line_id_budget_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."budget_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_request_id_spend_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."spend_requests"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_journal_entry_id_journal_entries_id_fk" FOREIGN KEY ("journal_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activities_office_idx" ON "activities" USING btree ("office_id");--> statement-breakpoint
CREATE INDEX "advances_status_line" ON "advances" USING btree ("status","line_id");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_steps_request_seq" ON "approval_steps" USING btree ("request_id","seq");--> statement-breakpoint
CREATE UNIQUE INDEX "approval_steps_realloc_seq" ON "approval_steps" USING btree ("reallocation_id","seq");--> statement-breakpoint
CREATE INDEX "approval_steps_role_status" ON "approval_steps" USING btree ("role_id","status");--> statement-breakpoint
CREATE INDEX "audit_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_user_idx" ON "audit_log" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "budget_lines_project_code" ON "budget_lines" USING btree ("project_id","code");--> statement-breakpoint
CREATE INDEX "budget_lines_pillar_idx" ON "budget_lines" USING btree ("pillar_id");--> statement-breakpoint
CREATE INDEX "journal_entries_period" ON "journal_entries" USING btree ("period");--> statement-breakpoint
CREATE INDEX "journal_lines_account" ON "journal_lines" USING btree ("account_code");--> statement-breakpoint
CREATE INDEX "journal_lines_budget_line" ON "journal_lines" USING btree ("budget_line_id");--> statement-breakpoint
CREATE INDEX "journal_lines_entry" ON "journal_lines" USING btree ("entry_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pillars_project_code" ON "pillars" USING btree ("project_id","code");--> statement-breakpoint
CREATE INDEX "refresh_tokens_user_idx" ON "refresh_tokens" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "refresh_tokens_family_idx" ON "refresh_tokens" USING btree ("family");--> statement-breakpoint
CREATE INDEX "spend_requests_line_status" ON "spend_requests" USING btree ("line_id","status");--> statement-breakpoint
CREATE INDEX "spend_requests_office_status" ON "spend_requests" USING btree ("office_id","status");