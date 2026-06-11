require('dotenv').config();
const db = require('./db');
const crypto = require('crypto');
const fetch = require('node-fetch');
const { HttpsProxyAgent } = require('https-proxy-agent');

const proxyUrl = process.env.RESIDENTIAL_PROXY_URL;
const proxyAgent = proxyUrl ? new HttpsProxyAgent(proxyUrl) : null;

function normalizeTitle(title) {
    let t = title.toLowerCase();
    // Strip text after dashes and in parens
    t = t.split('-')[0];
    t = t.replace(/\(.*?\)/g, '');
    // Strip common geographic modifiers
    const stopWords = ['emea', 'apac', 'amer', 'americas', 'remote', 'us', 'uk', 'usa', 'global'];
    for (const w of stopWords) {
        t = t.replace(new RegExp(`\\b${w}\\b`, 'g'), '');
    }
    return t.replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function scoreJobPreference(title, jobUrl) {
    let score = 0;
    const str = (title + ' ' + jobUrl).toLowerCase();
    if (str.includes('florida') || str.includes('est') || str.includes('east') || str.includes('amer')) {
        score += 100;
    }
    if (str.includes('usa') || str.includes('united states') || str.match(/\bus\b/)) {
        score += 50;
    }
    if (str.includes('remote')) {
        score += 25;
    }
    return score;
}

async function logMsg(msg, level='INFO') {
    console.log(`[${level}] ${msg}`);
    await db.query(`INSERT INTO scraper_logs (log_level, message) VALUES (?, ?)`, [level, msg]);
}

async function scrapeJobsNative(searchTerm, location, isRemote, hoursOld) {
    await logMsg(`Searching for "${searchTerm}" jobs (Remote: ${isRemote})`);
    
    const dbBoards = await db.query('SELECT board_token, ats_type FROM target_boards WHERE is_active = 1');
    const boards = dbBoards.rows;
    let allJobs = [];

    for (const boardRow of boards) {
        const board = boardRow.board_token;
        const atsType = boardRow.ats_type || 'greenhouse';
        try {
            await logMsg(`Fetching ${atsType} board: ${board}...`);
            const fetchOptions = proxyAgent ? { agent: proxyAgent } : {};
            
            let apiUrl = '';
            if (atsType === 'lever') {
                apiUrl = `https://api.lever.co/v0/postings/${board}`;
            } else {
                apiUrl = `https://boards-api.greenhouse.io/v1/boards/${board}/jobs`;
            }
            
            const res = await fetch(apiUrl, fetchOptions);
            if (!res.ok) continue;
            const data = await res.json();
            
            let jobsList = [];
            if (atsType === 'lever') {
                jobsList = data; // Lever returns an array of postings
            } else {
                jobsList = data.jobs; // Greenhouse returns { jobs: [] }
            }
            
            // Filter jobs based on search term AND location
            const matchingJobs = jobsList.filter(j => {
                const title = (atsType === 'lever' ? j.text : j.title).toLowerCase();
                // Strict Job Title Matching
                const titleMatch = /\bbusiness analyst\b/i.test(title);
                if (!titleMatch) return false;

                // Strict USA & Remote Filtering
                let locationString = '';
                if (atsType === 'lever' && j.categories) {
                    locationString = (j.categories.location || '').toLowerCase();
                } else if (atsType === 'greenhouse' && j.location) {
                    locationString = (j.location.name || '').toLowerCase();
                }

                // Check for explicit foreign exclusions or 'hybrid'
                const foreignRegions = [
                    'emea', 'apac', 'latam', 'uk', 'canada', 'europe', 'asia', 'india', 'australia', 
                    'philippines', 'mexico', 'brazil', 'london', 'toronto', 'vancouver', 'china',
                    'japan', 'germany', 'france', 'spain', 'ireland', 'dublin', 'singapore', 'korea',
                    'sweden', 'netherlands', 'amsterdam', 'berlin', 'paris', 'sydney', 'melbourne',
                    'hong kong', 'taiwan', 'poland', 'romania', 'argentina', 'colombia', 'costa rica',
                    'hybrid'
                ];
                
                const isForeignOrHybrid = foreignRegions.some(region => locationString.includes(region) || title.includes(region));
                if (isForeignOrHybrid) return false;
                
                // Strict Whitelist: Must explicitly indicate Remote and US
                const usaTerms = ['us', 'usa', 'united states', 'america', 'national', 'florida', 'fl', 'ny', 'ca', 'tx', 'wa', 'il', 'remote'];
                const isUsa = usaTerms.some(term => locationString.includes(term));
                const isRemote = locationString.includes('remote') || title.includes('remote');

                if (!isUsa || !isRemote) {
                    return false;
                }

                return true;
            });

            matchingJobs.forEach(j => {
                allJobs.push({
                    job_url: atsType === 'lever' ? j.hostedUrl : j.absolute_url,
                    company: board.toUpperCase(),
                    title: atsType === 'lever' ? j.text : j.title,
                    ats_type: atsType
                });
            });
        } catch (e) {
            console.error(`Failed to fetch from ${board}: ${e.message}`);
        }
    }
    
    // Inject some fake Workday/Taleo jobs to test the bypass logic
    allJobs.push({ job_url: 'https://myworkdayjobs.com/fake-job-1', company: 'Workday Corp', title: 'Business Analyst' });
    allJobs.push({ job_url: 'https://myworkdayjobs.com/fake-job-2', company: 'Workday Corp', title: 'Business Analyst' });
    allJobs.push({ job_url: 'https://taleo.net/fake-job-3', company: 'Taleo Inc', title: 'Business Analyst' });
    
    return allJobs;
}

async function runScraperForProfiles() {
    try {
        console.log("Fetching active search profiles...");
        const result = await db.query('SELECT * FROM search_profiles WHERE is_active = 1');
        const profiles = result.rows;
        
        if (profiles.length === 0) {
            console.log("No active search profiles found.");
            return;
        }

        let totalIngested = 0;
        let totalSkipped = 0;

        for (const profile of profiles) {
            console.log(`\n--- Running profile: ${profile.search_term} | ${profile.location} ---`);
            const jobs = await scrapeJobsNative(profile.search_term, profile.location, profile.is_remote, profile.hours_old);
            
            // Group jobs by Company to strictly enforce 1 application per company!
            const groups = {};
            for (const job of jobs) {
                const t = job.title || job.job_url;
                const normCompany = job.company.toLowerCase().replace(/inc|llc|ltd/g, '').trim();
                
                // Add bonus score if the title exactly contains "business analyst"
                let score = scoreJobPreference(t, job.job_url);
                if (t.toLowerCase().includes('business analyst')) score += 500;
                
                if (!groups[normCompany] || groups[normCompany].score < score) {
                    groups[normCompany] = { ...job, score, normCompany };
                }
            }

            const bestJobs = Object.values(groups);
            await logMsg(`Native Scraper returned ${jobs.length} total raw jobs. After strictly limiting to 1 per company: ${bestJobs.length} unique roles.`);

            for (const job of bestJobs) {
                const targetUrl = job.job_url;
                const company = job.company || "Unknown Company";
                const normCompany = job.normCompany;
                
                // 1. Check if job URL or Company already exists in our DB (Deduplication)
                const existing = await db.query('SELECT id FROM applications WHERE target_url = ? OR semantic_hash = ?', [targetUrl, normCompany]);
                if (existing.rows.length > 0) {
                    continue; // Skip duplicates
                }

                // 2. ATS Pre-filtering (Bypass Workday/Taleo)
                const isWorkday = targetUrl.includes('myworkdayjobs.com');
                const isTaleo = targetUrl.includes('taleo.net');
                
                let status = 'NEW';
                let detectedAts = job.ats_type || 'Unknown';
                
                if (isWorkday) {
                    status = 'SKIPPED_UNSUPPORTED_ATS';
                    detectedAts = 'Workday';
                    totalSkipped++;
                } else if (isTaleo) {
                    status = 'SKIPPED_UNSUPPORTED_ATS';
                    detectedAts = 'Taleo';
                    totalSkipped++;
                } else {
                    totalIngested++;
                }

                // 3. Insert into Database
                await db.query(`
                    INSERT INTO applications 
                    (target_company, target_url, status, ats_type, role_id, resume_id, semantic_hash) 
                    VALUES (?, ?, ?, ?, ?, ?, ?)
                `, [company, targetUrl, status, detectedAts, profile.role_id, 1, normCompany]); // Assume resume_id=1 for MVP
            }
        }
        
        await logMsg(`Scrape Complete. Ingested ${totalIngested} new PENDING jobs. Bypassed ${totalSkipped} Workday/Taleo jobs.`);
        
    } catch (e) {
        await logMsg(`Scraper Error: ${e.stack}`, 'ERROR');
    }
}

// Allow running directly
if (require.main === module) {
    runScraperForProfiles().then(() => process.exit(0));
}

module.exports = { runScraperForProfiles };
