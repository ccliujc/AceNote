CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  raw_text TEXT NOT NULL,
  title TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  record_date TEXT NOT NULL,
  due_date TEXT,
  due_time TEXT,
  time_zone TEXT NOT NULL,
  contact TEXT,
  parse_status TEXT NOT NULL CHECK (parse_status IN ('pending', 'processing', 'succeeded', 'failed')),
  parse_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  edited_at TEXT,
  revision INTEGER NOT NULL DEFAULT 0 CHECK (revision >= 0)
);

CREATE INDEX tasks_record_date_idx ON tasks(record_date, created_at DESC);
