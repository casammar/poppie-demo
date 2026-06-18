const messagesEl = document.getElementById('messages');
const formEl = document.getElementById('chat-form');
const inputEl = document.getElementById('chat-input');
const mealPanel = document.getElementById('meal-log-panel');

const MEMBER_ID = 'member-001';
const OPENING_MESSAGE = "Hi Sarah! I'm Poppie — your wellness companion from HUSK Health. I check in between your sessions with Dr. Brooks to help you log your mood and meals, and keep your care team in the loop. You can even snap a photo of a meal and I'll log it automatically. How are you feeling today?";

const history = [];

// ── PII detection (mirrors server-side patterns in src/lib/pii.js) ────────────

function detectsPII(text) {
  return (
    /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(text) ||
    /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/.test(text) ||
    /\b\d{3}-\d{2}-\d{4}\b/.test(text) ||
    (m => m && /^[A-Z]/.test(m[1]))(text.match(/\b(?:my name is|i'm|i am|this is|call me)\s+([A-Za-z][a-z]+)/i))
  );
}

// ── Bubble ─────────────────────────────────────────────────────────────────────

function bubble(role, html) {
  const wrapper = document.createElement('div');
  wrapper.className = role === 'user'
    ? 'flex flex-col items-end mb-4'
    : 'flex gap-3 mb-4 justify-start';

  const content = document.createElement('div');
  content.innerHTML = html;

  if (role === 'user') {
    content.className = 'bg-husk-teal text-white rounded-2xl px-4 py-3 max-w-md';
    wrapper.appendChild(content);
    messagesEl.appendChild(wrapper);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return { wrapper, content, inner: null };
  }

  const avatar = document.createElement('div');
  avatar.className = 'w-8 h-8 rounded-full bg-white overflow-hidden shrink-0 mt-1 will-change-transform';
  const avatarImg = document.createElement('img');
  avatarImg.src = '/poppie.gif';
  avatarImg.alt = 'Poppie';
  avatarImg.className = 'w-full h-full object-cover';
  avatar.appendChild(avatarImg);

  const inner = document.createElement('div');
  inner.className = 'flex flex-col gap-2 max-w-md';

  content.className = 'bg-husk-section text-husk-body rounded-2xl px-4 py-3';
  inner.appendChild(content);

  wrapper.appendChild(avatar);
  wrapper.appendChild(inner);
  messagesEl.appendChild(wrapper);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return { wrapper, content, inner };
}

// ── Mood rating row ────────────────────────────────────────────────────────────

const MOOD_COLORS = [
  '', '#ef4444', '#f87171', '#fb923c', '#F0AF42',
  '#fbbf24', '#a3e635', '#4ade80', '#66C4C4', '#3BA9D2', '#3BA9D2',
];

function renderMoodRow() {
  const row = document.createElement('div');
  row.id = 'mood-row';
  row.className = 'ml-11 mb-5';
  row.innerHTML = `
    <p class="text-xs text-husk-gray mb-2">Tap to rate your mood today</p>
    <div class="flex gap-1.5 flex-wrap">
      ${Array.from({ length: 10 }, (_, i) => i + 1).map(n => `
        <button class="mood-btn w-9 h-9 rounded-full text-white text-sm font-bold
                       hover:scale-110 active:scale-95 transition-transform shadow-sm"
                style="background:${MOOD_COLORS[n]}" data-score="${n}">${n}</button>
      `).join('')}
    </div>
  `;

  messagesEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  row.querySelectorAll('.mood-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      row.remove();
      sendMessage(`I'm feeling a ${btn.dataset.score} out of 10 today.`);
    });
  });
}

// ── Reply chips (LLM-personalized) ────────────────────────────────────────────

function buildChipButton(label, row) {
  const btn = document.createElement('button');
  btn.textContent = label;
  btn.className = 'border border-husk-teal text-husk-teal rounded-full px-3 py-1 text-xs font-medium hover:bg-husk-teal hover:text-white transition';
  btn.addEventListener('click', () => {
    row.remove();
    sendMessage(label);
  });
  return btn;
}

async function renderChips(innerEl, conversationHistory) {
  document.querySelectorAll('.chip-row').forEach(el => el.remove());

  const row = document.createElement('div');
  row.className = 'chip-row flex flex-wrap gap-2';

  // Skeleton placeholders while the LLM generates personalized chips
  ['w-24', 'w-32', 'w-20', 'w-28'].forEach(w => {
    const ghost = document.createElement('div');
    ghost.className = `${w} h-6 rounded-full bg-husk-border/50 animate-pulse`;
    row.appendChild(ghost);
  });

  innerEl.appendChild(row);
  messagesEl.scrollTop = messagesEl.scrollHeight;

  try {
    const res = await fetch('/api/chips', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: conversationHistory }),
    });
    const { chips } = await res.json();

    row.innerHTML = '';
    if (chips?.length) {
      chips.forEach(label => row.appendChild(buildChipButton(label, row)));
    } else {
      row.remove();
    }
  } catch {
    row.remove();
  }

  messagesEl.scrollTop = messagesEl.scrollHeight;
}

// ── Nutrition card (from photo analysis) ──────────────────────────────────────

function macroBar(label, value, max, color) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return `
    <div class="flex items-center gap-2 text-xs">
      <span class="w-14 text-husk-gray shrink-0">${label}</span>
      <div class="flex-1 h-1.5 rounded-full bg-husk-border">
        <div class="h-1.5 rounded-full ${color}" style="width:${pct}%"></div>
      </div>
      <span class="w-10 text-right font-medium text-husk-charcoal">${value}g</span>
    </div>`;
}

function renderNutritionCard(mealType, nutrition) {
  const confidenceColor = { high: 'text-green-600', medium: 'text-amber-600', low: 'text-red-500' };
  const categoryBadge = (c) =>
    `<span class="px-2 py-0.5 rounded-full text-xs bg-husk-teal/10 text-husk-teal font-medium">${c}</span>`;

  return `
    <div class="mt-2 rounded-2xl border border-husk-border bg-white overflow-hidden text-sm">
      <div class="bg-husk-teal/10 px-4 py-2 flex items-center justify-between">
        <span class="font-semibold text-husk-charcoal capitalize">📸 ${mealType} — photo analyzed</span>
        <span class="text-xs font-medium ${confidenceColor[nutrition.confidence] ?? 'text-husk-gray'}">
          ${nutrition.confidence} confidence
        </span>
      </div>
      <div class="px-4 py-3 space-y-3">
        <p class="text-husk-body leading-snug">${nutrition.description}</p>
        <div class="flex items-center gap-2">
          <span class="text-2xl font-bold text-husk-charcoal">${nutrition.estimatedCalories}</span>
          <span class="text-xs text-husk-gray">kcal estimated</span>
        </div>
        <div class="space-y-1.5">
          ${macroBar('Protein', nutrition.macros.proteinG, 60, 'bg-husk-blue')}
          ${macroBar('Carbs', nutrition.macros.carbsG, 80, 'bg-husk-amber')}
          ${macroBar('Fat', nutrition.macros.fatG, 50, 'bg-husk-teal')}
          ${macroBar('Fiber', nutrition.macros.fiberG, 30, 'bg-green-400')}
        </div>
        <div class="text-xs text-husk-gray">
          🧂 Sodium: <span class="font-medium text-husk-charcoal">${nutrition.macros.sodiumMg} mg</span>
        </div>
        ${nutrition.categories?.length ? `
        <div class="flex flex-wrap gap-1.5">
          ${nutrition.categories.map(categoryBadge).join('')}
        </div>` : ''}
        ${nutrition.notes ? `<p class="text-xs text-husk-gray italic">${nutrition.notes}</p>` : ''}
      </div>
    </div>`;
}

// ── Photo panel ────────────────────────────────────────────────────────────────

const photoPanel = document.getElementById('photo-panel');
const photoInput = document.getElementById('photo-input');
const photoPreview = document.getElementById('photo-preview');
const photoPreviewWrap = document.getElementById('photo-preview-wrap');
const photoDropzonePrompt = document.getElementById('photo-dropzone-prompt');
const photoAnalyzeBtn = document.getElementById('photo-analyze-btn');

let selectedMealType = 'dinner';
let selectedImageData = null;
let selectedMediaType = null;

document.getElementById('photo-panel-toggle').addEventListener('click', () => {
  document.getElementById('meal-log-panel').classList.add('hidden');
  photoPanel.classList.toggle('hidden');
});

document.getElementById('photo-panel-close').addEventListener('click', () => {
  photoPanel.classList.add('hidden');
});

document.querySelectorAll('.meal-type-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    selectedMealType = btn.dataset.meal;
    document.querySelectorAll('.meal-type-btn').forEach(b => {
      b.classList.remove('bg-husk-teal', 'text-white', 'border-husk-teal', 'selected');
      b.classList.add('border-husk-border', 'text-husk-gray');
    });
    btn.classList.add('bg-husk-teal', 'text-white', 'border-husk-teal', 'selected');
    btn.classList.remove('border-husk-border', 'text-husk-gray');
  });
});

function resizeImage(file, maxPx = 1280, quality = 0.82) {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', quality);
      const base64 = dataUrl.split(',')[1];
      resolve({ base64, mediaType: 'image/jpeg' });
    };
    img.src = url;
  });
}

photoInput.addEventListener('change', async () => {
  const file = photoInput.files?.[0];
  if (!file) return;

  const { base64, mediaType } = await resizeImage(file);
  selectedImageData = base64;
  selectedMediaType = mediaType;

  photoPreview.src = `data:${mediaType};base64,${base64}`;
  photoPreviewWrap.classList.remove('hidden');
  photoDropzonePrompt.classList.add('hidden');
  photoAnalyzeBtn.disabled = false;
});

photoAnalyzeBtn.addEventListener('click', async () => {
  if (!selectedImageData) return;

  photoPanel.classList.add('hidden');

  // Show placeholder bubble while analyzing
  const { content: card, inner } = bubble('assistant', `<span class="text-husk-gray text-sm animate-pulse">📷 Analyzing your ${selectedMealType}…</span>`);

  try {
    const res = await fetch('/api/food-photo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        memberId: MEMBER_ID,
        mealType: selectedMealType,
        imageData: selectedImageData,
        mediaType: selectedMediaType,
      }),
    });
    const { nutrition, error } = await res.json();

    if (error) {
      card.innerHTML = `<span class="text-red-600 text-sm">Could not analyze photo: ${error}</span>`;
      return;
    }

    card.innerHTML = renderNutritionCard(selectedMealType, nutrition);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    // Follow-up chat response from Poppie
    const summary = `Logged your ${selectedMealType}: ${nutrition.items.slice(0, 3).join(', ')}. Estimated ${nutrition.estimatedCalories} kcal with ${nutrition.macros.proteinG}g protein.`;
    history.push({ role: 'assistant', content: summary });
    sendMessage(`Great, Poppie just analyzed my ${selectedMealType} photo.`);
  } catch (err) {
    card.innerHTML = `<span class="text-red-600 text-sm">Something went wrong. Please try again.</span>`;
  }

  // Reset panel state
  selectedImageData = null;
  selectedMediaType = null;
  photoInput.value = '';
  photoPreview.src = '';
  photoPreviewWrap.classList.add('hidden');
  photoDropzonePrompt.classList.remove('hidden');
  photoAnalyzeBtn.disabled = true;
});

// ── Meal log panel ─────────────────────────────────────────────────────────────

document.getElementById('meal-log-toggle').addEventListener('click', () => {
  photoPanel.classList.add('hidden');
  mealPanel.classList.toggle('hidden');
  if (!mealPanel.classList.contains('hidden')) {
    document.getElementById('meal-breakfast').focus();
  }
});

document.getElementById('meal-log-close').addEventListener('click', () => {
  mealPanel.classList.add('hidden');
});

document.querySelectorAll('.skip-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const input = document.getElementById(`meal-${btn.dataset.meal}`);
    input.value = 'Skipped';
    input.disabled = true;
    btn.textContent = '✓';
    btn.disabled = true;
    btn.classList.add('opacity-40');
  });
});

document.getElementById('meal-log-submit').addEventListener('click', () => {
  const b = document.getElementById('meal-breakfast').value.trim();
  const l = document.getElementById('meal-lunch').value.trim();
  const d = document.getElementById('meal-dinner').value.trim();

  if (!b && !l && !d) return;

  const parts = [];
  if (b) parts.push(`breakfast: ${b}`);
  if (l) parts.push(`lunch: ${l}`);
  if (d) parts.push(`dinner: ${d}`);

  // Reset fields
  ['breakfast', 'lunch', 'dinner'].forEach(meal => {
    const input = document.getElementById(`meal-${meal}`);
    input.value = '';
    input.disabled = false;
  });
  document.querySelectorAll('.skip-btn').forEach(btn => {
    btn.textContent = 'Skip';
    btn.disabled = false;
    btn.classList.remove('opacity-40');
  });

  mealPanel.classList.add('hidden');
  sendMessage(`Here's what I had today — ${parts.join(', ')}.`);
});

// ── Data extraction (fire-and-forget) ─────────────────────────────────────────

function extractData(messages) {
  fetch('/api/extract', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ memberId: MEMBER_ID, messages }),
  }).catch(() => {});
}

// ── Send message + stream response ────────────────────────────────────────────

async function sendMessage(text) {
  const { wrapper } = bubble('user', marked.parse(text));

  if (detectsPII(text)) {
    const badge = document.createElement('div');
    badge.className = 'flex items-center gap-1.5 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-3 py-1 mt-1.5';
    badge.innerHTML = '🔒 <span>PII detected — masked before sending to Claude</span>';
    wrapper.appendChild(badge);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  history.push({ role: 'user', content: text });
  extractData([...history]);

  const { content: assistantBubble, inner } = bubble('assistant', '');
  let fullText = '';

  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: history, memberId: MEMBER_ID }),
  });

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split('\n\n');
    buffer = lines.pop();

    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6);
      if (payload === '[DONE]') continue;
      const { text: chunk, error } = JSON.parse(payload);
      if (error) {
        assistantBubble.innerHTML = `<span class="text-red-600">${error}</span>`;
        return;
      }
      fullText += chunk;
      assistantBubble.textContent = fullText;
    }
  }

  assistantBubble.innerHTML = marked.parse(fullText);
  history.push({ role: 'assistant', content: fullText });
  renderChips(inner, [...history]);
}

// ── Init ───────────────────────────────────────────────────────────────────────

function init() {
  bubble('assistant', marked.parse(OPENING_MESSAGE));
  history.push({ role: 'assistant', content: OPENING_MESSAGE });
  renderMoodRow();
}

formEl.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = inputEl.value.trim();
  if (!text) return;
  inputEl.value = '';
  sendMessage(text);
});

init();
