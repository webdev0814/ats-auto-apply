const db = require('./db');
db.query("SELECT target_company, target_url FROM applications WHERE target_company='CANONICAL'").then(res => {
    console.log(res.rows);
    process.exit(0);
});
