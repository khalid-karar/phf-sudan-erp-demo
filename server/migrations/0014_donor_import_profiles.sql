-- How each funding entity names the columns of its budget workbook (ICE layout is the default when none is saved).
CREATE TABLE IF NOT EXISTS "donor_import_profiles" (
	"donor_id" text PRIMARY KEY NOT NULL,
	"headers" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "donor_import_profiles" ADD CONSTRAINT "donor_import_profiles_donor_id_donors_id_fk" FOREIGN KEY ("donor_id") REFERENCES "public"."donors"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
