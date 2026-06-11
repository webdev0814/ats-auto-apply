const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);
const db = require('./db');
const { generateApplicationData } = require('./llm_engine');

// Residential Proxy Credentials from .env
const PROXY_USERNAME = process.env.PROXY_USERNAME || "YOUR_PROXY_USERNAME";
const PROXY_PASSWORD = process.env.PROXY_PASSWORD || "YOUR_PROXY_PASSWORD";
const PROXY_SERVER = process.env.PROXY_SERVER || "localhost:8080";
const TYPE = 1;
const PASSWORD_JSON_STRING = `{"p":"${PROXY_PASSWORD}","t":${TYPE}}`;
const ENCODED_PASSWORD = Buffer.from(PASSWORD_JSON_STRING).toString('base64');
const PROXY_CONFIG = {
    server: `http://${PROXY_SERVER}`,
    username: PROXY_USERNAME,
    password: ENCODED_PASSWORD
};

async function processNextNewJob() {
  let browser;
  let currentJobId = null;
  try {
    const { rows } = await db.query(`SELECT * FROM applications WHERE status = 'NEW' LIMIT 1`);
    if (rows.length === 0) {
      console.log("[Ingestion] No NEW jobs. Sleeping 15s...");
      return;
    }

    const job = rows[0];
    currentJobId = job.id;
    console.log(`\n[Ingestion] Processing NEW job: ${job.target_company} (ID: ${job.id})`);
    
    // Set to PROCESSING_INGESTION to avoid picking it up again concurrently
    await db.query(`UPDATE applications SET status = 'PROCESSING_INGESTION' WHERE id = $1`, [job.id]);

    browser = await chromium.launch({
        headless: true,
        proxy: PROXY_CONFIG,
        args: ['--disable-blink-features=AutomationControlled']
    });

    const context = await browser.newContext({
        viewport: { width: 1920, height: 1080 },
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();
    console.log(`[Ingestion] Navigating to ${job.target_url}`);
    
    await page.goto(job.target_url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait briefly for forms to load
    await page.waitForTimeout(3000);

    // Extract Job Description
    let jobDescription = "";
    try {
        jobDescription = await page.evaluate(() => {
            const content = document.querySelector('#content') || document.querySelector('main') || document.body;
            return content.innerText.substring(0, 5000); // Take first 5000 chars to save tokens
        });
    } catch(e) {
        console.log("[Ingestion] Failed to extract description, using fallback.");
    }

    // Extract Form Fields
    console.log("[Ingestion] Checking for initial Apply button to reveal form...");
    const applyBtns = page.locator('button:has-text("Apply"), a:has-text("Apply"), a:has-text("Apply Now"), button:has-text("Apply Now")').first();
    if (await applyBtns.count() > 0) {
        try {
            await applyBtns.click({ timeout: 5000 });
            await page.waitForTimeout(3000);
        } catch(e) {}
    }

    console.log("[Ingestion] Extracting form schema...");
    const formSchema = [];
    for (const frame of page.frames()) {
        try {
            const frameFields = await frame.evaluate(() => {
                const inputs = Array.from(document.querySelectorAll('input, select, textarea'));
                return inputs.map(i => {
                    let label = "";
                    if (i.id) {
                        const lbl = document.querySelector(`label[for="${i.id}"]`);
                        if (lbl) label = lbl.innerText.trim();
                    }
                    if (!label && i.closest('label')) {
                        label = i.closest('label').innerText.trim();
                    }
                    if (!label && i.getAttribute('aria-label')) {
                        label = i.getAttribute('aria-label').trim();
                    }
                    if (!label && i.placeholder) {
                        label = i.placeholder.trim();
                    }
                    if (!label && i.previousElementSibling && i.previousElementSibling.tagName === 'LABEL') {
                        label = i.previousElementSibling.innerText.trim();
                    }
                    let options = [];
                    if (i.tagName.toLowerCase() === 'select') {
                        options = Array.from(i.options).map(o => o.text);
                    }
                    return {
                        id: i.id || "",
                        name: i.name || "",
                        type: i.type || i.tagName.toLowerCase(),
                        label: label,
                        required: i.required || false,
                        options: options.length > 0 ? options : undefined
                    };
                }).filter(f => f.type !== 'hidden' && f.type !== 'submit' && f.type !== 'button');
            });
            formSchema.push(...frameFields);
        } catch(e) {
            // Ignore cross-origin frame errors
        }
    }

    console.log(`[Ingestion] Found ${formSchema.length} form fields.`);

    // Fetch Answer Memory for LLM Context
    const memoryRows = await db.query("SELECT question_label, user_answer FROM answer_memory");
    const previousAnswers = memoryRows.rows;

    // Send to LLM
    const llmData = await generateApplicationData(job.target_company, jobDescription, formSchema, previousAnswers);

    if (llmData && llmData.answers) {
        console.log(`[Ingestion] Generated LLM Payload Successfully! Moving to PENDING_REVIEW.`);
        await db.query(`
            UPDATE applications 
            SET status = 'PENDING_REVIEW',
                form_schema_json = $1,
                llm_json_payload = $2,
                cover_letter_text = $3
            WHERE id = $4
        `, [
            JSON.stringify(formSchema), 
            JSON.stringify(llmData.answers),
            llmData.cover_letter || '',
            job.id
        ]);
    } else {
        console.log(`[Ingestion] LLM Generation Failed. Moving to FAILED_INGESTION.`);
        await db.query(`UPDATE applications SET status = 'FAILED_INGESTION' WHERE id = $1`, [job.id]);
    }

  } catch (error) {
    console.error(`[Ingestion Error]`, error);
    if (currentJobId) {
        await db.query(`UPDATE applications SET status = 'FAILED_INGESTION' WHERE id = $1`, [currentJobId]).catch(() => null);
    }
  } finally {
    if (browser) await browser.close();
  }
}

// Loop endlessly
async function run() {
    console.log("Starting Ingestion Worker...");
    while (true) {
        await processNextNewJob();
        await new Promise(r => setTimeout(r, 15000)); // Sleep 15s between ingestion attempts
    }
}

run();
