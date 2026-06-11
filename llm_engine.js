const { createGoogleGenerativeAI } = require('@ai-sdk/google');
const { createOpenAI } = require('@ai-sdk/openai');
const { generateText } = require('ai');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const googleProvider = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY });
const openaiProvider = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function generateApplicationData(targetCompany, jobDescription, formSchemaJson, previousAnswers = []) {
  try {
    const resumePath = path.join(__dirname, 'user_resume.txt');
    let resumeText = '';
    if (fs.existsSync(resumePath)) {
      resumeText = fs.readFileSync(resumePath, 'utf-8');
    } else {
      console.warn("Resume text file not found!");
      resumeText = "Business Analyst with 5+ years of experience in agile methodologies.";
    }

    const currentDate = new Date().toLocaleDateString('en-US');

    const promptText = `
    You are an expert ATS auto-applicant acting on behalf of the user.
    Use the user's resume to accurately fill out the requested form fields for ${targetCompany}.
    Also generate a targeted cover letter expressing excitement about AI and agentic solutions, and how they apply to this role.
    
    Resume:
    ${resumeText}
    
    Job Description:
    ${jobDescription || "No description provided."}
    
    Form Fields Schema (HTML inputs):
    ${JSON.stringify(formSchemaJson, null, 2)}
    
    Historical Answer Memory (from the user):
    If a form field label conceptually matches one of the labels in this memory, YOU MUST strongly prefer using the corresponding user_answer.
    ${JSON.stringify(previousAnswers, null, 2)}

    CRITICAL INSTRUCTIONS ON CUSTOM FIELDS:
    1. If asked about AI tools being used to draft or apply (e.g. "AI Policy for Application"), YOU MUST ANSWER "No" or negatively (e.g. "I did not use AI tools").
    2. Keep ALL answers to custom short-answer questions extremely concise (1 to 2 sentences max). Do NOT write verbose paragraphs.
    3. If asked for links to GitHub, X, Twitter, or LinkedIn, simply point them to your personal website if applicable, or NA.
    4. If the form field is labeled "Keywords" or similar, just provide a clean, comma-separated list of 5-8 core technical skills (e.g. "Agentic AI, Workflow Automation, SQL, Python, Agile").
    5. The current date is ${currentDate}. If a field asks for today's date, use ${currentDate}.

    IMPORTANT: You must return a strict JSON object mapping the exact "id" or "name" attribute of the form field to the generated answer string. Do not include markdown formatting or backticks outside of the JSON object.
    
    Required JSON Format:
    {
      "answers": {
        "field_id_1": "answer text",
        "field_id_2": "answer text"
      },
      "cover_letter": "Dear Hiring Manager... \\n\\n... Sincerely, <YOUR_NAME>"
    }
    `;

    console.log(`[LLM Engine] Generating answers for ${targetCompany}...`);
    
    const { text } = await generateText({
      model: googleProvider('gemini-2.5-flash'),
      prompt: promptText
    });

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
        throw new Error("No JSON object found in LLM response");
    }

    let parsedObject;
    try {
      parsedObject = JSON.parse(match[0]);
    } catch (err) {
      const fixedJson = match[0].replace(/\n/g, '\\n').replace(/\r/g, '');
      parsedObject = JSON.parse(fixedJson);
    }

    return parsedObject;
  } catch (error) {
    console.error("[LLM Engine] Failed to generate data:", error.message);
    return null;
  }
}

module.exports = { generateApplicationData };
