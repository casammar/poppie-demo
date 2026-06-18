import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import briefRouter from './src/routes/brief.js';
import chatRouter from './src/routes/chat.js';
import alertsRouter from './src/routes/alerts.js';
import extractRouter from './src/routes/extract.js';
import trendsRouter from './src/routes/trends.js';
import chipsRouter from './src/routes/chips.js';
import foodPhotoRouter from './src/routes/food-photo.js';
import mealPlanRouter from './src/routes/meal-plan.js';
import moodPlanRouter from './src/routes/mood-plan.js';
import exportPlanRouter from './src/routes/export-plan.js';
import statsRouter from './src/routes/stats.js';
import sessionsRouter from './src/routes/sessions.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json({ limit: '10mb' }));
app.use(express.static(join(__dirname, 'public')));

app.use('/api/brief', briefRouter);
app.use('/api/chat', chatRouter);
app.use('/api/alerts', alertsRouter);
app.use('/api/extract', extractRouter);
app.use('/api/trends', trendsRouter);
app.use('/api/chips', chipsRouter);
app.use('/api/food-photo', foodPhotoRouter);
app.use('/api/meal-plan', mealPlanRouter);
app.use('/api/mood-plan', moodPlanRouter);
app.use('/api/export-plan', exportPlanRouter);
app.use('/api/stats', statsRouter);
app.use('/api/sessions', sessionsRouter);

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => console.log(`Poppie running at http://localhost:${PORT}`));
