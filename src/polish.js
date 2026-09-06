import { APB_KEYS, apbLoad } from './storage.js';

export const APB_POLISH_MODEL = 'claude-sonnet-5';
export const APB_POLISH_ENDPOINT = 'https://api.anthropic.com/v1/messages';
export const APB_POLISH_VERSION = '2023-06-01';
export const APB_POLISH_TIMEOUT_MS = 60000;

const APB_POLISH_SYSTEM = [
  'You tighten prompts. Rewrite the prompt you are given so it is clearer and more direct.',
  'Keep every XML section and every section tag exactly as it is.',
  'Keep every fact, path, command, constraint and requirement. Add nothing that is not already there.',
  'Do not answer the prompt. Return only the rewritten prompt, with no preamble and no code fence.',
].join(' ');

export function apbPolishAvailability() {
  if (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') {
    return {
      ok: false,
      reason: 'Polish needs the hosted version. Opened from a local file, the browser blocks the API call.',
    };
  }
  const settings = apbLoad(APB_KEYS.settings, {});
  if (!settings.apiKey) {
    return { ok: false, reason: 'Add an Anthropic API key in Settings to enable Polish.' };
  }
  return { ok: true, reason: '' };
}

export async function apbPolishPrompt(prompt, apiKey) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), APB_POLISH_TIMEOUT_MS);
  let response;
  try {
    response = await fetch(APB_POLISH_ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': APB_POLISH_VERSION,
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: APB_POLISH_MODEL,
        max_tokens: 2048,
        system: APB_POLISH_SYSTEM,
        messages: [{ role: 'user', content: prompt }],
      }),
      signal: controller.signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('The request timed out after 60 seconds. Your prompt is unchanged.');
    }
    throw new Error(`Could not reach the API: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const body = await response.json();
      if (body && body.error && body.error.message) detail = body.error.message;
    } catch (err) { /* keep the status line */ }
    throw new Error(detail);
  }

  const data = await response.json();
  const text = (data.content || [])
    .filter((part) => part.type === 'text')
    .map((part) => part.text)
    .join('')
    .trim();
  if (!text) throw new Error('The API returned an empty response.');
  return text;
}
