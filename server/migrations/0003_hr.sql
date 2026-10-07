CREATE TYPE "public"."contract_type" AS ENUM('permanent', 'fixed', 'daily', 'volunteer');--> statement-breakpoint
CREATE TYPE "public"."department" AS ENUM('medical', 'field', 'finance', 'admin', 'supply', 'logistics');--> statement-breakpoint
CREATE TYPE "public"."employee_status" AS ENUM('active', 'ended');--> statement-breakpoint
CREATE TYPE "public"."leave_status" AS ENUM('pending', 'approved', 'rejected', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."leave_type" AS ENUM('annual', 'sick', 'emergency', 'unpaid');--> statement-breakpoint
CREATE TYPE "public"."payroll_status" AS ENUM('posted', 'voided');--> statement-breakpoint
CREATE TABLE "employee_allocations" (
	"employee_id" text NOT NULL,
	"project_id" text NOT NULL,
	"line_id" text NOT NULL,
	"pct" integer NOT NULL,
	CONSTRAINT "employee_allocations_employee_id_line_id_pk" PRIMARY KEY("employee_id","line_id"),
	CONSTRAINT "allocation_pct" CHECK ("employee_allocations"."pct" between 1 and 100)
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" text PRIMARY KEY NOT NULL,
	"no" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"office_id" text NOT NULL,
	"position_ar" text NOT NULL,
	"position_en" text NOT NULL,
	"department" "department" NOT NULL,
	"contract" "contract_type" NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"salary_sdg" numeric(20, 2) DEFAULT '0' NOT NULL,
	"phone" text,
	"status" "employee_status" DEFAULT 'active' NOT NULL,
	"user_id" text,
	"leave_balance" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_no_unique" UNIQUE("no"),
	CONSTRAINT "employees_user_id_unique" UNIQUE("user_id"),
	CONSTRAINT "employees_salary_non_negative" CHECK ("employees"."salary_sdg" >= 0),
	CONSTRAINT "employees_leave_non_negative" CHECK ("employees"."leave_balance" >= 0)
);
--> statement-breakpoint
CREATE TABLE "leave_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"employee_id" text NOT NULL,
	"type" "leave_type" NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"days" integer NOT NULL,
	"note" text,
	"status" "leave_status" DEFAULT 'pending' NOT NULL,
	"requested_by_id" text,
	"decided_by_id" text,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leave_dates" CHECK ("leave_requests"."to_date" >= "leave_requests"."from_date" and "leave_requests"."days" >= 1)
);
--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" text PRIMARY KEY NOT NULL,
	"period" text NOT NULL,
	"date" date NOT NULL,
	"rate" numeric(14, 4) NOT NULL,
	"headcount" integer NOT NULL,
	"gross_sdg" numeric(20, 2) NOT NULL,
	"deductions_sdg" numeric(20, 2) NOT NULL,
	"net_sdg" numeric(20, 2) NOT NULL,
	"gross_usd" numeric(18, 2) NOT NULL,
	"account_code" text NOT NULL,
	"status" "payroll_status" DEFAULT 'posted' NOT NULL,
	"entry_id" text NOT NULL,
	"void_entry_id" text,
	"posted_by_id" text,
	"posted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	"void_reason" text,
	"detail" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "org_settings" ADD COLUMN "payroll_deduction_pct" numeric(5, 2) DEFAULT '8.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "employee_allocations" ADD CONSTRAINT "employee_allocations_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_allocations" ADD CONSTRAINT "employee_allocations_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_allocations" ADD CONSTRAINT "employee_allocations_line_id_budget_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."budget_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_account_code_accounts_code_fk" FOREIGN KEY ("account_code") REFERENCES "public"."accounts"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_void_entry_id_journal_entries_id_fk" FOREIGN KEY ("void_entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_posted_by_id_users_id_fk" FOREIGN KEY ("posted_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employees_office_idx" ON "employees" USING btree ("office_id");--> statement-breakpoint
CREATE INDEX "leave_employee_idx" ON "leave_requests" USING btree ("employee_id","from_date");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_one_posted_per_period" ON "payroll_runs" USING btree ("period") WHERE "payroll_runs"."status" = 'posted';