-- Demo data (profile "demo" only). Repeatable and idempotent: it never blocks versioned migrations and can be
-- re-applied safely (existing rows are left untouched). Dates are relative to the day the seed first runs.
-- All demo users have the password "Password123". Never use this profile in production.

INSERT INTO users (id, full_name, email, password_hash, enabled, created_at, updated_at) VALUES
  ('00000000-0000-4000-8000-000000000001', 'Aydan Aliyeva',   'aydan@demo.foresight.local',  '$2a$10$ayzVczjTttxiujrEGynpaODh56/o0FSjPiKFSoZImNyealvM5rFxq', true, now(), now()),
  ('00000000-0000-4000-8000-000000000002', 'Huseyn Gasimov',  'huseyn@demo.foresight.local', '$2a$10$ayzVczjTttxiujrEGynpaODh56/o0FSjPiKFSoZImNyealvM5rFxq', true, now(), now()),
  ('00000000-0000-4000-8000-000000000003', 'Ulvi Mammadov',   'ulvi@demo.foresight.local',   '$2a$10$ayzVczjTttxiujrEGynpaODh56/o0FSjPiKFSoZImNyealvM5rFxq', true, now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO workspaces (id, name, created_at, updated_at) VALUES
  ('00000000-0000-4000-8000-000000000010', 'Team Phoenix', now(), now())
ON CONFLICT DO NOTHING;

INSERT INTO workspace_memberships (id, workspace_id, user_id, role, created_at) VALUES
  (gen_random_uuid(), '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000001', 'OWNER',  now()),
  (gen_random_uuid(), '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000002', 'MEMBER', now()),
  (gen_random_uuid(), '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000003', 'MEMBER', now())
ON CONFLICT DO NOTHING;

INSERT INTO projects (id, workspace_id, name, description, status, start_date, deadline, created_by, created_at, updated_at) VALUES
  ('00000000-0000-4000-8000-000000000100', '00000000-0000-4000-8000-000000000010', 'Hackathon MVP',
   'Demo project for the proactive risk engine', 'ACTIVE', CURRENT_DATE - 10, CURRENT_DATE + 8,
   '00000000-0000-4000-8000-000000000001', now() - interval '10 days', now())
ON CONFLICT DO NOTHING;

INSERT INTO project_memberships (id, project_id, workspace_id, user_id, role, created_at) VALUES
  (gen_random_uuid(), '00000000-0000-4000-8000-000000000100', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000001', 'LEAD',        now()),
  (gen_random_uuid(), '00000000-0000-4000-8000-000000000100', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000002', 'CONTRIBUTOR', now()),
  (gen_random_uuid(), '00000000-0000-4000-8000-000000000100', '00000000-0000-4000-8000-000000000010', '00000000-0000-4000-8000-000000000003', 'CONTRIBUTOR', now())
ON CONFLICT DO NOTHING;

INSERT INTO tasks (id, project_id, title, description, status, priority, assignee_id, reporter_id, start_date, due_date,
                   estimated_hours, progress_percentage, created_at, updated_at, completed_at, last_progress_at) VALUES
  -- Ulvi's authentication module: due tomorrow, 20 %, no progress for two days
  ('00000000-0000-4000-8000-000000001001', '00000000-0000-4000-8000-000000000100', 'Authentication module',
   'JWT login, registration and refresh tokens', 'IN_PROGRESS', 'HIGH', '00000000-0000-4000-8000-000000000003',
   '00000000-0000-4000-8000-000000000001', CURRENT_DATE - 6, CURRENT_DATE + 1, 16, 20,
   now() - interval '6 days', now() - interval '2 days', NULL, now() - interval '2 days'),
  ('00000000-0000-4000-8000-000000001002', '00000000-0000-4000-8000-000000000100', 'API integration',
   'Connect the frontend to the secured API', 'TODO', 'HIGH', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000001', CURRENT_DATE + 2, CURRENT_DATE + 4, 8, 0,
   now() - interval '6 days', now() - interval '6 days', NULL, NULL),
  ('00000000-0000-4000-8000-000000001003', '00000000-0000-4000-8000-000000000100', 'Frontend integration',
   NULL, 'TODO', 'MEDIUM', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000001', NULL, CURRENT_DATE + 6, 8, 0,
   now() - interval '6 days', now() - interval '6 days', NULL, NULL),
  ('00000000-0000-4000-8000-000000001004', '00000000-0000-4000-8000-000000000100', 'End-to-end testing',
   NULL, 'TODO', 'HIGH', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000001', NULL, CURRENT_DATE + 7, 6, 0,
   now() - interval '6 days', now() - interval '6 days', NULL, NULL),
  ('00000000-0000-4000-8000-000000001005', '00000000-0000-4000-8000-000000000100', 'UI design',
   NULL, 'DONE', 'MEDIUM', '00000000-0000-4000-8000-000000000001',
   '00000000-0000-4000-8000-000000000001', NULL, CURRENT_DATE - 3, 6, 100,
   now() - interval '9 days', now() - interval '3 days', now() - interval '3 days', now() - interval '3 days'),
  -- Huseyn's database schema: overdue by two days
  ('00000000-0000-4000-8000-000000001006', '00000000-0000-4000-8000-000000000100', 'Database schema',
   NULL, 'IN_PROGRESS', 'HIGH', '00000000-0000-4000-8000-000000000002',
   '00000000-0000-4000-8000-000000000001', NULL, CURRENT_DATE - 2, 6, 60,
   now() - interval '8 days', now() - interval '4 days', NULL, now() - interval '4 days'),
  -- Ulvi's prompt tuning: started, no recorded progress for a week
  ('00000000-0000-4000-8000-000000001007', '00000000-0000-4000-8000-000000000100', 'LLM prompt tuning',
   NULL, 'IN_PROGRESS', 'MEDIUM', '00000000-0000-4000-8000-000000000003',
   '00000000-0000-4000-8000-000000000001', NULL, CURRENT_DATE + 12, 10, 30,
   now() - interval '9 days', now() - interval '7 days', NULL, now() - interval '7 days')
ON CONFLICT DO NOTHING;

INSERT INTO task_dependencies (id, project_id, predecessor_task_id, successor_task_id, created_by, created_at) VALUES
  (gen_random_uuid(), '00000000-0000-4000-8000-000000000100', '00000000-0000-4000-8000-000000001001', '00000000-0000-4000-8000-000000001002', '00000000-0000-4000-8000-000000000001', now()),
  (gen_random_uuid(), '00000000-0000-4000-8000-000000000100', '00000000-0000-4000-8000-000000001002', '00000000-0000-4000-8000-000000001003', '00000000-0000-4000-8000-000000000001', now()),
  (gen_random_uuid(), '00000000-0000-4000-8000-000000000100', '00000000-0000-4000-8000-000000001003', '00000000-0000-4000-8000-000000001004', '00000000-0000-4000-8000-000000000001', now()),
  (gen_random_uuid(), '00000000-0000-4000-8000-000000000100', '00000000-0000-4000-8000-000000001006', '00000000-0000-4000-8000-000000001002', '00000000-0000-4000-8000-000000000001', now())
ON CONFLICT DO NOTHING;

-- Recorded history (creation and explicit progress reports); inserted only once per task.
INSERT INTO task_activities (id, task_id, project_id, actor_id, type, old_value, new_value, occurred_at)
SELECT gen_random_uuid(), t.id, t.project_id, t.reporter_id, 'CREATED', NULL, t.title, t.created_at
FROM tasks t
WHERE t.project_id = '00000000-0000-4000-8000-000000000100'
  AND NOT EXISTS (SELECT 1 FROM task_activities a WHERE a.task_id = t.id AND a.type = 'CREATED');

INSERT INTO task_activities (id, task_id, project_id, actor_id, type, old_value, new_value, occurred_at)
SELECT gen_random_uuid(), v.task_id, '00000000-0000-4000-8000-000000000100', v.actor_id, 'PROGRESS_UPDATED', v.old_value, v.new_value, v.occurred_at
FROM (VALUES
  ('00000000-0000-4000-8000-000000001001'::uuid, '00000000-0000-4000-8000-000000000003'::uuid, '0',  '20', now() - interval '2 days'),
  ('00000000-0000-4000-8000-000000001006'::uuid, '00000000-0000-4000-8000-000000000002'::uuid, '30', '60', now() - interval '4 days'),
  ('00000000-0000-4000-8000-000000001007'::uuid, '00000000-0000-4000-8000-000000000003'::uuid, '0',  '30', now() - interval '7 days')
) AS v(task_id, actor_id, old_value, new_value, occurred_at)
WHERE NOT EXISTS (SELECT 1 FROM task_activities a WHERE a.task_id = v.task_id AND a.type = 'PROGRESS_UPDATED');
