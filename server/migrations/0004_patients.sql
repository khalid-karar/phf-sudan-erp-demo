CREATE TYPE "public"."service_type" AS ENUM('consultation', 'surgery', 'medicines', 'nutrition', 'vaccination', 'referral', 'maternal');--> statement-breakpoint
CREATE TABLE "beneficiaries" (
	"id" text PRIMARY KEY NOT NULL,
	"no" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text,
	"name_key" text NOT NULL,
	"gender" text NOT NULL,
	"birth_year" integer NOT NULL,
	"office_id" text NOT NULL,
	"locality" text,
	"displaced" boolean DEFAULT false NOT NULL,
	"phone" text,
	"phone_digits" text,
	"registered_at" date NOT NULL,
	"registered_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "beneficiaries_no_unique" UNIQUE("no"),
	CONSTRAINT "beneficiaries_gender" CHECK ("beneficiaries"."gender" in ('m', 'f')),
	CONSTRAINT "beneficiaries_birth_year" CHECK ("beneficiaries"."birth_year" between 1900 and 2100)
);
--> statement-breakpoint
CREATE TABLE "beneficiary_services" (
	"id" text PRIMARY KEY NOT NULL,
	"beneficiary_id" text NOT NULL,
	"date" date NOT NULL,
	"type" "service_type" NOT NULL,
	"office_id" text NOT NULL,
	"activity_id" text,
	"note" text,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "beneficiaries" ADD CONSTRAINT "beneficiaries_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beneficiaries" ADD CONSTRAINT "beneficiaries_registered_by_id_users_id_fk" FOREIGN KEY ("registered_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beneficiary_services" ADD CONSTRAINT "beneficiary_services_beneficiary_id_beneficiaries_id_fk" FOREIGN KEY ("beneficiary_id") REFERENCES "public"."beneficiaries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beneficiary_services" ADD CONSTRAINT "beneficiary_services_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beneficiary_services" ADD CONSTRAINT "beneficiary_services_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "beneficiary_services" ADD CONSTRAINT "beneficiary_services_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "beneficiaries_office_idx" ON "beneficiaries" USING btree ("office_id");--> statement-breakpoint
CREATE INDEX "beneficiaries_birth_gender_idx" ON "beneficiaries" USING btree ("birth_year","gender");--> statement-breakpoint
CREATE INDEX "beneficiaries_phone_idx" ON "beneficiaries" USING btree ("phone_digits");--> statement-breakpoint
CREATE INDEX "services_beneficiary_idx" ON "beneficiary_services" USING btree ("beneficiary_id","date");--> statement-breakpoint
CREATE INDEX "services_office_date_idx" ON "beneficiary_services" USING btree ("office_id","date");