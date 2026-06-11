require('dotenv').config();
const { createGoogleGenerativeAI } = require('@ai-sdk/google');
const { createOpenAI } = require('@ai-sdk/openai');
const { createGroq } = require('@ai-sdk/groq');
const { generateText } = require('ai');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const googleProvider = createGoogleGenerativeAI({ apiKey: process.env.GEMINI_API_KEY });
const groqProvider = createGroq({ apiKey: process.env.GROQ_API_KEY });
const openRouterProvider = createOpenAI({ baseURL: 'https://openrouter.ai/api/v1', apiKey: process.env.OPENROUTER_API_KEY });
const openaiProvider = createOpenAI({ apiKey: process.env.OPENAI_API_KEY });

const promptText = "Respond with a JSON object containing the key 'test' and value 'hello'. RETURN NOTHING BUT THE JSON.";

const providers = [
  { name: 'Gemini', model: googleProvider('gemini-2.5-flash-latest') },
  { name: 'Groq', model: groqProvider('llama-3.1-8b-instant') },
  { name: 'OpenRouter', model: openRouterProvider('mistralai/mistral-7b-instruct:free') },
  { name: 'OpenAI', model: openaiProvider('gpt-4o-mini') }
];

async function run() {
  // Test native Gemini SDK first
  console.log(`\nTesting Gemini Native SDK...`);
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    const result = await model.generateContent(promptText);
    console.log(`✅ Gemini Native Success:`, result.response.text());
  } catch (e) {
    console.log(`❌ Gemini Native Error:`, e.message);
  }

  for (const p of providers) {
    console.log(`\nTesting ${p.name} via AI SDK generateText...`);
    try {
      const { text } = await generateText({
        model: p.model,
        prompt: promptText
      });
      console.log(`✅ ${p.name} Success:`, text.trim());
    } catch (e) {
      console.log(`❌ ${p.name} Error:`, e.message);
    }
  }
}

run();
