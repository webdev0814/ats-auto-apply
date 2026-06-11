const db = require('./db');
async function run() {
  await db.query(`DELETE FROM applications WHERE status = 'SUCCESS'`);
  await db.query(`UPDATE applications SET status = 'NEW' WHERE status IN ('FAILED', 'FAILED_INGESTION', 'REQUIRES_MANUAL_CAPTCHA')`);
  console.log('DB Reset Complete');
  process.exit(0);
}
run();
