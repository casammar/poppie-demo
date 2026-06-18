import { Router } from 'express';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const STATS_FILE = join(__dirname, '..', 'data', 'stats.json');
const MINUTES_PER_BRIEF = 8;

export function readStats() {
  const today = new Date().toISOString().slice(0, 10);
  let stats = JSON.parse(readFileSync(STATS_FILE, 'utf8'));
  if (stats.date !== today) {
    stats = { date: today, briefsGenerated: 0 };
    writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
  }
  return stats;
}

export function incrementBriefs() {
  const stats = readStats();
  stats.briefsGenerated += 1;
  writeFileSync(STATS_FILE, JSON.stringify(stats, null, 2));
}

const router = Router();

router.get('/', (req, res) => {
  const stats = readStats();
  res.json({
    briefsGenerated: stats.briefsGenerated,
    minutesSavedToday: stats.briefsGenerated * MINUTES_PER_BRIEF,
  });
});

export default router;
