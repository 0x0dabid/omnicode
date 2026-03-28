/**
 * OmniCode — Frontend Application
 */

// ── State ──────────────────────────────────────────────────────────────
let conversationHistory = [];
let isStreaming = false;
let abortController = null;
let models = [];

// ── DOM refs ───────────────────────────────────────────────────────────
const $ = (sel) => document.querySelector(sel);
const modelSelect    = $('#modelSelect');
const settingsBtn    = $('#settingsBtn');
const settingsPanel  = $('#settingsPanel');
const saveSettingsBtn = $('#saveSettingsBtn');
const apiKeyInput    = $('#apiKeyInput');
const apiBaseInput   = $('#apiBaseInput');
const tempInput      = $('#tempInput');
const tempValue      = $('#tempValue');
const chatArea       = $('#chatArea');
const messageContainer = $('#messageContainer');
const chatInput      = $('#chatInput');
const sendBtn        = $('#sendBtn');
const stopBtn        = $('#stopBtn');
const newChatBtn     = $('#newChatBtn');
const statusText     = $('#statusText');
const tokenInfo      = $('#tokenInfo');

// ── Initialize ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  loadSettings();
  await loadModels();
  setupListeners();
  chatInput.focus();
});

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

    // Restore saved model
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
  if (temp) {
    tempInput.value = temp;
    tempValue.textContent = temp;
  }
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
  // Settings
  settingsBtn.addEventListener('click', () => settingsPanel.classList.toggle('hidden'));
  saveSettingsBtn.addEventListener('click', saveSettings);
  tempInput.addEventListener('input', () => tempValue.textContent = tempInput.value);

  // Model change
  modelSelect.addEventListener('change', () => {
    localStorage.setItem('omnicode_model', modelSelect.value);
  });

  // Chat input
  chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  chatInput.addEventListener('input', autoResize);

  // Buttons
  sendBtn.addEventListener('click', sendMessage);
  stopBtn.addEventListener('click', stopGeneration);
  newChatBtn.addEventListener('click', newChat);
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

  // Clear welcome message on first send
  const welcome = messageContainer.querySelector('.text-center');
  if (welcome) welcome.remove();

  // Add user message
  conversationHistory.push({ role: 'user', content: text });
  appendMessage('user', text);

  // Clear input
  chatInput.value = '';
  chatInput.style.height = 'auto';

  // Show assistant message placeholder
  const assistantEl = appendMessage('assistant', '', true);
  const contentEl = assistantEl.querySelector('.markdown-body');
  contentEl.classList.add('typing-cursor');

  // UI state
  setStreaming(true);
  statusText.textContent = 'Thinking...';

  // Get selected model info
  const selectedOption = modelSelect.options[modelSelect.selectedIndex];
  const provider = selectedOption?.dataset?.provider || '';
  const model = modelSelect.value;
  const apiBase = apiBaseInput.value.trim() || localStorage.getItem('omnicode_api_base') || null;
  const temperature = parseFloat(tempInput.value);

  // Stream response
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
      }),
      signal: abortController.signal,
    });

    const data = await res.json();

    if (data.error) {
      contentEl.classList.remove('typing-cursor');
      contentEl.innerHTML = `<span class="text-red-400">Error: ${escapeHtml(data.error)}</span>`;
    } else if (data.content) {
      fullContent = data.content;
      contentEl.classList.remove('typing-cursor');
      renderMarkdown(contentEl, fullContent);
      addCopyButtons(contentEl);
      scrollToBottom();
    }

    const elapsed = ((performance.now() - startTime) / 1000).toFixed(1);
    tokenInfo.textContent = `${elapsed}s`;

  } catch (e) {
    if (e.name === 'AbortError') {
      flashStatus('Generation stopped');
    } else {
      contentEl.classList.remove('typing-cursor');
      contentEl.innerHTML = `<span class="text-red-400">Error: ${escapeHtml(e.message)}</span>`;
    }
  }

  // Finalize
  contentEl.classList.remove('typing-cursor');
  if (fullContent) {
    conversationHistory.push({ role: 'assistant', content: fullContent });
    renderMarkdown(contentEl, fullContent);
    addCopyButtons(contentEl);
  }

  setStreaming(false);
  abortController = null;
  scrollToBottom();
}

function stopGeneration() {
  if (abortController) abortController.abort();
}

function newChat() {
  conversationHistory = [];
  messageContainer.innerHTML = '';
  // Re-add welcome
  messageContainer.innerHTML = `
    <div class="text-center py-12">
      <div class="text-5xl mb-4">&lt;/&gt;</div>
      <h2 class="text-2xl font-bold text-white mb-2">Welcome to OmniCode</h2>
      <p class="text-gray-400">Start a new conversation. Select your model and go.</p>
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
      <div class="max-w-[85%] bg-emerald-600/20 border border-emerald-500/30 rounded-2xl rounded-br-sm px-4 py-2.5 text-sm text-gray-100">
        ${escapeHtml(content)}
      </div>
    `;
  } else {
    div.innerHTML = `
      <div class="shrink-0 w-8 h-8 rounded-lg bg-gray-800 border border-gray-700 flex items-center justify-center text-emerald-400 font-bold text-xs">&lt;/&gt;</div>
      <div class="flex-1 min-w-0">
        <div class="markdown-body text-sm text-gray-200 leading-relaxed">${isStreaming ? '' : renderMd(content)}</div>
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
  statusText.textContent = val ? 'Streaming...' : 'Ready';
}

function flashStatus(msg) {
  statusText.textContent = msg;
  setTimeout(() => {
    if (!isStreaming) statusText.textContent = 'Ready';
  }, 2000);
}
