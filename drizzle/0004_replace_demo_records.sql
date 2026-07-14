DO $$
DECLARE
  org RECORD;
BEGIN
  FOR org IN SELECT id FROM organizations LOOP
    -- This pilot only contained generated fixtures. Clear them before the authorized operational import.
    DELETE FROM attendance_records WHERE organization_id = org.id;
    DELETE FROM payment_records WHERE organization_id = org.id;
    DELETE FROM membership_payments WHERE organization_id = org.id;
    DELETE FROM enrollments WHERE organization_id = org.id;
    DELETE FROM gym_memberships WHERE organization_id = org.id;
    DELETE FROM participant_guardians
    WHERE participant_id IN (SELECT id FROM participants WHERE organization_id = org.id);
    DELETE FROM guardians WHERE organization_id = org.id;
    DELETE FROM participants WHERE organization_id = org.id;

    DELETE FROM course_sessions
    WHERE course_id IN (
      SELECT id FROM courses
      WHERE organization_id = org.id
        AND title IN ('Yetiskin Temel Yuzme', 'Cocuk Suya Uyum', 'Sabah Kondisyon', 'Aile Havuz Saati')
    );
    DELETE FROM course_schedule_rules
    WHERE course_id IN (
      SELECT id FROM courses
      WHERE organization_id = org.id
        AND title IN ('Yetiskin Temel Yuzme', 'Cocuk Suya Uyum', 'Sabah Kondisyon', 'Aile Havuz Saati')
    );
    DELETE FROM courses
    WHERE organization_id = org.id
      AND title IN ('Yetiskin Temel Yuzme', 'Cocuk Suya Uyum', 'Sabah Kondisyon', 'Aile Havuz Saati');
    DELETE FROM course_terms WHERE organization_id = org.id AND name = 'Demo Pilot Donem';

    UPDATE instructors
    SET full_name = 'Yuzme Egitmeni', phone = NULL, specialties = ARRAY['Cocuk grubu', 'Temel yuzme'], updated_at = now()
    WHERE organization_id = org.id AND full_name = 'Demo Yuzme Egitmeni';
    UPDATE instructors
    SET full_name = 'Fitness Egitmeni', phone = NULL, specialties = ARRAY['Salon programi', 'Kondisyon'], updated_at = now()
    WHERE organization_id = org.id AND full_name = 'Demo Fitness Antrenoru';
    UPDATE pools SET description = NULL, updated_at = now() WHERE organization_id = org.id;

    INSERT INTO audit_events (organization_id, actor_user_id, action, entity_type, entity_id, summary, metadata)
    SELECT org.id, id, 'demo.records_replaced', 'organization', org.id, 'Demo kayitlari temizlendi; yetkili operasyon verisi importuna hazir.', '{"source":"migration"}'::jsonb
    FROM staff_users WHERE organization_id = org.id AND is_active = true ORDER BY created_at LIMIT 1;
  END LOOP;
END $$;
