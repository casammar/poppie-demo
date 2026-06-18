import { Router } from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { chat } from '../lib/llm.js';
import { SESSION_BRIEF_SYSTEM_PROMPT } from '../lib/prompts.js';
import { redactPII } from '../lib/pii.js';
import { incrementBriefs } from './stats.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');

const router = Router();

function readJson(file) {
  return JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8'));
}

router.post('/', async (req, res) => {
  const { memberId } = req.body;
  const members = readJson('members.json');
  const member = members.find((m) => m.id === memberId);
  if (!member) return res.status(404).json({ error: 'Member not found' });

  const sessions = readJson('sessions.json')
    .filter((s) => s.memberId === memberId)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3);

  const foodLogs = readJson('food-logs.json')
    .filter((f) => f.memberId === memberId)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 14);

  const moodCheckins = readJson('mood-checkins.json')
    .filter((c) => c.memberId === memberId)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 14);

  const recentCheckIns = readJson('check-ins.json')
    .filter((c) => c.memberId === memberId)
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 20);

  const contextText = `
Member profile:
${JSON.stringify(member, null, 2)}

Last 3 session notes:
${JSON.stringify(sessions, null, 2)}

Last 14 days of food logs:
${JSON.stringify(foodLogs, null, 2)}

Last 14 days of mood check-ins:
${JSON.stringify(moodCheckins, null, 2)}

Recent messages from member's chat with Poppie (between-session check-ins):
${JSON.stringify(recentCheckIns, null, 2)}
`.trim();

  const { text, provider } = await chat({
    system: SESSION_BRIEF_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: redactPII(contextText) }],
    useCache: true,
  });

  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  const jsonMatch = stripped.match(/\{[\s\S]*\}/);
  let brief;
  try {
    brief = JSON.parse(jsonMatch ? jsonMatch[0] : stripped);
  } catch {
    return res.status(500).json({ error: 'Failed to parse model response as JSON', raw: text.slice(0, 300) });
  }

  incrementBriefs();
  res.json({ brief, provider });
});

export default router;
