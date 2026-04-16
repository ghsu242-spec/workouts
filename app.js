// ============ STATE ============
const STORAGE_KEY = 'workout_tracker_v1';
const ENCOURAGE_KEY = 'workout_encourage_last';

const encouragements = [
  "Crushing it! 5 workouts logged — keep the streak alive. 🔥",
  "10 workouts strong. Your body's adapting, stay consistent. 💪",
  "15 sessions in. This is becoming a lifestyle. 🚀",
  "20 workouts! You're officially unstoppable. ⚡",
  "25 logged. Discipline > motivation. Proud of you. 🏆",
  "Another 5 down. Strength is built one rep at a time. 💥",
  "You showed up again. That's what separates you. 🌟",
  "Consistency compound interest. You're banking gains. 📈"
];

let state = {
  sessions: {}, // { 'YYYY-MM-DD': [ {id, name, sets: [{weight, reps}] } ] }
};
let editingExercise = null; // {date, id} or null

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) state = JSON.parse(raw);
  } catch (e) { console.warn('load failed', e); }
  if (!state.sessions) state.sessions = {};
}
function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

// ============ HELPERS ============
function todayKey() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}
function formatDate(key) {
  const d = new Date(key + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}
function formatShortDate(key) {
  const d = new Date(key + 'T00:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
function uid() { return Math.random().toString(36).slice(2, 10); }

function countTotalWorkouts() {
  // Each exercise entry = one "recorded workout" per user's spec
  let total = 0;
  for (const k in state.sessions) total += state.sessions[k].length;
  return total;
}

function countWeekWorkouts() {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  let n = 0;
  for (const k in state.sessions) {
    const d = new Date(k + 'T00:00:00');
    if (d >= weekAgo) n += state.sessions[k].length;
  }
  return n;
}

function countTodayWorkouts() {
  return (state.sessions[todayKey()] || []).length;
}

const TODAY_GOAL = 5;
const WEEK_GOAL = 15;
const MOVE_CIRCUMFERENCE = 2 * Math.PI * 86; // ≈ 540.35
const WEEK_CIRCUMFERENCE = 2 * Math.PI * 64; // ≈ 402.12

function setRing(el, value, goal, circumference) {
  const ratio = Math.min(1, goal > 0 ? value / goal : 0);
  el.style.strokeDashoffset = String(circumference * (1 - ratio));
}

// ============ RENDER ============
function render() {
  renderToday();
  renderHistory();
  renderProgress();
}

function renderToday() {
  const dateEl = document.getElementById('today-date');
  dateEl.textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' }).toUpperCase();

  const today = countTodayWorkouts();
  const week = countWeekWorkouts();
  document.getElementById('stat-total').textContent = countTotalWorkouts();
  document.getElementById('stat-today').textContent = today;
  document.getElementById('stat-week').textContent = week;
  setRing(document.getElementById('ring-move'), today, TODAY_GOAL, MOVE_CIRCUMFERENCE);
  setRing(document.getElementById('ring-week'), week, WEEK_GOAL, WEEK_CIRCUMFERENCE);

  const list = document.getElementById('today-exercises');
  const empty = document.getElementById('today-empty');
  const key = todayKey();
  const exercises = state.sessions[key] || [];

  list.innerHTML = '';
  if (exercises.length === 0) {
    empty.classList.add('visible');
  } else {
    empty.classList.remove('visible');
    exercises.forEach(ex => {
      const card = document.createElement('div');
      card.className = 'exercise-card';
      const setsHtml = ex.sets.map((s, i) =>
        `<div class="set-row"><div class="set-num">Set ${i + 1}</div><div class="set-detail">${s.weight} kg × ${s.reps} reps</div></div>`
      ).join('');
      card.innerHTML = `
        <div class="exercise-card-top">
          <div class="exercise-name">${escapeHtml(ex.name)}</div>
          <div class="exercise-actions">
            <button class="exercise-action" data-edit="${ex.id}">Edit</button>
            <button class="exercise-action delete" data-delete="${ex.id}">Delete</button>
          </div>
        </div>
        ${setsHtml}
      `;
      list.appendChild(card);
    });
    list.querySelectorAll('[data-edit]').forEach(b => b.addEventListener('click', () => openExerciseModal(b.dataset.edit)));
    list.querySelectorAll('[data-delete]').forEach(b => b.addEventListener('click', () => deleteExercise(b.dataset.delete)));
  }

  maybeShowEncouragement();
}

function renderHistory() {
  const list = document.getElementById('history-list');
  const empty = document.getElementById('history-empty');
  list.innerHTML = '';
  const keys = Object.keys(state.sessions).filter(k => state.sessions[k].length > 0).sort().reverse();
  if (keys.length === 0) { empty.classList.add('visible'); return; }
  empty.classList.remove('visible');

  keys.forEach(key => {
    const ex = state.sessions[key];
    const totalSets = ex.reduce((a, e) => a + e.sets.length, 0);
    const totalVol = Math.round(ex.reduce((a, e) => a + e.sets.reduce((b, s) => b + (Number(s.weight) || 0) * (Number(s.reps) || 0), 0), 0));

    const day = document.createElement('div');
    day.className = 'history-day';
    day.innerHTML = `
      <div class="history-day-header">
        <div>${formatShortDate(key)}</div>
        <div class="history-day-meta">${ex.length} exercises · ${totalSets} sets · ${totalVol} kg</div>
      </div>
      ${ex.map(e => `
        <div class="history-exercise">
          <div class="history-exercise-name">${escapeHtml(e.name)}</div>
          <div class="history-exercise-sets">${e.sets.map(s => `${s.weight}kg × ${s.reps}`).join('  ·  ')}</div>
        </div>
      `).join('')}
    `;
    list.appendChild(day);
  });
}

function renderProgress() {
  const list = document.getElementById('progress-list');
  const empty = document.getElementById('progress-empty');
  list.innerHTML = '';

  // aggregate max weight per exercise
  const byName = {};
  const keys = Object.keys(state.sessions).sort();
  keys.forEach(k => {
    (state.sessions[k] || []).forEach(e => {
      if (!byName[e.name]) byName[e.name] = [];
      const max = Math.max(0, ...e.sets.map(s => Number(s.weight) || 0));
      byName[e.name].push({ date: k, max });
    });
  });

  const names = Object.keys(byName);
  if (names.length === 0) { empty.classList.add('visible'); return; }
  empty.classList.remove('visible');

  names.forEach(name => {
    const entries = byName[name];
    const latest = entries[entries.length - 1].max;
    const first = entries[0].max;
    const diff = latest - first;
    const pct = first > 0 ? Math.round((diff / first) * 100) : 0;
    const arrow = diff > 0 ? '↑' : diff < 0 ? '↓' : '→';
    const cls = diff > 0 ? 'up' : diff < 0 ? 'down' : '';
    const maxEver = Math.max(...entries.map(e => e.max));
    const fill = maxEver > 0 ? (latest / maxEver) * 100 : 0;

    const card = document.createElement('div');
    card.className = 'progress-card';
    card.innerHTML = `
      <div class="progress-name">${escapeHtml(name)}</div>
      <div class="progress-meta">
        <span>Latest: <strong>${latest} kg</strong></span>
        <span>Best: <strong>${maxEver} kg</strong></span>
        <span class="${cls}">${arrow} ${Math.abs(diff)} kg ${first > 0 ? `(${pct > 0 ? '+' : ''}${pct}%)` : ''}</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${fill}%"></div></div>
    `;
    list.appendChild(card);
  });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ============ ENCOURAGEMENT ============
function maybeShowEncouragement() {
  const total = countTotalWorkouts();
  const banner = document.getElementById('encouragement-banner');
  if (total === 0 || total % 5 !== 0) { banner.classList.add('hidden'); return; }

  const lastShown = Number(localStorage.getItem(ENCOURAGE_KEY) || 0);
  if (lastShown === total) {
    // already celebrated this milestone — still show it for the session
    const idx = ((total / 5) - 1) % encouragements.length;
    banner.textContent = encouragements[idx];
    banner.classList.remove('hidden');
    return;
  }
  const idx = ((total / 5) - 1) % encouragements.length;
  banner.textContent = encouragements[idx];
  banner.classList.remove('hidden');
  localStorage.setItem(ENCOURAGE_KEY, String(total));
  if (navigator.vibrate) navigator.vibrate([40, 30, 40]);
}

// ============ MODAL ============
function openExerciseModal(editId = null) {
  editingExercise = null;
  const modal = document.getElementById('modal-exercise');
  const title = document.getElementById('exercise-modal-title');
  const nameInput = document.getElementById('exercise-name');
  const setsContainer = document.getElementById('sets-container');
  setsContainer.innerHTML = '';

  if (editId) {
    const key = todayKey();
    const ex = (state.sessions[key] || []).find(e => e.id === editId);
    if (ex) {
      editingExercise = { date: key, id: editId };
      title.textContent = 'Edit Exercise';
      nameInput.value = ex.name;
      ex.sets.forEach(s => addSetRow(s.weight, s.reps));
    }
  } else {
    title.textContent = 'Add Exercise';
    nameInput.value = '';
    addSetRow('', '');
  }

  modal.classList.add('visible');
  setTimeout(() => nameInput.focus(), 100);
}

function closeExerciseModal() {
  document.getElementById('modal-exercise').classList.remove('visible');
  editingExercise = null;
}

function addSetRow(weight = '', reps = '') {
  const container = document.getElementById('sets-container');
  const idx = container.children.length + 1;
  const row = document.createElement('div');
  row.className = 'set-input-row';
  row.innerHTML = `
    <div class="set-num-label">${idx}</div>
    <input type="number" inputmode="decimal" step="0.5" placeholder="0" class="w-input" value="${weight}" />
    <input type="number" inputmode="numeric" step="1" placeholder="0" class="r-input" value="${reps}" />
    <button class="set-remove" type="button" aria-label="Remove set">×</button>
  `;
  row.querySelector('.set-remove').addEventListener('click', () => {
    row.remove();
    renumberSets();
  });
  container.appendChild(row);
}

function renumberSets() {
  const rows = document.querySelectorAll('#sets-container .set-input-row');
  rows.forEach((r, i) => { r.querySelector('.set-num-label').textContent = i + 1; });
}

function saveExercise() {
  const name = document.getElementById('exercise-name').value.trim();
  if (!name) { alert('Please enter an exercise name.'); return; }
  const rows = document.querySelectorAll('#sets-container .set-input-row');
  const sets = [];
  rows.forEach(r => {
    const w = r.querySelector('.w-input').value;
    const reps = r.querySelector('.r-input').value;
    if (w !== '' && reps !== '') sets.push({ weight: Number(w), reps: Number(reps) });
  });
  if (sets.length === 0) { alert('Please add at least one set with weight and reps.'); return; }

  const key = todayKey();
  if (!state.sessions[key]) state.sessions[key] = [];

  if (editingExercise) {
    const idx = state.sessions[editingExercise.date].findIndex(e => e.id === editingExercise.id);
    if (idx >= 0) state.sessions[editingExercise.date][idx] = { id: editingExercise.id, name, sets };
  } else {
    state.sessions[key].push({ id: uid(), name, sets });
  }
  save();
  closeExerciseModal();
  render();
}

function deleteExercise(id) {
  if (!confirm('Delete this exercise?')) return;
  const key = todayKey();
  state.sessions[key] = (state.sessions[key] || []).filter(e => e.id !== id);
  save();
  render();
}

// ============ NAV ============
function switchView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.getElementById('view-' + name).classList.add('active');
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.view === name));
  window.scrollTo(0, 0);
}

// ============ INIT ============
document.addEventListener('DOMContentLoaded', () => {
  load();
  render();

  document.querySelectorAll('.tab').forEach(t => {
    t.addEventListener('click', () => switchView(t.dataset.view));
  });
  document.getElementById('btn-add-exercise').addEventListener('click', () => openExerciseModal());
  document.getElementById('exercise-cancel').addEventListener('click', closeExerciseModal);
  document.getElementById('exercise-done').addEventListener('click', saveExercise);
  document.getElementById('btn-add-set').addEventListener('click', () => addSetRow());
  document.getElementById('modal-exercise').addEventListener('click', (e) => {
    if (e.target.id === 'modal-exercise') closeExerciseModal();
  });

  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
});
