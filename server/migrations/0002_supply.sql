CREATE TYPE "public"."item_category" AS ENUM('nutrition', 'medicine', 'medical_supply', 'equipment');--> statement-breakpoint
CREATE TYPE "public"."move_kind" AS ENUM('receipt', 'issue', 'transfer_out', 'transfer_in', 'loss');--> statement-breakpoint
CREATE TYPE "public"."shipment_status" AS ENUM('preparing', 'in_transit', 'delivered');--> statement-breakpoint
CREATE TYPE "public"."vehicle_kind" AS ENUM('pickup', 'suv', 'truck', 'ambulance');--> statement-breakpoint
CREATE TYPE "public"."vehicle_status" AS ENUM('available', 'on_trip', 'maintenance');--> statement-breakpoint
CREATE TABLE "fuel_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"vehicle_id" text NOT NULL,
	"date" date NOT NULL,
	"liters" numeric(10, 2) NOT NULL,
	"cost_sdg" numeric(20, 2) NOT NULL,
	"odometer" integer NOT NULL,
	"office_id" text NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "items" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text NOT NULL,
	"unit_ar" text NOT NULL,
	"unit_en" text NOT NULL,
	"category" "item_category" NOT NULL,
	"unit_value" numeric(18, 2) NOT NULL,
	"min_qty" integer DEFAULT 0 NOT NULL,
	"expense_account_code" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "shipment_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"shipment_id" text NOT NULL,
	"item_id" text NOT NULL,
	"qty" integer NOT NULL,
	"received" integer,
	CONSTRAINT "shipment_lines_qty" CHECK ("shipment_lines"."qty" > 0 and ("shipment_lines"."received" is null or ("shipment_lines"."received" >= 0 and "shipment_lines"."received" <= "shipment_lines"."qty")))
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" text PRIMARY KEY NOT NULL,
	"no" text NOT NULL,
	"from_office_id" text NOT NULL,
	"to_office_id" text NOT NULL,
	"vehicle_id" text,
	"driver" text,
	"status" "shipment_status" DEFAULT 'preparing' NOT NULL,
	"note" text,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"departed_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"received_by_id" text,
	"sent_entry_id" text,
	CONSTRAINT "shipments_no_unique" UNIQUE("no"),
	CONSTRAINT "shipments_different_offices" CHECK ("shipments"."from_office_id" <> "shipments"."to_office_id")
);
--> statement-breakpoint
CREATE TABLE "stock_levels" (
	"item_id" text NOT NULL,
	"office_id" text NOT NULL,
	"qty" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "stock_levels_item_id_office_id_pk" PRIMARY KEY("item_id","office_id"),
	CONSTRAINT "stock_levels_non_negative" CHECK ("stock_levels"."qty" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stock_moves" (
	"id" text PRIMARY KEY NOT NULL,
	"no" text NOT NULL,
	"kind" "move_kind" NOT NULL,
	"date" date NOT NULL,
	"item_id" text NOT NULL,
	"office_id" text NOT NULL,
	"qty" integer NOT NULL,
	"value_usd" numeric(18, 2) NOT NULL,
	"ref" text,
	"source" text,
	"activity_id" text,
	"shipment_id" text,
	"expiry" date,
	"entry_id" text,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_moves_positive" CHECK ("stock_moves"."qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "vehicles" (
	"id" text PRIMARY KEY NOT NULL,
	"plate" text NOT NULL,
	"model_ar" text NOT NULL,
	"model_en" text NOT NULL,
	"kind" "vehicle_kind" NOT NULL,
	"office_id" text NOT NULL,
	"driver" text,
	"status" "vehicle_status" DEFAULT 'available' NOT NULL,
	"odometer" integer DEFAULT 0 NOT NULL,
	"next_service_km" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "vehicles_plate_unique" UNIQUE("plate")
);
--> statement-breakpoint
ALTER TABLE "fuel_logs" ADD CONSTRAINT "fuel_logs_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_logs" ADD CONSTRAINT "fuel_logs_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fuel_logs" ADD CONSTRAINT "fuel_logs_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "items" ADD CONSTRAINT "items_expense_account_code_accounts_code_fk" FOREIGN KEY ("expense_account_code") REFERENCES "public"."accounts"("code") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_lines" ADD CONSTRAINT "shipment_lines_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipment_lines" ADD CONSTRAINT "shipment_lines_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_from_office_id_offices_id_fk" FOREIGN KEY ("from_office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_to_office_id_offices_id_fk" FOREIGN KEY ("to_office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_vehicle_id_vehicles_id_fk" FOREIGN KEY ("vehicle_id") REFERENCES "public"."vehicles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_received_by_id_users_id_fk" FOREIGN KEY ("received_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_entry_id_journal_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."journal_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vehicles" ADD CONSTRAINT "vehicles_office_id_offices_id_fk" FOREIGN KEY ("office_id") REFERENCES "public"."offices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fuel_logs_vehicle" ON "fuel_logs" USING btree ("vehicle_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "shipment_lines_unique" ON "shipment_lines" USING btree ("shipment_id","item_id");--> statement-breakpoint
CREATE INDEX "shipments_status" ON "shipments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "stock_moves_item_office" ON "stock_moves" USING btree ("item_id","office_id");--> statement-breakpoint
CREATE INDEX "stock_moves_activity" ON "stock_moves" USING btree ("activity_id");