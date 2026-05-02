const express = require('express');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const cors = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json({ limit: '20mb' }));
app.use(cors());

// Serve static files for prototypes and demos
app.use(express.static(__dirname));

// Demo mode - returns mock data when API quota exceeded
const DEMO_MODE = process.env.DEMO_MODE === 'true';

// Mock diagnosis data for demo/fallback mode
const MOCK_CONDITIONS = [
  {
    primaryCondition: "Contact Dermatitis",
    confidence: 78,
    severity: "low",
    subtitle: "Skin condition / allergic reaction",
    description: "A common skin reaction that occurs when your skin comes into contact with an irritant or allergen. The skin becomes inflamed, causing redness, itching, and sometimes blistering.",
    symptoms: ["Red, inflamed skin", "Itching or burning sensation", "Dry, cracked skin", "Blisters in severe cases"],
    nextSteps: ["Identify and avoid the triggering substance", "Apply cool, wet compresses to affected areas", "Use over-the-counter hydrocortisone cream", "Consider oral antihistamines for itching"],
    urgentSigns: "Seek emergency care if you experience difficulty breathing, swelling of face/lips, or widespread rash with fever.",
    alternatives: [
      { name: "Eczema (Atopic Dermatitis)", confidence: 45 },
      { name: "Psoriasis", confidence: 28 },
      { name: "Heat Rash", confidence: 15 }
    ],
    disclaimer: "This AI analysis is for educational purposes only and does not constitute medical advice. Please consult a licensed physician."
  },
  {
    primaryCondition: "Seasonal Allergies",
    confidence: 85,
    severity: "low",
    subtitle: "Allergic rhinitis / immune response",
    description: "An allergic response to pollen, dust, or other airborne allergens. Your immune system overreacts to these harmless substances, causing inflammation in your nasal passages and sinuses.",
    symptoms: ["Sneezing and runny nose", "Itchy, watery eyes", "Nasal congestion", "Post-nasal drip"],
    nextSteps: ["Limit outdoor exposure during high pollen days", "Use saline nasal rinses", "Try over-the-counter antihistamines", "Keep windows closed during peak pollen season"],
    urgentSigns: "Seek emergency care if you develop wheezing, shortness of breath, or facial/throat swelling.",
    alternatives: [
      { name: "Common Cold", confidence: 35 },
      { name: "Sinus Infection", confidence: 22 },
      { name: "Non-allergic Rhinitis", confidence: 12 }
    ],
    disclaimer: "This AI analysis is for educational purposes only and does not constitute medical advice. Please consult a licensed physician."
  },
  {
    primaryCondition: "Tension Headache",
    confidence: 82,
    severity: "low",
    subtitle: "Primary headache disorder",
    description: "The most common type of headache, often caused by stress, poor posture, or eye strain. It feels like a dull, aching pressure around your head.",
    symptoms: ["Dull, aching head pain", "Pressure across forehead or sides of head", "Tenderness in scalp or neck muscles", "Sensitivity to light or noise"],
    nextSteps: ["Practice stress management techniques like deep breathing", "Apply heat or cold to tense muscles", "Take over-the-counter pain relievers", "Improve posture and ergonomics"],
    urgentSigns: "Seek immediate care for sudden severe headache, headache with fever/stiff neck, or after head injury.",
    alternatives: [
      { name: "Migraine", confidence: 48 },
      { name: "Sinus Headache", confidence: 25 },
      { name: "Cluster Headache", confidence: 10 }
    ],
    disclaimer: "This AI analysis is for educational purposes only and does not constitute medical advice. Please consult a licensed physician."
  },
  {
    primaryCondition: "Mild Sunburn",
    confidence: 75,
    severity: "low",
    subtitle: "Radiation burn / skin damage",
    description: "Skin damage caused by excessive UV radiation exposure. The skin becomes red, painful, and warm to touch as your body responds to the injury.",
    symptoms: ["Red, warm skin", "Pain or tenderness", "Swelling", "Possible blistering in severe cases"],
    nextSteps: ["Get out of the sun immediately", "Apply cool, damp cloths to affected skin", "Use aloe vera gel or moisturizer", "Stay hydrated and take anti-inflammatory medication"],
    urgentSigns: "Seek medical attention for blistering sunburn, fever, confusion, or signs of dehydration.",
    alternatives: [
      { name: "Heat Rash", confidence: 30 },
      { name: "Photodermatitis", confidence: 20 },
      { name: "Cellulitis", confidence: 8 }
    ],
    disclaimer: "This AI analysis is for educational purposes only and does not constitute medical advice. Please consult a licensed physician."
  },
  {
    primaryCondition: "Viral Upper Respiratory Infection",
    confidence: 88,
    severity: "medium",
    subtitle: "Common cold / viral infection",
    description: "A viral infection of your nose and throat, commonly known as a cold. Hundreds of viruses can cause these symptoms, with rhinoviruses being most common.",
    symptoms: ["Runny or stuffy nose", "Sore throat", "Mild cough", "Low-grade fever", "Fatigue"],
    nextSteps: ["Get plenty of rest and stay hydrated", "Use saline nasal spray for congestion", "Take acetaminophen for fever/aches", "Gargle warm salt water for sore throat"],
    urgentSigns: "Seek care for high fever lasting more than 3 days, difficulty breathing, or symptoms lasting more than 10 days.",
    alternatives: [
      { name: "Influenza", confidence: 42 },
      { name: "COVID-19", confidence: 28 },
      { name: "Strep Throat", confidence: 15 }
    ],
    disclaimer: "This AI analysis is for educational purposes only and does not constitute medical advice. Please consult a licensed physician."
  },
  {
    primaryCondition: "Gastroesophageal Reflux (GERD)",
    confidence: 72,
    severity: "medium",
    subtitle: "Digestive disorder / acid reflux",
    description: "A digestive condition where stomach acid frequently flows back into the tube connecting your mouth and stomach. This backwash can irritate the lining of your esophagus.",
    symptoms: ["Heartburn after eating", "Chest pain or discomfort", "Difficulty swallowing", "Regurgitation of food or sour liquid"],
    nextSteps: ["Avoid trigger foods (spicy, fatty, acidic)", "Eat smaller meals and don't lie down after eating", "Elevate head of bed 6-8 inches", "Try over-the-counter antacids"],
    urgentSigns: "Seek immediate care for chest pain with shortness of arm pain, vomiting blood, or black tarry stools.",
    alternatives: [
      { name: "Gastritis", confidence: 38 },
      { name: "Peptic Ulcer", confidence: 25 },
      { name: "Gallbladder Issues", confidence: 12 }
    ],
    disclaimer: "This AI analysis is for educational purposes only and does not constitute medical advice. Please consult a licensed physician."
  }
];

function getMockDiagnosis(symptoms, bodyArea) {
  // Simple keyword matching to pick relevant mock condition
  const symptomLower = (symptoms || '').toLowerCase();
  const bodyLower = (bodyArea || '').toLowerCase();

  if (bodyLower.includes('skin') || symptomLower.includes('rash') || symptomLower.includes('itch') || symptomLower.includes('red')) {
    return MOCK_CONDITIONS[0]; // Contact Dermatitis
  } else if (bodyLower.includes('nose') || bodyLower.includes('throat') || symptomLower.includes('sneeze') || symptomLower.includes('allerg')) {
    return MOCK_CONDITIONS[1]; // Seasonal Allergies
  } else if (bodyLower.includes('head') || symptomLower.includes('headache') || symptomLower.includes('migraine')) {
    return MOCK_CONDITIONS[2]; // Tension Headache
  } else if (symptomLower.includes('sun') || symptomLower.includes('burn')) {
    return MOCK_CONDITIONS[3]; // Sunburn
  } else if (symptomLower.includes('stomach') || symptomLower.includes('acid') || symptomLower.includes('heartburn')) {
    return MOCK_CONDITIONS[5]; // GERD
  } else {
    return MOCK_CONDITIONS[4]; // Viral URI (default)
  }
}

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

function extractJSON(raw) {
  raw = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1) throw new Error('No JSON found in AI response');
  raw = raw.slice(start, end + 1);
  try {
    return JSON.parse(raw);
  } catch {
    const fixed = raw.replace(/,\s*([}\]])/g, '$1').replace(/[\x00-\x1F\x7F]/g, ' ');
    try { return JSON.parse(fixed); }
    catch { throw new Error('AI returned malformed JSON. Please try again.'); }
  }
}

app.post('/api/analyze', async (req, res) => {
  const { prompt, imageBase64, imageMimeType } = req.body;

  // Extract symptoms and body area from prompt for mock fallback
  const symptomMatch = prompt.match(/Patient description: "([^"]+)"/);
  const bodyMatch = prompt.match(/Body area: ([^\n]+)/);
  const symptoms = symptomMatch ? symptomMatch[1] : '';
  const bodyArea = bodyMatch ? bodyMatch[1] : '';

  try {
    // Skip API call if in demo mode
    if (DEMO_MODE) {
      console.log('Demo mode: returning mock diagnosis');
      const mockData = getMockDiagnosis(symptoms, bodyArea);
      return res.json({ ...mockData, demoMode: true });
    }

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
    const result = await model.generateContent({ contents: [{ role: 'user', parts }] });
    const raw = result.response.text();
    console.log('Analyze raw (first 300):', raw.slice(0, 300));
    res.json(extractJSON(raw));
  } catch (error) {
    console.error('Analyze error:', error.message);

    // Check if quota exceeded - fall back to mock data
    if (error.message && (error.message.includes('429') || error.message.includes('quota') || error.message.includes('exceeded'))) {
      console.log('Quota exceeded - falling back to demo mode');
      const mockData = getMockDiagnosis(symptoms, bodyArea);
      return res.json({ ...mockData, demoMode: true, fallbackReason: 'API quota exceeded - using demo data' });
    }

    res.status(500).json({ error: error.message });
  }
});

app.post('/api/chat', async (req, res) => {
  const { prompt } = req.body;

  // Demo mode responses for common questions
  const demoReplies = [
    "That's a great question! In a real scenario, this would depend on your specific symptoms and medical history. For your science fair demo, this shows how AI can provide contextual follow-up information.",
    "This condition typically responds well to rest and proper hydration. However, always consult a healthcare provider for personalized advice.",
    "Most people see improvement within 3-7 days with proper care. Monitor your symptoms and seek medical attention if they worsen.",
    "Prevention is key! Good hygiene, adequate sleep, and a balanced diet help maintain a strong immune system.",
    "Common triggers include stress, certain foods, environmental factors, and lack of sleep. Identifying your triggers is an important part of management."
  ];

  try {
    // Skip API call if in demo mode
    if (DEMO_MODE) {
      console.log('Demo mode: returning mock chat reply');
      const randomReply = demoReplies[Math.floor(Math.random() * demoReplies.length)];
      return res.json({ reply: randomReply, demoMode: true });
    }

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
    const result = await model.generateContent({ contents: [{ role: 'user', parts: [{ text: prompt }] }] });
    res.json({ reply: result.response.text().trim() });
  } catch (error) {
    console.error('Chat error:', error.message);

    // Check if quota exceeded - fall back to demo response
    if (error.message && (error.message.includes('429') || error.message.includes('quota') || error.message.includes('exceeded'))) {
      console.log('Quota exceeded - falling back to demo chat');
      const randomReply = demoReplies[Math.floor(Math.random() * demoReplies.length)];
      return res.json({ reply: randomReply + ' (Demo mode: API quota exceeded)', demoMode: true });
    }

    res.status(500).json({ error: error.message });
  }
});

// Prototype routes for body heatmap demos
app.get('/prototype-2d', (req, res) => {
  res.sendFile(__dirname + '/prototype-body-heatmap.html');
});

app.get('/prototype-3d', (req, res) => {
  res.sendFile(__dirname + '/prototype-body-heatmap-3d.html');
});

// Landing page redirect
app.get('/', (req, res) => {
  res.sendFile(__dirname + '/IIndex.html');
});

app.listen(3000, () => console.log('MediScan server running on http://localhost:3000'));