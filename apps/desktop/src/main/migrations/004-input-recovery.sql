ALTER TABLE intake_events ADD COLUMN revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0);
ALTER TABLE intake_events ADD COLUMN completion_target TEXT;
ALTER TABLE intake_events ADD COLUMN task_id TEXT REFERENCES tasks(id);
ALTER TABLE intake_events ADD COLUMN resolution_kind TEXT
  CHECK (resolution_kind IN ('created', 'converted', 'completed'));
ALTER TABLE intake_events ADD COLUMN legacy_unlinked INTEGER NOT NULL DEFAULT 0
  CHECK (legacy_unlinked IN (0, 1));

UPDATE intake_events SET task_id = id
WHERE EXISTS (SELECT 1 FROM tasks WHERE tasks.id = intake_events.id);
UPDATE intake_events SET resolution_kind = 'created'
WHERE status = 'resolved' AND task_id IS NOT NULL AND intent = 'create';
UPDATE intake_events SET legacy_unlinked = 1
WHERE status != 'resolved' AND task_id IS NULL;

CREATE INDEX intake_events_recovery_idx ON intake_events(status, received_at DESC, id DESC);
