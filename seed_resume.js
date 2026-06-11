const db = require('./db');
const fs = require('fs');

async function seedResume() {
  try {
    // Read the real resume files
    const pdfPath = 'user_resume.pdf';
    const txtPath = 'user_resume.txt';
    let parsedText = '';
    if (fs.existsSync(txtPath)) {
        parsedText = fs.readFileSync(txtPath, 'utf8');
    }

    // Role ID 2 is Business Analyst in our DB
    await db.query(`INSERT OR REPLACE INTO resumes (id, role_id, file_path, parsed_text) VALUES (1, 2, $1, $2)`, [pdfPath, parsedText]);
    console.log('Real Resume seeded for Business Analyst (Role ID 2).');

    // Seed the initial search profile
    await db.query(`
        INSERT OR REPLACE INTO search_profiles (id, role_id, search_term, location, is_remote, hours_old, is_active) 
        VALUES (1, 2, 'Business Analyst', 'USA', 1, 24, 1)
    `);
    console.log('Search Profile seeded: Remote Business Analyst / USA / 24h');

  } catch (err) {
    console.error(err);
  } finally {
    process.exit(0);
  }
}
seedResume();
