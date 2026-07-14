DO $$
DECLARE
  org RECORD;
BEGIN
  FOR org IN SELECT id FROM organizations LOOP
    -- Preserve gym-membership records while removing the interrupted course import.
    DELETE FROM attendance_records WHERE organization_id = org.id;
    DELETE FROM payment_records WHERE organization_id = org.id;
    DELETE FROM enrollments WHERE organization_id = org.id;

    DELETE FROM participant_guardians pg
    USING participants p
    WHERE pg.participant_id = p.id
      AND p.organization_id = org.id
      AND NOT EXISTS (
        SELECT 1 FROM gym_memberships m
        WHERE m.participant_id = p.id AND m.organization_id = org.id
      );
    DELETE FROM guardians g
    WHERE g.organization_id = org.id
      AND NOT EXISTS (SELECT 1 FROM participant_guardians pg WHERE pg.guardian_id = g.id);
    DELETE FROM participants p
    WHERE p.organization_id = org.id
      AND NOT EXISTS (
        SELECT 1 FROM gym_memberships m
        WHERE m.participant_id = p.id AND m.organization_id = org.id
      );

    INSERT INTO audit_events (organization_id, actor_user_id, action, entity_type, entity_id, summary, metadata)
    SELECT org.id, id, 'course.import_reset', 'organization', org.id, 'Kesintili kurs aktarimi temizlendi; tekil roster aktarimina hazir.', '{"source":"migration"}'::jsonb
    FROM staff_users WHERE organization_id = org.id AND is_active = true ORDER BY created_at LIMIT 1;
  END LOOP;
END $$;
