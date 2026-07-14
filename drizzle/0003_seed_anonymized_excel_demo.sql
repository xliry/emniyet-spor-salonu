DO $$
DECLARE
  org RECORD;
  source RECORD;
  branch_id uuid;
  actor_id uuid;
  instructor_id uuid;
  lane_id uuid;
  v_term_id uuid;
  v_course_id uuid;
  v_participant_id uuid;
  v_plan_id uuid;
  v_membership_id uuid;
  v_enrollment_id uuid;
  i integer;
  v_demo_label text;
  v_starts_on date;
  v_ends_on date;
BEGIN
  FOR org IN SELECT id FROM organizations LOOP
    SELECT id INTO branch_id FROM branches WHERE organization_id = org.id AND is_active = true ORDER BY created_at LIMIT 1;
    SELECT id INTO actor_id FROM staff_users WHERE organization_id = org.id AND is_active = true ORDER BY created_at LIMIT 1;
    SELECT id INTO instructor_id FROM instructors WHERE organization_id = org.id AND full_name = 'Demo Yuzme Egitmeni' LIMIT 1;
    SELECT id INTO lane_id FROM pool_lanes WHERE organization_id = org.id AND name = 'Egitim Alani 1' LIMIT 1;

    IF branch_id IS NULL OR actor_id IS NULL OR instructor_id IS NULL OR lane_id IS NULL THEN
      CONTINUE;
    END IF;

    -- 30 personnel and 23 civilian membership rows, shaped from the two membership workbooks.
    FOR source IN
      SELECT * FROM (VALUES
        ('Personel', 30, 90000, 'Kurum Personeli - Aylik'),
        ('Sivil', 23, 180000, 'Sivil - Aylik')
      ) AS rows(prefix, record_count, price_cents, plan_name)
    LOOP
      INSERT INTO membership_plans (organization_id, name, duration_days, price_cents, pool_access, gym_access)
      VALUES (org.id, source.plan_name, 30, source.price_cents, true, true)
      ON CONFLICT (organization_id, name) DO NOTHING;

      SELECT id INTO v_plan_id FROM membership_plans WHERE organization_id = org.id AND name = source.plan_name LIMIT 1;

      FOR i IN 1..source.record_count LOOP
        v_demo_label := format('%s-%s', source.prefix, lpad(i::text, 2, '0'));
        SELECT id INTO v_participant_id
        FROM participants
        WHERE organization_id = org.id AND first_name = 'Demo Uye' AND last_name = v_demo_label
        LIMIT 1;

        IF v_participant_id IS NULL THEN
          INSERT INTO participants (organization_id, participant_type, first_name, last_name, is_active, created_by)
          VALUES (org.id, 'member', 'Demo Uye', v_demo_label, true, actor_id)
          RETURNING id INTO v_participant_id;
        END IF;

        v_starts_on := current_date - (i % 50);
        v_ends_on := v_starts_on + 29;
        SELECT id INTO v_membership_id
        FROM gym_memberships gm
        WHERE gm.organization_id = org.id AND gm.participant_id = v_participant_id AND gm.plan_id = v_plan_id AND gm.starts_on = v_starts_on
        LIMIT 1;

        IF v_membership_id IS NULL THEN
          INSERT INTO gym_memberships (organization_id, participant_id, plan_id, status, starts_on, ends_on, sale_amount_cents, notes, created_by)
          VALUES (
            org.id,
            v_participant_id,
            v_plan_id,
            CASE WHEN v_ends_on >= current_date THEN 'active'::membership_status ELSE 'expired'::membership_status END,
            v_starts_on,
            v_ends_on,
            source.price_cents,
            'Excel kaynakli, anonimlestirilmis demo uyelik kaydi.',
            actor_id
          )
          RETURNING id INTO v_membership_id;
        END IF;

        IF i % 5 <> 0 AND NOT EXISTS (SELECT 1 FROM membership_payments mp WHERE mp.membership_id = v_membership_id) THEN
          INSERT INTO membership_payments (organization_id, membership_id, amount_cents, method, reference, note, paid_at, recorded_by)
          VALUES (org.id, v_membership_id, source.price_cents, 'bank_transfer', format('DEMO-UYE-%s', v_demo_label), 'Anonim demo tahsilati.', v_starts_on::timestamp + time '09:00', actor_id);
        END IF;
      END LOOP;
    END LOOP;

    -- Course groups, hours and roster sizes are taken from the three period workbooks and KURSLAR CALISMA.xlsx.
    FOR source IN
      SELECT * FROM (VALUES
        ('2026 1. Donem', date '2026-06-29', date '2026-07-18', 'active', 'active', 1, 1, '09:30', '10:30', '10-14 Yas Baslangic', 10, 14, 26),
        ('2026 1. Donem', date '2026-06-29', date '2026-07-18', 'active', 'active', 2, 1, '10:45', '11:45', '5-7 Yas Gelisim', 5, 7, 28),
        ('2026 1. Donem', date '2026-06-29', date '2026-07-18', 'active', 'active', 3, 1, '12:00', '13:00', '8-10 Yas Baslangic', 8, 10, 25),
        ('2026 1. Donem', date '2026-06-29', date '2026-07-18', 'active', 'active', 4, 1, '13:30', '14:30', '5-7 Yas Baslangic', 5, 7, 26),
        ('2026 1. Donem', date '2026-06-29', date '2026-07-18', 'active', 'active', 5, 1, '14:45', '15:45', 'Performans', 5, 14, 20),
        ('2026 1. Donem', date '2026-06-29', date '2026-07-18', 'active', 'active', 6, 2, '09:30', '10:30', '10-14 Yas Gelisim', 10, 14, 32),
        ('2026 1. Donem', date '2026-06-29', date '2026-07-18', 'active', 'active', 7, 2, '10:45', '11:45', '5-7 Yas Baslangic', 5, 7, 27),
        ('2026 1. Donem', date '2026-06-29', date '2026-07-18', 'active', 'active', 8, 2, '12:00', '13:00', '8-10 Yas Gelisim', 8, 10, 26),
        ('2026 1. Donem', date '2026-06-29', date '2026-07-18', 'active', 'active', 9, 2, '13:30', '14:30', '5-7 Yas Baslangic', 5, 7, 24),
        ('2026 1. Donem', date '2026-06-29', date '2026-07-18', 'active', 'active', 10, 2, '14:45', '15:45', 'Performans', 5, 14, 26),
        ('2026 2. Donem', date '2026-07-20', date '2026-08-08', 'registration_open', 'upcoming', 1, 1, '09:30', '10:30', '10-14 Yas Baslangic', 10, 14, 16),
        ('2026 2. Donem', date '2026-07-20', date '2026-08-08', 'registration_open', 'upcoming', 2, 1, '10:45', '11:45', '5-7 Yas Gelisim', 5, 7, 26),
        ('2026 2. Donem', date '2026-07-20', date '2026-08-08', 'registration_open', 'upcoming', 3, 1, '12:00', '13:00', '8-10 Yas Baslangic', 8, 10, 18),
        ('2026 2. Donem', date '2026-07-20', date '2026-08-08', 'registration_open', 'upcoming', 4, 1, '13:30', '14:30', '5-7 Yas Baslangic', 5, 7, 25),
        ('2026 2. Donem', date '2026-07-20', date '2026-08-08', 'registration_open', 'upcoming', 5, 1, '14:45', '15:45', 'Performans', 5, 14, 0),
        ('2026 2. Donem', date '2026-07-20', date '2026-08-08', 'registration_open', 'upcoming', 6, 2, '09:30', '10:30', '10-14 Yas Gelisim', 10, 14, 13),
        ('2026 2. Donem', date '2026-07-20', date '2026-08-08', 'registration_open', 'upcoming', 7, 2, '10:45', '11:45', '5-7 Yas Baslangic', 5, 7, 27),
        ('2026 2. Donem', date '2026-07-20', date '2026-08-08', 'registration_open', 'upcoming', 8, 2, '12:00', '13:00', '8-10 Yas Gelisim', 8, 10, 19),
        ('2026 2. Donem', date '2026-07-20', date '2026-08-08', 'registration_open', 'upcoming', 9, 2, '13:30', '14:30', '5-7 Yas Baslangic', 5, 7, 7),
        ('2026 2. Donem', date '2026-07-20', date '2026-08-08', 'registration_open', 'upcoming', 10, 2, '14:45', '15:45', 'Performans', 5, 14, 22),
        ('2026 3. Donem', date '2026-08-10', date '2026-08-29', 'registration_open', 'upcoming', 1, 1, '09:30', '10:30', '10-14 Yas Baslangic', 10, 14, 0),
        ('2026 3. Donem', date '2026-08-10', date '2026-08-29', 'registration_open', 'upcoming', 2, 1, '10:45', '11:45', '5-7 Yas Gelisim', 5, 7, 1),
        ('2026 3. Donem', date '2026-08-10', date '2026-08-29', 'registration_open', 'upcoming', 3, 1, '12:00', '13:00', '8-10 Yas Baslangic', 8, 10, 1),
        ('2026 3. Donem', date '2026-08-10', date '2026-08-29', 'registration_open', 'upcoming', 4, 1, '13:30', '14:30', '5-7 Yas Baslangic', 5, 7, 2),
        ('2026 3. Donem', date '2026-08-10', date '2026-08-29', 'registration_open', 'upcoming', 5, 1, '14:45', '15:45', 'Performans', 5, 14, 16),
        ('2026 3. Donem', date '2026-08-10', date '2026-08-29', 'registration_open', 'upcoming', 6, 2, '09:30', '10:30', '10-14 Yas Gelisim', 10, 14, 1),
        ('2026 3. Donem', date '2026-08-10', date '2026-08-29', 'registration_open', 'upcoming', 7, 2, '10:45', '11:45', '5-7 Yas Baslangic', 5, 7, 0),
        ('2026 3. Donem', date '2026-08-10', date '2026-08-29', 'registration_open', 'upcoming', 8, 2, '12:00', '13:00', '8-10 Yas Gelisim', 8, 10, 3),
        ('2026 3. Donem', date '2026-08-10', date '2026-08-29', 'registration_open', 'upcoming', 9, 2, '13:30', '14:30', '5-7 Yas Baslangic', 5, 7, 0),
        ('2026 3. Donem', date '2026-08-10', date '2026-08-29', 'registration_open', 'upcoming', 10, 2, '14:45', '15:45', 'Performans', 5, 14, 0)
      ) AS rows(term_name, starts_on, ends_on, term_state, course_state, group_no, day_of_week, starts_at, ends_at, level_name, age_min, age_max, participant_count)
    LOOP
      IF NOT EXISTS (SELECT 1 FROM course_terms WHERE organization_id = org.id AND name = source.term_name) THEN
        INSERT INTO course_terms (organization_id, name, starts_on, ends_on, registration_opens_on, registration_closes_on, status)
        VALUES (org.id, source.term_name, source.starts_on, source.ends_on, source.starts_on - 14, source.starts_on - 1, source.term_state::term_status);
      END IF;

      SELECT id INTO v_term_id FROM course_terms WHERE organization_id = org.id AND name = source.term_name LIMIT 1;

      SELECT id INTO v_course_id
      FROM courses
      WHERE organization_id = org.id AND title = format('%s - Grup %s', source.term_name, source.group_no)
      LIMIT 1;

      IF v_course_id IS NULL THEN
        INSERT INTO courses (organization_id, branch_id, term_id, instructor_id, title, category, level, age_min, age_max, capacity, minimum_participants, fee_amount_cents, member_discount_percent, status, description)
        VALUES (
          org.id,
          branch_id,
          v_term_id,
          instructor_id,
          format('%s - Grup %s', source.term_name, source.group_no),
          'Yuzme Kursu',
          source.level_name,
          source.age_min,
          source.age_max,
          greatest(18, source.participant_count + 3),
          1,
          250000,
          10,
          source.course_state::course_status,
          format('Anonimlestirilmis Excel grup verisi: %s, %s-%s.', source.level_name, source.starts_at, source.ends_at)
        )
        RETURNING id INTO v_course_id;
      END IF;

      INSERT INTO course_schedule_rules (organization_id, course_id, day_of_week, starts_at_local, ends_at_local, pool_lane_id)
      VALUES (org.id, v_course_id, source.day_of_week, source.starts_at::time, source.ends_at::time, lane_id)
      ON CONFLICT DO NOTHING;

      FOR i IN 1..source.participant_count LOOP
        v_demo_label := format('D%s-G%s-%s', right(source.term_name, 1), lpad(source.group_no::text, 2, '0'), lpad(i::text, 2, '0'));
        SELECT id INTO v_participant_id
        FROM participants
        WHERE organization_id = org.id AND first_name = 'Demo Kursiyer' AND last_name = v_demo_label
        LIMIT 1;

        IF v_participant_id IS NULL THEN
          INSERT INTO participants (organization_id, participant_type, first_name, last_name, swimming_level, is_active, created_by)
          VALUES (org.id, 'external', 'Demo Kursiyer', v_demo_label, source.level_name, true, actor_id)
          RETURNING id INTO v_participant_id;
        END IF;

        SELECT id INTO v_enrollment_id FROM enrollments e WHERE e.course_id = v_course_id AND e.participant_id = v_participant_id LIMIT 1;
        IF v_enrollment_id IS NULL THEN
          INSERT INTO enrollments (organization_id, course_id, participant_id, status, agreed_fee_amount_cents, registered_at, registered_by)
          VALUES (org.id, v_course_id, v_participant_id, 'active', 250000, source.starts_on::timestamp - interval '7 days', actor_id)
          RETURNING id INTO v_enrollment_id;
        END IF;

        IF i % 4 <> 0 AND NOT EXISTS (SELECT 1 FROM payment_records pr WHERE pr.enrollment_id = v_enrollment_id) THEN
          INSERT INTO payment_records (organization_id, enrollment_id, amount_cents, method, reference, note, paid_at, recorded_by)
          VALUES (org.id, v_enrollment_id, 250000, 'bank_transfer', format('DEMO-KURS-%s', v_demo_label), 'Anonim demo kurs tahsilati.', source.starts_on::timestamp - interval '3 days', actor_id);
        END IF;
      END LOOP;
    END LOOP;

    INSERT INTO audit_events (organization_id, actor_user_id, action, entity_type, entity_id, summary, metadata)
    VALUES (org.id, actor_id, 'demo.excel_seed', 'organization', org.id, 'Anonimlestirilmis Excel demo verileri eklendi.', '{"source":"local_workbooks","personal_data":"excluded"}'::jsonb);
  END LOOP;
END $$;
