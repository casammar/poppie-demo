# Poppie Demo — CLAUDE.md

## Project Overview

Build a Node/Express demo app called "Poppie" — an AI clinical intelligence layer for HUSK. The app demonstrates how AI expands clinician capacity without adding headcount. It has two views (clinician and member) powered by either the Claude API (with prompt caching) or a local LLM via LM Studio, switchable via an environment variable.

This is a live demo for a 15-minute panel presentation. Prioritize a clear, polished demo flow over completeness. Use mock data throughout — no real backend or database needed.

---

## Tech Stack

- **Runtime**: Node 18+ ESM (`"type": "module"` in package.json)
- **Server**: Express 4
- **LLM (cloud)**: Anthropic SDK (`@anthropic-ai/sdk`) with prompt caching
- **LLM (local)**: OpenAI SDK (`openai`) pointed at LM Studio (`http://localhost:1234/v1`)
- **Frontend**: Vanilla HTML + JavaScript (no framework)
- **Styling**: Tailwind CSS via CDN
- **Markdown rendering**: marked via CDN
- **Storage**: Flat JSON files (no database)

---

## Environment Variables

Create `.env`:

```
# Switch between "claude" and "local"
LLM_PROVIDER=claude

# Claude API (used when LLM_PROVIDER=claude)
ANTHROPIC_API_KEY=sk-ant-...

# LM Studio (used when LLM_PROVIDER=local)
LOCAL_LLM_BASE_URL=http://localhost:1234/v1
LOCAL_LLM_MODEL=lmstudio-community/meta-llama-3.1-8b-instruct
LOCAL_LLM_API_KEY=lm-studio

PORT=3000
```

Also create `.env.example` with the same keys but empty/placeholder values.

---

## File Structure

```
poppie-demo/
├── .env
├── .env.example
├── CLAUDE.md
├── package.json              # "type": "module"; deps: express, @anthropic-ai/sdk, openai, dotenv
├── server.js                 # Express entry point
├── src/
│   ├── lib/
│   │   ├── llm.js            # LLM abstraction layer
│   │   └── prompts.js        # All system prompts as exported constants
│   ├── routes/
│   │   ├── brief.js          # POST /api/brief
│   │   ├── chat.js           # POST /api/chat (SSE streaming)
│   │   └── alerts.js         # GET /api/alerts
│   └── data/
│       ├── members.json
│       ├── sessions.json
│       ├── food-logs.json
│       └── mood-checkins.json
└── public/
    ├── index.html            # Home — two CTA buttons
    ├── clinician.html        # Clinician dashboard
    ├── member.html           # Member chat/check-in
    └── js/
        ├── clinician.js      # Clinician dashboard logic
        └── member.js         # Member chat logic
```

---

## package.json

```json
{
  "name": "poppie-demo",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "node server.js",
    "dev": "node --watch server.js"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.24.0",
    "dotenv": "^16.0.0",
    "express": "^4.19.0",
    "openai": "^4.47.0"
  }
}
```

---

## server.js

```js
import 'dotenv/config';
import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import briefRouter from './src/routes/brief.js';
import chatRouter from './src/routes/chat.js';
import alertsRouter from './src/routes/alerts.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.use(express.json());
app.use(express.static(join(__dirname, 'public')));

app.use('/api/brief', briefRouter);
app.use('/api/chat', chatRouter);
app.use('/api/alerts', alertsRouter);

const PORT = process.env.PORT ?? 3000;
app.listen(PORT, () => console.log(`Poppie running at http://localhost:${PORT}`));
```

---

## LLM Abstraction — `src/lib/llm.js`

This is the most critical file. It reads `LLM_PROVIDER` and routes to Claude or LM Studio. Both paths expose the same interface.

```js
import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

// Shared interface:
// chat({ system: string, messages: [{role, content}], useCache?: boolean })
// => { text: string, provider: string }

const provider = process.env.LLM_PROVIDER ?? 'claude';

export async function chat({ system, messages, useCache = false }) {
  if (provider === 'claude') {
    return claudeChat({ system, messages, useCache });
  } else {
    return localChat({ system, messages });
  }
}

async function claudeChat({ system, messages, useCache }) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  // Build system block — add cache_control when useCache is true
  const systemBlock = useCache
    ? [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }]
    : system;

  const response = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 1024,
    system: systemBlock,
    messages,
    ...(useCache && { betas: ['prompt-caching-2024-07-31'] }),
  });

  return { text: response.content[0].text, provider: 'claude' };
}

async function localChat({ system, messages }) {
  const client = new OpenAI({
    baseURL: process.env.LOCAL_LLM_BASE_URL,
    apiKey: process.env.LOCAL_LLM_API_KEY ?? 'lm-studio',
  });

  const allMessages = [{ role: 'system', content: system }, ...messages];

  const response = await client.chat.completions.create({
    model: process.env.LOCAL_LLM_MODEL,
    messages: allMessages,
    max_tokens: 1024,
  });

  return { text: response.choices[0].message.content, provider: 'local' };
}
```

**Prompt caching notes:**
- Only Claude supports `useCache`. The local path ignores it silently.
- Cache `useCache: true` on the session brief route — the system prompt + full member context is large and static per request, making it an ideal cache candidate.
- Caching requires the `prompt-caching-2024-07-31` beta header, passed via the `betas` array.
- The cached block must be at least 1024 tokens to qualify; the member context + system prompt will easily exceed this.

---

## Streaming — `src/lib/llm.js` (add a `stream` export)

The member chat route should stream responses for a better UX. Add a separate `stream` export:

```js
export async function* stream({ system, messages }) {
  if (provider === 'claude') {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const s = await client.messages.stream({
      model: 'claude-opus-4-5',
      max_tokens: 512,
      system,
      messages,
    });
    for await (const chunk of s) {
      if (chunk.type === 'content_block_delta' && chunk.delta?.text) {
        yield chunk.delta.text;
      }
    }
  } else {
    const client = new OpenAI({
      baseURL: process.env.LOCAL_LLM_BASE_URL,
      apiKey: process.env.LOCAL_LLM_API_KEY ?? 'lm-studio',
    });
    const s = await client.chat.completions.create({
      model: process.env.LOCAL_LLM_MODEL,
      messages: [{ role: 'system', content: system }, ...messages],
      stream: true,
      max_tokens: 512,
    });
    for await (const chunk of s) {
      const text = chunk.choices[0]?.delta?.content;
      if (text) yield text;
    }
  }
}
```

---

## API Routes

### `POST /api/brief` — `src/routes/brief.js`

1. Accept `{ memberId }` in request body
2. Load member, last 3 sessions, 14-day food logs, 14-day mood check-ins from JSON files
3. Build a user message that includes all context as structured text
4. Call `chat({ system: SESSION_BRIEF_SYSTEM_PROMPT, messages, useCache: true })`
5. Parse the JSON response from the LLM
6. Return `{ brief, provider }`

The `brief` object shape (LLM returns this as JSON):
```json
{
  "keyThemes": ["string", "string"],
  "dietaryPatterns": ["string", "string"],
  "moodSummary": "string",
  "talkingPoints": ["string", "string", "string"],
  "flags": ["string"]
}
```

### `POST /api/chat` — `src/routes/chat.js`

Server-Sent Events (SSE) streaming endpoint.

1. Set headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
2. Accept `{ memberId, messages }` — messages is the full conversation history
3. Call `stream({ system: MEMBER_CHAT_SYSTEM_PROMPT, messages })`
4. For each yielded chunk: `res.write('data: ' + JSON.stringify({ text: chunk }) + '\n\n')`
5. On completion: `res.write('data: [DONE]\n\n')` then `res.end()`

### `GET /api/alerts` — `src/routes/alerts.js`

Rule-based, no LLM call needed. Load `mood-checkins.json`, compute:
- If a member's last 5 mood scores average < 5 AND have dropped 3+ points from prior 5-day average → high severity alert
- If a member has missed breakfast (detected from food logs) 4+ of last 7 days → medium severity alert

Return array of alert objects:
```json
[
  {
    "memberId": "member-002",
    "memberName": "James T.",
    "severity": "high",
    "summary": "Mood score dropped significantly over 5 days",
    "detail": "Average mood: 4.2 (down from 7.4). Notes reference sleep disruption and avoidance.",
    "recommendedAction": "Consider reaching out before next scheduled session."
  }
]
```

---

## Mock Data

### `src/data/members.json`
Two members:

```json
[
  {
    "id": "member-001",
    "name": "Sarah M.",
    "age": 34,
    "clinicianName": "Dr. Priya Nair",
    "clinicianType": "Registered Dietitian",
    "nextAppointment": "2025-06-19T14:00:00",
    "conditions": ["metabolic syndrome", "insulin resistance"],
    "goals": ["reduce fasting glucose", "lose 12 lbs in 6 months"],
    "sessionCount": 8
  },
  {
    "id": "member-002",
    "name": "James T.",
    "age": 28,
    "clinicianName": "Dr. Aisha Okonkwo",
    "clinicianType": "Mental Health Therapist",
    "nextAppointment": "2025-06-19T15:30:00",
    "conditions": ["generalized anxiety disorder"],
    "goals": ["reduce avoidance behaviors", "improve sleep quality"],
    "sessionCount": 5
  }
]
```

### `src/data/sessions.json`
Three past session notes per member. Use realistic clinical shorthand. James's notes should show a clear arc: initial engagement → some regression → increasing avoidance and sleep disruption in the most recent note. This is what Poppie's brief will surface.

### `src/data/food-logs.json`
14 days of entries for Sarah. Pattern to embed: skips breakfast 4 of the last 7 days, higher processed food frequency in the last 3 days. Each entry:
```json
{ "memberId": "member-001", "date": "2025-06-10", "meals": { "breakfast": null, "lunch": "...", "dinner": "..." } }
```

### `src/data/mood-checkins.json`
14 daily check-ins per member. James's scores: days 1-9 range 6-8, days 10-14 drop to 3-5 with notes like "couldn't sleep," "cancelled plans with friends," "avoided gym again." This triggers the high-severity alert.

---

## Prompts — `src/lib/prompts.js`

```js
export const SESSION_BRIEF_SYSTEM_PROMPT = `
You are Poppie, an AI clinical assistant for HUSK Health. You help clinicians prepare
for sessions by reviewing member history and surfacing key patterns.

Given member data (profile, session notes, food logs, mood check-ins), return a JSON object
with exactly these fields:
- keyThemes: string[] (2-3 themes from recent sessions)
- dietaryPatterns: string[] (2-3 specific observations from food logs; empty array if not an RD case)
- moodSummary: string (1-2 sentences on mood trend)
- talkingPoints: string[] (2-3 suggested questions or topics for the clinician)
- flags: string[] (concerning patterns requiring attention; empty array if none)

Return only valid JSON. No markdown, no prose outside the JSON object.
Be specific — cite actual patterns from the data. Never speculate beyond what the data shows.
`;

export const MEMBER_CHAT_SYSTEM_PROMPT = `
You are Poppie, a warm wellness companion for HUSK Health. You check in with members
between their sessions with their care team.

Guidelines:
- Ask open-ended questions about their day, meals, sleep, and how they're feeling
- Keep it conversational — never make it feel like a form
- Be encouraging and non-judgmental
- Keep responses to 2-3 sentences maximum
- Never give medical or clinical advice. If a health concern comes up, say you'll make
  sure their care team knows and encourage them to bring it up at their next session
- You are a companion, not a clinician
`;
```

---

## Frontend — HTML Pages

All three pages use Tailwind via CDN. Include this in every `<head>`:

```html
<script src="https://cdn.tailwindcss.com"></script>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
```

Use `marked.parse(text)` to render any LLM output that may contain markdown (session brief fields, chat messages).

### `public/index.html`
Clean landing page. HUSK/Poppie branding. Two buttons: "Clinician View" → `/clinician.html`, "Member View" → `/member.html`.

### `public/clinician.html` + `public/js/clinician.js`

Two-column layout:
- **Left column**: appointment cards (one per member) + alert panel below
- **Right column**: session brief panel (empty state until brief loads)

Appointment card has a "Prepare with Poppie" button. On click:
1. Show loading state: "Poppie is reviewing [name]'s history..."
2. `POST /api/brief` with memberId
3. Render returned brief into the right panel — sections for Key Themes, Dietary Patterns, Mood Trend, Talking Points, Flags
4. Show a small badge: "Powered by Claude API" or "Powered by Local LLM"
5. Flags section uses red styling if `flags.length > 0`

Alert panel loads on page init via `GET /api/alerts`. Each alert is an expandable card showing severity badge, summary, and recommended action.

### `public/member.html` + `public/js/member.js`

Full-height chat interface. On load, immediately send Poppie's opening message (hardcoded, no API call):
> "Hi Sarah! I'm Poppie, checking in between your sessions with Dr. Nair. How are you feeling today?"

On user send:
1. Append user message to conversation history (in-memory array)
2. `POST /api/chat` with full messages array
3. Read SSE stream — append chunks to the current Poppie message bubble as they arrive
4. On `[DONE]`, finalize the message and render with `marked.parse()`

Small footer: "Your responses are shared with your care team."

---

## Design

Match the HUSK brand exactly as it appears on huskwellness.com. All colors are extracted from the live site's computed styles and CSS custom properties.

### Color Palette

| Role | Hex | Usage |
|---|---|---|
| **Golden Amber** | `#F0AF42` | Nav/header background, primary brand color |
| **Teal** | `#66C4C4` | Primary CTA buttons, Poppie avatar, decorative shapes, icon backgrounds |
| **Sky Blue** | `#3BA9D2` | Links, text accents, secondary interactive elements |
| **Slate** | `#5A6B80` | Stats/metric banner backgrounds, secondary UI panels |
| **Charcoal** | `#3E4349` | Primary headings and body text |
| **Medium Gray** | `#6D7680` | Secondary text, labels, captions |
| **Body Text** | `#54595F` | Paragraph text |
| **White** | `#FFFFFF` | Page and card backgrounds |
| **Off-White** | `#F5F5F7` | Alternating section backgrounds |
| **Border Gray** | `#DEDEE5` | Card borders, dividers, input borders |
| **Section Gray** | `#F8F8F8` | Subtle section background variation |

### Tailwind CDN — Custom Config

Inject this config block in every HTML `<head>` before the Tailwind CDN script to make brand colors available as utility classes:

```html
<script>
  tailwind.config = {
    theme: {
      extend: {
        colors: {
          husk: {
            amber:   '#F0AF42',
            teal:    '#66C4C4',
            'teal-light': '#79C4E0',
            blue:    '#3BA9D2',
            slate:   '#5A6B80',
            charcoal:'#3E4349',
            gray:    '#6D7680',
            body:    '#54595F',
            border:  '#DEDEE5',
            'off-white': '#F5F5F7',
            'section': '#F8F8F8',
          }
        },
        fontFamily: {
          sans: ['Inter', 'system-ui', 'sans-serif'],
        }
      }
    }
  }
</script>
<script src="https://cdn.tailwindcss.com"></script>
```

### Layout & Component Patterns

**Navigation bar**: Full-width, `bg-husk-amber`. White logo left, white nav links right, teal-outlined "Book a Demo" button (white bg, teal border, teal text — mirrors HUSK's own nav button style). Height ~80px.

**Page background**: `bg-white`. Alternate sections use `bg-husk-off-white` or `bg-husk-section` to create visual rhythm between content blocks.

**Stats/metric banners**: Full-width `bg-husk-slate` with white text. Use for key numbers (e.g., members served, time saved). Match the horizontal three-column stat strip on the HUSK site.

**Cards**: White background, `border border-husk-border`, `rounded-2xl`, subtle `shadow-sm`. No heavy drop shadows.

**Primary CTA buttons**: `bg-husk-teal text-white rounded-full px-6 py-2 font-semibold`. Hover: slightly darker teal.

**Secondary/outline buttons**: `border border-husk-amber text-husk-amber bg-white rounded-full`. Matches HUSK's "Book a Demo" nav button.

**Icon circles**: Small icons in `bg-husk-teal/20` (teal at 20% opacity) circle containers, icon itself in `text-husk-teal`. Used for feature/category cards.

**Decorative shapes**: Large quarter-circle or blob shapes in `bg-husk-teal` opacity-80, positioned at section edges as background decoration. Use `overflow-hidden` on the section wrapper.

**Alert severity**:
- High: `bg-red-50 border-red-400 text-red-700`
- Medium: `bg-amber-50 border-amber-400 text-amber-700`

**Typography**:
- Section labels (e.g., "Features", "How It Works"): `text-sm uppercase tracking-widest text-husk-gray`
- H1/H2 headings: `font-bold text-husk-charcoal`
- H3 subheadings: `font-semibold text-husk-charcoal`
- Body: `text-husk-body`
- Links: `text-husk-blue hover:underline`

### Poppie Avatar

A custom GIF provided in the project folder (`public/poppie.gif`). Reference it as a standard `<img>` tag. Used in the member chat interface (left-side bubble avatar) and in page headers next to "Poppie" branding. Render at 32x32px in chat bubbles and 48x48px in headers. Do not substitute an SVG or emoji — always use the GIF file.

---

## Demo Flow (for presentation)

Follow this sequence without any mid-demo setup:

1. **Home page** — show branding and two entry points
2. **Clinician View**
   - Alert panel already shows James T. flagged (loads on init)
   - Click "Prepare with Poppie" on Sarah M.'s appointment
   - Brief generates live and populates the right panel
   - Walk through: dietary pattern flag, talking points, provider badge
3. **Member View** (new tab)
   - Poppie opens with greeting
   - Type 2-3 messages — show conversational food/mood logging
4. **Return to Clinician View** — explain that member check-ins feed the next session brief

---

## Build Order

1. `npm init -y` → set `"type": "module"` → `npm install express @anthropic-ai/sdk openai dotenv`
2. Create `.env` and `.env.example`
3. Write `src/lib/llm.js` — test `chat()` and `stream()` against both providers from a scratch script before touching routes
4. Write `src/lib/prompts.js`
5. Create all mock data files in `src/data/` — make sure James's mood arc and Sarah's breakfast skips are clearly embedded
6. Build `src/routes/alerts.js` (rule-based, no LLM — simplest route, good warm-up)
7. Build `src/routes/brief.js`
8. Build `src/routes/chat.js` (SSE)
9. Write `server.js`
10. Build `public/index.html`
11. Build `public/clinician.html` + `public/js/clinician.js`
12. Build `public/member.html` + `public/js/member.js`
13. End-to-end demo run — verify the full narrative sequence works without touching `.env` or restarting

---

## What NOT to Build

- Authentication or login
- A real database or persistence layer
- React, Vue, or any JS framework
- npm-installed CSS (Tailwind via CDN only)
- Mobile optimization (desktop demo only)
- Multiple clinician accounts
