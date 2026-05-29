import fetch from 'node-fetch';

/**
 * Calls the remote Vista3D image‑analysis service.
 * The service expects a JSON body with `prompt` and `imageBase64` fields
 * and returns a JSON diagnosis payload.
 *
 * The endpoint URL and optional bearer token are read from environment:
 *   VISTA3D_URL  – e.g. https://my‑host.runpod.io (defaults to http://localhost:5000)
 *   VISTA3D_API_KEY – optional token, sent as `Authorization: Bearer <token>`
 */
export async function analyzeWithVista3D(prompt, imageBase64) {
  const baseUrl = process.env.VISTA3D_URL || 'http://localhost:5000';
  const url = `${baseUrl.replace(/\/*$/,'')}/analyze`;
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.VISTA3D_API_KEY) {
    headers['Authorization'] = `Bearer ${process.env.VISTA3D_API_KEY}`;
  }

  const response = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ prompt, imageBase64 })
  });

  if (!response.ok) {
    const txt = await response.text();
    throw new Error(`Vista3D failed (${response.status}): ${txt}`);
  }

  // The service already returns JSON in the expected format
  const data = await response.json();
  return data;
}
