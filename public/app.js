const $ = (s) => document.querySelector(s);
const STORAGE_KEY = "rdn_ai_conversations_v1";
const SETTINGS_KEY = "rdn_ai_settings_v1";

let conversations = loadConversations();
let activeId = null;
let isGenerating = false;
let settings = loadSettings();

function loadConversations() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
  catch { return []; }
}
function saveConversations() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(conversations));
}
function loadSettings() {
  try {
    return { theme: "dark", enterSend: true, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}) };
  } catch { return { theme: "dark", enterSend: true }; }
}
function saveSettings() {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : Date.now() + "-" + Math.random().toString(16).slice(2);
}
function activeConversation() {
  return conversations.find(c => c.id === activeId);
}
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;" }[c]));
}
function renderMarkdown(text) {
  let safe = escapeHtml(text);
  const blocks = [];
  safe = safe.replace(/```([\\w+-]*)\\n([\\s\\S]*?)```/g, (_, lang, code) => {
    const id = blocks.length;
    blocks.push(`<div class="code-wrap"><div class="code-head"><span>${lang || "code"}</span><button onclick="copyCode(${id})">Copy</button></div><pre><code>${code.trim()}</code></pre></div>`);
    return `@@CODE${id}@@`;
  });
  safe = safe.replace(/`([^`]+)`/g, "<code>$1</code>");
  safe = safe.replace(/^### (.*)$/gm, "<h3>$1</h3>");
  safe = safe.replace(/^## (.*)$/gm, "<h2>$1</h2>");
  safe = safe.replace(/^# (.*)$/gm, "<h1>$1</h1>");
  safe = safe.replace(/\\*\\*(.*?)\\*\\*/g, "<strong>$1</strong>");
  safe = safe.replace(/\\*(.*?)\\*/g, "<em>$1</em>");
  safe = safe.replace(/^- (.*)$/gm, "• $1");
  safe = safe.replace(/\\n\\n/g, "</p><p>");
  safe = safe.replace(/\\n/g, "<br>");
  safe = `<p>${safe}</p>`;
  safe = safe.replace(/<p>(@@CODE(\\d+)@@)<\\/p>/g, "$1");
  safe = safe.replace(/@@CODE(\\d+)@@/g, (_, i) => blocks[Number(i)]);
  return safe;
}
window.copyCode = async (i) => {
  const el = document.querySelectorAll(".code-wrap pre code")[i];
  if (el) await navigator.clipboard.writeText(el.textContent);
};

function renderSidebar() {
  const q = ($("#search").value || "").toLowerCase().trim();
  const list = $("#chatList");
  const filtered = conversations
    .slice().sort((a,b) => b.updatedAt - a.updatedAt)
    .filter(c => !q || c.title.toLowerCase().includes(q) || c.messages.some(m => m.content.toLowerCase().includes(q)));

  list.innerHTML = filtered.map(c => `
    <div class="chat-item ${c.id === activeId ? "active" : ""}" data-id="${c.id}">
      <div class="chat-item-title">${escapeHtml(c.title || "New chat")}</div>
      <button class="chat-item-menu" data-menu="${c.id}">•••</button>
    </div>`).join("");

  list.querySelectorAll(".chat-item").forEach(el => {
    el.addEventListener("click", e => {
      if (e.target.closest("[data-menu]")) return;
      openConversation(el.dataset.id);
    });
  });
  list.querySelectorAll("[data-menu]").forEach(btn => {
    btn.addEventListener("click", e => {
      e.stopPropagation();
      const id = btn.dataset.menu;
      const c = conversations.find(x => x.id === id);
      const action = prompt(`Conversation: ${c.title}\\nType "rename" or "delete".`);
      if (action?.toLowerCase() === "rename") {
        const title = prompt("New title:", c.title);
        if (title?.trim()) c.title = title.trim();
        saveConversations(); renderSidebar(); render();
      } else if (action?.toLowerCase() === "delete") {
        if (confirm("Delete this conversation?")) {
          conversations = conversations.filter(x => x.id !== id);
          if (activeId === id) activeId = null;
          saveConversations(); renderSidebar(); render();
        }
      }
    });
  });
}
function render() {
  const c = activeConversation();
  $("#topTitle").textContent = c?.title || "New chat";
  const messages = $("#messages");
  const welcome = $("#welcome");
  if (!c || c.messages.length === 0) {
    welcome.classList.remove("hidden");
    messages.innerHTML = "";
    return;
  }
  welcome.classList.add("hidden");
  messages.innerHTML = c.messages.map((m, i) => `
    <article class="message ${m.role}">
      <div class="avatar">${m.role === "user" ? "U" : "R"}</div>
      <div class="message-body">
        ${m.role === "assistant" ? renderMarkdown(m.content) : escapeHtml(m.content).replace(/\\n/g, "<br>")}
        ${m.role === "assistant" ? `<div class="message-actions">
          <button onclick="copyMessage(${i})">Copy</button>
          <button onclick="regenerate(${i})">Regenerate</button>
          <button>👍</button><button>👎</button>
        </div>` : `<div class="message-actions"><button onclick="copyMessage(${i})">Copy</button><button onclick="editMessage(${i})">Edit</button></div>`}
      </div>
    </article>`).join("");
  $("#chat").scrollTop = $("#chat").scrollHeight;
}
window.copyMessage = async (i) => {
  const c = activeConversation();
  if (c?.messages[i]) await navigator.clipboard.writeText(c.messages[i].content);
};
window.editMessage = (i) => {
  const c = activeConversation();
  if (!c?.messages[i]) return;
  $("#input").value = c.messages[i].content;
  $("#input").focus();
  c.messages = c.messages.slice(0, i);
  saveConversations(); render();
};
window.regenerate = async (i) => {
  const c = activeConversation();
  if (!c || c.messages[i]?.role !== "assistant") return;
  c.messages = c.messages.slice(0, i);
  saveConversations(); render();
  await sendToAI(c);
};

function createConversation() {
  const c = { id: uid(), title: "New chat", messages: [], model: $("#modelSelect").value, createdAt: Date.now(), updatedAt: Date.now() };
  conversations.push(c);
  activeId = c.id;
  saveConversations(); renderSidebar(); render();
}
function openConversation(id) {
  activeId = id;
  renderSidebar(); render();
  $("#sidebar").classList.remove("open");
}
function makeTitle(text) {
  const cleaned = text.replace(/\\s+/g, " ").trim();
  return cleaned.length > 38 ? cleaned.slice(0, 38) + "…" : cleaned || "New chat";
}
async function sendToAI(c) {
  if (isGenerating) return;
  isGenerating = true;
  $("#sendBtn").disabled = true;
  const typing = { id: uid(), role: "assistant", content: "Thinking…", createdAt: Date.now() };
  c.messages.push(typing);
  render();

  try {
    const payloadMessages = c.messages
      .filter(m => m.id !== typing.id)
      .map(m => ({ role: m.role, content: m.content }));

    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: payloadMessages, model: c.model === "default" ? undefined : c.model })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "AI request failed.");
    typing.content = data.content;
  } catch (err) {
    typing.content = `**RDN AI error**\\n\\n${err.message}`;
  } finally {
    c.updatedAt = Date.now();
    saveConversations();
    isGenerating = false;
    updateSendState();
    renderSidebar();
    render();
  }
}
async function submitMessage(text) {
  text = text.trim();
  if (!text || isGenerating) return;
  if (!activeConversation()) createConversation();
  const c = activeConversation();
  if (c.messages.length === 0) c.title = makeTitle(text);
  c.model = $("#modelSelect").value;
  c.messages.push({ id: uid(), role: "user", content: text, createdAt: Date.now() });
  c.updatedAt = Date.now();
  saveConversations();
  $("#input").value = "";
  autoGrow();
  renderSidebar();
  render();
  await sendToAI(c);
}
function updateSendState() {
  $("#sendBtn").disabled = !$("#input").value.trim() || isGenerating;
}
function autoGrow() {
  const el = $("#input");
  el.style.height = "auto";
  el.style.height = Math.min(el.scrollHeight, 180) + "px";
  updateSendState();
}

$("#composer").addEventListener("submit", e => { e.preventDefault(); submitMessage($("#input").value); });
$("#input").addEventListener("input", autoGrow);
$("#input").addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey && settings.enterSend) {
    e.preventDefault(); submitMessage($("#input").value);
  }
});
$("#newChat").addEventListener("click", createConversation);
$("#search").addEventListener("input", renderSidebar);
$("#modelSelect").addEventListener("change", () => {
  const c = activeConversation();
  if (c) { c.model = $("#modelSelect").value; saveConversations(); }
});
document.querySelectorAll("[data-prompt]").forEach(btn => btn.addEventListener("click", () => {
  $("#input").value = btn.dataset.prompt; autoGrow(); $("#input").focus();
}));

function openSettings() {
  $("#themeSelect").value = settings.theme;
  $("#enterSend").checked = settings.enterSend;
  $("#modalBackdrop").classList.remove("hidden");
}
function closeSettings() { $("#modalBackdrop").classList.add("hidden"); }
$("#settingsBtn").addEventListener("click", openSettings);
$("#topSettings").addEventListener("click", openSettings);
$("#closeModal").addEventListener("click", closeSettings);
$("#modalBackdrop").addEventListener("click", e => { if (e.target === $("#modalBackdrop")) closeSettings(); });
$("#themeSelect").addEventListener("change", e => { settings.theme = e.target.value; applyTheme(); saveSettings(); });
$("#enterSend").addEventListener("change", e => { settings.enterSend = e.target.checked; saveSettings(); });
$("#clearData").addEventListener("click", () => {
  if (confirm("Delete ALL local RDN AI conversations? This cannot be undone.")) {
    conversations = []; activeId = null; saveConversations(); renderSidebar(); render(); closeSettings();
  }
});
$("#aboutBtn").addEventListener("click", () => $("#aboutBackdrop").classList.remove("hidden"));
$("#closeAbout").addEventListener("click", () => $("#aboutBackdrop").classList.add("hidden"));
$("#openSidebar").addEventListener("click", () => $("#sidebar").classList.add("open"));
$("#closeSidebar").addEventListener("click", () => $("#sidebar").classList.remove("open"));

function applyTheme() {
  const theme = settings.theme === "system"
    ? (matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark")
    : settings.theme;
  document.body.classList.toggle("light", theme === "light");
}
applyTheme();
renderSidebar();
render();
