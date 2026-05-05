const express = require('express');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const Anthropic = require('@anthropic-ai/sdk');
const { OpenAI } = require('openai');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(cors());

// Serve static files from project root
const publicDir = path.join(__dirname);
app.use(express.static(publicDir));

// Request logging middleware
app.use((req, res, next) => {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

// Response cache - keyed by symptom hash, expires after 1 hour
const responseCache = new Map();
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

function getCacheKey(symptoms, bodyArea) {
  const crypto = require('crypto');
  return crypto.createHash('md5').update(`${symptoms}:${bodyArea}`).digest('hex');
}

function getCached(key) {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    responseCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCached(key, data) {
  responseCache.set(key, { data, expires: Date.now() + CACHE_TTL });
}

// Ollama runs locally on port 11434
// NOTE: Ollama is disabled on Vercel (serverless environment)
const OLLAMA_URL = 'http://localhost:11434';
let ollamaAvailable = false;

// Test if Ollama is running (disabled on Vercel)
async function checkOllama() {
  // Skip Ollama check on Vercel (serverless environment)
  if (process.env.VERCEL) {
    console.log('⚠️  Ollama check skipped on Vercel (serverless environment)');
    return;
  }

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

// Initialize all AI clients (only if API keys are available)
const genAI = process.env.GEMINI_API_KEY ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY) : null;
const anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;
const groq = process.env.GROQ_API_KEY ? new OpenAI({ apiKey: process.env.GROQ_API_KEY, baseURL: 'https://api.groq.com/openai/v1' }) : null;
const nvidia = process.env.NVIDIA_API_KEY ? new OpenAI({ apiKey: process.env.NVIDIA_API_KEY, baseURL: 'https://integrate.api.nvidia.com/v1' }) : null;

// Model priority order
const MODEL_PRIORITY = ['gemini', 'nvidia', 'groq', 'ollama', 'demo'];

// Model capabilities - which models support image input
const MODEL_CAPABILITIES = {
  gemini: { supportsImages: true },
  nvidia: { supportsImages: false },  // NVIDIA uses text-only Llama
  groq: { supportsImages: false },  // Groq uses text-only Llama
  ollama: { supportsImages: false }, // Ollama in this config is text-only
  demo: { supportsImages: false }    // Demo uses keyword matching
};

// ===== IN-MEMORY RATE LIMIT TRACKING =====
// Vercel's file system is read-only, so we use in-memory storage
// Rate limits will reset on each deployment/restart

const DAILY_LIMITS = {
  gemini: 1500,
  nvidia: 10000,
  groq: 14400,
  demo: Infinity
};

// Initialize rate limits in memory
let rateLimits = {
  resetTime: getNextMidnight(),
  gemini: 0,
  nvidia: 0,
  groq: 0,
  demo: 0
};

function getNextMidnight() {
  const nextMidnight = new Date();
  nextMidnight.setHours(24, 0, 0, 0);
  return nextMidnight.getTime();
}

function loadRateLimits() {
  // In-memory only for Vercel compatibility
  if (Date.now() > rateLimits.resetTime) {
    rateLimits = { resetTime: getNextMidnight(), gemini: 0, groq: 0, demo: 0 };
  }
  return rateLimits;
}

function saveRateLimits(limits) {
  // No-op for Vercel - in-memory only
  // Rate limits will reset on each deployment
}

function isModelAvailable(model) {
  // Ollama is always available (local, unlimited)
  if (model === 'ollama') return ollamaAvailable;

  // Roll over if the day has passed
  if (Date.now() > rateLimits.resetTime) {
    rateLimits = { resetTime: getNextMidnight(), gemini: 0, groq: 0, demo: 0 };
  }
  return rateLimits[model] < DAILY_LIMITS[model] || DAILY_LIMITS[model] === Infinity;
}

function incrementModel(model) {
  rateLimits[model]++;
}

function exhaustModel(model) {
  rateLimits[model] = DAILY_LIMITS[model];
}

// ===== MOCK DATA =====
const MOCK_CONDITIONS = [
  {
    primaryCondition: "Contact Dermatitis",
    confidence: 78, severity: "low",
    subtitle: "Skin condition / allergic reaction",
    description: "A common skin reaction that occurs when your skin comes into contact with an irritant or allergen. The skin becomes inflamed, causing redness, itching, and sometimes blistering.",
    symptoms: ["Red, inflamed skin", "Itching or burning sensation", "Dry, cracked skin", "Blisters in severe cases"],
    nextSteps: ["Identify and avoid the triggering substance", "Apply cool, wet compresses to affected areas", "Use over-the-counter hydrocortisone cream", "Consider oral antihistamines for itching"],
    urgentSigns: "Seek emergency care if you experience difficulty breathing, swelling of face/lips, or widespread rash with fever.",
    alternatives: [{ name: "Eczema (Atopic Dermatitis)", confidence: 45 }, { name: "Psoriasis", confidence: 28 }, { name: "Heat Rash", confidence: 15 }],
    disclaimer: "This AI analysis is for educational purposes only and does not constitute medical advice. Please consult a licensed physician."
  },
  {
    primaryCondition: "Seasonal Allergies",
    confidence: 85, severity: "low",
    subtitle: "Allergic rhinitis / immune response",
    description: "An allergic response to pollen, dust, or other airborne allergens. Your immune system overreacts to these harmless substances, causing inflammation in your nasal passages and sinuses.",
    symptoms: ["Sneezing and runny nose", "Itchy, watery eyes", "Nasal congestion", "Post-nasal drip"],
    nextSteps: ["Limit outdoor exposure during high pollen days", "Use saline nasal rinses", "Try over-the-counter antihistamines", "Keep windows closed during peak pollen season"],
    urgentSigns: "Seek emergency care if you develop wheezing, shortness of breath, or facial/throat swelling.",
    alternatives: [{ name: "Common Cold", confidence: 35 }, { name: "Sinus Infection", confidence: 22 }, { name: "Non-allergic Rhinitis", confidence: 12 }],
    disclaimer: "This AI analysis is for educational purposes only and does not constitute medical advice. Please consult a licensed physician."
  },
  {
    primaryCondition: "Tension Headache",
    confidence: 82, severity: "low",
    subtitle: "Primary headache disorder",
    description: "The most common type of headache, often caused by stress, poor posture, or eye strain.",
    symptoms: ["Dull, aching head pain", "Pressure across forehead or sides of head", "Tenderness in scalp or neck muscles", "Sensitivity to light or noise"],
    nextSteps: ["Practice stress management techniques like deep breathing", "Apply heat or cold to tense muscles", "Take over-the-counter pain relievers", "Improve posture and ergonomics"],
    urgentSigns: "Seek immediate care for sudden severe headache, headache with fever/stiff neck, or after head injury.",
    alternatives: [{ name: "Migraine", confidence: 48 }, { name: "Sinus Headache", confidence: 25 }, { name: "Cluster Headache", confidence: 10 }],
    disclaimer: "This AI analysis is for educational purposes only and does not constitute medical advice. Please consult a licensed physician."
  },
  {
    primaryCondition: "Viral Upper Respiratory Infection",
    confidence: 88, severity: "medium",
    subtitle: "Common cold / viral infection",
    description: "A viral infection of your nose and throat, commonly known as a cold. Hundreds of viruses can cause these symptoms, with rhinoviruses being most common.",
    symptoms: ["Runny or stuffy nose", "Sore throat", "Mild cough", "Low-grade fever", "Fatigue"],
    nextSteps: ["Get plenty of rest and stay hydrated", "Use saline nasal spray for congestion", "Take acetaminophen for fever/aches", "Gargle warm salt water for sore throat"],
    urgentSigns: "Seek care for high fever lasting more than 3 days, difficulty breathing, or symptoms lasting more than 10 days.",
    alternatives: [{ name: "Influenza", confidence: 42 }, { name: "COVID-19", confidence: 28 }, { name: "Strep Throat", confidence: 15 }],
    disclaimer: "This AI analysis is for educational purposes only and does not constitute medical advice. Please consult a licensed physician."
  },
  {
    primaryCondition: "Gastroesophageal Reflux (GERD)",
    confidence: 72, severity: "medium",
    subtitle: "Digestive disorder / acid reflux",
    description: "A digestive condition where stomach acid frequently flows back into the tube connecting your mouth and stomach.",
    symptoms: ["Heartburn after eating", "Chest pain or discomfort", "Difficulty swallowing", "Regurgitation of food or sour liquid"],
    nextSteps: ["Avoid trigger foods (spicy, fatty, acidic)", "Eat smaller meals and don't lie down after eating", "Elevate head of bed 6-8 inches", "Try over-the-counter antacids"],
    urgentSigns: "Seek immediate care for chest pain with arm pain, vomiting blood, or black tarry stools.",
    alternatives: [{ name: "Gastritis", confidence: 38 }, { name: "Peptic Ulcer", confidence: 25 }, { name: "Gallbladder Issues", confidence: 12 }],
    disclaimer: "This AI analysis is for educational purposes only and does not constitute medical advice. Please consult a licensed physician."
  },
  {
    primaryCondition: "Conjunctivitis (Pink Eye)",
    confidence: 80, severity: "low",
    subtitle: "Eye infection / inflammation",
    description: "Inflammation of the conjunctiva, the thin clear tissue that lies over the white part of the eye and lines the inside of the eyelid.",
    symptoms: ["Red or pink eye color", "Itching or burning sensation", "Watery or thick discharge", "Sensitivity to light"],
    nextSteps: ["Avoid touching or rubbing eyes", "Use warm compresses to loosen crust", "Artificial tears for comfort", "Practice good hand hygiene"],
    urgentSigns: "Seek immediate care for eye pain, vision changes, or severe sensitivity to light.",
    alternatives: [{ name: "Dry Eye Syndrome", confidence: 35 }, { name: "Allergic Eye Reaction", confidence: 28 }, { name: "Corneal Abrasion", confidence: 8 }],
    disclaimer: "This AI analysis is for educational purposes only and does not constitute medical advice. Please consult a licensed physician."
  },
  {
    primaryCondition: "Anxiety Attack (Panic Attack)",
    confidence: 76, severity: "medium",
    subtitle: "Mental health / anxiety disorder",
    description: "A sudden episode of intense fear that triggers severe physical reactions when there is no real danger or apparent cause.",
    symptoms: ["Rapid heart rate", "Sweating and trembling", "Shortness of breath", "Chest pain or tightness", "Fear of losing control"],
    nextSteps: ["Practice deep breathing (4-7-8 technique)", "Ground yourself with 5-4-3-2-1 technique", "Find a quiet space to rest", "Consider therapy or counseling"],
    urgentSigns: "Call emergency services if chest pain is severe, or if this is your first episode and you're unsure it's anxiety.",
    alternatives: [{ name: "Hyperventilation Syndrome", confidence: 42 }, { name: "Heart Arrhythmia", confidence: 18 }, { name: "Thyroid Issue", confidence: 12 }],
    disclaimer: "This AI analysis is for educational purposes only and does not constitute medical advice. Please consult a licensed physician."
  }
];

function getMockDiagnosis(symptoms, bodyArea) {
  const s = (symptoms || '').toLowerCase();
  const b = (bodyArea || '').toLowerCase();
  if (b.includes('eye') || s.includes('eye')) return MOCK_CONDITIONS[5];
  if (b.includes('skin') || s.includes('rash') || s.includes('itch')) return MOCK_CONDITIONS[0];
  if (b.includes('nose') || b.includes('throat') || s.includes('sneeze')) return MOCK_CONDITIONS[1];
  if (b.includes('head') || s.includes('headache') || s.includes('migraine')) return MOCK_CONDITIONS[2];
  if (b.includes('chest') || s.includes('heart') || s.includes('anxiety') || s.includes('panic')) return MOCK_CONDITIONS[6];
  if (s.includes('stomach') || s.includes('acid') || s.includes('heartburn')) return MOCK_CONDITIONS[4];
  return MOCK_CONDITIONS[3];
}

function extractJSON(raw) {
  // Remove markdown code blocks
  raw = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

  // Find JSON boundaries
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');

  if (start === -1 || end === -1) {
    console.error('No JSON found in response:', raw.slice(0, 200));
    throw new Error('No JSON found in AI response');
  }

  raw = raw.slice(start, end + 1);

  try {
    return JSON.parse(raw);
  } catch (e) {
    // Try fixing common JSON issues
    const fixed = raw
      .replace(/,\s*([}\]])/g, '$1')  // Remove trailing commas
      .replace(/[\x00-\x1F\x7F]/g, ' ')  // Remove control characters
      .replace(/'/g, '"');  // Replace single quotes

    try {
      return JSON.parse(fixed);
    } catch {
      console.error('JSON parse failed:', e.message);
      console.error('Raw response:', raw.slice(0, 500));
      throw new Error('AI returned malformed JSON. Please try again.');
    }
  }
}

// ===== OLLAMA (Secondary - Local, Free) - text only =====
async function analyzeWithOllama(prompt) {
  if (!ollamaAvailable) throw new Error('Ollama not available');

  // Enhanced system prompt for Ollama to ensure proper JSON output
  const systemPrompt = `You are a medical AI assistant. You MUST respond with ONLY a valid JSON object matching this exact structure:
{
  "primaryCondition": "string - the main condition name",
  "confidence": number between 55-92,
  "severity": "low" | "medium" | "high",
  "subtitle": "string - brief medical category",
  "description": "string - 2-3 sentences explaining the condition",
  "symptoms": ["array", "of", "symptoms"],
  "nextSteps": ["array", "of", "recommendations"],
  "urgentSigns": "string - when to seek emergency care",
  "alternatives": [
    {"name": "string", "confidence": number},
    {"name": "string", "confidence": number},
    {"name": "string", "confidence": number}
  ],
  "disclaimer": "This AI analysis is for educational purposes only and does not constitute medical advice. Please consult a licensed physician."
}

Rules:
- Respond ONLY with the JSON object
- NO markdown, NO backticks, NO explanations
- severity MUST be exactly: low, medium, or high
- confidence MUST be a number between 55-92`;

  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'llama3.2',
      prompt: systemPrompt + '\n\n' + prompt + '\n\nRemember: Respond ONLY with valid JSON, no markdown, no backticks.',
      stream: false,
      options: { temperature: 0.2, num_predict: 2048 }
    })
  });
  if (!response.ok) throw new Error('Ollama request failed');
  const data = await response.json();

  // Try to extract and validate JSON
  try {
    const result = extractJSON(data.response);
    // Validate required fields
    if (!result.primaryCondition || !result.severity) {
      throw new Error('Ollama response missing required fields');
    }
    // Ensure severity is valid
    if (!['low', 'medium', 'high'].includes(result.severity)) {
      result.severity = 'medium';
    }
    return result;
  } catch (e) {
    console.log('Ollama returned invalid JSON, falling back to demo data');
    throw new Error('Ollama JSON parse failed: ' + e.message);
  }
}

async function chatWithOllama(prompt) {
  if (!ollamaAvailable) throw new Error('Ollama not available');
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

// ===== GEMINI (Primary) - supports images =====
async function analyzeWithGemini(prompt, imageBase64, imageMimeType) {
  if (!genAI) throw new Error('Gemini not configured');

  // DEBUG: Log request details
  console.log('Gemini Request:', {
    model: 'gemini-2.0-flash',
    hasImage: !!imageBase64,
    promptLength: prompt?.length
  });

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
  if (imageBase64) parts.push({ inlineData: { mimeType: imageMimeType || 'image/jpeg', data: imageBase64 } });

  try {
    const result = await model.generateContent({ contents: [{ role: 'user', parts }] });
    const responseText = result.response.text();
    console.log('Gemini Response preview:', responseText.slice(0, 100));
    return extractJSON(responseText);
  } catch (error) {
    console.error('Gemini Error Details:', {
      message: error.message,
      status: error.status,
      details: error.cause
    });
    throw error;
  }
}

// ===== CLAUDE (Secondary) - supports images via base64 =====
async function analyzeWithClaude(prompt, imageBase64, imageMimeType) {
  if (!anthropic) throw new Error('Claude not configured');
  const content = [];

  if (imageBase64) {
    content.push({
      type: 'image',
      source: {
        type: 'base64',
        media_type: imageMimeType || 'image/jpeg',
        data: imageBase64
      }
    });
  }

  content.push({
    type: 'text',
    text: prompt + '\n\nRespond ONLY with valid JSON. No markdown, no backticks, no explanations.'
  });

  const response = await anthropic.messages.create({
    model: 'claude-3-5-haiku-20241022',
    max_tokens: 4096,
    messages: [{ role: 'user', content }]
  });

  return extractJSON(response.content[0].text);
}

// ===== OPENAI (Tertiary) - supports images via base64 =====
async function analyzeWithOpenAI(prompt, imageBase64, imageMimeType) {
  if (!openai) throw new Error('OpenAI not configured');
  const userContent = [];

  if (imageBase64) {
    userContent.push({
      type: 'image_url',
      image_url: { url: `data:${imageMimeType || 'image/jpeg'};base64,${imageBase64}` }
    });
  }

  userContent.push({ type: 'text', text: prompt });

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    temperature: 0.2,
    max_tokens: 4096,
    messages: [
      { role: 'system', content: 'You are a medical AI assistant. Respond ONLY with valid JSON. No markdown formatting, no backticks, no explanations.' },
      { role: 'user', content: userContent }
    ]
  });

  return extractJSON(response.choices[0].message.content);
}

// ===== GROQ (Secondary) - fast, cheap, no images =====
async function analyzeWithGroq(prompt) {
  if (!groq) throw new Error('Groq not configured');

  // DEBUG: Log request details
  console.log('Groq Request:', {
    model: 'llama-3.3-70b-versatile',
    promptLength: prompt?.length
  });

  try {
    const response = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      temperature: 0.2,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: 'You are a medical AI assistant. Respond ONLY with valid JSON. No markdown formatting, no backticks, no explanations.' },
        { role: 'user', content: prompt }
      ]
    });

    const responseText = response.choices[0].message.content;
    console.log('Groq Response preview:', responseText.slice(0, 100));

    return extractJSON(responseText);
  } catch (error) {
    console.error('Groq Error Details:', {
      message: error.message,
      status: error.status,
      details: error.cause
    });
    throw error;
  }
}

// ===== NVIDIA (Secondary) - fast, powerful, no images =====
async function analyzeWithNvidia(prompt) {
  if (!nvidia) throw new Error('NVIDIA not configured');

  // DEBUG: Log request details
  console.log('NVIDIA Request:', {
    model: 'meta/llama-3.1-405b-instruct',
    promptLength: prompt?.length
  });

  try {
    const response = await nvidia.chat.completions.create({
      model: 'meta/llama-3.1-405b-instruct',
      temperature: 0.2,
      max_tokens: 4096,
      messages: [
        { role: 'system', content: 'You are a medical AI assistant. Respond ONLY with valid JSON. No markdown formatting, no backticks, no explanations.' },
        { role: 'user', content: prompt }
      ]
    });

    const responseText = response.choices[0].message.content;
    console.log('NVIDIA Response preview:', responseText.slice(0, 100));

    return extractJSON(responseText);
  } catch (error) {
    console.error('NVIDIA Error Details:', {
      message: error.message,
      status: error.status,
      details: error.cause
    });
    throw error;
  }
}

// ===== FACILITY RECOMMENDATION =====
function recommendFacilities(severity, condition) {
  // Load hospital data
  let hospitals = [];
  try {
    const hospitalData = fs.readFileSync(path.join(__dirname, 'hospitals-gondar.json'), 'utf8');
    hospitals = JSON.parse(hospitalData);
  } catch (error) {
    console.error('Failed to load hospital data:', error);
    return [];
  }

  // Filter and rank facilities based on severity and condition
  const severityPriority = {
    high: ['hospital', 'health_center', 'clinic', 'pharmacy'],
    medium: ['health_center', 'hospital', 'clinic', 'pharmacy'],
    low: ['clinic', 'health_center', 'hospital', 'pharmacy']
  };

  const priorityOrder = severityPriority[severity] || severityPriority.low;

  // Sort hospitals by priority and 24/7 availability
  const sorted = hospitals.sort((a, b) => {
    const aPriority = priorityOrder.indexOf(a.type);
    const bPriority = priorityOrder.indexOf(b.type);
    if (aPriority !== bPriority) return aPriority - bPriority;

    // Prioritize 24/7 facilities
    const a247 = a.hours === '24/7';
    const b247 = b.hours === '24/7';
    if (a247 && !b247) return -1;
    if (!a247 && b247) return 1;

    return 0;
  });

  // Return top 3 recommendations
  return sorted.slice(0, 3).map(h => ({
    name: h.name,
    type: h.type,
    address: h.address,
    phone: h.phone,
    hours: h.hours,
    specialties: h.specialties,
    lat: h.lat,
    lng: h.lng
  }));
}

// ===== MAIN ANALYZE ENDPOINT =====
app.post('/api/analyze', async (req, res) => {
  const { prompt, imageBase64, imageMimeType, symptoms, bodyArea } = req.body;

  // Check cache first (skip for images)
  if (!imageBase64 && symptoms) {
    const cacheKey = getCacheKey(symptoms, bodyArea);
    const cached = getCached(cacheKey);
    if (cached) {
      console.log('✅ Cache hit for:', symptoms.slice(0, 30) + '...');
      return res.json({ ...cached, cached: true });
    }
  }

  const usedModels = [];
  let lastError = null;

  for (const modelName of MODEL_PRIORITY) {
    // Skip if rate limited
    if (modelName !== 'demo' && !isModelAvailable(modelName)) {
      console.log(`${modelName} rate limited, skipping...`);
      continue;
    }

    // Skip text-only models when an image is provided (they can't see the image)
    // BUT: if we have an image, also extract text from symptoms for text-only models
    if (imageBase64 && MODEL_CAPABILITIES[modelName]?.supportsImages === false) {
      // Only skip if no symptoms text provided - if symptoms exist, text-only models can still help
      if (!symptoms || !symptoms.trim()) {
        console.log(`${modelName} does not support images and no symptoms text, skipping...`);
        continue;
      }
      // If symptoms text exists, text-only models can analyze based on that
    }

    try {
      let result;
      const startTime = Date.now();

      switch (modelName) {
        case 'gemini':
          if (!process.env.GEMINI_API_KEY) continue;
          result = await analyzeWithGemini(prompt, imageBase64, imageMimeType);
          incrementModel('gemini');
          break;
        case 'nvidia':
          if (!process.env.NVIDIA_API_KEY) continue;
          result = await analyzeWithNvidia(prompt);
          incrementModel('nvidia');
          break;
        case 'groq':
          if (!process.env.GROQ_API_KEY) continue;
          result = await analyzeWithGroq(prompt);
          incrementModel('groq');
          break;
        case 'ollama':
          if (!ollamaAvailable) continue;
          result = await analyzeWithOllama(prompt);
          break;
        case 'demo':
          console.log('Using demo/mock diagnosis as fallback');
          result = getMockDiagnosis(symptoms, bodyArea);
          // Don't increment demo counter (it's unlimited)
          break;
      }

      const duration = Date.now() - startTime;
      console.log(`✅ Used ${modelName} (${duration}ms)`);

      // Add facility recommendations
      const recommendedFacilities = recommendFacilities(result.severity, result.primaryCondition);

      const response = {
        ...result,
        modelUsed: modelName,
        modelsAttempted: usedModels,
        responseTimeMs: duration,
        demoMode: modelName === 'demo',
        recommendedFacilities: recommendedFacilities
      };

      // Cache the response (skip for demo with images)
      if (!imageBase64 && symptoms) {
        setCached(getCacheKey(symptoms, bodyArea), response);
      }

      return res.json(response);

    } catch (error) {
      console.error(`❌ ${modelName} failed:`, error.message);
      usedModels.push({ model: modelName, error: error.message });
      lastError = error;
      if (error.message && (error.message.includes('429') || error.message.includes('quota'))) {
        exhaustModel(modelName);
      }
      continue;
    }
  }

  // Final fallback: if all AI models failed, use demo mode
  console.log('All AI models failed, using demo mode as final fallback');
  const demoResult = getMockDiagnosis(symptoms, bodyArea);
  const recommendedFacilities = recommendFacilities(demoResult.severity, demoResult.primaryCondition);
  res.json({
    ...demoResult,
    modelUsed: 'demo',
    modelsAttempted: usedModels,
    responseTimeMs: 0,
    demoMode: true,
    fallbackReason: 'All AI models unavailable, using demo data',
    recommendedFacilities: recommendedFacilities
  });
});

// ===== CHAT ENDPOINT =====
const demoReplies = [
  "That's a great question! In general, this condition responds well to rest and proper self-care. However, everyone's body is different.",
  "Most people see improvement within 3-7 days. Make sure to monitor your symptoms and seek professional care if they worsen.",
  "Prevention is really important! Good hygiene, adequate sleep, and staying hydrated are your best defenses.",
  "Common triggers include stress, certain foods, and environmental factors. Keeping a symptom journal can help identify patterns.",
  "While this is usually manageable at home, don't hesitate to consult a healthcare provider if you're concerned."
];

app.post('/api/chat', async (req, res) => {
  const { prompt } = req.body;

  // Try Gemini first for chat
  if (process.env.GEMINI_API_KEY && isModelAvailable('gemini')) {
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash', generationConfig: { temperature: 0.7, maxOutputTokens: 512 } });
      const result = await model.generateContent(prompt);
      incrementModel('gemini');
      return res.json({ reply: result.response.text().trim(), modelUsed: 'gemini' });
    } catch (error) {
      console.log('Gemini chat failed:', error.message);
      if (error.message && (error.message.includes('429') || error.message.includes('quota'))) exhaustModel('gemini');
    }
  }

  // Try Groq (fast fallback)
  if (process.env.GROQ_API_KEY && isModelAvailable('groq')) {
    try {
      const response = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.7,
        max_tokens: 512,
        messages: [
          { role: 'system', content: 'You are a helpful medical AI assistant. Be concise and encouraging.' },
          { role: 'user', content: prompt }
        ]
      });
      incrementModel('groq');
      return res.json({ reply: response.choices[0].message.content.trim(), modelUsed: 'groq' });
    } catch (error) {
      console.log('Groq chat failed:', error.message);
      if (error.message && (error.message.includes('429') || error.message.includes('quota'))) exhaustModel('groq');
    }
  }

  // Try Ollama (local, free)
  if (ollamaAvailable) {
    try {
      const reply = await chatWithOllama(prompt);
      return res.json({ reply, modelUsed: 'ollama' });
    } catch (error) {
      console.log('Ollama chat failed:', error.message);
    }
  }

  const randomReply = demoReplies[Math.floor(Math.random() * demoReplies.length)];
  res.json({ reply: randomReply, modelUsed: 'demo' });
});

// ===== ROOT ROUTE - Serve main HTML file =====
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'IIndex.html'));
});

// ===== HEALTH CHECK =====
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: '2.1.0'
  });
});

// ===== STATUS ENDPOINT =====
app.get('/api/status', (req, res) => {
  res.json({
    models: {
      gemini: {
        available: isModelAvailable('gemini'),
        usedToday: rateLimits.gemini,
        dailyLimit: DAILY_LIMITS.gemini,
        hasKey: !!process.env.GEMINI_API_KEY,
        supportsImages: true
      },
      nvidia: {
        available: isModelAvailable('nvidia'),
        usedToday: rateLimits.nvidia,
        dailyLimit: DAILY_LIMITS.nvidia,
        hasKey: !!process.env.NVIDIA_API_KEY,
        supportsImages: false
      },
      groq: {
        available: isModelAvailable('groq'),
        usedToday: rateLimits.groq,
        dailyLimit: DAILY_LIMITS.groq,
        hasKey: !!process.env.GROQ_API_KEY,
        supportsImages: false
      },
      ollama: {
        available: ollamaAvailable,
        usedToday: 0,
        dailyLimit: 'unlimited',
        hasKey: ollamaAvailable,
        supportsImages: false
      },
      // Include these for frontend compatibility (not configured in this server)
      claude: { available: false, supportsImages: true },
      openai: { available: false, supportsImages: true }
    },
    rateLimitResetsAt: new Date(rateLimits.resetTime).toISOString(),
    demoMode: !process.env.GEMINI_API_KEY && !ollamaAvailable && !process.env.GROQ_API_KEY && !process.env.NVIDIA_API_KEY
  });
});

app.listen(process.env.PORT || 3000, () => {
  console.log('');
  console.log('🚀 MediScan Multi-Model Server running on http://localhost:' + (process.env.PORT || 3000));
  console.log('📊 Model priority:', MODEL_PRIORITY.join(' → '));
  console.log('');
  console.log('API Keys configured:');
  console.log('  Gemini:', process.env.GEMINI_API_KEY ? '✅' : '❌');
  console.log('  Groq:', process.env.GROQ_API_KEY ? '✅' : '❌');
  console.log('');
  console.log('Rate limits loaded. Resets at:', new Date(rateLimits.resetTime).toLocaleString());
});