CREATE TABLE membership_debts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES gym_memberships(id) ON DELETE CASCADE,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  reason text NOT NULL,
  due_on date,
  created_by uuid NOT NULL REFERENCES staff_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX membership_debts_org_created_idx ON membership_debts (organization_id, created_at);
CREATE INDEX membership_debts_membership_idx ON membership_debts (membership_id);
