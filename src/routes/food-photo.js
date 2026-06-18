import { Router } from 'express';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { analyzeImage } from '../lib/llm.js';
import { FOOD_PHOTO_SYSTEM_PROMPT } from '../lib/prompts.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FOOD_FILE = join(__dirname, '..', 'data', 'food-logs.json');

const router = Router();

const VALID_MEAL_TYPES = new Set(['breakfast', 'lunch', 'dinner', 'snack']);
const VALID_MEDIA_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function today() {
  return new Date().toISOString().slice(0, 10);
}

router.post('/', async (req, res) => {
  const { memberId, mealType, imageData, mediaType } = req.body;

  if (!memberId || !mealType || !imageData || !mediaType) {
    return res.status(400).json({ error: 'Missing required fields: memberId, mealType, imageData, mediaType' });
  }
  if (!VALID_MEAL_TYPES.has(mealType)) {
    return res.status(400).json({ error: 'mealType must be breakfast, lunch, dinner, or snack' });
  }
  if (!VALID_MEDIA_TYPES.has(mediaType)) {
    return res.status(400).json({ error: 'Unsupported image format' });
  }

  let nutrition;
  try {
    const { text } = await analyzeImage({
      imageBase64: imageData,
      mediaType,
      system: FOOD_PHOTO_SYSTEM_PROMPT,
      prompt: 'Analyze this meal photo and provide a detailed nutritional breakdown.',
    });
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    nutrition = JSON.parse(jsonMatch ? jsonMatch[0] : text);
  } catch (err) {
    const isProviderError = err.message.includes('Claude provider');
    return res.status(isProviderError ? 503 : 500).json({ error: err.message });
  }

  // Persist to food-logs.json
  const date = today();
  const foodLogs = JSON.parse(readFileSync(FOOD_FILE, 'utf8'));
  const idx = foodLogs.findIndex(e => e.memberId === memberId && e.date === date);

  const mealLabel = nutrition.items.join(', ');

  if (idx >= 0) {
    if (!foodLogs[idx].meals) foodLogs[idx].meals = {};
    if (!foodLogs[idx].nutrition) foodLogs[idx].nutrition = {};
    foodLogs[idx].meals[mealType] = mealLabel;
    foodLogs[idx].nutrition[mealType] = { ...nutrition, photoAnalyzed: true };
  } else {
    const entry = {
      memberId,
      date,
      meals: { breakfast: null, lunch: null, dinner: null, [mealType]: mealLabel },
      nutrition: { [mealType]: { ...nutrition, photoAnalyzed: true } },
    };
    foodLogs.push(entry);
  }

  writeFileSync(FOOD_FILE, JSON.stringify(foodLogs, null, 2));

  res.json({ nutrition, provider: 'claude' });
});

export default router;
