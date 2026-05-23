const dotenv = require('dotenv');
dotenv.config();

const PROVIDERS = {
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    model: 'openai/gpt-oss-120b',
    apiKey: () => process.env.GROQ_API_KEY,
  },
  openai: {
    url: 'https://api.openai.com/v1/chat/completions',
    model: 'gpt-4o-mini',
    apiKey: () => process.env.OPENAI_API_KEY,
  },
};

const defaultOptions = {
  provider: 'groq',
  temperature: 0.3,
  maxTokens: 1000,
  systemPrompt: 'You are a helpful assistant.',
  format: 'text',
};

async function promptLLM(prompt, options = {}) {
  const config = { ...defaultOptions, ...options };
  const provider = PROVIDERS[config.provider];
  if (!provider) throw new Error(`Unknown provider: ${config.provider}`);

  const apiKey = provider.apiKey();
  if (!apiKey) throw new Error(`Missing API key for provider: ${config.provider}`);

  const body = {
    model: provider.model,
    messages: [
      { role: 'system', content: config.systemPrompt },
      { role: 'user', content: prompt },
    ],
    temperature: config.temperature,
    max_tokens: config.maxTokens,
  };

  if (config.format === 'json') {
    body.response_format = { type: 'json_object' };
  }

  const response = await fetch(provider.url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(`LLM API error (${response.status}): ${JSON.stringify(errorData)}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content;

  if (config.format === 'json') {
    try {
      return JSON.parse(content);
    } catch {
      return content;
    }
  }

  return content;
}

async function promptLLMStructured(prompt, schemaDescription, options = {}) {
  const systemPrompt = [
    'You are a structured data extraction assistant.',
    'Respond only with valid JSON matching the schema below.',
    'Do not include markdown code blocks or extra text.',
    '',
    `Schema: ${schemaDescription}`,
  ].join('\n');

  const result = await promptLLM(prompt, {
    ...options,
    systemPrompt,
    format: 'json',
  });

  if (typeof result === 'string') {
    try {
      return JSON.parse(result);
    } catch {
      throw new Error('LLM returned invalid JSON');
    }
  }

  return result;
}

module.exports = { promptLLM, promptLLMStructured };
