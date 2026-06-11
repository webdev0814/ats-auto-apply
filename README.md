# Antigravity ATS Auto-Apply Beta

An open-source, agentic web automation system designed to autonomously find, analyze, and apply to job postings on Applicant Tracking Systems (ATS) like Greenhouse and Lever. 

It leverages Playwright for browser automation, large language models (LLMs) to map custom forms and generate dynamic cover letters, and SQLite/Redis for queue management.

## Architecture
- **Scraper Cron (`scraper_cron.js`)**: Bypasses job aggregators (Indeed, Glassdoor) to query top-tier tech ATS APIs directly, avoiding Cloudflare and Datadome bot protection walls.
- **Ingestion Worker (`ingestion_worker.js`)**: Connects to ATS instances via residential proxies, scrapes the application form DOM schema, and passes the schema and job description to the LLM Engine.
- **LLM Engine (`llm_engine.js`)**: Reads your resume and the DOM schema, then generates a precise JSON payload to answer all questions, dropdowns, and checkboxes.
- **Execution Worker (`worker.js`)**: A scalable BullMQ worker that launches a Playwright Chromium instance, navigates to the application, maps the LLM's JSON payload to the DOM, uploads the resume, and submits the application.

## Prerequisites
- Node.js 18+
- SQLite3
- Redis (for BullMQ queue management)
- Playwright Chromium browsers installed

## Getting Started
1. Clone the repository.
2. Run `npm install` and `npx playwright install`.
3. Create a `.env` file based on the required secrets (OpenAI API keys, proxy credentials, 2captcha keys).
4. Place your personal resume as `user_resume.pdf` and `user_resume.txt` in the root directory.
5. Initialize the SQLite database by running `node schema.sql` (or equivalent setup script).
6. Start the Redis server.
7. Run the components:
   - `node api.js` (Dashboard API)
   - `node ingestion_worker.js` (Form parser)
   - `node worker.js` (Playwright execution)

## Known Issues (Beta)
1. **Job Aggregator Bot Protection:** The system relies on direct ATS APIs (Greenhouse/Lever) because standard aggregators (Indeed, ZipRecruiter) block the Playwright bots with Cloudflare/Datadome.
2. **Invisible Validation Errors:** Single Page Apps (SPAs) often fail silently if a dropdown isn't clicked correctly, causing Playwright to timeout.
3. **Complex Custom Dropdowns:** The LLM sometimes struggles to map string answers to dynamic div-based dropdowns (especially on Workday).
4. **CAPTCHAs:** Some Greenhouse boards randomly trigger hCaptcha. The 2captcha bypass is in beta.

## License
MIT License. See `LICENSE` for details.
