/**
 * OmniCode — Frontend Application
 * + Real-time streaming (SSE) with typewriter
 * + Live HTML preview panel
 * + Multi-theme support
 */

// ── Themes ─────────────────────────────────────────────────────────────
const THEMES = [
  { id: 'dark',     name: 'Dark',     dot: '#10b981' },
  { id: 'midnight', name: 'Midnight', dot: '#818cf8' },
  { id: 'ocean',    name: 'Ocean',    dot: '#38bdf8' },
  { id: 'nord',     name: 'Nord',     dot: '#88c0d0' },
  { id: 'rose',     name: 'Rose',     dot: '#f472b6' },
  { id: 'light',    name: 'Light',    dot: '#10b981' },
];

// ── State ──────────────────────────────────────────────────────────────
let conversationHistory = [];
let isStreaming = false;
let abortController = null;
let models = [];
let previewOpen = false;
let lastHtmlCode = '';

// ── DOM refs ───────────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const modelSelect     = $('#modelSelect');
const settingsBtn     = $('#settingsBtn');
const settingsPanel   = $('#settingsPanel');
const saveSettingsBtn = $('#saveSettingsBtn');
const apiKeyInput     = $('#apiKeyInput');
const apiBaseInput    = $('#apiBaseInput');
const tempInput       = $('#tempInput');
const tempValue       = $('#tempValue');
const chatArea        = $('#chatArea');
const messageContainer = $('#messageContainer');
const chatInput       = $('#chatInput');
const sendBtn         = $('#sendBtn');
const stopBtn         = $('#stopBtn');
const newChatBtn      = $('#newChatBtn');
const statusText      = $('#statusText');
const tokenInfo       = $('#tokenInfo');
const themeBtn        = $('#themeBtn');
const themeIconDark   = $('#themeIconDark');
const themeIconLight  = $('#themeIconLight');
const previewToggleBtn = $('#previewToggleBtn');
const previewPanel    = $('#previewPanel');
const previewFrame    = $('#previewFrame');
const previewCloseBtn = $('#previewCloseBtn');
const previewRefreshBtn = $('#previewRefreshBtn');

// ── Initialize ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  loadTheme();
  loadSettings();
  await loadModels();
  setupListeners();
  chatInput.focus();
});

// ── Theme ──────────────────────────────────────────────────────────────
function loadTheme() {
  const saved = localStorage.getItem('omnicode_theme') || 'dark';
  applyTheme(saved);
}

function applyTheme(themeId) {
  document.documentElement.setAttribute('data-theme', themeId);
  localStorage.setItem('omnicode_theme', themeId);
  const isDark = ['dark', 'midnight', 'ocean', 'nord', 'rose'].includes(themeId);
  themeIconDark.classList.toggle('hidden', !isDark);
  themeIconLight.classList.toggle('hidden', isDark);
}

function toggleThemeMenu() {
  let menu = document.querySelector('.theme-menu');
  if (menu) { menu.remove(); return; }
  menu = document.createElement('div');
  menu.className = 'theme-menu';
  const current = localStorage.getItem('omnicode_theme') || 'dark';
  THEMES.forEach(t => {
    const btn = document.createElement('button');
    btn.className = t.id === current ? 'active' : '';
    btn.innerHTML = `<span class="theme-dot" style="background:${t.dot}"></span> ${t.name}`;
    btn.onclick = () => { applyTheme(t.id); menu.remove(); };
    menu.appendChild(btn);
  });
  themeBtn.style.position = 'relative';
  themeBtn.appendChild(menu);
}

// ── Models ─────────────────────────────────────────────────────────────
async function loadModels() {
  try {
    const res = await fetch('/api/models');
    const data = await res.json();
    models = data.models;
    modelSelect.innerHTML = '';
    let currentGroup = null;
    models.forEach(m => {
      if (!currentGroup || currentGroup.dataset.provider !== m.provider) {
        currentGroup = document.createElement('optgroup');
        currentGroup.label = m.provider.charAt(0).toUpperCase() + m.provider.slice(1);
        currentGroup.dataset.provider = m.provider;
        modelSelect.appendChild(currentGroup);
      }
      const opt = document.createElement('option');
      opt.value = m.id;
      opt.textContent = m.name;
      opt.dataset.provider = m.provider;
      currentGroup.appendChild(opt);
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

// ── Preview Panel ──────────────────────────────────────────────────────
function togglePreview() {
  if (previewOpen) closePreview();
  else openPreview();
}

function openPreview() {
  previewOpen = true;
  previewPanel.classList.add('active');
  previewToggleBtn.classList.add('text-[var(--accent)]');
  if (lastHtmlCode) updatePreview(lastHtmlCode);
}

function closePreview() {
  previewOpen = false;
  previewPanel.classList.remove('active');
  previewToggleBtn.classList.remove('text-[var(--accent)]');
}

function updatePreview(html) {
  if (!previewOpen) return;
  const doc = previewFrame.contentDocument || previewFrame.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
}

function extractHtmlFromResponse(text) {
  // Find HTML code blocks in the response
  const htmlMatch = text.match(/```html\s*\n([\s\S]*?)```/);
  const htmMatch = text.match(/```htm\s*\n([\s\S]*?)```/);
  const match = htmlMatch || htmMatch;

  if (match) {
    return match[1].trim();
  }

  // Also check for bare HTML (starts with <!DOCTYPE or <html)
  const bareMatch = text.match(/((?:<!DOCTYPE|<html)[\s\S]*<\/html>)/i);
  if (bareMatch) return bareMatch[1].trim();

  return null;
}

function checkAndShowPreview(fullText) {
  const html = extractHtmlFromResponse(fullText);
  if (html) {
    lastHtmlCode = html;
    previewToggleBtn.classList.remove('hidden');
    if (!previewOpen) openPreview();
    updatePreview(html);
  }
}

// ── Chat ───────────────────────────────────────────────────────────────
async function sendMessage() {
  const text = chatInput.value.trim();
  if (!text || isStreaming) return;

  const apiKey = apiKeyInput.value.trim() || localStorage.getItem('omnicode_api_key');
  if (!apiKey) {
    settingsPanel.classList.remove('hidden');
    apiKeyInput.focus();
    flashStatus('Please set your API key first');
    return;
  }

  const welcome = messageContainer.querySelector('.text-center');
  if (welcome) welcome.remove();

  conversationHistory.push({ role: 'user', content: text });
  appendMessage('user', text);

  chatInput.value = '';
  chatInput.style.height = 'auto';

  // Show thinking indicator
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

  try {
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: conversationHistory,
        api_key: apiKey,
        api_base: apiBase,
        temperature,
        stream: true,
      }),
      signal: abortController.signal,
    });

    const contentType = res.headers.get('content-type') || '';

    // Check if we got streaming (SSE) or JSON fallback
    if (contentType.includes('text/event-stream')) {
      // Streaming response
      hideThinking(contentEl);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let renderTimer = null;
      let pendingRender = false;

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
              if (parsed.content) {
                fullContent += parsed.content;
                scheduleRender();
              }
            } catch {}
          }
        }
      }

      // Final render
      if (renderTimer) clearTimeout(renderTimer);
      if (fullContent) {
        renderMarkdown(contentEl, fullContent);
        addCopyButtons(contentEl);
        scrollToBottom();
        checkAndShowPreview(fullContent);
      }
    } else {
      // JSON fallback (non-streaming)
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

  } catch (e) {
    hideThinking(contentEl);
    if (e.name === 'AbortError') {
      flashStatus('Generation stopped');
    } else {
      contentEl.innerHTML = `<span class="text-red-400">Error: ${escapeHtml(e.message)}</span>`;
    }
  }

  if (fullContent) {
    conversationHistory.push({ role: 'assistant', content: fullContent });
  }

  setStreaming(false);
  abortController = null;
  scrollToBottom();
}

// ── Thinking Indicator ─────────────────────────────────────────────────
function showThinking(el) {
  el.innerHTML = `<span class="thinking-indicator">Thinking<span class="dot"></span><span class="dot"></span><span class="dot"></span></span>`;
}

function hideThinking(el) {
  const thinker = el.querySelector('.thinking-indicator');
  if (thinker) thinker.remove();
}

function stopGeneration() {
  if (abortController) abortController.abort();
}

function newChat() {
  conversationHistory = [];
  lastHtmlCode = '';
  closePreview();
  previewToggleBtn.classList.add('hidden');
  messageContainer.innerHTML = `
    <div class="text-center py-12">
      <div class="text-5xl mb-4">&lt;/&gt;</div>
      <h2 class="text-2xl font-bold text-[var(--text-primary)] mb-2">Welcome to OmniCode</h2>
      <p class="text-[var(--text-muted)]">Start a new conversation. Select your model and go.</p>
    </div>
  `;
  chatInput.focus();
  flashStatus('New chat started');
}

// ── Message Rendering ──────────────────────────────────────────────────
function appendMessage(role, content, isStreaming = false) {
  const div = document.createElement('div');
  div.className = `msg-appear flex gap-3 ${role === 'user' ? 'justify-end' : ''}`;

  if (role === 'user') {
    div.innerHTML = `
      <div class="max-w-[85%] bg-[var(--accent-dim)] border border-[var(--accent-border)] rounded-2xl rounded-br-sm px-4 py-2.5 text-sm text-[var(--text-primary)]">
        ${escapeHtml(content)}
      </div>
    `;
  } else {
    div.innerHTML = `
      <div class="shrink-0 w-8 h-8 rounded-lg bg-[var(--bg-input)] border border-[var(--border)] flex items-center justify-center text-[var(--accent)] font-bold text-xs">&lt;/&gt;</div>
      <div class="flex-1 min-w-0">
        <div class="markdown-body text-sm text-[var(--text-primary)] leading-relaxed">${isStreaming ? '' : renderMd(content)}</div>
      </div>
    `;
  }

  messageContainer.appendChild(div);
  scrollToBottom();
  return div;
}

function renderMarkdown(el, text) {
  el.innerHTML = renderMd(text);
}

function renderMd(text) {
  return marked.parse(text, { breaks: true });
}

function addCopyButtons(container) {
  container.querySelectorAll('pre').forEach(pre => {
    if (pre.querySelector('.copy-btn')) return;
    const btn = document.createElement('button');
    btn.className = 'copy-btn';
    btn.textContent = 'Copy';
    btn.onclick = () => {
      const code = pre.querySelector('code')?.textContent || pre.textContent;
      navigator.clipboard.writeText(code).then(() => {
        btn.textContent = 'Copied!';
        setTimeout(() => btn.textContent = 'Copy', 1500);
      });
    };
    pre.style.position = 'relative';
    pre.appendChild(btn);
  });
}

// ── Helpers ────────────────────────────────────────────────────────────
function escapeHtml(text) {
  const d = document.createElement('div');
  d.textContent = text;
  return d.innerHTML;
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    chatArea.scrollTop = chatArea.scrollHeight;
  });
}

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
