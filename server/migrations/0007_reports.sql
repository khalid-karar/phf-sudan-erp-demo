CREATE TYPE "public"."draft_status" AS ENUM('draft', 'approved', 'sent');--> statement-breakpoint
CREATE TYPE "public"."report_kind" AS ENUM('hq', 'donor');--> statement-breakpoint
CREATE TYPE "public"."send_status" AS ENUM('sent', 'failed');--> statement-breakpoint
CREATE TABLE "hq_drafts" (
	"period" text PRIMARY KEY NOT NULL,
	"summary" jsonb,
	"challenges" jsonb,
	"plan" jsonb,
	"status" "draft_status" DEFAULT 'draft' NOT NULL,
	"approved_by_id" text,
	"approved_at" timestamp with time zone,
	"updated_by_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "report_settings" (
	"id" integer PRIMARY KEY DEFAULT 1 NOT NULL,
	"hq" jsonb NOT NULL,
	"donor" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_by_id" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sent_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "report_kind" NOT NULL,
	"period" text NOT NULL,
	"project_id" text,
	"to_addresses" jsonb NOT NULL,
	"cc_addresses" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"subject" text NOT NULL,
	"body" text NOT NULL,
	"attachment_id" text,
	"status" "send_status" NOT NULL,
	"error" text,
	"sent_by_id" text,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "hq_drafts" ADD CONSTRAINT "hq_drafts_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "hq_drafts" ADD CONSTRAINT "hq_drafts_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_settings" ADD CONSTRAINT "report_settings_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sent_reports" ADD CONSTRAINT "sent_reports_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sent_reports" ADD CONSTRAINT "sent_reports_attachment_id_attachments_id_fk" FOREIGN KEY ("attachment_id") REFERENCES "public"."attachments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sent_reports" ADD CONSTRAINT "sent_reports_sent_by_id_users_id_fk" FOREIGN KEY ("sent_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sent_reports_period_idx" ON "sent_reports" USING btree ("kind","period");