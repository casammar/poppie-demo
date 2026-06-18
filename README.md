<img src="poppie.gif" alt="Poppie" width="80" />

# Poppie — AI Clinical Intelligence for HUSK Health

Poppie is an AI-powered clinical support layer that expands clinician capacity without adding headcount. It gives clinicians an AI-generated session brief before every appointment and keeps members engaged between sessions with a conversational check-in companion.

Built as a live demo for a 15-minute panel presentation.

---

## What It Does

**Clinician Dashboard**
- AI-generated pre-session briefs: key themes, dietary patterns, mood trends, talking points, and flags — all pulled from member history
- Rule-based alert panel that surfaces high-severity mood drops and missed meal patterns instantly, without an LLM call
- 7-day personalized meal and mood plans, exportable to branded Word documents
- 14-day mood and nutrition trend charts

**Member Check-In (Poppie Chat)**
- Conversational mood and meal check-ins between sessions
- One-tap mood rating chips, followed by natural language follow-up
- Meal photo upload — Claude analyzes the image and logs calories, macros, and food categories automatically
- All check-in data feeds back into the next session brief

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node 18+ ESM |
| Server | Express 4 |
| LLM (cloud) | Anthropic Claude via `@anthropic-ai/sdk` with prompt caching |
| LLM (local) | Any OpenAI-compatible model via LM Studio |
| Frontend | Vanilla HTML + Tailwind CSS (CDN) |
| Document export | `docx` npm package |
| Storage | Flat JSON files |

---

## Getting Started

**1. Install dependencies**
```bash
npm install
```

**2. Create a `.env` file**
```
LLM_PROVIDER=claude
ANTHROPIC_API_KEY=sk-ant-...
PORT=3000
```

For local LLM development (no API key needed):
```
LLM_PROVIDER=local
LOCAL_LLM_BASE_URL=http://localhost:1234/v1
LOCAL_LLM_MODEL=lmstudio-community/meta-llama-3.1-8b-instruct
LOCAL_LLM_API_KEY=lm-studio
PORT=3000
```

**3. Start the server**
```bash
npm start
# or for auto-reload during development:
npm run dev
```

**4. Open the app**

Visit `http://localhost:3000`

---

## Demo Flow

Follow this sequence for the 15-minute presentation:

1. **Home page** — show branding and the two entry points
2. **Clinician View**
   - Alert panel loads automatically, showing James T. flagged for mood drop
   - Click "View Member" on Sarah M. → 14-day mood and nutrition charts render
   - Click "Prepare with Poppie" → brief generates live with dietary flags and talking points
   - Generate a meal plan → export to Word
3. **Member View** (new tab)
   - Poppie opens with a greeting and mood chip selector
   - Tap a mood rating, follow up with a message, upload a meal photo
4. **Return to Clinician View** — explain that check-in data flows into the next brief

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `LLM_PROVIDER` | Yes | `claude` or `local` |
| `ANTHROPIC_API_KEY` | When `LLM_PROVIDER=claude` | Anthropic API key |
| `LOCAL_LLM_BASE_URL` | When `LLM_PROVIDER=local` | LM Studio base URL |
| `LOCAL_LLM_MODEL` | When `LLM_PROVIDER=local` | Model identifier |
| `LOCAL_LLM_API_KEY` | When `LLM_PROVIDER=local` | Defaults to `lm-studio` |
| `PORT` | No | Defaults to `3000` |

---

## Project Structure

```
poppie-demo/
├── server.js                 # Express entry point
├── src/
│   ├── lib/
│   │   ├── llm.js            # LLM abstraction (Claude + local)
│   │   ├── prompts.js        # All system prompts
│   │   └── pii.js            # PII redaction for extraction paths
│   ├── routes/               # API route handlers
│   └── data/                 # Flat JSON mock data
└── public/
    ├── index.html            # Home page
    ├── clinician.html        # Clinician dashboard
    ├── member.html           # Member chat
    └── js/                   # Frontend logic
```

---

## Deploying to Railway

1. Push this repo to GitHub
2. Create a new Railway project from the GitHub repo
3. Add environment variables in the Railway dashboard:
   - `ANTHROPIC_API_KEY`
   - `LLM_PROVIDER=claude`
4. Railway injects `PORT` automatically — do not set it manually

> **Note:** Railway's filesystem is ephemeral. Writes to the JSON data files reset on redeploy. Plan your demo run accordingly.
