import { Router } from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { chat } from '../lib/llm.js';
import { MEAL_PLAN_SYSTEM_PROMPT } from '../lib/prompts.js';

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

  const foodLogs = readJson('food-logs.json')
    .filter((f) => f.memberId === memberId)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 14);

  const contextText = `
Member profile:
${JSON.stringify(member, null, 2)}

Last 14 days of food logs:
${JSON.stringify(foodLogs, null, 2)}
`.trim();

  const { text, provider } = await chat({
    system: MEAL_PLAN_SYSTEM_PROMPT,
    messages: [{ role: 'user', content: contextText }],
    useCache: true,
  });

  const stripped = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  const jsonMatch = stripped.match(/\{[\s\S]*\}/);
  let plan;
  try {
    plan = JSON.parse(jsonMatch ? jsonMatch[0] : stripped);
  } catch {
    return res.status(500).json({ error: 'Failed to parse model response as JSON', raw: text.slice(0, 300) });
  }

  res.json({ plan, provider });
});

export default router;
