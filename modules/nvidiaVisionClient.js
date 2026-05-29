const { OpenAI } = require('openai');

/**
 * Calls the NVIDIA Nemotron‑Nano‑12B‑VL vision model.
 * It receives a text prompt and a base64‑encoded image, returns a concise
 * description of the image. The function expects the model to respond with a
 * plain text string; we wrap it in an object `{ description: string }` for
 * downstream use.
 */
async function analyzeWithNvidiaVision(prompt, imageBase64) {
  if (!process.env.VISION_API_KEY) {
    throw new Error('VISION_API_KEY not set');
  }

  const client = new OpenAI({
    apiKey: process.env.VISION_API_KEY,
    baseURL: 'https://integrate.api.nvidia.com/v1',
  });

  // Build the content array – first the textual prompt, then the image.
  const content = [{ type: 'text', text: prompt }];
  if (imageBase64) {
    content.push({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${imageBase64}` },
    });
  }

  const payload = {
    model: 'nvidia/nemotron-nano-12b-v2-vl',
    max_tokens: 4096,
    temperature: 0.2,
    messages: [
      { role: 'system', content: '/think' },
      { role: 'user', content },
    ],
  };

  const response = await client.chat.completions.create(payload);
  const text = response.choices[0].message.content;
  return { description: text.trim() };
}

module.exports = { analyzeWithNvidiaVision };
