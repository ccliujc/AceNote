ALTER TABLE tasks ADD COLUMN status TEXT NOT NULL DEFAULT 'open'
  CHECK (status IN ('open', 'completed', 'archived'));
ALTER TABLE tasks ADD COLUMN completed_at TEXT;
ALTER TABLE tasks ADD COLUMN completion_date TEXT;
ALTER TABLE tasks ADD COLUMN completion_time_zone TEXT;
ALTER TABLE tasks ADD COLUMN archived_at TEXT;

CREATE INDEX tasks_completion_date_idx ON tasks(completion_date, status);

CREATE TABLE intake_events (
  id TEXT PRIMARY KEY,
  raw_text TEXT NOT NULL,
  received_at TEXT NOT NULL,
  local_date TEXT NOT NULL,
  local_date_time TEXT NOT NULL,
  time_zone TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending', 'awaiting_selection', 'resolved', 'failed')),
  intent TEXT CHECK (intent IN ('create', 'complete')),
  error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE INDEX intake_events_status_idx ON intake_events(status, created_at);
