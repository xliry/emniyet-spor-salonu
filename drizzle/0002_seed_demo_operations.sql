DO $$
DECLARE
  org RECORD;
  branch_id uuid;
  actor_id uuid;
  instructor_swim uuid;
  instructor_fitness uuid;
  pool_main uuid;
  pool_child uuid;
  lane_main_1 uuid;
  lane_main_2 uuid;
  lane_main_3 uuid;
  lane_child_1 uuid;
  term_id uuid;
  course_swim uuid;
  course_child uuid;
  course_fitness uuid;
  course_family uuid;
  rule_id uuid;
  demo_participant_id uuid;
  enrollment_id uuid;
  session_id uuid;
  definition_temp uuid;
  definition_ph uuid;
  definition_clarity uuid;
  run_id uuid;
  i integer;
BEGIN
  FOR org IN SELECT id FROM organizations LOOP
    SELECT id INTO branch_id FROM branches WHERE organization_id = org.id AND is_active = true ORDER BY created_at LIMIT 1;
    IF branch_id IS NULL THEN
      INSERT INTO branches (organization_id, name, code, address)
      VALUES (org.id, 'Emniyet Spor Salonu', 'MERKEZ', 'Demo pilot yerleskesi')
      RETURNING id INTO branch_id;
    END IF;

    SELECT id INTO actor_id FROM staff_users WHERE organization_id = org.id AND is_active = true ORDER BY created_at LIMIT 1;
    IF actor_id IS NULL THEN
      CONTINUE;
    END IF;

    SELECT id INTO instructor_swim FROM instructors WHERE organization_id = org.id AND full_name = 'Demo Yuzme Egitmeni' LIMIT 1;
    IF instructor_swim IS NULL THEN
      INSERT INTO instructors (organization_id, full_name, phone, specialties)
      VALUES (org.id, 'Demo Yuzme Egitmeni', '05550112001', ARRAY['Temel yuzme', 'Cocuk grubu'])
      RETURNING id INTO instructor_swim;
    END IF;

    SELECT id INTO instructor_fitness FROM instructors WHERE organization_id = org.id AND full_name = 'Demo Fitness Antrenoru' LIMIT 1;
    IF instructor_fitness IS NULL THEN
      INSERT INTO instructors (organization_id, full_name, phone, specialties)
      VALUES (org.id, 'Demo Fitness Antrenoru', '05550112002', ARRAY['Kondisyon', 'Salon programi'])
      RETURNING id INTO instructor_fitness;
    END IF;

    SELECT id INTO pool_main FROM pools WHERE organization_id = org.id AND name = 'Ana Havuz' LIMIT 1;
    IF pool_main IS NULL THEN
      INSERT INTO pools (organization_id, branch_id, name, description)
      VALUES (org.id, branch_id, 'Ana Havuz', 'Demo ana havuz')
      RETURNING id INTO pool_main;
    END IF;

    SELECT id INTO pool_child FROM pools WHERE organization_id = org.id AND name = 'Cocuk Havuzu' LIMIT 1;
    IF pool_child IS NULL THEN
      INSERT INTO pools (organization_id, branch_id, name, description)
      VALUES (org.id, branch_id, 'Cocuk Havuzu', 'Demo egitim havuzu')
      RETURNING id INTO pool_child;
    END IF;

    FOR i IN 1..3 LOOP
      IF NOT EXISTS (SELECT 1 FROM pool_lanes WHERE pool_id = pool_main AND name = 'Kulvar ' || i) THEN
        INSERT INTO pool_lanes (organization_id, pool_id, name, sort_order)
        VALUES (org.id, pool_main, 'Kulvar ' || i, i);
      END IF;
    END LOOP;
    IF NOT EXISTS (SELECT 1 FROM pool_lanes WHERE pool_id = pool_child AND name = 'Egitim Alani 1') THEN
      INSERT INTO pool_lanes (organization_id, pool_id, name, sort_order)
      VALUES (org.id, pool_child, 'Egitim Alani 1', 1);
    END IF;

    SELECT id INTO lane_main_1 FROM pool_lanes WHERE pool_id = pool_main AND name = 'Kulvar 1' LIMIT 1;
    SELECT id INTO lane_main_2 FROM pool_lanes WHERE pool_id = pool_main AND name = 'Kulvar 2' LIMIT 1;
    SELECT id INTO lane_main_3 FROM pool_lanes WHERE pool_id = pool_main AND name = 'Kulvar 3' LIMIT 1;
    SELECT id INTO lane_child_1 FROM pool_lanes WHERE pool_id = pool_child AND name = 'Egitim Alani 1' LIMIT 1;

    SELECT id INTO term_id FROM course_terms WHERE organization_id = org.id AND name = 'Demo Pilot Donem' LIMIT 1;
    IF term_id IS NULL THEN
      INSERT INTO course_terms (organization_id, name, starts_on, ends_on, registration_opens_on, registration_closes_on, status)
      VALUES (org.id, 'Demo Pilot Donem', current_date - 7, current_date + 90, current_date - 10, current_date + 60, 'active')
      RETURNING id INTO term_id;
    END IF;

    SELECT id INTO course_swim FROM courses WHERE organization_id = org.id AND title = 'Yetiskin Temel Yuzme' LIMIT 1;
    IF course_swim IS NULL THEN
      INSERT INTO courses (organization_id, branch_id, term_id, instructor_id, title, category, level, age_min, capacity, minimum_participants, fee_amount_cents, member_discount_percent, status, description)
      VALUES (org.id, branch_id, term_id, instructor_swim, 'Yetiskin Temel Yuzme', 'Yuzme Kursu', 'Baslangic', 18, 12, 1, 250000, 10, 'active', 'Demo yetiskin temel yuzme kursu.')
      RETURNING id INTO course_swim;
    END IF;

    SELECT id INTO course_child FROM courses WHERE organization_id = org.id AND title = 'Cocuk Suya Uyum' LIMIT 1;
    IF course_child IS NULL THEN
      INSERT INTO courses (organization_id, branch_id, term_id, instructor_id, title, category, level, age_min, age_max, capacity, minimum_participants, fee_amount_cents, member_discount_percent, status, description)
      VALUES (org.id, branch_id, term_id, instructor_swim, 'Cocuk Suya Uyum', 'Yuzme Kursu', 'Baslangic', 7, 12, 10, 1, 180000, 5, 'active', 'Demo cocuk grubu havuz kursu.')
      RETURNING id INTO course_child;
    END IF;

    SELECT id INTO course_fitness FROM courses WHERE organization_id = org.id AND title = 'Sabah Kondisyon' LIMIT 1;
    IF course_fitness IS NULL THEN
      INSERT INTO courses (organization_id, branch_id, term_id, instructor_id, title, category, level, age_min, capacity, minimum_participants, fee_amount_cents, member_discount_percent, status, description)
      VALUES (org.id, branch_id, term_id, instructor_fitness, 'Sabah Kondisyon', 'Fitness Programi', 'Orta', 18, 16, 1, 220000, 10, 'active', 'Demo salon kondisyon programi.')
      RETURNING id INTO course_fitness;
    END IF;

    SELECT id INTO course_family FROM courses WHERE organization_id = org.id AND title = 'Aile Havuz Saati' LIMIT 1;
    IF course_family IS NULL THEN
      INSERT INTO courses (organization_id, branch_id, term_id, instructor_id, title, category, level, capacity, minimum_participants, fee_amount_cents, status, description)
      VALUES (org.id, branch_id, term_id, instructor_swim, 'Aile Havuz Saati', 'Havuz', 'Karma', 14, 1, 200000, 'upcoming', 'Demo aile havuz kullanim saati.')
      RETURNING id INTO course_family;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM course_schedule_rules WHERE course_id = course_swim) THEN
      INSERT INTO course_schedule_rules (organization_id, course_id, day_of_week, starts_at_local, ends_at_local, pool_lane_id)
      VALUES (org.id, course_swim, extract(isodow from current_date)::int, '09:00', '10:00', lane_main_1)
      RETURNING id INTO rule_id;
    ELSE
      SELECT id INTO rule_id FROM course_schedule_rules WHERE course_id = course_swim LIMIT 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM course_sessions WHERE course_id = course_swim AND starts_at::date = current_date) THEN
      INSERT INTO course_sessions (organization_id, course_id, instructor_id, pool_lane_id, starts_at, ends_at, status, source_rule_id)
      VALUES (org.id, course_swim, instructor_swim, lane_main_1, current_date + time '09:00', current_date + time '10:00', 'scheduled', rule_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM course_schedule_rules WHERE course_id = course_child) THEN
      INSERT INTO course_schedule_rules (organization_id, course_id, day_of_week, starts_at_local, ends_at_local, pool_lane_id)
      VALUES (org.id, course_child, extract(isodow from current_date)::int, '10:30', '11:15', lane_child_1)
      RETURNING id INTO rule_id;
    ELSE
      SELECT id INTO rule_id FROM course_schedule_rules WHERE course_id = course_child LIMIT 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM course_sessions WHERE course_id = course_child AND starts_at::date = current_date) THEN
      INSERT INTO course_sessions (organization_id, course_id, instructor_id, pool_lane_id, starts_at, ends_at, status, source_rule_id)
      VALUES (org.id, course_child, instructor_swim, lane_child_1, current_date + time '10:30', current_date + time '11:15', 'scheduled', rule_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM course_schedule_rules WHERE course_id = course_fitness) THEN
      INSERT INTO course_schedule_rules (organization_id, course_id, day_of_week, starts_at_local, ends_at_local, pool_lane_id)
      VALUES (org.id, course_fitness, extract(isodow from current_date)::int, '18:00', '19:00', lane_main_2)
      RETURNING id INTO rule_id;
    ELSE
      SELECT id INTO rule_id FROM course_schedule_rules WHERE course_id = course_fitness LIMIT 1;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM course_sessions WHERE course_id = course_fitness AND starts_at::date = current_date) THEN
      INSERT INTO course_sessions (organization_id, course_id, instructor_id, pool_lane_id, starts_at, ends_at, status, source_rule_id)
      VALUES (org.id, course_fitness, instructor_fitness, lane_main_2, current_date + time '18:00', current_date + time '19:00', 'scheduled', rule_id);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM course_schedule_rules WHERE course_id = course_family) THEN
      INSERT INTO course_schedule_rules (organization_id, course_id, day_of_week, starts_at_local, ends_at_local, pool_lane_id)
      VALUES (org.id, course_family, extract(isodow from current_date)::int, '19:15', '20:00', lane_main_3);
    END IF;

    i := 0;
    FOR demo_participant_id IN
      SELECT id FROM participants WHERE organization_id = org.id AND is_active = true ORDER BY created_at LIMIT 8
    LOOP
      i := i + 1;
      IF i <= 3 THEN
        IF NOT EXISTS (SELECT 1 FROM enrollments WHERE course_id = course_swim AND participant_id = demo_participant_id) THEN
          INSERT INTO enrollments (organization_id, course_id, participant_id, status, agreed_fee_amount_cents, registered_by)
          VALUES (org.id, course_swim, demo_participant_id, 'active', 250000, actor_id)
          RETURNING id INTO enrollment_id;
        END IF;
      ELSIF i <= 5 THEN
        IF NOT EXISTS (SELECT 1 FROM enrollments WHERE course_id = course_child AND participant_id = demo_participant_id) THEN
          INSERT INTO enrollments (organization_id, course_id, participant_id, status, agreed_fee_amount_cents, registered_by)
          VALUES (org.id, course_child, demo_participant_id, 'active', 180000, actor_id)
          RETURNING id INTO enrollment_id;
        END IF;
      ELSIF i <= 7 THEN
        IF NOT EXISTS (SELECT 1 FROM enrollments WHERE course_id = course_fitness AND participant_id = demo_participant_id) THEN
          INSERT INTO enrollments (organization_id, course_id, participant_id, status, agreed_fee_amount_cents, registered_by)
          VALUES (org.id, course_fitness, demo_participant_id, 'active', 220000, actor_id)
          RETURNING id INTO enrollment_id;
        END IF;
      ELSE
        IF NOT EXISTS (SELECT 1 FROM enrollments WHERE course_id = course_family AND participant_id = demo_participant_id) THEN
          INSERT INTO enrollments (organization_id, course_id, participant_id, status, waitlist_position, agreed_fee_amount_cents, registered_by)
          VALUES (org.id, course_family, demo_participant_id, 'waitlisted', 1, 200000, actor_id)
          RETURNING id INTO enrollment_id;
        END IF;
      END IF;
    END LOOP;

    SELECT id INTO definition_temp FROM pool_check_definitions WHERE organization_id = org.id AND key = 'temperature' LIMIT 1;
    IF definition_temp IS NULL THEN
      INSERT INTO pool_check_definitions (organization_id, key, label, unit, value_type, warning_min, warning_max, sort_order)
      VALUES (org.id, 'temperature', 'Su sicakligi', 'C', 'number', 25, 29, 1)
      RETURNING id INTO definition_temp;
    END IF;
    SELECT id INTO definition_ph FROM pool_check_definitions WHERE organization_id = org.id AND key = 'ph' LIMIT 1;
    IF definition_ph IS NULL THEN
      INSERT INTO pool_check_definitions (organization_id, key, label, unit, value_type, warning_min, warning_max, sort_order)
      VALUES (org.id, 'ph', 'pH', 'pH', 'number', 7.0, 7.8, 2)
      RETURNING id INTO definition_ph;
    END IF;
    SELECT id INTO definition_clarity FROM pool_check_definitions WHERE organization_id = org.id AND key = 'visual_clarity' LIMIT 1;
    IF definition_clarity IS NULL THEN
      INSERT INTO pool_check_definitions (organization_id, key, label, value_type, sort_order)
      VALUES (org.id, 'visual_clarity', 'Gorsel berraklik', 'boolean', 3)
      RETURNING id INTO definition_clarity;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pool_check_runs WHERE organization_id = org.id AND performed_at::date = current_date) THEN
      INSERT INTO pool_check_runs (organization_id, pool_id, performed_by, performed_at, cleaning_status, equipment_status, changing_room_status, status, note)
      VALUES (org.id, pool_main, actor_id, now(), 'ok', 'ok', 'ok', 'ok', 'Demo havuz kontrol kaydi.')
      RETURNING id INTO run_id;
      INSERT INTO pool_check_values (organization_id, run_id, definition_id, numeric_value)
      VALUES (org.id, run_id, definition_temp, 27.2), (org.id, run_id, definition_ph, 7.4);
      INSERT INTO pool_check_values (organization_id, run_id, definition_id, boolean_value)
      VALUES (org.id, run_id, definition_clarity, true);
    END IF;

    INSERT INTO audit_events (organization_id, actor_user_id, action, entity_type, entity_id, summary, metadata)
    VALUES (org.id, actor_id, 'demo.operations_seed', 'organization', org.id, 'Demo operasyon verileri eklendi.', '{"source":"migration"}'::jsonb);
  END LOOP;
END $$;
