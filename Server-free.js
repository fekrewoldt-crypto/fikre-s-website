const express = require('express');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const cors = require('cors');
const https = require('https');
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(cors());

// Check which AI services are available
const hasGemini = !!process.env.GEMINI_API_KEY;

// Ollama runs locally on port 11434
const OLLAMA_URL = 'http://localhost:11434';
let ollamaAvailable = false;

// Test if Ollama is running
async function checkOllama() {
  try {
    const response = await fetch(`${OLLAMA_URL}/api/tags`);
    if (response.ok) {
      const data = await response.json();
      ollamaAvailable = true;
      console.log('✅ Ollama available with models:', data.models?.map(m => m.name).join(', '));
    }
  } catch (e) {
    console.log('⚠️  Ollama not running. Start it with: ollama serve');
  }
}
checkOllama();

// Initialize Gemini (if key exists)
let genAI = null;
if (hasGemini) {
  genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  console.log('✅ Gemini API configured');
}

// Model priority: Gemini → Llama 3.2 (Local) → Demo
const getModelPriority = () => {
  const priority = [];
  if (hasGemini) priority.push('gemini');
  if (ollamaAvailable) priority.push('ollama');
  priority.push('demo');
  return priority;
};

// ============ MOCK DATA ============
const MOCK_CONDITIONS = [
  {
    primaryCondition: "Contact Dermatitis",
    confidence: 78, severity: "low",
    subtitle: "Skin condition / allergic reaction",
    description: "A common skin reaction that occurs when your skin comes into contact with an irritant or allergen.",
    symptoms: ["Red, inflamed skin", "Itching or burning", "Dry, cracked skin", "Blisters in severe cases"],
    nextSteps: ["Identify and avoid triggers", "Apply cool compresses", "Use OTC hydrocortisone", "Take antihistamines"],
    urgentSigns: "Seek emergency care for difficulty breathing or facial swelling.",
    alternatives: [{ name: "Eczema", confidence: 45 }, { name: "Psoriasis", confidence: 28 }],
    disclaimer: "This AI analysis is for educational purposes only."
  },
  {
    primaryCondition: "Tension Headache",
    confidence: 82, severity: "low",
    subtitle: "Primary headache disorder",
    description: "The most common type of headache, often caused by stress or poor posture.",
    symptoms: ["Dull, aching pain", "Forehead pressure", "Neck tenderness", "Light sensitivity"],
    nextSteps: ["Practice deep breathing", "Apply heat/cold", "Take OTC pain relievers", "Improve posture"],
    urgentSigns: "Seek immediate care for sudden severe headache or fever with stiff neck.",
    alternatives: [{ name: "Migraine", confidence: 48 }, { name: "Sinus Headache", confidence: 25 }],
    disclaimer: "This AI analysis is for educational purposes only."
  },
  {
    primaryCondition: "Viral URI (Common Cold)",
    confidence: 88, severity: "medium",
    subtitle: "Viral respiratory infection",
    description: "A viral infection of your nose and throat, commonly known as a cold.",
    symptoms: ["Runny nose", "Sore throat", "Mild cough", "Low-grade fever", "Fatigue"],
    nextSteps: ["Rest and hydrate", "Use saline spray", "Take acetaminophen", "Gargle salt water"],
    urgentSigns: "Seek care for high fever >3 days or difficulty breathing.",
    alternatives: [{ name: "Influenza", confidence: 42 }, { name: "COVID-19", confidence: 28 }],
    disclaimer: "This AI analysis is for educational purposes only."
  },
  {
    primaryCondition: "Seasonal Allergies",
    confidence: 85, severity: "low",
    subtitle: "Allergic rhinitis",
    description: "An allergic response to pollen, dust, or other airborne allergens.",
    symptoms: ["Sneezing", "Itchy eyes", "Nasal congestion", "Post-nasal drip"],
    nextSteps: ["Limit outdoor exposure", "Use saline rinses", "Try OTC antihistamines", "Keep windows closed"],
    urgentSigns: "Seek emergency care for wheezing or throat swelling.",
    alternatives: [{ name: "Common Cold", confidence: 35 }, { name: "Sinus Infection", confidence: 22 }],
    disclaimer: "This AI analysis is for educational purposes only."
  },
  {
    primaryCondition: "GERD (Acid Reflux)",
    confidence: 72, severity: "medium",
    subtitle: "Digestive disorder",
    description: "Stomach acid flows back into the esophagus, causing irritation.",
    symptoms: ["Heartburn", "Chest discomfort", "Difficulty swallowing", "Regurgitation"],
    nextSteps: ["Avoid trigger foods", "Eat smaller meals", "Elevate bed head", "Try OTC antacids"],
    urgentSigns: "Seek immediate care for chest pain with arm pain or vomiting blood.",
    alternatives: [{ name: "Gastritis", confidence: 38 }, { name: "Peptic Ulcer", confidence: 25 }],
    disclaimer: "This AI analysis is for educational purposes only."
  }
];

function getMockDiagnosis(symptoms, bodyArea) {
  const s = (symptoms || '').toLowerCase();
  const b = (bodyArea || '').toLowerCase();
  if (b.includes('skin') || s.includes('rash') || s.includes('itch')) return MOCK_CONDITIONS[0];
  if (b.includes('head') || s.includes('headache')) return MOCK_CONDITIONS[1];
  if (s.includes('nose') || s.includes('sneeze') || s.includes('allerg')) return MOCK_CONDITIONS[3];
  if (s.includes('stomach') || s.includes('acid') || s.includes('heartburn')) return MOCK_CONDITIONS[4];
  return MOCK_CONDITIONS[2]; // Default: cold
}

function extractJSON(raw) {
  raw = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON found');
  raw = raw.slice(start, end + 1);
  try {
    return JSON.parse(raw);
  } catch {
    const fixed = raw.replace(/,\s*([}\]])/g, '$1').replace(/[\x00-\x1F\x7F]/g, ' ');
    try { return JSON.parse(fixed); }
    catch { throw new Error('Malformed JSON'); }
  }
}

// ============ OLLAMA (LOCAL - FREE) ============
async function analyzeWithOllama(prompt) {
  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama3.2',  // or 'phi3', 'mistral', 'gemma2'
      prompt: prompt + '\n\nRespond ONLY with valid JSON.',
      stream: false,
      options: { temperature: 0.2 }
    })
  });

  if (!response.ok) throw new Error('Ollama request failed');
  const data = await response.json();
  return extractJSON(data.response);
}

async function chatWithOllama(prompt) {
  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama3.2',
      prompt: prompt,
      stream: false,
      options: { temperature: 0.7 }
    })
  });

  if (!response.ok) throw new Error('Ollama chat failed');
  const data = await response.json();
  return data.response.trim();
}

// ============ GEMINI (FREE TIER) ============
async function analyzeWithGemini(prompt, imageBase64, imageMimeType) {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
    ]
  });

  const parts = [{ text: prompt }];
  if (imageBase64) {
    parts.push({ inlineData: { mimeType: imageMimeType || 'image/jpeg', data: imageBase64 } });
  }

  const result = await model.generateContent({ contents: [{ role: 'user', parts }] });
  return extractJSON(result.response.text());
}

async function chatWithGemini(prompt) {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: { temperature: 0.7, maxOutputTokens: 512 },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' }
    ]
  });

  const result = await model.generateContent(prompt);
  return result.response.text().trim();
}

// ============ ANALYZE ENDPOINT ============
app.post('/api/analyze', async (req, res) => {
  const { prompt, imageBase64, imageMimeType, symptoms, bodyArea } = req.body;
  const models = getModelPriority();
  const tried = [];

  for (const model of models) {
    try {
      let result;
      const start = Date.now();

      switch (model) {
        case 'ollama':
          result = await analyzeWithOllama(prompt);
          break;
        case 'gemini':
          result = await analyzeWithGemini(prompt, imageBase64, imageMimeType);
          break;
        case 'demo':
          result = getMockDiagnosis(symptoms, bodyArea);
          break;
      }

      const duration = Date.now() - start;
      console.log(`✅ Success with ${model} (${duration}ms)`);

      return res.json({
        ...result,
        modelUsed: model,
        modelsTried: tried,
        responseTimeMs: duration
      });

    } catch (error) {
      console.log(`❌ ${model} failed: ${error.message}`);
      tried.push({ model, error: error.message });

      // If quota exceeded, skip to next
      if (error.message.includes('429') || error.message.includes('quota')) {
        console.log(`   → Quota exceeded, trying next model...`);
      }
    }
  }

  res.status(500).json({ error: 'All models failed', tried });
});

// ============ CHAT ENDPOINT ============
const demoReplies = [
  "That's a great question! Most people see improvement within 3-7 days with proper self-care.",
  "Prevention is key - good hygiene, adequate sleep, and staying hydrated are your best defenses.",
  "Everyone's body is different. Monitor your symptoms and seek professional care if they worsen.",
  "Common triggers include stress and environmental factors. Keeping a journal can help identify patterns."
];

app.post('/api/chat', async (req, res) => {
  const { prompt } = req.body;
  const models = getModelPriority();

  for (const model of models) {
    try {
      let reply;

      switch (model) {
        case 'ollama':
          reply = await chatWithOllama(prompt);
          break;
        case 'gemini':
          reply = await chatWithGemini(prompt);
          break;
        case 'demo':
          reply = demoReplies[Math.floor(Math.random() * demoReplies.length)];
          break;
      }

      return res.json({ reply, modelUsed: model });
    } catch (error) {
      console.log(`Chat ${model} failed: ${error.message}`);
    }
  }

  res.json({ reply: demoReplies[0], modelUsed: 'demo' });
});

// ============ STATUS ============
app.get('/api/status', (req, res) => {
  res.json({
    models: {
      ollama: { available: ollamaAvailable, free: true },
      gemini: { available: hasGemini, free: !!process.env.GEMINI_API_KEY },
      demo: { available: true, free: true }
    },
    priority: getModelPriority()
  });
});

app.listen(3000, () => {
  console.log('');
  console.log('╔══════════════════════════════════════════════════╗');
  console.log('║     🏥 MediScan - 100% FREE AI Server            ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log('║                                                  ║');
  console.log('║  🦙 Local AI (Ollama):', ollamaAvailable ? '✅ Running' : '❌ Not started', '     ║');
  console.log('║  🔷 Gemini API:', hasGemini ? '✅ Configured' : '❌ No key', '         ║');
  console.log('║  📋 Demo Mode: ✅ Always available               ║');
  console.log('║                                                  ║');
  console.log('║  Priority: Gemini → Llama 3.2 → Demo' + ''.padEnd(17), '║');
  console.log('║                                                  ║');
  console.log('╚══════════════════════════════════════════════════╝');
  console.log('');
  console.log('To use local AI, run in another terminal:');
  console.log('  ollama run llama3.2');
  console.log('');
  console.log('Server running at: http://localhost:3000');
});
