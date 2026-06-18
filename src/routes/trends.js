import { Router } from 'express';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const router = Router();

function readJson(file) {
  return JSON.parse(readFileSync(join(DATA_DIR, file), 'utf8'));
}

router.get('/:memberId', (req, res) => {
  const { memberId } = req.params;

  const mood = readJson('mood-checkins.json')
    .filter(c => c.memberId === memberId)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14);

  const food = readJson('food-logs.json')
    .filter(f => f.memberId === memberId)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-14);

  res.json({ mood, food });
});

export default router;
