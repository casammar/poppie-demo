import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

const provider = process.env.LLM_PROVIDER ?? 'claude';
const claudeModel = process.env.CLAUDE_MODEL ?? 'claude-opus-4-5';

export async function chat({ system, messages, useCache = false, maxTokens = 1024 }) {
  if (provider === 'claude') {
    return claudeChat({ system, messages, useCache, maxTokens });
  } else {
    return localChat({ system, messages, maxTokens });
  }
}

async function claudeChat({ system, messages, useCache, maxTokens }) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemBlock = useCache
    ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
    : system;

  const response = await client.messages.create({
    model: claudeModel,
    max_tokens: maxTokens,
    system: systemBlock,
    messages,
  });

  return { text: response.content[0].text, provider: 'claude' };
}

async function localChat({ system, messages, maxTokens }) {
  const client = new OpenAI({
    baseURL: process.env.LOCAL_LLM_BASE_URL,
    apiKey: process.env.LOCAL_LLM_API_KEY ?? 'lm-studio',
  });

  const allMessages = [{ role: 'system', content: system }, ...messages];

  const response = await client.chat.completions.create({
    model: process.env.LOCAL_LLM_MODEL,
    messages: allMessages,
    max_tokens: maxTokens,
  });

  return { text: response.choices[0].message.content, provider: 'local' };
}

export async function analyzeImage({ imageBase64, mediaType, system, prompt }) {
  if (provider !== 'claude') {
    throw new Error('Image analysis requires the Claude provider (LLM_PROVIDER=claude)');
  }
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const response = await client.messages.create({
    model: claudeModel,
    max_tokens: 1024,
    system,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: imageBase64 } },
        { type: 'text', text: prompt ?? 'Analyze this meal photo.' },
      ],
    }],
  });
  return { text: response.content[0].text, provider: 'claude' };
}

export async function* stream({ system, messages }) {
  if (provider === 'claude') {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const s = client.messages.stream({
      model: claudeModel,
      max_tokens: 512,
      system,
      messages,
    });
    for await (const chunk of s) {
      if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
        yield chunk.delta.text;
      }
    }
  } else {
    const client = new OpenAI({
      baseURL: process.env.LOCAL_LLM_BASE_URL,
      apiKey: process.env.LOCAL_LLM_API_KEY ?? 'lm-studio',
    });
    const s = await client.chat.completions.create({
      model: process.env.LOCAL_LLM_MODEL,
      messages: [{ role: 'system', content: system }, ...messages],
      stream: true,
      max_tokens: 512,
    });
    for await (const chunk of s) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) yield text;
    }
  }
}
