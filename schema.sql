CREATE TABLE IF NOT EXISTS profiles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(50),
    resume_path VARCHAR(255) NOT NULL,
    linkedin_url VARCHAR(255),
    github_url VARCHAR(255),
    portfolio_url VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Multi-Role Support
CREATE TABLE IF NOT EXISTS roles (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    system_prompt_context TEXT
);

CREATE TABLE IF NOT EXISTS resumes (
    id SERIAL PRIMARY KEY,
    role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
    file_path VARCHAR(255) NOT NULL,
    parsed_text TEXT
);

CREATE TABLE IF NOT EXISTS applications (
    id SERIAL PRIMARY KEY,
    target_company VARCHAR(255) NOT NULL,
    target_url VARCHAR(2048) NOT NULL,
    status VARCHAR(50) DEFAULT 'PENDING_REVIEW',
    role_id INTEGER REFERENCES roles(id) ON DELETE SET NULL,
    resume_id INTEGER REFERENCES resumes(id) ON DELETE SET NULL,
    form_schema_json JSONB,
    llm_json_payload JSONB,
    ai_reviewer_feedback JSONB,
    screenshot_before_path VARCHAR(255),
    screenshot_after_path VARCHAR(255),
    error_log TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS custom_questions_cache (
    id SERIAL PRIMARY KEY,
    question_hash VARCHAR(255) UNIQUE NOT NULL,
    question_text TEXT NOT NULL,
    role_id INTEGER REFERENCES roles(id) ON DELETE CASCADE,
    llm_answer TEXT NOT NULL,
    is_human_verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
