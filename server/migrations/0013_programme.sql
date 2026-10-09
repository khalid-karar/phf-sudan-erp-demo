-- Programme management: donors, sectors, objectives and indicators, project team, milestones,
-- reporting calendar and the monthly/quarterly report workflow (PMO review → release to donor).

CREATE TABLE IF NOT EXISTS "donors" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "donors_code_unique" UNIQUE("code")
);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN IF NOT EXISTS "donor_id" text REFERENCES "donors"("id");--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "donor_id" text REFERENCES "donors"("id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "sectors" (
	"id" text PRIMARY KEY NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);--> statement-breakpoint
INSERT INTO "sectors" ("id", "name_ar", "name_en", "sort") VALUES
	('health', 'الصحة', 'Health', 1),
	('nutrition', 'التغذية', 'Nutrition', 2),
	('cash', 'الدعم النقدي', 'Cash support', 3),
	('wash', 'المياه والإصحاح', 'WASH', 4)
ON CONFLICT DO NOTHING;--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "project_sectors" (
	"project_id" text NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
	"sector_id" text NOT NULL REFERENCES "sectors"("id"),
	PRIMARY KEY ("project_id", "sector_id")
);--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "objectives" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
	"sector_id" text REFERENCES "sectors"("id"),
	"code" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "objectives_project_code" ON "objectives" ("project_id", "code");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "indicators" (
	"id" text PRIMARY KEY NOT NULL,
	"objective_id" text NOT NULL REFERENCES "objectives"("id") ON DELETE CASCADE,
	"code" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"unit" text DEFAULT '' NOT NULL,
	"target" numeric(18,2),
	-- manual: typed in the report; the others are counted from the system for the report's period
	"source" text DEFAULT 'manual' NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "indicators_source" CHECK ("source" in ('manual', 'beneficiaries', 'services', 'activities', 'field_beneficiaries'))
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "indicators_objective_code" ON "indicators" ("objective_id", "code");--> statement-breakpoint

ALTER TABLE "activities" ADD COLUMN IF NOT EXISTS "objective_id" text REFERENCES "objectives"("id") ON DELETE SET NULL;--> statement-breakpoint

CREATE TYPE "public"."team_role" AS ENUM('project_manager', 'project_coordinator', 'project_office');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_team" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
	"role" "team_role" NOT NULL,
	"user_id" text NOT NULL REFERENCES "users"("id"),
	"sector_id" text REFERENCES "sectors"("id") -- a project office works for one sector (nutrition, health…)
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_team_member" ON "project_team" ("project_id", "role", "user_id");--> statement-breakpoint

CREATE TYPE "public"."milestone_status" AS ENUM('planned', 'in_progress', 'done', 'delayed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "milestones" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
	"title_ar" text NOT NULL,
	"title_en" text NOT NULL,
	"due" date NOT NULL,
	"owner_id" text REFERENCES "users"("id"),
	"status" "milestone_status" DEFAULT 'planned' NOT NULL,
	"objective_id" text REFERENCES "objectives"("id") ON DELETE SET NULL,
	"activity_id" text REFERENCES "activities"("id") ON DELETE SET NULL,
	"notify_days_before" integer DEFAULT 7 NOT NULL,
	"done_at" timestamp with time zone,
	"created_by_id" text REFERENCES "users"("id"),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "milestones_project_due" ON "milestones" ("project_id", "due");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "report_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"sector_id" text REFERENCES "sectors"("id"),
	"fields" jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- One row per project: which reports it owes, and when (day of the month after the period ends).
CREATE TABLE IF NOT EXISTS "reporting_schedules" (
	"project_id" text PRIMARY KEY NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
	"enabled" boolean DEFAULT true NOT NULL,
	"monthly_due_day" integer DEFAULT 10 NOT NULL,
	"quarterly_due_day" integer DEFAULT 20 NOT NULL,
	"notify_days_before" integer DEFAULT 5 NOT NULL,
	CONSTRAINT "schedule_days" CHECK ("monthly_due_day" between 1 and 28 and "quarterly_due_day" between 1 and 28 and "notify_days_before" between 0 and 60)
);--> statement-breakpoint

CREATE TYPE "public"."project_report_type" AS ENUM('statistics', 'narrative', 'custom', 'quarterly');--> statement-breakpoint
CREATE TYPE "public"."project_report_status" AS ENUM('open', 'draft', 'submitted', 'returned', 'approved', 'released');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "project_reports" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
	"type" "project_report_type" NOT NULL,
	"period" text NOT NULL, -- YYYY-MM, or YYYY-Qn for the quarterly report
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"due" date NOT NULL,
	"sector_id" text REFERENCES "sectors"("id"),
	"template_id" text REFERENCES "report_templates"("id"),
	"status" "project_report_status" DEFAULT 'open' NOT NULL,
	"content" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"submitted_at" timestamp with time zone,
	"submitted_by_id" text REFERENCES "users"("id"),
	"reviewed_at" timestamp with time zone,
	"reviewed_by_id" text REFERENCES "users"("id"),
	"review_note" text,
	"released_at" timestamp with time zone,
	"released_by_id" text REFERENCES "users"("id"),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "project_reports_slot" ON "project_reports" ("project_id", "type", "period", coalesce("sector_id", ''));--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_reports_status_due" ON "project_reports" ("status", "due");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "project_report_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"report_id" text NOT NULL REFERENCES "project_reports"("id") ON DELETE CASCADE,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text REFERENCES "users"("id"),
	"action" text NOT NULL, -- submit, return, approve, release, reopen
	"note" text
);--> statement-breakpoint

-- Standard roles for the programme (existing installations get them here; new ones from defaults.json).
INSERT INTO "roles" ("id", "name_ar", "name_en", "desc_ar", "desc_en", "permissions", "scope", "can_approve", "system") VALUES
	('pmo', 'مكتب إدارة المشاريع (PMO)', 'Project management office (PMO)', 'يراجع كل تقارير المشاريع ويعتمدها ثم يفرج عنها للمانح', 'Reviews and approves every project report, then releases it to the donor',
	 '{"dashboard":"view","projects":"edit","activities":"view","finance":"none","supply":"none","logistics":"none","patients":"view","hr":"none","reports":"manage","alerts":"view","settings":"none"}', 'all', false, false),
	('project_manager', 'مدير المشروع', 'Project manager', 'يعدّ التقرير الإحصائي الشهري والتقرير الربع سنوي', 'Prepares the monthly statistics report and the quarterly report',
	 '{"dashboard":"view","projects":"edit","activities":"view","finance":"none","supply":"none","logistics":"none","patients":"view","hr":"none","reports":"edit","alerts":"view","settings":"none"}', 'all', false, false),
	('project_coordinator', 'منسق المشروع', 'Project coordinator', 'يعدّ التقرير السردي الشهري', 'Prepares the monthly narrative report',
	 '{"dashboard":"view","projects":"view","activities":"view","finance":"none","supply":"none","logistics":"none","patients":"none","hr":"none","reports":"edit","alerts":"view","settings":"none"}', 'all', false, false),
	('project_office', 'مكتب المشروع (تغذية / صحة)', 'Project office (nutrition / health)', 'يعدّ التقرير الشهري المخصص لقطاعه', 'Prepares the custom monthly report for its sector',
	 '{"dashboard":"view","projects":"view","activities":"view","finance":"none","supply":"none","logistics":"none","patients":"none","hr":"none","reports":"edit","alerts":"view","settings":"none"}', 'all', false, false),
	('donor_viewer', 'ممثل الجهة المانحة (عرض فقط)', 'Donor representative (view only)', 'يرى التقارير التي أُفرج عنها لجهته فقط', 'Sees only the reports released to their own donor',
	 '{"dashboard":"none","projects":"none","activities":"none","finance":"none","supply":"none","logistics":"none","patients":"none","hr":"none","reports":"none","alerts":"none","settings":"none"}', 'all', false, true)
ON CONFLICT DO NOTHING;--> statement-breakpoint

-- Alert rules for the new events (existing installations; new ones get them from DEFAULT_RULES).
INSERT INTO "notif_rules" ("id", "event", "name_ar", "name_en", "threshold", "recipients", "channels", "enabled")
SELECT 'nr-' || e.event, e.event, e.name_ar, e.name_en, NULL, e.recipients::jsonb, e.channels::jsonb, true
FROM (VALUES
	('project_report_due', 'اقتراب موعد تسليم تقرير مشروع', 'A project report is due soon', '{"concerned":true,"roles":[],"users":[]}', '{"inapp":true,"email":true,"whatsapp":false,"sms":false}'),
	('project_report_overdue', 'تقرير مشروع متأخر', 'A project report is overdue', '{"concerned":true,"roles":["pmo"],"users":[]}', '{"inapp":true,"email":true,"whatsapp":false,"sms":true}'),
	('project_report_submitted', 'تقرير بانتظار مراجعة PMO', 'A report is waiting for PMO review', '{"concerned":true,"roles":[],"users":[]}', '{"inapp":true,"email":true,"whatsapp":false,"sms":false}'),
	('project_report_returned', 'أُعيد تقريرك للتعديل', 'Your report was returned for changes', '{"concerned":true,"roles":[],"users":[]}', '{"inapp":true,"email":true,"whatsapp":true,"sms":false}'),
	('milestone_due', 'اقتراب موعد معلم في مشروع', 'A project milestone is coming up', '{"concerned":true,"roles":[],"users":[]}', '{"inapp":true,"email":true,"whatsapp":false,"sms":false}'),
	('milestone_overdue', 'معلم مشروع متأخر', 'A project milestone is overdue', '{"concerned":true,"roles":["pmo"],"users":[]}', '{"inapp":true,"email":true,"whatsapp":false,"sms":true}')
) AS e(event, name_ar, name_en, recipients, channels)
WHERE EXISTS (SELECT 1 FROM "notif_rules") AND NOT EXISTS (SELECT 1 FROM "notif_rules" n WHERE n.event = e.event);
