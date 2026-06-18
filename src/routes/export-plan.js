import { Router } from 'express';
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, WidthType, AlignmentType, ShadingType, BorderStyle,
} from 'docx';

const router = Router();

const TEAL = '66C4C4';
const CHARCOAL = '3E4349';
const GRAY = '6D7680';
const WHITE = 'FFFFFF';

const noBorder = { style: BorderStyle.NONE, size: 0, color: 'auto' };
const cellBorders = { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

function heading1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 0, after: 120 },
    children: [new TextRun({ text, color: CHARCOAL, size: 36, bold: true })],
  });
}

function heading2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 360, after: 120 },
    children: [new TextRun({ text, color: TEAL, size: 28, bold: true })],
  });
}

function heading3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 80 },
    children: [new TextRun({ text, color: CHARCOAL, size: 24, bold: true })],
  });
}

function body(text) {
  return new Paragraph({
    spacing: { before: 0, after: 120 },
    children: [new TextRun({ text, color: CHARCOAL, size: 22 })],
  });
}

function bullet(text) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { before: 0, after: 80 },
    children: [new TextRun({ text, color: CHARCOAL, size: 22 })],
  });
}

function spacer() {
  return new Paragraph({ text: '' });
}

function headerCell(text) {
  return new TableCell({
    shading: { fill: TEAL, type: ShadingType.CLEAR, color: WHITE },
    borders: cellBorders,
    children: [new Paragraph({
      alignment: AlignmentType.LEFT,
      children: [new TextRun({ text, color: WHITE, bold: true, size: 18 })],
    })],
  });
}

function dataCell(text, shade = false) {
  return new TableCell({
    shading: shade ? { fill: 'F8F8F8', type: ShadingType.CLEAR } : undefined,
    borders: { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder },
    children: [new Paragraph({
      children: [new TextRun({ text: text ?? '—', color: CHARCOAL, size: 18 })],
    })],
  });
}

function mealPlanTable(days) {
  const MEAL_KEYS = ['breakfast', 'lunch', 'dinner', 'snack'];
  const MEAL_LABELS = { breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner', snack: 'Snack' };

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      headerCell(''),
      ...days.map(d => headerCell(d.day.slice(0, 3))),
    ],
  });

  const rows = MEAL_KEYS.map((key, i) =>
    new TableRow({
      children: [
        dataCell(MEAL_LABELS[key], i % 2 === 0),
        ...days.map(d => dataCell(d[key], i % 2 === 0)),
      ],
    })
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...rows],
  });
}

function moodPlanTable(days) {
  const ROW_KEYS = ['morningRoutine', 'eveningRoutine', 'focusActivity'];
  const ROW_LABELS = { morningRoutine: 'Morning', eveningRoutine: 'Evening', focusActivity: 'Activity' };

  const headerRow = new TableRow({
    tableHeader: true,
    children: [
      headerCell(''),
      ...days.map(d => headerCell(d.day.slice(0, 3))),
    ],
  });

  const rows = ROW_KEYS.map((key, i) =>
    new TableRow({
      children: [
        dataCell(ROW_LABELS[key], i % 2 === 0),
        ...days.map(d => dataCell(d[key], i % 2 === 0)),
      ],
    })
  );

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [headerRow, ...rows],
  });
}

router.post('/', async (req, res) => {
  const { memberName, clinicianName, clinicianType, brief, mealPlan, moodPlan } = req.body;
  const date = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  const children = [
    heading1('HUSK Health — Member Care Plan'),
    new Paragraph({
      spacing: { before: 0, after: 80 },
      children: [
        new TextRun({ text: `Member: `, bold: true, color: GRAY, size: 22 }),
        new TextRun({ text: memberName, color: CHARCOAL, size: 22 }),
        new TextRun({ text: `   |   Clinician: `, bold: true, color: GRAY, size: 22 }),
        new TextRun({ text: `${clinicianName} (${clinicianType})`, color: CHARCOAL, size: 22 }),
      ],
    }),
    new Paragraph({
      spacing: { before: 0, after: 240 },
      children: [
        new TextRun({ text: `Generated: `, bold: true, color: GRAY, size: 22 }),
        new TextRun({ text: date, color: CHARCOAL, size: 22 }),
      ],
    }),
  ];

  // Brief summary
  if (brief) {
    children.push(heading2('Session Brief'));
    if (brief.moodSummary) {
      children.push(heading3('Mood Trend'));
      children.push(body(brief.moodSummary));
    }
    if (brief.keyThemes?.length) {
      children.push(heading3('Key Themes'));
      brief.keyThemes.forEach(t => children.push(bullet(t)));
    }
    if (brief.dietaryPatterns?.length) {
      children.push(heading3('Dietary Patterns'));
      brief.dietaryPatterns.forEach(t => children.push(bullet(t)));
    }
    if (brief.talkingPoints?.length) {
      children.push(heading3('Talking Points'));
      brief.talkingPoints.forEach(t => children.push(bullet(t)));
    }
    if (brief.flags?.length) {
      children.push(heading3('Flags'));
      brief.flags.forEach(t => children.push(bullet(t)));
    }
  }

  // Meal plan
  if (mealPlan) {
    children.push(heading2('7-Day Meal Plan'));
    children.push(body(mealPlan.rationale));
    if (mealPlan.days?.length) {
      children.push(spacer());
      children.push(mealPlanTable(mealPlan.days));
    }
  }

  // Mood plan
  if (moodPlan) {
    children.push(heading2('Mood Enhancement Plan'));
    children.push(body(moodPlan.rationale));
    if (moodPlan.pillars?.length) {
      children.push(heading3('Focus Areas'));
      moodPlan.pillars.forEach(p => {
        children.push(new Paragraph({
          spacing: { before: 160, after: 60 },
          children: [new TextRun({ text: p.title, bold: true, color: TEAL, size: 22 })],
        }));
        children.push(body(`Goal: ${p.goal}`));
        p.dailyActions?.forEach(a => children.push(bullet(a)));
      });
    }
    if (moodPlan.days?.length) {
      children.push(heading3('Daily Schedule'));
      children.push(spacer());
      children.push(moodPlanTable(moodPlan.days));
    }
  }

  const doc = new Document({ sections: [{ children }] });
  const buffer = await Packer.toBuffer(doc);

  const filename = `${(memberName ?? 'member').replace(/\s+/g, '-')}-care-plan.docx`;
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
});

export default router;
