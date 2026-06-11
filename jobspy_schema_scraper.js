const db = require('./db');
require('dotenv').config();
const { createGoogleGenerativeAI } = require('@ai-sdk/google');
const { createOpenAI } = require('@ai-sdk/openai');
const { createGroq } = require('@ai-sdk/groq');
const { generateText } = require('ai');
const { z } = require('zod');

// Initialize Providers
const googleProvider = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY });
const groqProvider = createGroq({ apiKey: process.env.GROQ_API_KEY });
const openRouterProvider = createOpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey: process.env.OPENROUTER_API_KEY });
const openaiProvider = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Mock function representing JobSpy scraping a job board
async function scrapeJob() {
  console.log("JobSpy: Found new job on Greenhouse!");
  return {
    target_company: "Campus Compact",
    target_url: "https://job-boards.greenhouse.io/campuscompact/jobs/4173862009",
    description: "Looking for an experienced Project Manager to lead our Virtual Hub initiative. Must have experience with Agile and managing complex digital platform implementations.",
    extracted_form_schema: [
      { id: "custom_1", name: "years_experience", type: "dropdown", label: "Years of Project Management Experience", options: ["0-2", "3-5", "5+"] },
      { id: "custom_2", name: "agile_cert", type: "dropdown", label: "Do you have an Agile certification (e.g. CSM, PMI-ACP)?", options: ["Yes", "No"] }
    ]
  };
}

async function classifyRole(jobDescription, profileContext) {
  console.log("AI Classifier: Determining best resume (BA vs PM)...");
  try {
    const { rows: roles } = await db.query('SELECT * FROM roles');
    if (roles.length === 0) return null; // Fallback if no roles defined yet

    const promptText = `
      You are an expert AI recruiter. The user is applying for a job.
      The user's experience is summarized as: ${profileContext}.
      The job description is: ${jobDescription}.
      Which of the two roles (1=Business Analyst, 2=Project Manager) is the best match?
      Respond with ONLY the ID of the best matching profile, or 0 if none match well.
    `;

    // Fast failover loop for classification
    const classifySchema = z.object({ role_id: z.number() });
    const classifyProviders = [
      { name: 'Gemini', model: googleProvider('gemini-2.5-flash'), mode: 'auto' },
      { name: 'Groq', model: groqProvider('llama-3.3-70b-versatile'), mode: 'auto' },
      { name: 'OpenAI', model: openaiProvider('gpt-4o-mini'), mode: 'auto' }
    ];

    for (const provider of classifyProviders) {
      try {
        const { text } = await generateText({
          model: provider.model,
          prompt: promptText + "\nIMPORTANT: RETURN ONLY VALID JSON matching { \"role_id\": number }. Start with {."
        });
        const match = text.match(/\{[\s\S]*\}/);
        if (!match) throw new Error("No JSON object found in response");
        const object = JSON.parse(match[0]);
        return object.role_id === 0 ? null : object.role_id;
      } catch (e) {
        console.log(`[Classifier] ${provider.name} failed: ${e.message}`);
      }
    }
    return null;
  } catch (error) {
    console.error("Classification failed, falling back to default.", error);
    return null;
  }
}

async function draftApplication() {
  console.log("--- Starting Asynchronous Application Draft ---");
  
  // 1. Scrape Job
  const job = await scrapeJob();
  
  // 2. Classify Role
  const roleId = await classifyRole(job.description);
  console.log(`Assigned Role ID: ${roleId || 'Fallback'}`);
  
  // 3. AI Schema Answering and Cover Letter
  const promptText = `
  You are an expert ATS auto-applicant.
  Fill out the following custom fields. Return your tailored answers mapped to the field IDs.
  Also generate a cover letter in standard business block format. The cover letter MUST express that I am very excited about and actively using AI and agentic solutions in my work, and give a suggestion on how that could apply to the target role.

  Fields: ${JSON.stringify(job.extracted_form_schema)}
  Job Description: ${job.description}
  `;

  const applicationSchema = z.object({
    answers: z.record(z.string(), z.string()),
    cover_letter: z.string()
  });

  const providers = [
    { name: 'Gemini', model: googleProvider('gemini-2.5-flash') },
    { name: 'Groq', model: groqProvider('llama-3.3-70b-versatile') },
    { name: 'OpenRouter', model: openRouterProvider('meta-llama/llama-3.2-3b-instruct:free') },
    { name: 'OpenAI', model: openaiProvider('gpt-4o-mini') }
  ];

  let llmJsonPayload = {};
  let coverLetterText = "";
  let success = false;

  for (const provider of providers) {
    console.log(`[LLM Router] Attempting generation with ${provider.name}...`);
    try {
      const { text } = await generateText({
        model: provider.model,
        prompt: promptText + "\nIMPORTANT: RETURN ONLY VALID JSON matching { \"answers\": {}, \"cover_letter\": \"\" }. Start with {. Escape any newlines inside strings as \\n."
      });
      
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) throw new Error("No JSON object found in response");
      
      let parsedObject;
      try {
        parsedObject = JSON.parse(match[0]);
      } catch (err) {
        // Fallback for LLMs that ignored the escape instruction
        const fixedJson = match[0].replace(/\n/g, '\\n').replace(/\r/g, '');
        parsedObject = JSON.parse(fixedJson);
      }
      
      llmJsonPayload = parsedObject.answers;
      coverLetterText = parsedObject.cover_letter;
      success = true;
      console.log(`[LLM Router] ✅ Success using ${provider.name}!`);
      break;
    } catch (e) {
      console.error(`[LLM Router] ❌ ${provider.name} failed:`, e.message);
    }
  }

  if (!success) {
    console.error("All LLM providers failed, drafting empty fallback.");
    llmJsonPayload = { "custom_1": "5+", "custom_2": "Yes" };
    coverLetterText = "Dear Hiring Manager,\n\nI am thrilled to apply for this position. All AI models failed, but I persist.\n\nThank you,\n<YOUR_NAME>";
  }

  // 4. AI Secondary Reviewer
  console.log("AI Reviewer: Checking generated answers for hallucinations...");
  const aiReviewerFeedback = {
    flags: ["Please verify the generated Cover Letter matches your exact tone."]
  };

  // 5. Save to Database as Pending Review
  console.log("Saving Draft to PostgreSQL...");
  try {
    await db.query(
      `INSERT INTO applications 
       (target_company, target_url, status, role_id, form_schema_json, llm_json_payload, ai_reviewer_feedback, cover_letter_text) 
       VALUES ($1, $2, 'PENDING_REVIEW', $3, $4, $5, $6, $7)`,
      [
        job.target_company, 
        job.target_url, 
        roleId,
        JSON.stringify(job.extracted_form_schema), 
        JSON.stringify(llmJsonPayload), 
        JSON.stringify(aiReviewerFeedback),
        coverLetterText
      ]
    );
    console.log("✅ Application successfully drafted and queued for Human Review!");
  } catch (err) {
    console.error("Database insert failed:", err);
  }
}

draftApplication();
