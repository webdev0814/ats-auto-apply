const express = require('express');
const cors = require('cors');
const db = require('./db');
const { Queue } = require('./queue');
const { runScraperForProfiles } = require('./scraper_cron');
require('./worker'); // Start the worker in the same process to share the in-memory queue

require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());

const applicationQueue = new Queue('application_queue');

// GET all applications
app.get('/api/applications', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM applications ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET specific application
app.get('/api/applications/:id', async (req, res) => {
  const { id } = req.params;
  try {
    const { rows } = await db.query('SELECT * FROM applications WHERE id = $1', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST to retry application (Human in the loop feedback)
app.post('/api/applications/:id/retry', async (req, res) => {
  const { id } = req.params;
  const { llm_json_payload, role_id, cover_letter_text } = req.body; // Corrected JSON and optionally changed role
  
  try {
    // 1. Update the database with the corrected JSON
    await db.query(
      `UPDATE applications 
       SET llm_json_payload = $1, status = 'QUEUED_FOR_RETRY', role_id = COALESCE($2, role_id), cover_letter_text = COALESCE($3, cover_letter_text)
       WHERE id = $4 RETURNING *`,
      [JSON.stringify(llm_json_payload), role_id, cover_letter_text, id]
    );

    const { rows } = await db.query('SELECT * FROM applications WHERE id = $1', [id]);
    const jobData = rows[0];

    // 1.5 Update Answer Memory (RAG)
    if (jobData.form_schema_json && llm_json_payload) {
      const formSchema = JSON.parse(jobData.form_schema_json);
      for (const [fieldId, answer] of Object.entries(llm_json_payload)) {
        if (!answer || answer.trim() === '') continue;
        const field = formSchema.find(f => f.id === fieldId);
        if (field && field.label) {
          await db.query(`
            INSERT INTO answer_memory (question_label, user_answer) 
            VALUES ($1, $2)
            ON CONFLICT(question_label) DO UPDATE SET user_answer = excluded.user_answer, updated_at = CURRENT_TIMESTAMP
          `, [field.label, answer]);
        }
      }
    }

    // 2. Add job to BullMQ
    await applicationQueue.add('retry-application', {
      applicationId: id,
      targetUrl: jobData.target_url,
      roleId: jobData.role_id,
      resumeId: jobData.resume_id,
      preApprovedJson: llm_json_payload,
      coverLetterText: jobData.cover_letter_text
    });

    res.json({ message: 'Application queued for retry successfully!' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// GET roles
app.get('/api/roles', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM roles ORDER BY id ASC');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

const path = require('path');
// Serve static screenshots if they are stored locally for MVP
app.use('/screenshots', express.static(path.join(__dirname, 'client', 'public', 'screenshots', 'ats-auto-apply')));

// GET telemetry
app.get('/api/telemetry', async (req, res) => {
  try {
    const totalResult = await db.query('SELECT COUNT(*) as c FROM applications');
    const pendingResult = await db.query("SELECT COUNT(*) as c FROM applications WHERE status='PENDING_REVIEW' OR status='PENDING'");
    const bypassedResult = await db.query("SELECT COUNT(*) as c FROM applications WHERE status='SKIPPED_UNSUPPORTED_ATS'");
    res.json({
      total: totalResult.rows[0].c,
      pending: pendingResult.rows[0].c,
      bypassed: bypassedResult.rows[0].c,
      manual_captcha: 0
    });
  } catch (e) {
    res.status(500).json({error: e.message});
  }
});

// GET scraper logs
app.get('/api/scraper/logs', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM scraper_logs ORDER BY id DESC LIMIT 50');
    res.json(rows.reverse());
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET scraper boards
app.get('/api/scraper/boards', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM target_boards ORDER BY board_token ASC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// GET active search profiles
app.get('/api/search_profiles', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM search_profiles WHERE is_active=1');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST trigger scraper
app.post('/api/scraper/run', async (req, res) => {
  try {
    // Run asynchronously so we don't block the request
    runScraperForProfiles().catch(console.error);
    res.json({ message: 'Scraper triggered successfully in the background.' });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

// POST approve all pending applications
app.post('/api/applications/approve-all', async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT * FROM applications WHERE status = 'PENDING_REVIEW'`);
    
    if (rows.length === 0) {
      return res.json({ message: 'No pending applications to approve.' });
    }

    await db.query(`UPDATE applications SET status = 'APPROVED' WHERE status = 'PENDING_REVIEW'`);

    // Add them to BullMQ
    for (const app of rows) {
      await applicationQueue.add('auto-apply', {
        applicationId: app.id,
        targetUrl: app.target_url,
        roleId: app.role_id,
        resumeId: app.resume_id,
        preApprovedJson: app.llm_json_payload
      });
    }

    res.json({ message: `Successfully approved and queued ${rows.length} applications.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST bulk retry failed applications
app.post('/api/applications/retry-failed', async (req, res) => {
  try {
    const { rows } = await db.query(`SELECT * FROM applications WHERE status IN ('FAILED', 'REQUIRES_MANUAL_CAPTCHA')`);
    
    if (rows.length === 0) {
      return res.json({ message: 'No failed applications to retry.' });
    }

    await db.query(`UPDATE applications SET status = 'QUEUED_FOR_RETRY' WHERE status IN ('FAILED', 'REQUIRES_MANUAL_CAPTCHA')`);

    // Add them to BullMQ
    for (const app of rows) {
      await applicationQueue.add('retry-application', {
        applicationId: app.id,
        targetUrl: app.target_url,
        roleId: app.role_id,
        resumeId: app.resume_id,
        preApprovedJson: app.llm_json_payload
      });
    }

    res.json({ message: `Successfully queued ${rows.length} failed applications for retry.` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`API Server running on http://localhost:${PORT}`);
});
