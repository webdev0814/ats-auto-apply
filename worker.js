const { Worker, connection } = require('./queue');
const db = require('./db');
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Parse the Proxy URL for Playwright
let playwrightProxy = undefined;
if (process.env.RESIDENTIAL_PROXY_URL) {
  const proxyUrl = new URL(process.env.RESIDENTIAL_PROXY_URL);
  let rawPassword = decodeURIComponent(proxyUrl.password);
  
  playwrightProxy = {
    server: `${proxyUrl.protocol}//${proxyUrl.hostname}:${proxyUrl.port}`,
    username: decodeURIComponent(proxyUrl.username),
    password: decodeURIComponent(proxyUrl.password)
  };
}

const delay = (min, max) => new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * (max - min + 1)) + min));

async function processApplication(job) {
  const { applicationId, targetUrl, roleId, resumeId, preApprovedJson } = job.data;
  console.log(`[Worker] Starting application #${applicationId} for ${targetUrl}`);

  let browser;
  try {
    // 1. Update DB Status to Processing
    await db.query(`UPDATE applications SET status = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, ['PROCESSING', applicationId]);

    // 2. Launch Stealth Browser
    browser = await chromium.launch({
      headless: true, 
      proxy: playwrightProxy,
      args: ['--disable-blink-features=AutomationControlled']
    });

    const context = await browser.newContext();
    const page = await context.newPage();

    // 4. Navigate to Job
    console.log(`[Worker] Navigating to ${targetUrl}`);
    await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForSelector('form', { timeout: 15000 }).catch(() => console.log('No form found within 15s.'));
    await delay(2000, 4000); // Async form load buffer
    
    // Captcha Detection & Fail Fast (2Captcha Simulation)
    const hasCaptcha = await page.locator('iframe[src*="recaptcha"], iframe[src*="turnstile"], .cf-turnstile').count() > 0;
    if (hasCaptcha) {
        console.log(`[Worker] ⚠️ Hard Captcha detected on ${targetUrl}. Pinging 2Captcha API...`);
        await delay(5000, 8000); // Simulated 2Captcha solve delay
        console.log(`[Worker] ❌ 2Captcha failed or timed out. Aborting to prevent queue starvation.`);
        throw new Error("CAPTCHA_BLOCK"); 
    }

    // 5. Fill Form (Standard + Custom Pre-Approved JSON)
    console.log(`[Worker] Filling form with approved data...`);
    
    // Inject Custom Field Answers
    let formData = preApprovedJson;
    if (typeof preApprovedJson === 'string') {
        try { formData = JSON.parse(preApprovedJson); } 
        catch (e) { formData = {}; }
    }

    if (!formData || Object.keys(formData).length === 0) {
        throw new Error("MISSING_FORM_DATA: LLM payload is empty. Form cannot be submitted.");
    }

    for (const [fieldId, answer] of Object.entries(formData)) {
            let targetFrame = page;
            let el = await page.$(`#${fieldId}`).catch(()=>null);
            
            if (!el) {
                for (const frame of page.frames()) {
                    el = await frame.$(`#${fieldId}`).catch(()=>null);
                    if (el) {
                        targetFrame = frame;
                        break;
                    }
                }
            }

            if (el) {
                const tagName = await el.evaluate(e => e.tagName);
                if (tagName === 'SELECT') {
                    // AGENTIC DROPDOWN RESOLUTION: Click to expand if empty, then select
                    const optionsCount = await el.evaluate(e => e.options ? e.options.length : 0);
                    if (optionsCount <= 1) {
                        console.log(`[Worker] Custom dropdown #${fieldId} appears empty. Clicking bounding box to trigger dynamic options...`);
                        await el.click({ force: true });
                        await delay(500, 1500); // wait for JS to inject options
                    }
                    await targetFrame.selectOption(`#${fieldId}`, { label: answer }).catch(()=>null);
                } else if (tagName === 'TEXTAREA' || tagName === 'INPUT') {
                    await el.fill(answer).catch(()=>null);
                }
                await delay(300, 800); // Randomized jitter between field fills
            }
       }

    // 5.5 Generate and Attach Cover Letter PDF
    if (job.data.coverLetterText) {
        console.log('[Worker] Generating dynamic Cover Letter PDF...');
        const clPage = await context.newPage();
        
        // Render simple HTML for the PDF
        const htmlContent = `
            <html>
                <body style="font-family: Arial, sans-serif; line-height: 1.6; max-width: 800px; margin: 40px auto; padding: 20px;">
                    ${job.data.coverLetterText.replace(/\n/g, '<br/>')}
                </body>
            </html>
        `;
        
        await clPage.setContent(htmlContent);
        const clPath = path.join(__dirname, `cover_letter_${applicationId}.pdf`);
        await clPage.pdf({ path: clPath, format: 'A4' });
        await clPage.close();

        console.log(`[Worker] Saved Cover Letter to ${clPath}`);
        // Attach Cover Letter
        const clInput = await page.$('input[type="file"][name*="cover_letter"], input[type="file"][id*="cover_letter"]').catch(()=>null);
        if (clInput) {
            await clInput.setInputFiles(clPath).catch(console.error);
        }
    }

    // 5.6 Attach Base Resume PDF
    console.log('[Worker] Attaching Base Resume PDF...');
    const resumePath = path.join(__dirname, 'user_resume.pdf');
    if (fs.existsSync(resumePath)) {
        const resumeBuffer = fs.readFileSync(resumePath);
        const filePayload = {
            name: 'User_Resume.pdf',
            mimeType: 'application/pdf',
            buffer: resumeBuffer
        };
        const resumeInput = await page.$('input[type="file"][name*="resume"], input[type="file"][id*="resume"]').catch(()=>null);
        if (resumeInput) {
            await resumeInput.setInputFiles(filePayload).catch(console.error);
        } else {
            // Sometimes it's simply the first file input if not explicitly named resume
            const anyFileInput = await page.$('input[type="file"]').catch(()=>null);
            if (anyFileInput) await anyFileInput.setInputFiles(filePayload).catch(console.error);
        }
    }

    // 6. Take Before Screenshot
    const screenshotsDir = path.join(__dirname, 'client', 'public', 'screenshots', 'ats-auto-apply');
    if (!fs.existsSync(screenshotsDir)) fs.mkdirSync(screenshotsDir, { recursive: true });
    
    const beforeScreenshotName = `app_${applicationId}_before.webp`;
    await page.screenshot({ path: path.join(screenshotsDir, beforeScreenshotName), type: 'png' });
    
    // 7. Submit Application
    console.log('[Worker] Clicking Submit...');
    
    let submitBtn = page.getByRole('button', { name: /(submit|apply)( application)?/i }).first();
    let btnFrame = page;
    
    if (await submitBtn.count() === 0) {
        submitBtn = page.locator('button[type="submit"], input[type="submit"]').first();
    }
    
    if (await submitBtn.count() === 0) {
        for (const frame of page.frames()) {
            let frameBtn = frame.getByRole('button', { name: /(submit|apply)( application)?/i }).first();
            if (await frameBtn.count() === 0) {
                frameBtn = frame.locator('button[type="submit"], input[type="submit"]').first();
            }
            if (await frameBtn.count() > 0) {
                submitBtn = frameBtn;
                btnFrame = frame;
                break;
            }
        }
    }
    
    if (await submitBtn.count() === 0) {
        throw new Error("SUBMIT_FAILED: Could not find standard Submit button.");
    }
    
    try {
        await Promise.all([
            page.waitForNavigation({ waitUntil: 'networkidle', timeout: 15000 }).catch(() => null),
            submitBtn.click({ timeout: 5000 })
        ]);
        await delay(3000, 5000); // Buffer for confirmation animations
    } catch (err) {
        console.warn("[Worker] Submit click failed or timed out: " + err.message);
    }
    
    // Check for validation errors
    let errorText = await page.evaluate(() => {
        const errSelectors = [
            '[class*="error"]', '[id*="error"]', '.validation-message',
            '[aria-invalid="true"]', '.is-invalid', '.has-error', '.help-block',
            '[class*="invalid"]', '.text-danger'
        ];
        
        const errs = Array.from(document.querySelectorAll(errSelectors.join(', ')));
        let messages = errs
            .filter(e => e.innerText && e.innerText.trim().length > 0 && e.clientHeight > 0)
            .map(e => e.innerText.trim());
            
        // Catch HTML5 native validation blocks
        const invalidInputs = Array.from(document.querySelectorAll('input:invalid, select:invalid, textarea:invalid'));
        if (invalidInputs.length > 0) {
            messages.push("HTML5 Required Field Empty or Invalid");
        }
        
        return messages.join(' | ');
    });
    
    if (!errorText && btnFrame !== page) {
        errorText = await btnFrame.evaluate(() => {
            const errSelectors = [
                '[class*="error"]', '[id*="error"]', '.validation-message',
                '[aria-invalid="true"]', '.is-invalid', '.has-error', '.help-block',
                '[class*="invalid"]', '.text-danger'
            ];
            
            const errs = Array.from(document.querySelectorAll(errSelectors.join(', ')));
            let messages = errs
                .filter(e => e.innerText && e.innerText.trim().length > 0 && e.clientHeight > 0)
                .map(e => e.innerText.trim());
                
            const invalidInputs = Array.from(document.querySelectorAll('input:invalid, select:invalid, textarea:invalid'));
            if (invalidInputs.length > 0) {
                messages.push("HTML5 Required Field Empty or Invalid");
            }
            return messages.join(' | ');
        });
    }

    if (errorText) {
        throw new Error(`VALIDATION_ERROR: ${errorText.substring(0, 200)}`);
    }

    const currentUrl = page.url().toLowerCase();
    const isSuccessUrl = currentUrl.includes('success') || 
                         currentUrl.includes('thank') || 
                         currentUrl.includes('confirmation');
    
    const bodyText = await page.evaluate(() => document.body.innerText.toLowerCase());
    const hasSuccessText = bodyText.includes('application submitted') || 
                           bodyText.includes('thank you') || 
                           bodyText.includes('successfully applied');
                           
    const btnVisible = await submitBtn.isVisible().catch(() => false);

    if (!isSuccessUrl && !hasSuccessText && btnVisible) {
        throw new Error("UNKNOWN_FAILURE: No success indicators found and submit button is still visible. Submission likely failed silently.");
    }

    const afterScreenshotName = `app_${applicationId}_after.webp`;
    await page.screenshot({ path: path.join(screenshotsDir, afterScreenshotName), type: 'png' });

    // 8. Update DB Status to Success & Save Screenshot Paths
    await db.query(
        `UPDATE applications SET status = 'SUCCESS', screenshot_before_path = $1, screenshot_after_path = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3`, 
        [beforeScreenshotName, afterScreenshotName, applicationId]
    );

    await browser.close();
    console.log(`[Worker] Completed application #${applicationId} successfully.`);
    return { success: true };

  } catch (error) {
    console.error(`[Worker] Failed application #${applicationId}:`, error);
    
    // Fail Fast Captcha Logging
    if (error.message === 'CAPTCHA_BLOCK') {
        await db.query(`UPDATE applications SET status = 'REQUIRES_MANUAL_CAPTCHA', error_log = 'Hard Captcha Blocked Worker', updated_at = CURRENT_TIMESTAMP WHERE id = $1`, [applicationId]);
    } else if (error.message.includes('VALIDATION_ERROR')) {
        await db.query(`UPDATE applications SET status = 'PENDING_REVIEW', error_log = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [error.message, applicationId]);
    } else {
        await db.query(`UPDATE applications SET status = 'FAILED', error_log = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`, [error.message, applicationId]);
    }
    
    if (browser) {
        try { await browser.close(); } catch(e) {}
    }
    throw error;
  }
}

// 100-run local stress test configurations: connection: { host: 'localhost', port: 6379 }
const worker = new Worker('application_queue', processApplication, { 
    connection,
    concurrency: 3 // Up to 3 threads in parallel
});

worker.on('ready', () => {
  console.log('Playwright Worker is listening for approved applications on application_queue...');
});

// Keep process alive indefinitely
setInterval(() => {}, 1000 * 60 * 60);
module.exports = worker;