const appointmentsEl = document.getElementById('appointments');
const alertsEl = document.getElementById('alerts');
const briefPanel = document.getElementById('brief-panel');

let activeChart = null;
let currentMember = null;
let currentBrief = null;
let currentMealPlan = null;
let currentMoodPlan = null;

// ── Time saved tracking ────────────────────────────────────────────────────────

function animateTimeSaved(from, to) {
  const badge = document.getElementById('time-saved-badge');
  const label = document.getElementById('time-saved-label');
  badge.classList.remove('hidden');

  const duration = 800;
  const start = performance.now();
  function tick(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    const value = Math.round(from + (to - from) * eased);
    label.textContent = `${value} min saved today`;
    if (t < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}

async function fetchMinutesSaved() {
  const res = await fetch('/api/stats');
  const { minutesSavedToday } = await res.json();
  return minutesSavedToday;
}

async function initTimeSaved() {
  const saved = await fetchMinutesSaved();
  if (saved > 0) {
    const badge = document.getElementById('time-saved-badge');
    const label = document.getElementById('time-saved-label');
    badge.classList.remove('hidden');
    label.textContent = `${saved} min saved today`;
  }
}

async function addTimeSaved() {
  const prev = await fetchMinutesSaved();
  animateTimeSaved(prev - 8, prev);
}

const MEMBERS = [
  {
    id: 'member-001',
    name: 'Sarah M.',
    clinicianName: 'Dr. Lauren Brooks',
    clinicianType: 'Registered Dietitian',
    time: '2:00 PM',
    conditions: ['Metabolic Syndrome', 'Insulin Resistance'],
    goals: ['Reduce fasting glucose', 'Lose 12 lbs in 6 months'],
  },
  {
    id: 'member-002',
    name: 'James T.',
    clinicianName: 'Dr. Marcus Webb',
    clinicianType: 'Mental Health Therapist',
    time: '3:30 PM',
    conditions: ['Generalized Anxiety Disorder'],
    goals: ['Reduce avoidance behaviors', 'Improve sleep quality'],
  },
];

function formatDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Appointment cards ──────────────────────────────────────────────────────────

function renderAppointments() {
  appointmentsEl.innerHTML = MEMBERS.map((m) => `
    <div class="bg-white border border-husk-border rounded-2xl p-5 shadow-sm">
      <div class="flex justify-between items-start mb-3">
        <div>
          <p class="font-semibold text-husk-charcoal">${m.name}</p>
          <p class="text-sm text-husk-gray">${m.clinicianType} · ${m.clinicianName}</p>
        </div>
        <span class="text-sm text-husk-blue font-medium whitespace-nowrap">${m.time}</span>
      </div>
      <button data-member-id="${m.id}"
        class="view-btn bg-husk-teal text-white rounded-full px-5 py-2 text-sm font-semibold hover:opacity-90 transition w-full">
        View Member
      </button>
    </div>
  `).join('');

  document.querySelectorAll('.view-btn').forEach((btn) => {
    btn.addEventListener('click', () => loadMemberProfile(btn.dataset.memberId));
  });
}

// ── Member profile + charts ────────────────────────────────────────────────────

async function loadMemberProfile(memberId) {
  currentBrief = null; currentMealPlan = null; currentMoodPlan = null;
  document.getElementById('plans-section').innerHTML = '';
  const member = MEMBERS.find(m => m.id === memberId);
  currentMember = member;

  briefPanel.className = 'bg-husk-section border border-husk-border rounded-2xl p-6 min-h-[300px] flex items-center justify-center text-husk-gray';
  briefPanel.innerHTML = `<p class="text-sm">Loading ${member.name}'s trends…</p>`;

  try {
    const res = await fetch(`/api/trends/${memberId}`);
    const { mood, food } = await res.json();
    renderMemberProfile(member, mood, food);
  } catch (err) {
    briefPanel.innerHTML = `<p class="text-red-600 text-sm">Failed to load profile: ${err.message}</p>`;
  }
}

function renderMemberProfile(member, mood, food) {
  if (activeChart) { activeChart.destroy(); activeChart = null; }

  briefPanel.className = 'bg-white border border-husk-border rounded-2xl';
  briefPanel.innerHTML = `
    <div class="bg-husk-off-white border-b border-husk-border px-6 py-4 rounded-t-2xl">
      <div class="flex justify-between items-start">
        <div>
          <h2 class="font-bold text-xl text-husk-charcoal">${member.name}</h2>
          <p class="text-sm text-husk-gray mt-0.5">${member.clinicianType} · ${member.clinicianName}</p>
          <div class="flex flex-wrap gap-2 mt-2">
            ${member.conditions.map(c => `
              <span class="text-xs bg-husk-slate/10 text-husk-slate rounded-full px-2.5 py-0.5">${c}</span>
            `).join('')}
          </div>
        </div>
        <div class="text-right shrink-0 ml-4">
          <span class="text-sm font-semibold text-husk-blue">Today at ${member.time}</span>
          <p class="text-xs text-husk-gray mt-1 max-w-[180px]">${member.goals.join(' · ')}</p>
        </div>
      </div>
    </div>

    <div class="p-6 space-y-7">
      <div>
        <h3 class="font-semibold text-husk-charcoal mb-3">Mood — Last 14 Days</h3>
        <div style="position:relative; height:180px">
          <canvas id="mood-chart"></canvas>
        </div>
      </div>

      <div id="nutrition-section">${renderNutritionCalendar(food)}</div>

      <div id="session-notes-section" class="hidden">
        <div class="flex justify-between items-center mb-3">
          <h3 class="font-semibold text-husk-charcoal">Session Notes</h3>
          <span class="text-xs text-husk-gray">Surfaced in future briefs</span>
        </div>
        <div id="past-notes" class="space-y-3 mb-4 text-sm text-husk-gray italic">Loading…</div>
        <textarea id="new-note-input"
          class="w-full border border-husk-border rounded-xl px-4 py-3 text-sm text-husk-body placeholder:text-husk-gray/60 resize-none focus:outline-none focus:ring-2 focus:ring-husk-teal/40"
          rows="3" placeholder="Add notes from today's session…"></textarea>
        <button id="save-note-btn"
          class="mt-2 w-full bg-husk-slate text-white rounded-full py-2 font-semibold text-sm hover:opacity-90 transition">
          Save Note
        </button>
        <p id="note-status" class="text-xs text-husk-gray mt-1.5 hidden"></p>
      </div>

      <div id="brief-trigger-wrap">
        <button id="brief-trigger-btn"
          data-member-id="${member.id}" data-member-name="${member.name}"
          class="w-full bg-husk-teal text-white rounded-full py-2.5 font-semibold hover:opacity-90 transition text-sm">
          Prepare with Poppie
        </button>
      </div>

      <div id="brief-content"></div>
    </div>
  `;

  buildMoodChart(mood);
  loadSessionNotes(member.id);

  document.getElementById('save-note-btn').addEventListener('click', () => {
    saveSessionNote(member.id);
  });

  document.getElementById('brief-trigger-btn').addEventListener('click', (e) => {
    const btn = e.currentTarget;
    loadBrief(btn.dataset.memberId, btn.dataset.memberName);
  });
}

function buildMoodChart(mood) {
  const canvas = document.getElementById('mood-chart');
  const ctx = canvas.getContext('2d');

  activeChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: mood.map(m => formatDate(m.date)),
      datasets: [{
        data: mood.map(m => m.score),
        borderColor: '#66C4C4',
        borderWidth: 2.5,
        backgroundColor(context) {
          const { ctx: c, chartArea } = context.chart;
          if (!chartArea) return 'rgba(102,196,196,0.1)';
          const grad = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          grad.addColorStop(0, 'rgba(102,196,196,0.28)');
          grad.addColorStop(1, 'rgba(102,196,196,0.02)');
          return grad;
        },
        fill: true,
        tension: 0.35,
        pointBackgroundColor: mood.map(m =>
          m.score <= 4 ? '#ef4444' : m.score === 5 ? '#F0AF42' : '#66C4C4'
        ),
        pointBorderColor: '#fff',
        pointBorderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          min: 1, max: 10,
          ticks: { stepSize: 3, color: '#6D7680', font: { size: 11 } },
          grid: { color: '#DEDEE5' },
          border: { display: false },
        },
        x: {
          ticks: { color: '#6D7680', font: { size: 11 }, maxRotation: 0 },
          grid: { display: false },
          border: { display: false },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#3E4349',
          titleColor: '#fff',
          bodyColor: '#DEDEE5',
          padding: 10,
          cornerRadius: 8,
          callbacks: {
            title: (items) => formatDate(mood[items[0].dataIndex].date),
            label: (item) => `Mood: ${item.parsed.y}/10`,
            afterLabel: (item) => mood[item.dataIndex].note,
          },
        },
      },
    },
  });
}

function renderNutritionCalendar(food) {
  if (!food.length) {
    return `
      <div>
        <h3 class="font-semibold text-husk-charcoal mb-2">Nutrition — Last 14 Days</h3>
        <p class="text-sm text-husk-gray">No food log data available for this member.</p>
      </div>
    `;
  }

  const cells = food.map(f => {
    const { breakfast, lunch, dinner } = f.meals;
    const skipWords = ['coffee only'];
    const hasProperBreakfast = breakfast && !skipWords.some(k => breakfast.toLowerCase().includes(k));
    const mealsLogged = [breakfast, lunch, dinner].filter(Boolean).length;

    let bg, label;
    if (hasProperBreakfast && mealsLogged === 3) {
      bg = '#66C4C4'; label = 'All meals logged';
    } else if (mealsLogged >= 1) {
      bg = '#F0AF42'; label = hasProperBreakfast ? 'Missing a meal' : 'Skipped breakfast';
    } else {
      bg = '#DEDEE5'; label = 'No meals logged';
    }

    const day = new Date(f.date + 'T12:00:00').getDate();
    const textColor = bg === '#DEDEE5' ? '#6D7680' : '#fff';
    const b = breakfast || 'Skipped';
    const l = lunch || '—';
    const d = dinner || '—';

    return `
      <div class="group relative flex justify-center">
        <div class="w-10 h-10 rounded-xl flex items-center justify-center text-xs font-bold select-none cursor-default"
             style="background:${bg}; color:${textColor}">
          ${day}
        </div>
        <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-20 pointer-events-none
                    opacity-0 group-hover:opacity-100 transition-opacity
                    bg-husk-charcoal text-white text-xs rounded-xl shadow-lg px-3 py-2.5 w-52">
          <p class="font-semibold mb-1.5">${formatDate(f.date)}</p>
          <p><span class="text-husk-border/60">Breakfast:</span> ${b}</p>
          <p><span class="text-husk-border/60">Lunch:</span> ${l}</p>
          <p><span class="text-husk-border/60">Dinner:</span> ${d}</p>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div>
      <h3 class="font-semibold text-husk-charcoal mb-3">Nutrition — Last 14 Days</h3>
      <div class="grid grid-cols-7 gap-2">${cells}</div>
      <div class="flex gap-5 mt-3 text-xs text-husk-gray">
        <span class="flex items-center gap-1.5">
          <span class="inline-block w-3 h-3 rounded" style="background:#66C4C4"></span> All meals
        </span>
        <span class="flex items-center gap-1.5">
          <span class="inline-block w-3 h-3 rounded" style="background:#F0AF42"></span> Skipped breakfast
        </span>
        <span class="flex items-center gap-1.5">
          <span class="inline-block w-3 h-3 rounded" style="background:#DEDEE5"></span> No data
        </span>
      </div>
    </div>
  `;
}

// ── Session notes ─────────────────────────────────────────────────────────────

function formatNoteDate(dateStr) {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

async function loadSessionNotes(memberId) {
  const el = document.getElementById('past-notes');
  if (!el) return;
  try {
    const res = await fetch(`/api/sessions/${memberId}`);
    const { sessions } = await res.json();
    if (!sessions.length) {
      el.innerHTML = `<p>No previous session notes.</p>`;
      return;
    }
    el.className = 'space-y-3 mb-4';
    el.innerHTML = sessions.map((s) => `
      <div class="border border-husk-border rounded-xl px-4 py-3">
        <p class="text-xs font-semibold text-husk-gray mb-1">${formatNoteDate(s.date)}</p>
        <p class="text-sm text-husk-body leading-relaxed">${s.note}</p>
      </div>
    `).join('');
  } catch {
    el.innerHTML = `<p class="text-red-600">Failed to load notes.</p>`;
  }
}

async function saveSessionNote(memberId) {
  const input = document.getElementById('new-note-input');
  const btn = document.getElementById('save-note-btn');
  const status = document.getElementById('note-status');
  const note = input.value.trim();
  if (!note) return;

  btn.disabled = true;
  btn.textContent = 'Saving…';
  status.classList.add('hidden');

  try {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId, note }),
    });
    const { session } = await res.json();

    const el = document.getElementById('past-notes');
    el.className = 'space-y-3 mb-4';

    const noNotes = el.querySelector('p');
    if (noNotes) el.innerHTML = '';

    el.insertAdjacentHTML('afterbegin', `
      <div class="border border-husk-teal/40 bg-husk-teal/5 rounded-xl px-4 py-3">
        <p class="text-xs font-semibold text-husk-gray mb-1">${formatNoteDate(session.date)}</p>
        <p class="text-sm text-husk-body leading-relaxed">${session.note}</p>
      </div>
    `);

    input.value = '';
    status.textContent = 'Note saved — will appear in future briefs.';
    status.classList.remove('hidden');
    setTimeout(() => status.classList.add('hidden'), 4000);
  } catch {
    status.textContent = 'Failed to save note.';
    status.classList.remove('hidden');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Note';
  }
}

// ── Session brief ──────────────────────────────────────────────────────────────

async function loadBrief(memberId, memberName) {
  const briefContent = document.getElementById('brief-content');
  briefContent.dataset.memberId = memberId;
  briefContent.dataset.memberName = memberName;
  const btn = document.getElementById('brief-trigger-btn');

  btn.disabled = true;
  btn.innerHTML = `
    <span class="flex items-center justify-center gap-2">
      <img src="/poppie.gif" class="w-6 h-6 rounded-full" alt="">
      Poppie is reviewing ${memberName}'s history<span class="loading-dot">.</span><span class="loading-dot">.</span><span class="loading-dot">.</span>
    </span>`;

  try {
    const res = await fetch('/api/brief', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId }),
    });
    const { brief, provider } = await res.json();
    currentBrief = brief;
    addTimeSaved();
    renderBrief(brief, provider, briefContent);
    document.getElementById('meal-plan-trigger-btn')?.addEventListener('click', () => loadMealPlan(memberId));
    document.getElementById('mood-plan-trigger-btn')?.addEventListener('click', () => loadMoodPlan(memberId));
  } catch (err) {
    briefContent.innerHTML = `<p class="text-red-600 text-sm">Failed to generate brief: ${err.message}</p>`;
    btn.disabled = false;
    btn.textContent = 'Prepare with Poppie';
  }
}

function renderBrief(brief, provider, briefContent) {
  const wrap = document.getElementById('brief-trigger-wrap');
  if (wrap) wrap.remove();

  const badge = `
    <span class="inline-block text-xs font-semibold uppercase tracking-wide px-3 py-1 rounded-full
      ${provider === 'claude' ? 'bg-husk-teal/20 text-husk-teal' : 'bg-husk-blue/20 text-husk-blue'}">
      Powered by ${provider === 'claude' ? 'Claude API' : 'Local LLM'}
    </span>`;

  const bulletSection = (title, items) => `
    <div>
      <h3 class="font-semibold text-husk-charcoal mb-2">${title}</h3>
      <ul class="list-disc list-inside text-husk-body text-sm space-y-1">
        ${items.map(i => `<li>${marked.parseInline(i)}</li>`).join('')}
      </ul>
    </div>`;

  briefContent.innerHTML = `
    <hr class="border-husk-border">
    <div class="space-y-5 pt-1" id="brief-sections">
      ${badge}
      ${bulletSection('Key Themes', brief.keyThemes || [])}
      ${brief.dietaryPatterns?.length ? bulletSection('Dietary Patterns', brief.dietaryPatterns) : ''}
      <div>
        <h3 class="font-semibold text-husk-charcoal mb-2">Mood Trend</h3>
        <div class="text-husk-body text-sm">${marked.parse(brief.moodSummary || '')}</div>
      </div>
      ${bulletSection('Talking Points', brief.talkingPoints || [])}
      ${brief.flags?.length ? `
        <div class="bg-red-50 border border-red-400 rounded-xl p-4">
          <h3 class="font-semibold text-red-700 mb-2">Flags</h3>
          <ul class="list-disc list-inside text-red-700 text-sm space-y-1">
            ${brief.flags.map(f => `<li>${marked.parseInline(f)}</li>`).join('')}
          </ul>
        </div>
      ` : ''}
      <div class="grid grid-cols-2 gap-3">
        <button id="meal-plan-trigger-btn"
          class="border border-husk-teal text-husk-teal bg-white rounded-full py-2.5 font-semibold hover:bg-husk-teal hover:text-white transition text-sm">
          Generate Meal Plan
        </button>
        <button id="mood-plan-trigger-btn"
          class="border border-husk-teal text-husk-teal bg-white rounded-full py-2.5 font-semibold hover:bg-husk-teal hover:text-white transition text-sm">
          Generate Mood Plan
        </button>
      </div>
    </div>`;
}

// ── Meal plan ──────────────────────────────────────────────────────────────────

async function loadMealPlan(memberId) {
  const btn = document.getElementById('meal-plan-trigger-btn');
  btn.disabled = true;
  btn.innerHTML = `<span class="flex items-center justify-center gap-2"><img src="/poppie.gif" class="w-5 h-5 rounded-full" alt="">Generating<span class="loading-dot">.</span><span class="loading-dot">.</span><span class="loading-dot">.</span></span>`;

  try {
    const res = await fetch('/api/meal-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId }),
    });
    const { plan } = await res.json();
    currentMealPlan = plan;
    btn.textContent = '✓ Meal Plan Generated';
    renderMealPlan(plan);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Generate Meal Plan';
    alert(`Failed to generate meal plan: ${err.message}`);
  }
}

// ── Mood plan ──────────────────────────────────────────────────────────────────

async function loadMoodPlan(memberId) {
  const btn = document.getElementById('mood-plan-trigger-btn');
  btn.disabled = true;
  btn.innerHTML = `<span class="flex items-center justify-center gap-2"><img src="/poppie.gif" class="w-5 h-5 rounded-full" alt="">Generating<span class="loading-dot">.</span><span class="loading-dot">.</span><span class="loading-dot">.</span></span>`;

  try {
    const res = await fetch('/api/mood-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ memberId }),
    });
    const { plan } = await res.json();
    currentMoodPlan = plan;
    btn.textContent = '✓ Mood Plan Generated';
    renderMoodPlan(plan);
  } catch (err) {
    btn.disabled = false;
    btn.textContent = 'Generate Mood Plan';
    alert(`Failed to generate mood plan: ${err.message}`);
  }
}

function planCard(id, title, subtitle, bodyHtml, exportType) {
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement('div');
    el.id = id;
    document.getElementById('plans-section').appendChild(el);
  }
  el.className = 'bg-white border border-husk-border rounded-2xl shadow-sm overflow-hidden';
  el.innerHTML = `
    <div class="bg-husk-teal px-8 py-5 flex justify-between items-center">
      <div>
        <h2 class="font-bold text-white text-lg">${title}</h2>
        <p class="text-white/75 text-sm mt-0.5">${subtitle}</p>
      </div>
      <button data-export-type="${exportType}"
        class="plan-export-btn flex items-center gap-2 bg-white/20 hover:bg-white/30 text-white rounded-full px-4 py-2 text-sm font-semibold transition">
        <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
          <path stroke-linecap="round" stroke-linejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5 5-5M12 15V3"/>
        </svg>
        Export to Word
      </button>
    </div>
    <div class="px-8 py-6">${bodyHtml}</div>`;
  return el;
}

function colorTable(rowDefs, days) {
  const dayHeaders = days.map(d =>
    `<th class="px-3 pb-3 text-xs font-semibold text-white text-left whitespace-nowrap">${d.day.slice(0, 3)}</th>`
  ).join('');

  const rows = rowDefs.map(({ key, label }, i) => {
    const bg = i % 2 === 0 ? 'bg-white' : 'bg-husk-off-white';
    return `
      <tr class="${bg}">
        <td class="py-3 pr-4 pl-2 text-xs font-semibold text-husk-teal uppercase tracking-wide whitespace-nowrap align-top w-28">${label}</td>
        ${days.map(d => `<td class="py-3 px-3 text-xs text-husk-body align-top leading-relaxed">${d[key] ?? '—'}</td>`).join('')}
      </tr>`;
  }).join('');

  return `
    <div class="overflow-x-auto rounded-xl border border-husk-border">
      <table class="w-full border-collapse">
        <thead>
          <tr class="bg-husk-slate">
            <th class="px-3 pb-3 pt-3 w-28"></th>
            ${dayHeaders}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

function renderMealPlan(plan) {
  const memberName = currentMember?.name ?? 'Member';
  if (!plan.days?.length) {
    planCard('meal-plan-card', '7-Day Meal Plan', memberName, `<p class="text-husk-gray text-sm">${plan.rationale}</p>`, 'meal');
    return;
  }

  const table = colorTable(
    [{ key: 'breakfast', label: 'Breakfast' }, { key: 'lunch', label: 'Lunch' },
     { key: 'dinner', label: 'Dinner' }, { key: 'snack', label: 'Snack' }],
    plan.days
  );

  const body = `
    <p class="text-husk-gray text-sm mb-5">${plan.rationale}</p>
    ${table}`;

  const card = planCard('meal-plan-card', '7-Day Meal Plan', `Personalized for ${memberName}`, body, 'meal');
  card.querySelector('.plan-export-btn').addEventListener('click', () => exportPlan('meal'));
}

function renderMoodPlan(plan) {
  const memberName = currentMember?.name ?? 'Member';

  const PILLAR_COLORS = ['#66C4C4', '#3BA9D2', '#5A6B80', '#F0AF42'];
  const pillarsHtml = plan.pillars?.map((p, i) => {
    const color = PILLAR_COLORS[i % PILLAR_COLORS.length];
    return `
      <div class="rounded-xl p-4 space-y-2" style="border-left: 4px solid ${color}; background: ${color}18;">
        <p class="font-semibold text-sm" style="color:${color}">${p.title}</p>
        <p class="text-xs text-husk-body"><span class="font-medium text-husk-charcoal">Goal:</span> ${p.goal}</p>
        <ul class="list-disc list-inside text-xs text-husk-body space-y-0.5">
          ${p.dailyActions?.map(a => `<li>${a}</li>`).join('') ?? ''}
        </ul>
      </div>`;
  }).join('') ?? '';

  const table = plan.days?.length ? colorTable(
    [{ key: 'morningRoutine', label: 'Morning' },
     { key: 'eveningRoutine', label: 'Evening' },
     { key: 'focusActivity', label: 'Activity' }],
    plan.days
  ) : '';

  const body = `
    <p class="text-husk-gray text-sm mb-5">${plan.rationale}</p>
    ${plan.pillars?.length ? `<div class="grid grid-cols-2 gap-4 mb-6">${pillarsHtml}</div>` : ''}
    ${table}`;

  const card = planCard('mood-plan-card', 'Mood Enhancement Plan', `Personalized for ${memberName}`, body, 'mood');
  card.querySelector('.plan-export-btn').addEventListener('click', () => exportPlan('mood'));
}

// ── Export ─────────────────────────────────────────────────────────────────────

async function exportPlan(type) {
  const cardId = type === 'meal' ? 'meal-plan-card' : 'mood-plan-card';
  const btn = document.querySelector(`#${cardId} .plan-export-btn`);
  const origHTML = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<span class="flex items-center gap-2"><img src="/poppie.gif" class="w-4 h-4 rounded-full" alt="">Preparing<span class="loading-dot">.</span><span class="loading-dot">.</span><span class="loading-dot">.</span></span>`;

  try {
    const res = await fetch('/api/export-plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        memberName: currentMember?.name,
        clinicianName: currentMember?.clinicianName,
        clinicianType: currentMember?.clinicianType,
        brief: currentBrief,
        mealPlan: type === 'meal' ? currentMealPlan : null,
        moodPlan: type === 'mood' ? currentMoodPlan : null,
      }),
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(currentMember?.name ?? 'member').replace(/\s+/g, '-')}-${type}-plan.docx`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (err) {
    alert(`Export failed: ${err.message}`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = origHTML;
  }
}

// ── Alerts ─────────────────────────────────────────────────────────────────────

async function loadAlerts() {
  try {
    const res = await fetch('/api/alerts');
    renderAlerts(await res.json());
  } catch (err) {
    alertsEl.innerHTML = `<p class="text-red-600 text-sm">Failed to load alerts.</p>`;
  }
}

function renderAlerts(alerts) {
  if (!alerts.length) {
    alertsEl.innerHTML = `<p class="text-husk-gray text-sm">No active alerts.</p>`;
    return;
  }
  alertsEl.innerHTML = alerts.map(a => {
    const s = a.severity === 'high'
      ? 'bg-red-50 border-red-400 text-red-700'
      : 'bg-amber-50 border-amber-400 text-amber-700';
    return `
      <details class="border ${s} rounded-xl p-4">
        <summary class="cursor-pointer flex justify-between items-center font-medium text-sm">
          <span>${a.memberName} — ${a.summary}</span>
          <span class="text-xs uppercase tracking-wide font-semibold ml-2">${a.severity}</span>
        </summary>
        <p class="mt-2 text-sm">${a.detail}</p>
        <p class="mt-2 text-sm font-medium">Recommended: ${a.recommendedAction}</p>
      </details>`;
  }).join('');
}

// ── Init ───────────────────────────────────────────────────────────────────────

renderAppointments();
loadAlerts();
initTimeSaved();
