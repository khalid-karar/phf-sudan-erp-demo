CREATE INDEX IF NOT EXISTS jl_activity_idx ON journal_lines (activity_id) WHERE activity_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS jl_project_idx ON journal_lines (project_id) WHERE project_id IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS je_date_idx ON journal_entries (date);
