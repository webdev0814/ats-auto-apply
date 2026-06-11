const db = require('./db');
async function reset() {
  await db.query("UPDATE applications SET status='PENDING_REVIEW' WHERE status='QUEUED_FOR_RETRY'");
  console.log('Reset complete');
  process.exit(0);
}
reset();
