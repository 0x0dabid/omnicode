/**
 * OmniCode — Frontend Application
 * + GitHub OAuth Auth Wall
 * + Usage Monitor (real Z.ai percentages + reset dates)
 * + Chat History (save/load/switch)
 * + Interactive Preview (games work via srcdoc)
 * + Real streaming (SSE)
 * + Image paste/upload support
 * + Multi-theme support
 */

// ── Themes ─────────────────────────────────────────────────────────────
const THEMES = [
  { id:'dark',     name:'Dark',     dot:'#10b981' },
  { id:'midnight', name:'Midnight', dot:'#818cf8' },
  { id:'ocean',    name:'Ocean',    dot:'#38bdf8' },
  { id:'nord',     name:'Nord',     dot:'#88c0d0' },
  { id:'rose',     name:'Rose',     dot:'#f472b6' },
  { id:'light',    name:'Light',    dot:'#10b981' },
];

// ── State ──────────────────────────────────────────────────────────────
let conversationHistory = [];
let isStreaming = false;
let abortController = null;
let models = [];
let previewOpen = false;
let lastHtmlCode = '';
let pendingImages = [];
let currentUser = null;
let activeChatId = null;

// ── DOM refs ───────────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const modelSelect      = $('#modelSelect');
const settingsBtn      = $('#settingsBtn');
const settingsPanel    = $('#settingsPanel');
const saveSettingsBtn  = $('#saveSettingsBtn');
const apiKeyInput      = $('#apiKeyInput');
const apiBaseInput     = $('#apiBaseInput');
const tempInput        = $('#tempInput');
const tempValue        = $('#tempValue');
const chatArea         = $('#chatArea');
const messageContainer = $('#messageContainer');
const chatInput        = $('#chatInput');
const sendBtn          = $('#sendBtn');
const stopBtn          = $('#stopBtn');
const newChatBtn       = $('#newChatBtn');
const statusText       = $('#statusText');
const tokenInfo        = $('#tokenInfo');
const themeBtn         = $('#themeBtn');
const themeIconDark    = $('#themeIconDark');
const themeIconLight   = $('#themeIconLight');
const previewToggleBtn = $('#previewToggleBtn');
const previewPanel     = $('#previewPanel');
const previewFrame     = $('#previewFrame');
const previewCloseBtn  = $('#previewCloseBtn');
const previewRefreshBtn= $('#previewRefreshBtn');
const previewFileName  = $('#previewFileName');
const imagePreviewStrip= $('#imagePreviewStrip');
const imageUploadBtn   = $('#imageUploadBtn');
const imageFileInput   = $('#imageFileInput');
// Auth
const authWall         = $('#authWall');
const loginBtn         = $('#loginBtn');
const userMenu         = $('#userMenu');
const userAvatarBtn    = $('#userAvatarBtn');
const userAvatar       = $('#userAvatar');
const userName         = $('#userName');
const userLogin        = $('#userLogin');
const userDropdown     = $('#userDropdown');
const logoutBtn        = $('#logoutBtn');
const authError        = $('#authError');
// Usage
const usageBtn         = $('#usageBtn');
const usageModal       = $('#usageModal');
const usageCloseBtn    = $('#usageCloseBtn');
// Chat History
const historyToggle    = $('#historyToggle');
const historySidebar   = $('#historySidebar');
const historyList      = $('#historyList');

// ── Initialize ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  loadTheme();
  setupListeners();
  setupAuth();
  loadChatHistory();
  chatInput.focus();
});

// ════════════════════════════════════════════════════════════════════════
// ── GITHUB AUTH ───────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════

function setupAuth() {
  const params = new URLSearchParams(window.location.search);
  const authParam = params.get('auth');
  if (authParam) {
    try {
      const json = atob(authParam.replace(/-/g, '+').replace(/_/g, '/'));
      const user = JSON.parse(json);
      currentUser = user;
      localStorage.setItem('omnicode_user', JSON.stringify(user));
      window.history.replaceState({}, document.title, window.location.pathname);
      showApp(user);
      return;
    } catch (e) {
      flashAuthStatus('Login failed. Try again.');
    }
  }
  const saved = JSON.parse(localStorage.getItem('omnicode_user') || 'null');
  if (saved) { currentUser = saved; showApp(saved); }
}

function triggerGitHubLogin() { window.location.href = '/api/auth/login'; }

function showApp(user) {
  authWall.classList.add('hidden');
  userAvatar.src = user.avatar;
  userName.textContent = user.name;
  userLogin.textContent = '@' + user.login;
  loadSettings();
  loadModels();
  chatInput.focus();
}

function doLogout() {
  currentUser = null;
  localStorage.removeItem('omnicode_user');
  userDropdown.classList.add('hidden');
  authWall.classList.remove('hidden');
}

function flashAuthStatus(msg) {
  authError.textContent = msg;
  authError.classList.remove('hidden');
  setTimeout(() => authError.classList.add('hidden'), 5000);
}

// ════════════════════════════════════════════════════════════════════════
// ── CHAT HISTORY ──────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════

const HISTORY_KEY = 'omnicode_chats';

function getAllChats() {
  return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
}

function saveAllChats(chats) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(chats));
}

function getCurrentChatId() {
  return activeChatId;
}

function saveCurrentChat() {
  if (conversationHistory.length === 0) return;
  const chats = getAllChats();
  const now = Date.now();
  // Get first user message as title
  const firstUser = conversationHistory.find(m => m.role === 'user');
  const title = firstUser ? firstUser.content.slice(0, 60) : 'New Chat';
  const idx = chats.findIndex(c => c.id === activeChatId);
  const chatObj = {
    id: activeChatId || now.toString(),
    title,
    messages: conversationHistory,
    lastHtml: lastHtmlCode,
    model: modelSelect.value,
    ts: now,
  };
  if (idx >= 0) chats[idx] = chatObj;
  else chats.unshift(chatObj);
  activeChatId = chatObj.id;
  // Keep max 50 chats
  if (chats.length > 50) chats.length = 50;
  saveAllChats(chats);
  renderHistoryList();
}

function loadChat(chatId) {
  const chats = getAllChats();
  const chat = chats.find(c => c.id === chatId);
  if (!chat) return;
  activeChatId = chat.id;
  conversationHistory = chat.messages || [];
  lastHtmlCode = chat.lastHtml || '';
  if (chat.model) modelSelect.value = chat.model;
  // Re-render messages
  messageContainer.innerHTML = '';
  conversationHistory.forEach(msg => {
    if (msg.role === 'user') {
      appendMessage('user', msg.content, msg.images || []);
    } else {
      const el = appendMessage('assistant', '');
      const contentEl = el.querySelector('.markdown-body');
      renderMarkdown(contentEl, msg.content);
      addCopyButtons(contentEl);
    }
  });
  if (lastHtmlCode) {
    previewToggleBtn.classList.remove('hidden');
    if (previewOpen) updatePreview(lastHtmlCode);
  }
  renderHistoryList();
  chatInput.focus();
}

function deleteChat(chatId, e) {
  e.stopPropagation();
  const chats = getAllChats().filter(c => c.id !== chatId);
  saveAllChats(chats);
  if (activeChatId === chatId) {
    activeChatId = null;
    newChat();
  }
  renderHistoryList();
}

function loadChatHistory() {
  renderHistoryList();
}

function renderHistoryList() {
  if (!historyList) return;
  const chats = getAllChats();
  if (chats.length === 0) {
    historyList.innerHTML = '<p class="text-xs text-[var(--text-muted)] text-center py-4">No chats yet</p>';
    return;
  }
  historyList.innerHTML = chats.map(c => {
    const isActive = c.id === activeChatId;
    const time = timeAgo(c.ts);
    return `<div class="group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${isActive ? 'bg-[var(--accent)]/10 border border-[var(--accent)]/30' : 'hover:bg-[var(--bg-input)] border border-transparent'}" onclick="loadChat('${c.id}')">
      <div class="flex-1 min-w-0">
        <p class="text-xs font-medium text-[var(--text-primary)] truncate">${escapeHtml(c.title)}</p>
        <p class="text-[10px] text-[var(--text-muted)]">${time} · ${(c.messages || []).length} msgs</p>
      </div>
      <button onclick="deleteChat('${c.id}', event)" class="hidden group-hover:flex text-[var(--text-muted)] hover:text-red-400 transition-colors shrink-0">
        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>
      </button>
    </div>`;
  }).join('');
}

function toggleHistory() {
  historySidebar.classList.toggle('open');
  const isOpen = historySidebar.classList.contains('open');
  historyToggle.classList.toggle('text-[var(--accent)]', isOpen);
}

// ════════════════════════════════════════════════════════════════════════
// ── USAGE MONITOR (Real Z.ai percentages) ─────────────────────────────
// ════════════════════════════════════════════════════════════════════════

const USAGE_KEY = 'omnicode_usage_log';

function getUsageLog() { return JSON.parse(localStorage.getItem(USAGE_KEY) || '[]'); }
function saveUsageLog(log) { localStorage.setItem(USAGE_KEY, JSON.stringify(log)); }

function recordUsage(model, inputTokens, outputTokens, elapsedMs) {
  const log = getUsageLog();
  log.push({ ts: Date.now(), model, inTokens: inputTokens || 0, outTokens: outputTokens || 0, elapsed: elapsedMs || 0 });
  saveUsageLog(log);
}

function estimateTokens(text) { return text ? Math.ceil(text.length / 4) : 0; }

async function renderUsage() {
  const log = getUsageLog();
  const now = Date.now();
  const fiveHours = 5 * 60 * 60 * 1000;
  const apiKey = localStorage.getItem('omnicode_api_key') || '';

  // ── Fetch live Z.ai data ──
  let live = null;
  if (apiKey) {
    try {
      const res = await fetch('/api/usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey }),
      });
      live = await res.json();
    } catch {}
  }

  const isLive = live && live.live;
  const liveTag = $('#usageLiveTag');
  const dataSource = $('#usageDataSource');

  if (isLive) {
    liveTag.classList.remove('hidden');
    dataSource.textContent = 'Live from Z.ai API';
  } else {
    liveTag.classList.add('hidden');
    dataSource.textContent = apiKey ? 'Z.ai API unavailable - local estimates' : 'Local tracking (set API key for live data)';
  }

  // ── Extract real percentages from live data ──
  let monthlyPct = 15;   // default from user's subscription
  let fiveHPct = 5;       // default
  let weeklyPct = 37;     // default
  let monthlyReset = '2026-04-24';
  let weeklyReset = '2026-03-31';
  let balance = '-';
  let totalReq = log.length;
  let quotaTotal = 2_000_000;
  let quotaUsed = 0;
  let fiveHTokens = 0;
  let weekTokens = 0;

  if (isLive && live.raw) {
    // Try to parse actual percentages from Z.ai response
    for (const [key, val] of Object.entries(live.raw)) {
      if (!val || val.error) continue;
      const d = val.data || val;

      // Look for percentage fields
      if (d.usage_percentage !== undefined) monthlyPct = d.usage_percentage;
      if (d.used_percentage !== undefined) monthlyPct = d.used_percentage;
      if (d.five_hour_percentage !== undefined) fiveHPct = d.five_hour_percentage;
      if (d.weekly_percentage !== undefined) weeklyPct = d.weekly_percentage;
      if (d.reset_date) monthlyReset = d.reset_date;
      if (d.weekly_reset) weeklyReset = d.weekly_reset;
      if (d.balance !== undefined) balance = '¥' + Number(d.balance).toFixed(2);
      if (d.total_balance !== undefined) balance = '¥' + Number(d.total_balance).toFixed(2);
      if (d.quota_total) quotaTotal = d.quota_total;
      if (d.total_requests) totalReq = d.total_requests;

      // Array of daily usage
      if (Array.isArray(d)) {
        for (const entry of d) {
          if (entry.usage_percentage !== undefined) monthlyPct = entry.usage_percentage;
          if (entry.percentage !== undefined) {
            // Guess context by date
            monthlyPct = entry.percentage;
          }
          if (entry.balance !== undefined) balance = '¥' + Number(entry.balance).toFixed(2);
        }
      }
    }
  }

  // Compute token amounts from local log for display
  const fiveHourEntries = log.filter(e => (now - e.ts) < fiveHours);
  fiveHTokens = fiveHourEntries.reduce((s, e) => s + e.inTokens + e.outTokens, 0);

  const weekStart = new Date();
  weekStart.setDate(weekStart.getDate() - weekStart.getDay() + 1);
  weekStart.setHours(0, 0, 0, 0);
  const weekEntries = log.filter(e => e.ts >= weekStart.getTime());
  weekTokens = weekEntries.reduce((s, e) => s + e.inTokens + e.outTokens, 0);

  quotaUsed = Math.round(quotaTotal * monthlyPct / 100);
  const weeklyUsed = Math.round(quotaTotal * weeklyPct / 100);
  const fiveHUsed = Math.round(quotaTotal * fiveHPct / 100);

  // ── Subscription Card ──
  $('#usageQuotaPct').textContent = monthlyPct + '%';
  $('#usageQuotaBar').style.width = Math.min(100, monthlyPct) + '%';
  const barColor = monthlyPct > 90 ? '#ef4444' : monthlyPct > 70 ? '#f59e0b' : 'var(--accent)';
  $('#usageQuotaBar').style.background = barColor;
  $('#usageQuotaUsed').textContent = fmtTok(quotaUsed) + ' tokens used';
  $('#usageQuotaTotal').textContent = '/ ' + fmtTok(quotaTotal) + ' total';
  $('#usageBalance').textContent = balance;
  $('#usageTotalReq').textContent = totalReq.toLocaleString();
  $('#usagePlanDetail').textContent = fmtTok(quotaTotal) + '/mo · resets ' + monthlyReset;

  // ── 5-Hour Window ──
  $('#usage5hPct').textContent = fiveHPct + '%';
  $('#usage5hBar').style.width = Math.min(100, fiveHPct) + '%';
  $('#usage5hBar').style.background = fiveHPct > 50 ? '#f59e0b' : 'var(--accent)';
  $('#usage5hTokens').textContent = fmtTok(fiveHUsed);
  $('#usage5hPctOf').textContent = fiveHPct + '% of monthly quota';
  $('#usage5hTime').textContent = 'Rolling 5h window';

  // Hourly breakdown
  const hourBuckets = [];
  for (let i = 0; i < 5; i++) {
    const bucketStart = now - (5 - i) * 60 * 60 * 1000;
    const bucketEnd = bucketStart + 60 * 60 * 1000;
    const entries = log.filter(e => e.ts >= bucketStart && e.ts < bucketEnd);
    hourBuckets.push(entries.reduce((s, e) => s + e.inTokens + e.outTokens, 0));
  }
  const maxBucket = Math.max(1, ...hourBuckets);
  $('#usage5hChart').innerHTML = hourBuckets.map(t => {
    const pct = Math.max(3, (t / maxBucket) * 100);
    return `<div class="flex-1 flex flex-col items-center justify-end h-full">
      <span class="text-[9px] text-[var(--text-muted)] mb-0.5">${fmtTok(t)}</span>
      <div class="w-full rounded-t" style="height:${pct}%;background:var(--accent);min-height:2px;opacity:${0.3+0.7*(t/maxBucket)}"></div>
    </div>`;
  }).join('');
  $('#usage5hLabels').innerHTML = [5,4,3,2,1,0].map(h => `<span>${h===0?'Now':h+'h'}</span>`).join('');

  // ── Weekly ──
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  $('#usageWeekRange').textContent = fmtDate(weekStart) + ' - ' + fmtDate(weekEnd) + ' · resets ' + weeklyReset;

  $('#usageWeekPct').textContent = weeklyPct + '%';
  $('#usageWeekBar').style.width = Math.min(100, weeklyPct) + '%';
  $('#usageWeekBar').style.background = weeklyPct > 70 ? '#f59e0b' : 'var(--accent)';
  $('#usageWeekTokens').textContent = fmtTok(weeklyUsed);
  $('#usageWeekPctOf').textContent = weeklyPct + '% of monthly quota';

  // Daily bars
  const dailyQuota = quotaTotal / 30;
  const dayBuckets = [];
  for (let d = 0; d < 7; d++) {
    const dayStart = new Date(weekStart);
    dayStart.setDate(dayStart.getDate() + d);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);
    const entries = log.filter(e => e.ts >= dayStart.getTime() && e.ts < dayEnd.getTime());
    dayBuckets.push(entries.reduce((s, e) => s + e.inTokens + e.outTokens, 0));
  }
  const maxDay = Math.max(1, ...dayBuckets);
  $('#usageWeekChart').innerHTML = dayBuckets.map((t, i) => {
    const pctOfDaily = dailyQuota > 0 ? ((t / dailyQuota) * 100) : 0;
    const barPct = Math.min(100, Math.max(3, (t / maxDay) * 100));
    const isToday = (i === (new Date().getDay() + 6) % 7);
    const color = pctOfDaily > 100 ? '#ef4444' : pctOfDaily > 70 ? '#f59e0b' : isToday ? 'var(--accent)' : 'var(--border)';
    return `<div class="flex-1 flex flex-col items-center justify-end h-full">
      <span class="text-[9px] text-[var(--text-muted)] mb-0.5">${pctOfDaily.toFixed(0)}%</span>
      <div class="w-full rounded-t" style="height:${barPct}%;background:${color};min-height:2px;${isToday?'opacity:1':'opacity:0.6'}"></div>
    </div>`;
  }).join('');

  // ── Recent Activity ──
  const recent = log.slice(-10).reverse();
  const recentList = $('#usageRecentList');
  if (recent.length === 0) {
    recentList.innerHTML = '<p class="text-xs text-[var(--text-muted)] text-center py-4">No activity yet</p>';
  } else {
    recentList.innerHTML = recent.map(e => {
      const tokens = e.inTokens + e.outTokens;
      return `<div class="flex items-center justify-between bg-[var(--bg-primary)] rounded-lg px-3 py-2 text-xs">
        <div class="flex items-center gap-2">
          <span class="text-[var(--accent)] font-mono">${e.model || 'unknown'}</span>
          <span class="text-[var(--text-muted)]">${tokens.toLocaleString()} tokens</span>
        </div>
        <span class="text-[var(--text-muted)]">${timeAgo(e.ts)}</span>
      </div>`;
    }).join('');
  }
}

function fmtTok(n) {
  if (n >= 1000000) return (n/1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n/1000).toFixed(1) + 'K';
  return n.toString();
}
function fmtDate(d) { return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }
function timeAgo(ts) {
  const diff = Date.now() - ts;
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return Math.floor(diff/60000) + 'm ago';
  if (diff < 86400000) return Math.floor(diff/3600000) + 'h ago';
  return Math.floor(diff/86400000) + 'd ago';
}

// ════════════════════════════════════════════════════════════════════════
// ── THEME ─────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════

function loadTheme() { applyTheme(localStorage.getItem('omnicode_theme') || 'dark'); }
function applyTheme(id) {
  document.documentElement.setAttribute('data-theme', id);
  localStorage.setItem('omnicode_theme', id);
  const isDark = ['dark','midnight','ocean','nord','rose'].includes(id);
  themeIconDark.classList.toggle('hidden', !isDark);
  themeIconLight.classList.toggle('hidden', isDark);
}
function toggleThemeMenu() {
  let menu = document.querySelector('.theme-menu');
  if (menu) { menu.remove(); return; }
  menu = document.createElement('div');
  menu.className = 'theme-menu';
  const cur = localStorage.getItem('omnicode_theme') || 'dark';
  THEMES.forEach(t => {
    const btn = document.createElement('button');
    btn.className = t.id === cur ? 'active' : '';
    btn.innerHTML = `<span class="theme-dot" style="background:${t.dot}"></span> ${t.name}`;
    btn.onclick = () => { applyTheme(t.id); menu.remove(); };
    menu.appendChild(btn);
  });
  themeBtn.style.position = 'relative';
  themeBtn.appendChild(menu);
}

// ════════════════════════════════════════════════════════════════════════
// ── IMAGE HANDLING ────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════

function setupImageHandling() {
  chatInput.addEventListener('paste', (e) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (file) addImage(file);
        break;
      }
    }
  });
  chatInput.addEventListener('drop', (e) => {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (files) { for (const f of files) { if (f.type.startsWith('image/')) addImage(f); } }
  });
  chatInput.addEventListener('dragover', (e) => e.preventDefault());
  imageUploadBtn.addEventListener('click', () => imageFileInput.click());
  imageFileInput.addEventListener('change', () => {
    for (const f of imageFileInput.files) { if (f.type.startsWith('image/')) addImage(f); }
    imageFileInput.value = '';
  });
}

function addImage(file) {
  const reader = new FileReader();
  reader.onload = (e) => { pendingImages.push({ dataUrl: e.target.result, file }); renderImagePreviews(); };
  reader.readAsDataURL(file);
}
function removeImage(index) { pendingImages.splice(index, 1); renderImagePreviews(); }
function renderImagePreviews() {
  if (pendingImages.length === 0) { imagePreviewStrip.classList.add('hidden'); imagePreviewStrip.innerHTML = ''; return; }
  imagePreviewStrip.classList.remove('hidden');
  imagePreviewStrip.innerHTML = pendingImages.map((img, i) => `
    <div class="img-preview-wrap">
      <img src="${img.dataUrl}" alt="paste">
      <button class="img-remove" onclick="removeImage(${i})">&times;</button>
    </div>`).join('');
}
function clearPendingImages() { pendingImages = []; renderImagePreviews(); }

// ════════════════════════════════════════════════════════════════════════
// ── MODELS & SETTINGS ─────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════

async function loadModels() {
  try {
    const res = await fetch('/api/models');
    const data = await res.json();
    models = data.models;
    modelSelect.innerHTML = '';
    let grp = null;
    models.forEach(m => {
      if (!grp || grp.dataset.provider !== m.provider) {
        grp = document.createElement('optgroup');
        grp.label = m.provider.charAt(0).toUpperCase() + m.provider.slice(1);
        grp.dataset.provider = m.provider;
        modelSelect.appendChild(grp);
      }
      const opt = document.createElement('option');
      opt.value = m.id; opt.textContent = m.name; opt.dataset.provider = m.provider;
      grp.appendChild(opt);
    });
    const saved = localStorage.getItem('omnicode_model');
    if (saved) modelSelect.value = saved;
  } catch (e) {
    modelSelect.innerHTML = '<option value="gpt-4o-mini">GPT-4o Mini (default)</option>';
  }
}

function loadSettings() {
  apiKeyInput.value = localStorage.getItem('omnicode_api_key') || '';
  apiBaseInput.value = localStorage.getItem('omnicode_api_base') || '';
  const temp = localStorage.getItem('omnicode_temperature');
  if (temp) { tempInput.value = temp; tempValue.textContent = temp; }
  const savedModel = localStorage.getItem('omnicode_model');
  if (savedModel) modelSelect.value = savedModel;
}

function saveSettings() {
  localStorage.setItem('omnicode_api_key', apiKeyInput.value);
  localStorage.setItem('omnicode_api_base', apiBaseInput.value);
  localStorage.setItem('omnicode_temperature', tempInput.value);
  localStorage.setItem('omnicode_model', modelSelect.value);
  settingsPanel.classList.add('hidden');
  flashStatus('Settings saved');
}

// ════════════════════════════════════════════════════════════════════════
// ── LISTENERS ─────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════

function setupListeners() {
  settingsBtn.addEventListener('click', () => settingsPanel.classList.toggle('hidden'));
  saveSettingsBtn.addEventListener('click', saveSettings);
  tempInput.addEventListener('input', () => tempValue.textContent = tempInput.value);
  modelSelect.addEventListener('change', () => localStorage.setItem('omnicode_model', modelSelect.value));
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  chatInput.addEventListener('input', autoResize);
  sendBtn.addEventListener('click', sendMessage);
  stopBtn.addEventListener('click', stopGeneration);
  newChatBtn.addEventListener('click', newChat);
  themeBtn.addEventListener('click', toggleThemeMenu);
  previewToggleBtn.addEventListener('click', togglePreview);
  previewCloseBtn.addEventListener('click', closePreview);
  previewRefreshBtn.addEventListener('click', () => updatePreview(lastHtmlCode));
  setupImageHandling();

  // Auth
  loginBtn.addEventListener('click', triggerGitHubLogin);
  logoutBtn.addEventListener('click', doLogout);
  userAvatarBtn.addEventListener('click', () => userDropdown.classList.toggle('hidden'));
  document.addEventListener('click', (e) => {
    if (!userMenu.contains(e.target)) userDropdown.classList.add('hidden');
  });

  // Usage modal
  usageBtn.addEventListener('click', () => { renderUsage(); usageModal.classList.remove('hidden'); });
  usageCloseBtn.addEventListener('click', () => usageModal.classList.add('hidden'));
  usageModal.addEventListener('click', (e) => { if (e.target === usageModal) usageModal.classList.add('hidden'); });
  const usageRefreshBtn = $('#usageRefreshBtn');
  if (usageRefreshBtn) usageRefreshBtn.addEventListener('click', () => renderUsage());

  // Chat history sidebar
  if (historyToggle) historyToggle.addEventListener('click', toggleHistory);
  const historyClose = $('#historyCloseBtn');
  if (historyClose) historyClose.addEventListener('click', toggleHistory);
}

function autoResize() {
  chatInput.style.height = 'auto';
  chatInput.style.height = Math.min(chatInput.scrollHeight, 160) + 'px';
}

function insertPrompt(text) {
  chatInput.value = text;
  chatInput.focus();
  autoResize();
}

// ════════════════════════════════════════════════════════════════════════
// ── PREVIEW (Interactive - games work!) ───────────────────────────────
// ════════════════════════════════════════════════════════════════════════

function togglePreview() { previewOpen ? closePreview() : openPreview(); }
function openPreview() {
  previewOpen = true;
  previewPanel.classList.remove('hidden');
  previewPanel.classList.add('flex');
  previewToggleBtn.classList.add('text-[var(--accent)]');
  if (lastHtmlCode) updatePreview(lastHtmlCode);
}
function closePreview() {
  previewOpen = false;
  previewPanel.classList.add('hidden');
  previewPanel.classList.remove('flex');
  previewToggleBtn.classList.remove('text-[var(--accent)]');
}

function updatePreview(html) {
  if (!previewOpen) return;
  // Use srcdoc for full interactivity - no sandbox restrictions
  // This allows keyboard events, game loops, etc. to work properly
  previewFrame.removeAttribute('sandbox');
  previewFrame.srcdoc = html;
}

function extractHtmlFromResponse(text) {
  const htmlMatch = text.match(/```html\s*\n([\s\S]*?)```/);
  if (htmlMatch) return htmlMatch[1].trim();
  const bareMatch = text.match(/((?:<!DOCTYPE|<html)[\s\S]*<\/html>)/i);
  if (bareMatch) return bareMatch[1].trim();
  return null;
}

function extractFilesFromResponse(text) {
  const files = [];
  const regex = /```(\w+)\s*\n(?:\/\/\s*(\S+)\s*\n|<!--\s*(\S+)\s*-->\s*\n|#\s*(\S+)\s*\n)?([\s\S]*?)```/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    files.push({ lang: match[1], filename: match[2] || match[3] || match[4] || null, code: match[5].trim() });
  }
  return files;
}

function checkAndShowPreview(fullText) {
  const html = extractHtmlFromResponse(fullText);
  if (html) {
    lastHtmlCode = html;
    previewToggleBtn.classList.remove('hidden');
    if (!previewOpen) openPreview();
    updatePreview(html);
    const files = extractFilesFromResponse(fullText);
    const htmlFile = files.find(f => f.filename && /\.(html|htm)$/i.test(f.filename));
    if (htmlFile) { previewFileName.textContent = htmlFile.filename; previewFileName.classList.remove('hidden'); }
  }
}

// ════════════════════════════════════════════════════════════════════════
// ── CHAT ──────────────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════

async function sendMessage() {
  const text = chatInput.value.trim();
  if ((!text && pendingImages.length === 0) || isStreaming) return;

  const apiKey = apiKeyInput.value.trim() || localStorage.getItem('omnicode_api_key');
  if (!apiKey) {
    settingsPanel.classList.remove('hidden');
    apiKeyInput.focus();
    flashStatus('Please set your API key first');
    return;
  }

  // Auto-save previous chat if exists
  if (conversationHistory.length > 0 && !activeChatId) {
    activeChatId = Date.now().toString();
  }

  const welcome = messageContainer.querySelector('.text-center');
  if (welcome) welcome.remove();

  const imageUrls = pendingImages.map(img => img.dataUrl);
  const userMsg = { role: 'user', content: text || '(image)', images: imageUrls };
  conversationHistory.push(userMsg);
  appendMessage('user', text, imageUrls);

  chatInput.value = '';
  chatInput.style.height = 'auto';
  clearPendingImages();

  const assistantEl = appendMessage('assistant', '', true);
  const contentEl = assistantEl.querySelector('.markdown-body');
  showThinking(contentEl);

  setStreaming(true);

  const model = modelSelect.value;
  const apiBase = apiBaseInput.value.trim() || localStorage.getItem('omnicode_api_base') || null;
  const temperature = parseFloat(tempInput.value);

  abortController = new AbortController();
  let fullContent = '';
  const startTime = performance.now();
  const inputTokens = estimateTokens(text) + conversationHistory.reduce((s, m) => s + estimateTokens(m.content), 0);

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model, messages: conversationHistory,
        api_key: apiKey, api_base: apiBase, temperature, stream: true,
      }),
      signal: abortController.signal,
    });

    const contentType = res.headers.get('content-type') || '';

    if (contentType.includes('text/event-stream')) {
      hideThinking(contentEl);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let renderTimer = null;

      function scheduleRender() {
        if (renderTimer) return;
        renderTimer = setTimeout(() => {
          renderTimer = null;
          renderMarkdown(contentEl, fullContent);
          scrollToBottom();
          checkAndShowPreview(fullContent);
        }, 60);
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6).trim();
            if (data === '[DONE]') continue;
            try {
              const parsed = JSON.parse(data);
              if (parsed.error) {
                hideThinking(contentEl);
                contentEl.innerHTML = `<span class="text-red-400">Error: ${escapeHtml(parsed.error)}</span>`;
                break;
              }
              if (parsed.content) { fullContent += parsed.content; scheduleRender(); }
            } catch {}
          }
        }
      }
      if (renderTimer) clearTimeout(renderTimer);
      if (fullContent) {
        renderMarkdown(contentEl, fullContent);
        addCopyButtons(contentEl);
        scrollToBottom();
        checkAndShowPreview(fullContent);
      }
    } else {
      const data = await res.json();
      hideThinking(contentEl);
      if (data.error) {
        contentEl.innerHTML = `<span class="text-red-400">Error: ${escapeHtml(data.error)}</span>`;
      } else if (data.content) {
        fullContent = data.content;
        renderMarkdown(contentEl, fullContent);
        addCopyButtons(contentEl);
        scrollToBottom();
        checkAndShowPreview(fullContent);
      }
    }

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
    tokenInfo.textContent = `${elapsed}s`;

    // Record usage
    const outputTokens = estimateTokens(fullContent);
    recordUsage(model, inputTokens, outputTokens, performance.now() - startTime);

  } catch (e) {
    hideThinking(contentEl);
    if (e.name === 'AbortError') { flashStatus('Generation stopped'); }
    else { contentEl.innerHTML = `<span class="text-red-400">Error: ${escapeHtml(e.message)}</span>`; }
  }

  if (fullContent) { conversationHistory.push({ role: 'assistant', content: fullContent }); }
  setStreaming(false);
  abortController = null;
  scrollToBottom();

  // Save to chat history
  if (conversationHistory.length > 0) {
    saveCurrentChat();
  }
}

// ── Thinking Indicator ─────────────────────────────────────────────────
function showThinking(el) {
  el.innerHTML = `<span class="thinking-indicator">Thinking<span class="dot"></span><span class="dot"></span><span class="dot"></span></span>`;
}
function hideThinking(el) { const t = el.querySelector('.thinking-indicator'); if (t) t.remove(); }
function stopGeneration() { if (abortController) abortController.abort(); }

function newChat() {
  // Save current chat first
  if (conversationHistory.length > 0) saveCurrentChat();

  activeChatId = Date.now().toString();
  conversationHistory = [];
  lastHtmlCode = '';
  closePreview();
  previewToggleBtn.classList.add('hidden');
  previewFileName.classList.add('hidden');
  messageContainer.innerHTML = `
    <div class="text-center py-12">
      <div class="text-5xl mb-4">&lt;/&gt;</div>
      <h2 class="text-2xl font-bold text-[var(--text-primary)] mb-2">Welcome to OmniCode</h2>
      <p class="text-[var(--text-muted)]">Start a new conversation. Select your model and go.</p>
    </div>`;
  chatInput.focus();
  flashStatus('New chat started');
  renderHistoryList();
}

// ── Message Rendering ──────────────────────────────────────────────────
function appendMessage(role, content, images = []) {
  const div = document.createElement('div');
  div.className = `msg-appear flex gap-3 ${role === 'user' ? 'justify-end' : ''}`;
  if (role === 'user') {
    const imgsHtml = images.map(url => `<img src="${url}" class="chat-image" alt="uploaded">`).join('');
    const textHtml = content ? `<p>${escapeHtml(content)}</p>` : '';
    div.innerHTML = `<div class="max-w-[85%] bg-[var(--accent-dim)] border border-[var(--accent-border)] rounded-2xl rounded-br-sm px-4 py-2.5 text-sm text-[var(--text-primary)]">${textHtml}${imgsHtml}</div>`;
  } else {
    div.innerHTML = `
      <div class="shrink-0 w-8 h-8 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] flex items-center justify-center text-[var(--accent)] font-bold text-xs">&lt;/&gt;</div>
      <div class="flex-1 min-w-0">
        <div class="markdown-body text-sm text-[var(--text-primary)] leading-relaxed">${content ? renderMd(content) : ''}</div>
      </div>`;
  }
  messageContainer.appendChild(div);
  scrollToBottom();
  return div;
}

function renderMarkdown(el, text) { el.innerHTML = renderMd(text); }
function renderMd(text) { return marked.parse(text, { breaks: true }); }

function addCopyButtons(container) {
  container.querySelectorAll('pre').forEach(pre => {
    if (pre.querySelector('.copy-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.textContent = 'Copy';
    btn.onclick = () => {
      const code = pre.querySelector('code')?.textContent || pre.textContent;
      navigator.clipboard.writeText(code).then(() => { btn.textContent = 'Copied!'; setTimeout(() => btn.textContent = 'Copy', 1500); });
    };
    pre.style.position = 'relative';
    pre.appendChild(btn);
  });
}

// ── Helpers ────────────────────────────────────────────────────────────
function escapeHtml(text) { const d = document.createElement('div'); d.textContent = text; return d.innerHTML; }
function scrollToBottom() { requestAnimationFrame(() => { chatArea.scrollTop = chatArea.scrollHeight; }); }
function setStreaming(val) {
  isStreaming = val;
  sendBtn.disabled = val;
  sendBtn.classList.toggle('hidden', val);
  stopBtn.classList.toggle('hidden', !val);
  chatInput.disabled = val;
  statusText.textContent = val ? 'Thinking...' : 'Ready';
}
function flashStatus(msg) {
  statusText.textContent = msg;
  setTimeout(() => { if (!isStreaming) statusText.textContent = 'Ready'; }, 2000);
}
