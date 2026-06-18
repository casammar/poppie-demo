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

function average(scores) {
  return scores.reduce((sum, s) => sum + s, 0) / scores.length;
}

router.get('/', (req, res) => {
  const members = readJson('members.json');
  const moodCheckins = readJson('mood-checkins.json');
  const foodLogs = readJson('food-logs.json');
  const alerts = [];

  for (const member of members) {
    const checkins = moodCheckins
      .filter((c) => c.memberId === member.id)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (checkins.length >= 10) {
      const last5 = checkins.slice(-5).map((c) => c.score);
      const prior5 = checkins.slice(-10, -5).map((c) => c.score);
      const lastAvg = average(last5);
      const priorAvg = average(prior5);
      if (lastAvg < 5 && priorAvg - lastAvg >= 3) {
        alerts.push({
          memberId: member.id,
          memberName: member.name,
          severity: 'high',
          summary: 'Mood score dropped significantly over 5 days',
          detail: `Average mood: ${lastAvg.toFixed(1)} (down from ${priorAvg.toFixed(1)}). Notes reference sleep disruption and avoidance.`,
          recommendedAction: 'Consider reaching out before next scheduled session.',
        });
      }
    }

    const logs = foodLogs
      .filter((f) => f.memberId === member.id)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(-7);
    const missedBreakfasts = logs.filter((f) => !f.meals.breakfast).length;
    if (missedBreakfasts >= 4) {
      alerts.push({
        memberId: member.id,
        memberName: member.name,
        severity: 'medium',
        summary: 'Frequently skipping breakfast',
        detail: `Missed breakfast ${missedBreakfasts} of the last 7 days.`,
        recommendedAction: 'Discuss breakfast routine and barriers at next session.',
      });
    }
  }

  res.json(alerts);
});

export default router;
