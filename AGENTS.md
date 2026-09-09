# Agent Briefing: ats-auto-apply

## 1. Repository Overview & Purpose
- **Repository**: `webdev0814/ats-auto-apply`
- **Visibility**: `Public`
- **Default Branch**: `main`
- **Last Updated / Pushed**: 2026-09-09
- **Description**: An open-source, agentic web automation system designed to autonomously find, analyze, and apply to job postings on Applicant Tracking Systems.
- **Context from README**: An open-source, agentic web automation system designed to autonomously find, analyze, and apply to job postings on Applicant Tracking Systems (ATS) like Greenhouse and Lever. It leverages Playwright for browser automation, large language models (LLMs) to map custom forms and generate dynamic cover l...
- **Topics/Tags**: ai-agent, ats, automation, job-search, playwright

---

## 2. Tech Stack & Architecture
- **Primary Language / Ecosystem**: JavaScript, Python, Node.js, Docker
- **Key Directories**: `client/`
- **Notable Top-Level Files**: `.gitignore`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `LICENSE`, `README.md`, `api.js`, `db.js`, `db_migrate_phase9.js`, `docker-compose.yml`, `ingestion_worker.js`, `jobspy_runner.py`

---

## 3. Setup & Execution Commands
### Environment Setup & Installation
```bash
npm install
```

### Running / Starting
```bash
python3 <entrypoint>.py
```

### Testing / Verification
```bash
npm test
```

---

## 4. Recent Commit Activity (Where We Left Off)
The most recent commits show the latest development trajectory:
- `[988fd82]` (2026-09-09) docs: update agent briefing with multi-computer handoff protocol
- `[fc4448d]` (2026-09-09) docs: update agent briefing with multi-computer handoff protocol
- `[e7c1f79]` (2026-09-09) docs: update agent briefing with multi-computer handoff protocol
- `[fd4cc2a]` (2026-09-09) docs: update agent briefing with multi-computer handoff protocol
- `[cacc9d0]` (2026-09-09) docs: update agent briefing with multi-computer handoff protocol
- `[ae99a04]` (2026-09-09) docs: update agent briefing with multi-computer handoff protocol
- `[2034160]` (2026-09-09) docs: update agent briefing with multi-computer handoff protocol
- `[c137859]` (2026-09-09) docs: update agent briefing with multi-computer handoff protocol
- `[42a9eee]` (2026-09-09) docs: update agent briefing with multi-computer handoff protocol
- `[73b9b0a]` (2026-09-09) docs: update agent briefing with multi-computer handoff protocol

---

## 5. Current State & Immediate Next Steps
- **Current State**: Project is active under branch `main`.
- **When picking up this repo**:
  1. Inspect the top-level files and recent commits to understand the active feature or bugfix context.
  2. Verify all required credentials and environment variables before running integration scripts.
  3. Ensure all tests and linting pass after making modifications.
  4. Follow the repository conventions and preserve existing architecture patterns.

---

## 6. Multi-Computer Handoff & Git Sync Protocol
- **On Session Start**: Always run `git pull` when opening this repository on any computer to synchronize the latest changes.
- **On Task Completion**: Before ending any agent session, the agent **MUST**:
  1. Update Section 5 (Current State & Next Steps) in this `AGENTS.md` file.
  2. Stage all modifications (`git add .`).
  3. Commit with a concise conventional message (`git commit -m "feat/fix: ..."`).
  4. Push directly to GitHub (`git push`).
- **Secret Hygiene**: NEVER commit plain-text API keys, tokens, or credentials into repository files.
