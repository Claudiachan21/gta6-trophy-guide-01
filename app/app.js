// Leonida Trophy Guide — tracker logic (offline, no network at run time).
// Loads app/data/trophies.json + app/data/roadmap.json, renders the checklist,
// filters, search, spoiler mode, localStorage progress, export / import.

const STORE_KEY = 'gta6-trophy-guide-v1';
const GRADE_ORDER = { platinum: 0, gold: 1, silver: 2, bronze: 3 };
const GRADE_LABEL = { platinum: 'Platinum', gold: 'Gold', silver: 'Silver', bronze: 'Bronze' };

const state = {
  trophies: [],
  stages: [],
  earned: new Set(),
  spoiler: false,
  filter: 'all',
  query: '',
  sort: 'id',
  openId: null,
};

const $ = (sel) => document.querySelector(sel);

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { earned: [], spoiler: false };
    const data = JSON.parse(raw);
    return {
      earned: Array.isArray(data.earned) ? data.earned : [],
      spoiler: data.spoiler === true,
    };
  } catch {
    return { earned: [], spoiler: false };
  }
}

function saveStore() {
  const data = {
    app: 'gta6-trophy-guide-01',
    version: 1,
    earned: [...state.earned].sort((a, b) => a - b),
    spoiler: state.spoiler,
    savedAt: new Date().toISOString(),
  };
  localStorage.setItem(STORE_KEY, JSON.stringify(data));
  const el = $('#save-state');
  if (el) el.textContent = `Progress saved in this browser (${data.earned.length} earned).`;
}

function isHidden(trophy) {
  return state.spoiler && trophy.secret && !state.earned.has(trophy.id);
}

function trophyMatches(trophy) {
  const q = state.query.trim().toLowerCase();
  if (q) {
    if (isHidden(trophy)) return false;
    const hay = `${trophy.name} ${trophy.description}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  switch (state.filter) {
    case 'all': return true;
    case 'story': return trophy.kind.includes('story');
    case 'missable': return trophy.missable === true;
    case 'collectibles': return trophy.kind.includes('collectibles');
    case 'activities': return trophy.kind.includes('activities');
    case 'online': return trophy.kind.includes('online');
    case 'earned': return state.earned.has(trophy.id);
    case 'todo': return !state.earned.has(trophy.id);
    default: return true;
  }
}

function sortedTrophies(list) {
  const copy = [...list];
  if (state.sort === 'grade') {
    copy.sort((a, b) => GRADE_ORDER[a.grade] - GRADE_ORDER[b.grade] || a.id - b.id);
  } else if (state.sort === 'name') {
    copy.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    copy.sort((a, b) => a.id - b.id);
  }
  return copy;
}

function gradeTag(trophy) {
  return `<span class="tag tag-${trophy.grade}">${GRADE_LABEL[trophy.grade]}</span>`;
}

function kindTags(trophy) {
  let tags = trophy.kind.map((k) => `<span class="tag tag-kind">${k}</span>`).join('');
  if (trophy.missable) tags += '<span class="tag tag-missable">Missable</span>';
  return tags;
}

function renderList() {
  const list = $('#trophy-list');
  const visible = sortedTrophies(state.trophies.filter(trophyMatches));
  $('#result-count').textContent = `Showing ${visible.length} of ${state.trophies.length} trophies`;

  if (visible.length === 0) {
    list.innerHTML = '<p class="empty">No trophies match this filter yet. Try another filter or clear the search.</p>';
    return;
  }

  list.innerHTML = '';
  for (const trophy of visible) {
    const earned = state.earned.has(trophy.id);
    const hidden = isHidden(trophy);
    const card = document.createElement('article');
    card.className = `trophy${earned ? ' is-earned' : ''}${state.openId === trophy.id ? ' is-open' : ''}`;
    card.dataset.id = trophy.id;
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    card.setAttribute('aria-label', hidden ? `Hidden story trophy ${trophy.id}` : `${trophy.name}, ${GRADE_LABEL[trophy.grade]}`);
    card.innerHTML = `
      <button class="t-check" aria-pressed="${earned}" aria-label="${earned ? 'Mark as not earned' : 'Mark as earned'}" title="${earned ? 'Mark as not earned' : 'Mark as earned'}">${earned ? '✓' : ''}</button>
      <div class="t-body">
        ${hidden
          ? `<div class="t-name t-hidden">Hidden story trophy</div>
             <div class="t-desc">Earn this trophy to reveal its name and description.</div>`
          : `<div class="t-name">${escapeHtml(trophy.name)}</div>
             <div class="t-desc">${escapeHtml(trophy.description)}</div>`}
        <div class="t-tags">${gradeTag(trophy)}${kindTags(trophy)}</div>
      </div>
      <div class="t-points">${trophy.points} pts</div>`;
    card.querySelector('.t-check').addEventListener('click', (ev) => {
      ev.stopPropagation();
      toggleEarned(trophy.id);
    });
    card.addEventListener('click', () => openDetail(trophy.id));
    card.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openDetail(trophy.id); }
    });
    list.appendChild(card);
  }
}

function renderCounts() {
  const counts = { all: state.trophies.length, earned: state.earned.size, todo: state.trophies.length - state.earned.size };
  for (const kind of ['story', 'missable', 'collectibles', 'activities', 'online']) {
    counts[kind] = state.trophies.filter((t) => kind === 'missable' ? t.missable === true : t.kind.includes(kind)).length;
  }
  for (const [key, value] of Object.entries(counts)) {
    const el = document.querySelector(`[data-count="${key}"]`);
    if (el) el.textContent = value;
  }
  const note = $('#filter-note');
  if (state.filter === 'online') {
    note.textContent = 'GTA VI has no online trophies — all 55 are single-player.';
  } else if (state.filter === 'missable') {
    note.textContent = 'Only one trophy can be missed. Everything else is still earnable in free-roam after the story.';
  } else {
    note.textContent = '';
  }
}

function renderProgress() {
  const earned = state.earned.size;
  const total = state.trophies.length;
  const points = state.trophies.reduce((sum, t) => sum + (state.earned.has(t.id) ? t.points : 0), 0);
  const pct = total === 0 ? 0 : Math.round((earned / total) * 100);
  $('#earned-count').textContent = earned;
  $('#points').textContent = points.toLocaleString('en-US');
  $('#plat-pct').textContent = `${pct}%`;
  $('#plat-fill').style.width = `${pct}%`;
}

function renderRoadmap() {
  const box = $('#roadmap');
  box.innerHTML = '';
  for (const stage of state.stages) {
    const ids = stage.trophies;
    const done = ids.filter((id) => state.earned.has(id)).length;
    const li = document.createElement('li');
    if (done === ids.length) li.className = 'done';
    li.innerHTML = `
      <span class="stage-num">${done === ids.length ? '✓' : stage.n}</span>
      <div>
        <div class="stage-title">${escapeHtml(stage.title)}</div>
        <div class="stage-desc">${escapeHtml(stage.desc)}</div>
        <div class="stage-prog">${done} / ${ids.length} trophies</div>
      </div>`;
    box.appendChild(li);
  }
}

function openDetail(id) {
  const trophy = state.trophies.find((t) => t.id === id);
  if (!trophy) return;
  state.openId = id;
  const body = $('#detail-body');
  const earned = state.earned.has(id);
  const hidden = isHidden(trophy);
  const stage = state.stages.find((s) => s.trophies.includes(id));

  if (hidden) {
    body.innerHTML = `
      <div class="d-grade">${gradeTag(trophy)}</div>
      <h2 class="d-name">Hidden story trophy</h2>
      <p class="d-desc">This is a secret story trophy. Turn off spoiler-free mode, or earn it,
      to reveal its name, description and guide.</p>
      <div class="d-actions">
        <button class="btn btn-primary" id="d-toggle">${earned ? 'Mark as not earned' : 'Mark as earned'}</button>
      </div>`;
  } else {
    const steps = Array.isArray(trophy.steps) && trophy.steps.length > 0
      ? `<div class="d-sec">Steps</div><ol class="d-steps">${trophy.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join('')}</ol>`
      : '';
    const missable = trophy.missable
      ? `<div class="d-note"><strong>Missable.</strong> ${escapeHtml(trophy.missableNote || 'This trophy can be missed — see the guide before you pass the point of no return.')}</div>`
      : `<div class="d-note" style="border-color: var(--border); background: transparent;"><strong>Not missable.</strong> Still earnable in free-roam after the story.</div>`;
    body.innerHTML = `
      <div class="d-grade">${gradeTag(trophy)}<span class="tag tag-kind">${trophy.kind.join(' · ')}</span>${trophy.missable ? '<span class="tag tag-missable">Missable</span>' : ''}</div>
      <h2 class="d-name">${escapeHtml(trophy.name)}</h2>
      <p class="d-desc"><strong>Official description:</strong> ${escapeHtml(trophy.description)}</p>
      <div class="d-sec">Guide</div>
      <p class="d-guide">${escapeHtml(trophy.guide)}</p>
      ${steps}
      ${missable}
      <div class="d-sec">Source</div>
      <p class="d-source">${escapeHtml(trophy.source.name)} — <a href="${escapeHtml(trophy.source.url)}" target="_blank" rel="noopener">${escapeHtml(trophy.source.url)}</a></p>
      ${stage ? `<div class="d-sec">Roadmap</div><p class="d-source">Stage ${stage.n} — ${escapeHtml(stage.title)}</p>` : ''}
      <div class="d-actions">
        <button class="btn btn-primary" id="d-toggle">${earned ? 'Mark as not earned' : 'Mark as earned'}</button>
      </div>`;
  }
  document.querySelector('#d-toggle').addEventListener('click', () => toggleEarned(id));
  $('#detail').hidden = false;
  document.querySelectorAll('.trophy.is-open').forEach((el) => el.classList.remove('is-open'));
  document.querySelector(`.trophy[data-id="${id}"]`)?.classList.add('is-open');
  positionDetail();
}

// Keep the slide-over below the header so the platinum progress card stays visible
// while a guide is open; once the header has scrolled away the panel docks to the top.
function positionDetail() {
  const panel = $('#detail');
  if (panel.hidden || state.openId === null) return;
  if (window.innerWidth <= 860) {
    panel.style.top = '';
    return;
  }
  const header = document.querySelector('.top');
  const top = Math.max(0, (header ? header.offsetHeight : 0) - window.scrollY);
  panel.style.top = `${top}px`;
}

function closeDetail() {
  $('#detail').hidden = true;
  state.openId = null;
  document.querySelectorAll('.trophy.is-open').forEach((el) => el.classList.remove('is-open'));
}

function toggleEarned(id) {
  if (state.earned.has(id)) state.earned.delete(id);
  else state.earned.add(id);
  saveStore();
  renderAll();
  if (state.openId === id) openDetail(id);
}

function renderAll() {
  renderCounts();
  renderProgress();
  renderRoadmap();
  renderList();
}

function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

async function loadData() {
  const [trophiesRes, roadmapRes] = await Promise.all([
    fetch('data/trophies.json'),
    fetch('data/roadmap.json'),
  ]);
  const trophiesData = await trophiesRes.json();
  const roadmapData = await roadmapRes.json();
  state.trophies = trophiesData.trophies;
  state.stages = roadmapData.stages;
}

function exportProgress() {
  const data = {
    app: 'gta6-trophy-guide-01',
    version: 1,
    earned: [...state.earned].sort((a, b) => a - b),
    spoiler: state.spoiler,
    exportedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'gta6-trophy-progress.json';
  a.click();
  URL.revokeObjectURL(url);
}

function importProgress(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result));
      if (!Array.isArray(data.earned)) throw new Error('no earned list');
      const valid = new Set(state.trophies.map((t) => t.id));
      state.earned = new Set(data.earned.filter((id) => valid.has(id)));
      if (data.spoiler === true || data.spoiler === false) state.spoiler = data.spoiler;
      $('#spoiler-toggle').checked = state.spoiler;
      saveStore();
      renderAll();
      if (state.openId !== null) openDetail(state.openId);
      $('#save-state').textContent = `Imported progress (${state.earned.size} earned).`;
    } catch {
      $('#save-state').textContent = 'That file is not a valid progress export.';
    }
  };
  reader.readAsText(file);
}

function bindEvents() {
  $('#search').addEventListener('input', (ev) => { state.query = ev.target.value; renderList(); });
  $('#sort').addEventListener('change', (ev) => { state.sort = ev.target.value; renderList(); });
  document.querySelectorAll('#filter-chips .chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      document.querySelectorAll('#filter-chips .chip').forEach((c) => c.classList.remove('is-active'));
      chip.classList.add('is-active');
      state.filter = chip.dataset.filter;
      renderCounts();
      renderList();
    });
  });
  $('#spoiler-toggle').addEventListener('change', (ev) => {
    state.spoiler = ev.target.checked;
    saveStore();
    renderAll();
    if (state.openId !== null) openDetail(state.openId);
  });
  $('#btn-export').addEventListener('click', exportProgress);
  $('#btn-import').addEventListener('click', () => $('#import-file').click());
  $('#import-file').addEventListener('change', (ev) => {
    if (ev.target.files && ev.target.files[0]) importProgress(ev.target.files[0]);
    ev.target.value = '';
  });
  $('#btn-reset').addEventListener('click', () => {
    if (window.confirm('Reset all earned trophies? This cannot be undone.')) {
      state.earned = new Set();
      saveStore();
      renderAll();
      if (state.openId !== null) openDetail(state.openId);
    }
  });
  $('#detail-close').addEventListener('click', closeDetail);
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') closeDetail();
  });
  window.addEventListener('scroll', positionDetail, { passive: true });
  window.addEventListener('resize', positionDetail);
}

async function init() {
  const stored = loadStore();
  state.earned = new Set(stored.earned);
  state.spoiler = stored.spoiler;
  $('#spoiler-toggle').checked = state.spoiler;
  await loadData();
  bindEvents();
  renderAll();
  if (stored.earned.length > 0) {
    $('#save-state').textContent = `Progress loaded from this browser (${stored.earned.length} earned).`;
  }
  // Staging hook for screenshots: the shoot script waits for this flag.
  window.__shotReady = true;
}

init();
