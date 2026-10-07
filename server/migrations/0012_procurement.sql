CREATE TYPE "public"."procurement_status" AS ENUM('draft', 'rfq', 'evaluated', 'ordered', 'received', 'cancelled');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "procurement_cases" (
	"id" text PRIMARY KEY NOT NULL,
	"no" text NOT NULL,
	"office_id" text NOT NULL,
	"project_id" text,
	"line_id" text,
	"status" "procurement_status" DEFAULT 'draft' NOT NULL,
	"data" jsonb NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "procurement_cases_no_unique" UNIQUE("no")
);--> statement-breakpoint
ALTER TABLE "procurement_cases" ADD CONSTRAINT "procurement_cases_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_cases" ADD CONSTRAINT "procurement_cases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_cases" ADD CONSTRAINT "procurement_cases_line_id_budget_lines_id_fk" FOREIGN KEY ("line_id") REFERENCES "public"."budget_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "procurement_cases" ADD CONSTRAINT "procurement_cases_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "procurement_office_status" ON "procurement_cases" USING btree ("office_id","status");
