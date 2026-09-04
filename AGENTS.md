# Agent Briefing: ats-auto-apply

## 1. Repository Overview & Purpose
- **Repository**: `webdev0814/ats-auto-apply`
- **Visibility**: `Public`
- **Default Branch**: `main`
- **Last Updated / Pushed**: 2026-09-04
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
python <entrypoint>.py
```

### Testing / Verification
```bash
npm test
```

---

## 4. Recent Commit Activity (Where We Left Off)
The most recent commits show the latest development trajectory:
- `[d3203d9]` (2026-09-04) docs: add comprehensive agent briefing (AGENTS.md, GEMINI.md, CLAUDE.md)
- `[7b0d1a1]` (2026-09-04) docs: add comprehensive agent briefing (AGENTS.md, GEMINI.md, CLAUDE.md)
- `[89b3e9c]` (2026-09-04) docs: add comprehensive agent briefing (AGENTS.md, GEMINI.md, CLAUDE.md)
- `[232d474]` (2026-06-11) Beta release of Antigravity ATS Auto-Apply

---

## 5. Current State & Immediate Next Steps
- **Current State**: Project is active under branch `main`.
- **When picking up this repo**:
  1. Inspect the top-level files and recent commits to understand the active feature or bugfix context.
  2. Verify all required credentials and environment variables before running integration scripts.
  3. Ensure all tests and linting pass after making modifications.
  4. Follow the repository conventions and preserve existing architecture patterns.

---

## 6. Agent Working Guidelines & Gotchas
- **Cross-Platform Compatibility**: Code may run across Windows, macOS, or Linux agent environments. Ensure path manipulations use OS-agnostic methods (e.g. `pathlib.Path` or `path.join`).
- **Secret Hygiene**: NEVER commit plain-text API keys, tokens, or credentials into repository files.
- **Git Commit Etiquette**: Use concise, conventional commit messages (e.g., `feat:`, `fix:`, `docs:`, `refactor:`).
- **Tooling Compatibility**: This briefing is kept aligned for Antigravity (`GEMINI.md`), Claude Code / Codex (`CLAUDE.md`), and general autonomous agents (`AGENTS.md`).
