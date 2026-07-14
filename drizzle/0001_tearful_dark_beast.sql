CREATE TYPE "public"."membership_status" AS ENUM('active', 'frozen', 'expired', 'cancelled');--> statement-breakpoint
CREATE TABLE "gym_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"participant_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"status" "membership_status" DEFAULT 'active' NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"sale_amount_cents" integer NOT NULL,
	"notes" text,
	"created_by" uuid NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "gym_memberships_dates_check" CHECK ("gym_memberships"."ends_on" >= "gym_memberships"."starts_on"),
	CONSTRAINT "gym_memberships_sale_check" CHECK ("gym_memberships"."sale_amount_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "membership_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"membership_id" uuid NOT NULL,
	"amount_cents" integer NOT NULL,
	"method" "payment_method" NOT NULL,
	"status" "payment_status" DEFAULT 'recorded' NOT NULL,
	"reference" text,
	"note" text,
	"paid_at" timestamp with time zone NOT NULL,
	"recorded_by" uuid NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_payments_amount_check" CHECK ("membership_payments"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "membership_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" text NOT NULL,
	"duration_days" integer NOT NULL,
	"price_cents" integer NOT NULL,
	"visit_limit" integer,
	"pool_access" boolean DEFAULT true NOT NULL,
	"gym_access" boolean DEFAULT true NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "membership_plans_duration_check" CHECK ("membership_plans"."duration_days" > 0),
	CONSTRAINT "membership_plans_price_check" CHECK ("membership_plans"."price_cents" >= 0),
	CONSTRAINT "membership_plans_visit_limit_check" CHECK ("membership_plans"."visit_limit" is null or "membership_plans"."visit_limit" > 0)
);
--> statement-breakpoint
ALTER TABLE "gym_memberships" ADD CONSTRAINT "gym_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_memberships" ADD CONSTRAINT "gym_memberships_participant_id_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."participants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_memberships" ADD CONSTRAINT "gym_memberships_plan_id_membership_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."membership_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "gym_memberships" ADD CONSTRAINT "gym_memberships_created_by_staff_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_payments" ADD CONSTRAINT "membership_payments_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_payments" ADD CONSTRAINT "membership_payments_membership_id_gym_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "public"."gym_memberships"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_payments" ADD CONSTRAINT "membership_payments_recorded_by_staff_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_payments" ADD CONSTRAINT "membership_payments_voided_by_staff_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "membership_plans" ADD CONSTRAINT "membership_plans_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "gym_memberships_org_status_idx" ON "gym_memberships" USING btree ("organization_id","status");--> statement-breakpoint
CREATE INDEX "gym_memberships_participant_idx" ON "gym_memberships" USING btree ("participant_id");--> statement-breakpoint
CREATE INDEX "membership_payments_org_paid_idx" ON "membership_payments" USING btree ("organization_id","paid_at");--> statement-breakpoint
CREATE INDEX "membership_payments_membership_idx" ON "membership_payments" USING btree ("membership_id");--> statement-breakpoint
CREATE UNIQUE INDEX "membership_plans_org_name_unique" ON "membership_plans" USING btree ("organization_id","name");--> statement-breakpoint
CREATE INDEX "membership_plans_org_idx" ON "membership_plans" USING btree ("organization_id");
--> statement-breakpoint
INSERT INTO "membership_plans" ("organization_id","name","duration_days","price_cents","visit_limit","pool_access","gym_access")
SELECT "id",'Aylik Salon + Havuz',30,180000,NULL,true,true FROM "organizations"
ON CONFLICT ("organization_id","name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "membership_plans" ("organization_id","name","duration_days","price_cents","visit_limit","pool_access","gym_access")
SELECT "id",'Uc Aylik Salon',90,420000,NULL,false,true FROM "organizations"
ON CONFLICT ("organization_id","name") DO NOTHING;
--> statement-breakpoint
INSERT INTO "membership_plans" ("organization_id","name","duration_days","price_cents","visit_limit","pool_access","gym_access")
SELECT "id",'Aile Havuz Erisimi',30,250000,12,true,false FROM "organizations"
ON CONFLICT ("organization_id","name") DO NOTHING;
