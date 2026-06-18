import { Router } from 'express';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { chat } from '../lib/llm.js';
import { EXTRACTION_SYSTEM_PROMPT } from '../lib/prompts.js';
import { maskMessages } from '../lib/pii.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const MOOD_FILE = join(__dirname, '..', 'data', 'mood-checkins.json');
const FOOD_FILE = join(__dirname, '..', 'data', 'food-logs.json');

const router = Router();

function today() {
  return new Date().toISOString().slice(0, 10);
}

function upsertMood(memberId, score, note) {
  const data = JSON.parse(readFileSync(MOOD_FILE, 'utf8'));
  const date = today();
  const idx = data.findIndex(e => e.memberId === memberId && e.date === date);
  if (idx >= 0) {
    if (score != null) data[idx].score = score;
    if (note != null) data[idx].note = note;
  } else {
    data.push({ memberId, date, score: score ?? 5, note: note ?? '' });
  }
  writeFileSync(MOOD_FILE, JSON.stringify(data, null, 2));
}

function upsertFood(memberId, { breakfast, lunch, dinner }) {
  const data = JSON.parse(readFileSync(FOOD_FILE, 'utf8'));
  const date = today();
  const idx = data.findIndex(e => e.memberId === memberId && e.date === date);
  if (idx >= 0) {
    if (breakfast != null) data[idx].meals.breakfast = breakfast;
    if (lunch != null) data[idx].meals.lunch = lunch;
    if (dinner != null) data[idx].meals.dinner = dinner;
  } else {
    data.push({ memberId, date, meals: { breakfast: breakfast ?? null, lunch: lunch ?? null, dinner: dinner ?? null } });
  }
  writeFileSync(FOOD_FILE, JSON.stringify(data, null, 2));
}

router.post('/', async (req, res) => {
  const { memberId, messages } = req.body;
  if (!memberId || !messages?.length) return res.json({ ok: false });

  try {
    const { text } = await chat({ system: EXTRACTION_SYSTEM_PROMPT, messages: maskMessages(messages) });
    const extracted = JSON.parse(text);

    if (extracted.mood) upsertMood(memberId, extracted.mood.score, extracted.mood.note);
    if (extracted.food) upsertFood(memberId, extracted.food);

    res.json({ ok: true, extracted });
  } catch (err) {
    res.json({ ok: false, error: err.message });
  }
});

export default router;
