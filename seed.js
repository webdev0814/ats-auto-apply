const db = require('./db');

async function seed() {
  try {
    await db.query(`
      INSERT INTO roles (title, system_prompt_context) 
      VALUES 
      ('Project Manager', 'Focus on Agile, Scrum, budgets, and stakeholders.'),
      ('Business Analyst', 'Focus on SQL, data analysis, requirement gathering, and process mapping.')
    `);
    console.log('Seeded roles!');
  } catch (err) {
    console.error('Seed error:', err);
  } finally {
    process.exit(0);
  }
}

seed();
