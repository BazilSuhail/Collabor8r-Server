import { env } from '../../config/env.js';
import { ApiError } from '../../utils/http.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const TIMEOUT_MS = 30000;

export function isAiConfigured() {
  return Boolean(env.groqApiKey);
}

// Single entry point for model calls. Prompt text is never logged or stored here.
export async function generateText({ system, user, maxTokens = 1024 }) {
  if (!isAiConfigured()) throw new ApiError(503, 'AI not configured');
  let res;
  try {
    res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.groqApiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.aiModel,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new ApiError(502, 'AI provider error');
  }
  if (res.status === 429) throw new ApiError(429, 'AI rate limit reached');
  if (!res.ok) throw new ApiError(502, 'AI provider error');
  const body = await res.json();
  const text = body.choices?.[0]?.message?.content ?? '';
  return { text, inputTokens: body.usage?.prompt_tokens ?? 0, outputTokens: body.usage?.completion_tokens ?? 0 };
}
