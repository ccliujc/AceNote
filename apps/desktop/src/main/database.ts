import Database from 'better-sqlite3';
import migration001 from './migrations/001-create-tasks.sql?raw';
import migration002 from './migrations/002-task-lifecycle.sql?raw';
import migration003 from './migrations/003-reminders.sql?raw';

const migrations = [
  { version: 1, sql: migration001 },
  { version: 2, sql: migration002 },
  { version: 3, sql: migration003 },
];

export function createDatabase(filename: string): Database.Database {
  const database = new Database(filename);
  database.pragma('foreign_keys = ON');
  if (filename !== ':memory:') database.pragma('journal_mode = WAL');
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    )
  `);

  for (const migration of migrations) {
    const applied = database.prepare('SELECT version FROM schema_migrations WHERE version = ?').get(migration.version);
    if (applied) continue;
    database.transaction(() => {
      database.exec(migration.sql);
      database.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)')
        .run(migration.version, new Date().toISOString());
    })();
  }
  return database;
}
