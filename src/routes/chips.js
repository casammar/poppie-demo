import { Router } from 'express';
import { chat } from '../lib/llm.js';
import { maskMessages } from '../lib/pii.js';

const router = Router();

const CHIPS_PROMPT = `You generate quick-reply chip suggestions for a wellness check-in conversation.

Given the conversation so far, suggest exactly 4 short reply options the user might realistically send next.
Rules:
- Each chip must be 2–5 words
- Make them specific to what this user actually mentioned — reference their foods, feelings, activities, or patterns
- Phrase them as natural first-person fragments the user would type ("Had oatmeal", "Still stressed", "Skipped again")
- Cover a range: 2 options continuing the current topic, 1 positive/upbeat, 1 that redirects or closes off
- Return ONLY a valid JSON array of 4 strings, no markdown, no explanation`;

// Keyword-based fallback — scans recent conversation text for context
function fallbackChips(messages) {
  const recent = messages
    .slice(-6)
    .map(m => m.content.toLowerCase())
    .join(' ');

  if (/breakfast|lunch|dinner|eat|meal|food|nutrition|snack|cook/.test(recent))
    return ['Ate pretty well', 'Skipped breakfast again', 'Grabbed something quick', 'Mostly healthy today'];
  if (/sleep|rest|tired|exhausted|woke|insomnia|nap/.test(recent))
    return ['Slept well last night', 'Rough night again', 'Still feeling tired', 'More energy today'];
  if (/stress|anxi|worry|overwhelm|pressure|nervous/.test(recent))
    return ['Feeling calmer now', 'Still pretty stressed', 'Took a few breaths', 'Need to decompress'];
  if (/gym|workout|walk|exercise|run|move|active/.test(recent))
    return ['Made it to the gym', 'Rest day today', 'Went for a walk', 'Too tired to move'];
  return ['Doing pretty well', 'Could be better', 'Feeling a bit off', "That's about it"];
}

// Try to extract a JSON array from text that may have surrounding prose
function parseChips(text) {
  if (!text?.trim()) return null;
  // Direct parse first
  try { return JSON.parse(text.trim()); } catch {}
  // Pull out the first [...] block
  const match = text.match(/\[[\s\S]*?\]/);
  if (match) try { return JSON.parse(match[0]); } catch {}
  return null;
}

router.post('/', async (req, res) => {
  const { messages } = req.body;
  if (!messages?.length) return res.json({ chips: fallbackChips([]) });

  const masked = maskMessages(messages);
  try {
    const { text } = await chat({ system: CHIPS_PROMPT, messages: masked });
    const parsed = parseChips(text);
    if (Array.isArray(parsed) && parsed.length) {
      return res.json({ chips: parsed.slice(0, 4) });
    }
  } catch {}

  // LLM failed or returned nothing useful — fall back to keyword chips
  res.json({ chips: fallbackChips(masked) });
});

export default router;
