import { Router } from 'express';
import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, '..', 'data', 'sessions.json');

const router = Router();

function readSessions() {
  return JSON.parse(readFileSync(DATA_FILE, 'utf8'));
}

function writeSessions(data) {
  writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

router.get('/:memberId', (req, res) => {
  const sessions = readSessions()
    .filter((s) => s.memberId === req.params.memberId)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);
  res.json({ sessions });
});

router.post('/', (req, res) => {
  const { memberId, note } = req.body;
  if (!memberId || !note?.trim()) {
    return res.status(400).json({ error: 'memberId and note are required' });
  }

  const today = new Date().toISOString().slice(0, 10);
  const session = { memberId, date: today, note: note.trim() };

  const all = readSessions();
  all.push(session);
  writeSessions(all);

  res.json({ session });
});

export default router;
