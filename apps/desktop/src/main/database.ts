import Database from 'better-sqlite3';
import migration001 from './migrations/001-create-tasks.sql?raw';

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

  const applied = database.prepare('SELECT version FROM schema_migrations WHERE version = 1').get();
  if (!applied) {
    database.transaction(() => {
      database.exec(migration001);
      database.prepare('INSERT INTO schema_migrations (version, applied_at) VALUES (1, ?)').run(new Date().toISOString());
    })();
  }
  return database;
}
