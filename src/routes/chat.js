import { Router } from 'express';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { stream } from '../lib/llm.js';
import { MEMBER_CHAT_SYSTEM_PROMPT } from '../lib/prompts.js';
import { maskMessages } from '../lib/pii.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CHECK_INS_FILE = join(__dirname, '..', 'data', 'check-ins.json');

const router = Router();

function appendCheckIn(memberId, message) {
  const checkIns = JSON.parse(readFileSync(CHECK_INS_FILE, 'utf8'));
  checkIns.push({
    memberId,
    message,
    date: new Date().toISOString().slice(0, 10),
    timestamp: new Date().toISOString(),
  });
  writeFileSync(CHECK_INS_FILE, JSON.stringify(checkIns, null, 2));
}

router.post('/', async (req, res) => {
  const { messages, memberId } = req.body;

  const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
  if (memberId && lastUserMessage) {
    appendCheckIn(memberId, lastUserMessage.content);
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  try {
    for await (const chunk of stream({ system: MEMBER_CHAT_SYSTEM_PROMPT, messages: maskMessages(messages) })) {
      res.write(`data: ${JSON.stringify({ text: chunk })}\n\n`);
    }
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
  }

  res.write('data: [DONE]\n\n');
  res.end();
});

export default router;
