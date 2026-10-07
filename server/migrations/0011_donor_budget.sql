ALTER TYPE "public"."attachment_owner" ADD VALUE IF NOT EXISTS 'project';--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "ip_code" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "budget_rate" numeric(14,4);--> statement-breakpoint
ALTER TABLE "budget_lines" ADD COLUMN IF NOT EXISTS "activity_code" text;--> statement-breakpoint
ALTER TABLE "budget_lines" ADD COLUMN IF NOT EXISTS "fund_code" text;--> statement-breakpoint
ALTER TABLE "budget_lines" ADD COLUMN IF NOT EXISTS "state" text;--> statement-breakpoint
ALTER TABLE "budget_lines" ADD COLUMN IF NOT EXISTS "description" text;--> statement-breakpoint
ALTER TABLE "budget_lines" ADD COLUMN IF NOT EXISTS "unit" text;--> statement-breakpoint
ALTER TABLE "budget_lines" ADD COLUMN IF NOT EXISTS "unit_qty" numeric(14,2);--> statement-breakpoint
ALTER TABLE "budget_lines" ADD COLUMN IF NOT EXISTS "duration" numeric(14,2);--> statement-breakpoint
ALTER TABLE "budget_lines" ADD COLUMN IF NOT EXISTS "unit_cost_usd" numeric(18,2);--> statement-breakpoint
ALTER TABLE "budget_lines" ADD COLUMN IF NOT EXISTS "nature" text;--> statement-breakpoint
ALTER TABLE "budget_lines" ADD COLUMN IF NOT EXISTS "donor_account" text;
