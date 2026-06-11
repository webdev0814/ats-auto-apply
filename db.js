const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');
const path = require('path');

let dbInstance = null;

async function getDb() {
  if (dbInstance) return dbInstance;
  
  dbInstance = await open({
    filename: path.join(__dirname, 'antigravity.sqlite'),
    driver: sqlite3.Database
  });

  await dbInstance.exec('PRAGMA journal_mode = WAL;');
  await dbInstance.exec('PRAGMA busy_timeout = 5000;');

  await dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS roles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        title TEXT NOT NULL,
        system_prompt_context TEXT
    );

    CREATE TABLE IF NOT EXISTS resumes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
        file_path TEXT NOT NULL,
        parsed_text TEXT
    );

    CREATE TABLE IF NOT EXISTS applications (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        target_company TEXT NOT NULL,
        target_url TEXT NOT NULL,
        status TEXT DEFAULT 'PENDING_REVIEW',
        ats_type TEXT,
        role_id INTEGER REFERENCES roles(id) ON DELETE SET NULL,
        resume_id INTEGER REFERENCES resumes(id) ON DELETE SET NULL,
        form_schema_json TEXT,
        llm_json_payload TEXT,
        ai_reviewer_feedback TEXT,
        cover_letter_text TEXT,
        screenshot_before_path TEXT,
        screenshot_after_path TEXT,
        error_log TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS custom_questions_cache (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        question_hash TEXT UNIQUE NOT NULL,
        question_text TEXT NOT NULL,
        role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
        llm_answer TEXT NOT NULL,
        is_human_verified BOOLEAN DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS search_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
        search_term TEXT NOT NULL,
        location TEXT NOT NULL,
        is_remote BOOLEAN DEFAULT 1,
        hours_old INTEGER DEFAULT 24,
        is_active BOOLEAN DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS target_boards (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        board_token TEXT UNIQUE NOT NULL,
        is_active BOOLEAN DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS scraper_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        log_level TEXT DEFAULT 'INFO',
        message TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    INSERT OR IGNORE INTO roles (id, title, system_prompt_context) 
    VALUES 
    (1, 'Project Manager', 'Focus on Agile, Scrum, budgets, and stakeholders.'),
    (2, 'Business Analyst', 'Focus on SQL, data analysis, requirement gathering, and process mapping.');
  `);

  return dbInstance;
}

// Wrapper to mimic postgres 'pg' library structure
module.exports = {
  query: async (text, params) => {
    const db = await getDb();
    
    // Convert Postgres $1, $2 to SQLite ?, ?
    const sqliteText = text.replace(/\$\d+/g, '?');

    if (sqliteText.trim().toUpperCase().startsWith('SELECT') || sqliteText.trim().toUpperCase().startsWith('PRAGMA') || sqliteText.trim().includes('RETURNING')) {
      const rows = await db.all(sqliteText, params);
      return { rows };
    } else {
      const result = await db.run(sqliteText, params);
      return { rows: [], lastID: result.lastID, changes: result.changes };
    }
  }
};
