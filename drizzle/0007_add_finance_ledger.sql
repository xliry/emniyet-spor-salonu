ALTER TABLE "membership_payments" ADD COLUMN "receipt_number" text;
ALTER TABLE "payment_records" ADD COLUMN "receipt_number" text;

ALTER TABLE "membership_debts" ADD COLUMN "status" "payment_status" DEFAULT 'recorded' NOT NULL;
ALTER TABLE "membership_debts" ADD COLUMN "voided_at" timestamp with time zone;
ALTER TABLE "membership_debts" ADD COLUMN "voided_by" uuid;
ALTER TABLE "membership_debts" ADD COLUMN "void_reason" text;
ALTER TABLE "membership_debts" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;

ALTER TABLE "membership_debts" ADD CONSTRAINT "membership_debts_voided_by_staff_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."staff_users"("id") ON DELETE no action ON UPDATE no action;

CREATE TABLE "finance_counters" (
  "organization_id" uuid PRIMARY KEY NOT NULL,
  "next_receipt_number" integer DEFAULT 1 NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "finance_counters" ADD CONSTRAINT "finance_counters_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;

CREATE UNIQUE INDEX "membership_payments_org_receipt_unique" ON "membership_payments" USING btree ("organization_id", "receipt_number") WHERE "receipt_number" is not null;
CREATE UNIQUE INDEX "payment_records_org_receipt_unique" ON "payment_records" USING btree ("organization_id", "receipt_number") WHERE "receipt_number" is not null;
CREATE INDEX "membership_debts_org_status_idx" ON "membership_debts" USING btree ("organization_id", "status");
