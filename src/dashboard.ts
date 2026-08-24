export function getDashboardHTML(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Memory MCP</title>
<script defer src="https://cdn.jsdelivr.net/npm/alpinejs@3/dist/cdn.min.js"></script>
<style>
:root {
  --bg: #0f1117;
  --surface: #1a1d27;
  --surface2: #22253a;
  --border: #2e3149;
  --text: #e2e4f0;
  --muted: #8b8fa8;
  --accent: #6c8eff;
  --accent-hover: #8aa3ff;
  --danger: #ff6b6b;
  --success: #52d68a;
  --imp1: #8b8fa8;
  --imp2: #52b0d6;
  --imp3: #f0c040;
  --imp4: #f07840;
  --imp5: #ff4d4d;
  --radius: 8px;
  --font: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
}
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: var(--font); background: var(--bg); color: var(--text); min-height: 100vh; }
a { color: var(--accent); }

/* Login */
.login-wrap { display: flex; align-items: center; justify-content: center; min-height: 100vh; }
.login-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 2rem; width: 100%; max-width: 400px; }
.login-card h1 { font-size: 1.4rem; margin-bottom: .25rem; }
.login-card p { color: var(--muted); font-size: .875rem; margin-bottom: 1.5rem; }
.field { margin-bottom: 1rem; }
label { display: block; font-size: .8rem; color: var(--muted); margin-bottom: .35rem; }
input[type=text], input[type=password] {
  width: 100%; padding: .6rem .75rem; background: var(--bg); border: 1px solid var(--border);
  border-radius: var(--radius); color: var(--text); font-size: .9rem;
}
input:focus { outline: 2px solid var(--accent); outline-offset: 1px; border-color: transparent; }

/* Layout */
.app { display: grid; grid-template-columns: 260px 1fr; min-height: 100vh; }
.sidebar { background: var(--surface); border-right: 1px solid var(--border); padding: 1.25rem; }
.main { padding: 1.5rem; overflow-y: auto; }

/* Header */
.app-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 1.5rem; }
.app-header h1 { font-size: 1.1rem; font-weight: 600; }

/* Stats strip */
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: .75rem; margin-bottom: 1.5rem; }
.stat-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: .875rem 1rem; }
.stat-card .val { font-size: 1.6rem; font-weight: 700; line-height: 1; }
.stat-card .lbl { font-size: .72rem; color: var(--muted); margin-top: .3rem; }

/* Importance bar */
.imp-bars { display: flex; flex-direction: column; gap: .3rem; margin-top: .75rem; }
.imp-row { display: flex; align-items: center; gap: .5rem; font-size: .75rem; }
.imp-row .bar-bg { flex: 1; height: 6px; background: var(--border); border-radius: 3px; }
.imp-row .bar-fill { height: 100%; border-radius: 3px; transition: width .3s; }

/* Agent list */
.section-title { font-size: .72rem; color: var(--muted); letter-spacing: .08em; text-transform: uppercase; margin-bottom: .75rem; margin-top: 1.25rem; }
.agent-item { display: flex; align-items: center; justify-content: space-between; padding: .5rem .65rem; border-radius: 6px; cursor: pointer; font-size: .875rem; margin-bottom: 2px; transition: background .1s; }
.agent-item:hover { background: var(--surface2); }
.agent-item.active { background: var(--surface2); color: var(--accent); }
.badge { background: var(--surface2); color: var(--muted); font-size: .7rem; padding: .15rem .45rem; border-radius: 10px; }
.agent-item.active .badge { background: var(--accent); color: #fff; }

/* Search + toolbar */
.toolbar { display: flex; gap: .75rem; margin-bottom: 1rem; align-items: center; }
.search-wrap { flex: 1; position: relative; }
.search-wrap input { padding-left: 2.2rem; width: 100%; }
.search-icon { position: absolute; left: .65rem; top: 50%; transform: translateY(-50%); color: var(--muted); font-size: .9rem; pointer-events: none; }

/* Buttons */
.btn { display: inline-flex; align-items: center; gap: .4rem; padding: .5rem 1rem; border: none; border-radius: var(--radius); cursor: pointer; font-size: .875rem; font-weight: 500; transition: background .15s; white-space: nowrap; }
.btn-primary { background: var(--accent); color: #fff; }
.btn-primary:hover { background: var(--accent-hover); }
.btn-ghost { background: var(--surface2); color: var(--text); border: 1px solid var(--border); }
.btn-ghost:hover { background: var(--border); }
.btn-danger { background: transparent; color: var(--danger); border: 1px solid var(--danger); }
.btn-danger:hover { background: var(--danger); color: #fff; }
.btn:disabled { opacity: .5; cursor: not-allowed; }
.btn-sm { padding: .3rem .6rem; font-size: .78rem; }

/* Memory grid */
.memory-grid { display: grid; gap: .75rem; }
.mem-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1rem; cursor: pointer; transition: border-color .15s; }
.mem-card:hover { border-color: var(--accent); }
.mem-card.expanded { border-color: var(--accent); }
.mem-header { display: flex; align-items: flex-start; gap: .75rem; }
.imp-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; margin-top: .35rem; }
.mem-summary { font-size: .9rem; line-height: 1.45; flex: 1; }
.mem-meta { display: flex; align-items: center; gap: .75rem; margin-top: .6rem; flex-wrap: wrap; }
.tag { background: var(--surface2); color: var(--muted); font-size: .7rem; padding: .15rem .5rem; border-radius: 10px; }
.mem-age { font-size: .7rem; color: var(--muted); }
.agent-label { font-size: .7rem; color: var(--accent); opacity: .7; }
.class-badge { font-size: .65rem; padding: .15rem .45rem; border-radius: 10px; font-weight: 600; letter-spacing: .03em; }
.class-lt { background: #1a2d4a; color: #52b0d6; }
.class-ws { background: #2d2a1a; color: #f0c040; }
.mem-detail { margin-top: .875rem; padding-top: .875rem; border-top: 1px solid var(--border); }
.mem-content { font-size: .85rem; color: var(--muted); line-height: 1.6; white-space: pre-wrap; margin-bottom: .75rem; }
.mem-actions { display: flex; gap: .5rem; }

/* Consolidation panel */
.consol-panel { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 1.25rem; margin-bottom: 1.5rem; }
.consol-panel h3 { font-size: .9rem; margin-bottom: .5rem; }
.consol-panel p { font-size: .8rem; color: var(--muted); margin-bottom: .875rem; line-height: 1.5; }
.consol-result { margin-top: .875rem; padding: .75rem 1rem; background: var(--surface2); border-radius: 6px; font-size: .82rem; }
.consol-result.success { border-left: 3px solid var(--success); }
.consol-result.fail { border-left: 3px solid var(--danger); }

/* History */
.history-row { display: flex; align-items: center; gap: 1rem; padding: .5rem 0; border-bottom: 1px solid var(--border); font-size: .8rem; }
.status-dot { width: 8px; height: 8px; border-radius: 50%; }
.dot-ok { background: var(--success); }
.dot-fail { background: var(--danger); }
.dot-run { background: var(--imp3); }

/* Empty */
.empty { text-align: center; padding: 3rem 1rem; color: var(--muted); }
.empty p { margin-top: .5rem; font-size: .875rem; }

/* Spinner */
.spin { display: inline-block; width: 14px; height: 14px; border: 2px solid currentColor; border-top-color: transparent; border-radius: 50%; animation: spin .6s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

.logout-btn { background: none; border: none; color: var(--muted); font-size: .8rem; cursor: pointer; padding: .25rem .5rem; border-radius: 4px; }
.logout-btn:hover { color: var(--text); }
</style>
</head>
<body x-data="app()" x-init="init()">

<!-- Login -->
<div class="login-wrap" x-show="!authed" x-cloak>
  <div class="login-card">
    <h1>Memory MCP</h1>
    <p>Enter your API key to access the dashboard.</p>
    <div class="field">
      <label>API Key</label>
      <input type="password" x-model="apiKey" @keydown.enter="login()" placeholder="Bearer token…" autocomplete="off">
    </div>
    <button class="btn btn-primary" style="width:100%" @click="login()" :disabled="!apiKey">
      <span x-show="!loggingIn">Sign in</span>
      <span class="spin" x-show="loggingIn"></span>
    </button>
    <p x-show="loginError" style="color:var(--danger);font-size:.8rem;margin-top:.75rem" x-text="loginError"></p>
  </div>
</div>

<!-- App -->
<div class="app" x-show="authed" x-cloak>
  <!-- Sidebar -->
  <aside class="sidebar">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1.25rem">
      <strong style="font-size:.95rem">Memory MCP</strong>
      <button class="logout-btn" @click="logout()">Sign out</button>
    </div>

    <!-- Stats summary -->
    <div class="stat-card" style="margin-bottom:.75rem">
      <div class="val" x-text="stats.total_memories ?? '—'"></div>
      <div class="lbl">Total memories</div>
    </div>

    <!-- Importance bars -->
    <div class="imp-bars" x-show="(stats.by_importance ?? []).length">
      <template x-for="row in (stats.by_importance ?? [])" :key="row.importance">
        <div class="imp-row">
          <div :style="\`color:var(--imp\${row.importance})\`" style="width:14px;text-align:center;font-size:.7rem;font-weight:700" x-text="row.importance"></div>
          <div class="bar-bg">
            <div class="bar-fill" :style="\`width:\${Math.round(row.count / stats.total_memories * 100)}%;background:var(--imp\${row.importance})\`"></div>
          </div>
          <div style="color:var(--muted);width:28px;text-align:right" x-text="row.count"></div>
        </div>
      </template>
    </div>

    <!-- Agents -->
    <div class="section-title" style="margin-top:1.25rem">Agents</div>
    <div
      class="agent-item"
      :class="{ active: selectedAgent === null }"
      @click="selectAgent(null)">
      <span>All agents</span>
      <span class="badge" x-text="stats.total_memories ?? 0"></span>
    </div>
    <template x-for="a in agents" :key="a.agent_id">
      <div
        class="agent-item"
        :class="{ active: selectedAgent === a.agent_id }"
        @click="selectAgent(a.agent_id)"
        :title="a.agent_id">
        <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:140px" x-text="a.agent_id"></span>
        <span class="badge" :title="a.working_state_count + ' working'" x-text="a.count"></span>
      </div>
    </template>
  </aside>

  <!-- Main -->
  <main class="main">
    <div class="app-header">
      <h1 x-text="selectedAgent ? selectedAgent : 'All memories'"></h1>
    </div>

    <!-- Consolidation panel -->
    <div class="consol-panel">
      <h3>Memory Consolidation</h3>
      <p>Groups related memories by shared tags and merges them using Workers AI — reducing noise and keeping context tight. Runs automatically at 2 AM UTC daily.</p>
      <div style="display:flex;gap:.75rem;flex-wrap:wrap">
        <button class="btn btn-ghost" @click="consolidate(true)" :disabled="consolidating">
          <span x-show="!consolidating">Preview (dry run)</span>
          <span x-show="consolidating"><span class="spin"></span> Running…</span>
        </button>
        <button class="btn btn-primary" @click="consolidate(false)" :disabled="consolidating">
          <span x-show="!consolidating">Run consolidation</span>
          <span x-show="consolidating"><span class="spin"></span> Running…</span>
        </button>
      </div>
      <div class="consol-result success" x-show="consolResult && consolResult.status === 'completed'" x-cloak>
        <strong x-text="consolResult?.dry_run ? 'Preview result' : 'Done'"></strong> —
        <span x-text="\`\${consolResult?.memories_before} memories → \${consolResult?.memories_after} · \${consolResult?.groups_merged} chunk(s) merged, \${consolResult?.groups_skipped} skipped\`"></span>
        <div x-show="(consolResult?.ai_errors ?? []).length > 0" style="color:var(--danger);margin-top:.4rem;font-size:.78rem">
          AI errors: <span x-text="(consolResult?.ai_errors ?? []).join('; ')"></span>
        </div>
      </div>
      <div class="consol-result fail" x-show="consolResult && consolResult.status === 'failed'" x-cloak>
        Error: <span x-text="consolResult?.error"></span>
      </div>
    </div>

    <!-- Toolbar -->
    <div class="toolbar">
      <div class="search-wrap">
        <span class="search-icon">⌕</span>
        <input type="text" x-model.debounce.400ms="searchQuery" @input="loadMemories()" placeholder="Search memories…">
      </div>
      <button class="btn btn-ghost btn-sm" @click="loadMemories()">
        <span x-show="!loadingMem">Refresh</span>
        <span x-show="loadingMem" class="spin"></span>
      </button>
    </div>

    <!-- Memory grid -->
    <div class="memory-grid" x-show="memories.length">
      <template x-for="m in memories" :key="m.id">
        <div class="mem-card" :class="{ expanded: expanded === m.id }" @click="toggle(m)">
          <div class="mem-header">
            <div class="imp-dot" :style="\`background:var(--imp\${m.importance})\`"></div>
            <div style="flex:1">
              <div class="mem-summary" x-text="m.summary"></div>
              <div class="mem-meta">
                <span class="class-badge" :class="m.memory_class === 'working_state' ? 'class-ws' : 'class-lt'" x-text="m.memory_class === 'working_state' ? 'working' : 'long-term'"></span>
                <template x-for="t in (m.tags ?? [])" :key="t">
                  <span class="tag" x-text="t"></span>
                </template>
                <span class="mem-age" x-text="relTime(m.updated_at)"></span>
                <span class="mem-age" x-show="m.memory_class === 'working_state' && m.staleness_days != null" x-text="'· ' + m.staleness_days + 'd stale'"></span>
                <span class="agent-label" x-show="selectedAgent === null" x-text="m.agent_id"></span>
              </div>
            </div>
          </div>

          <!-- Expanded detail -->
          <div class="mem-detail" x-show="expanded === m.id" @click.stop x-cloak>
            <div x-show="!fullMem[m.id]" style="color:var(--muted);font-size:.8rem">Loading…</div>
            <div x-show="fullMem[m.id]">
              <div class="mem-content" x-text="fullMem[m.id]?.content"></div>
              <div class="mem-actions">
                <button class="btn btn-ghost btn-sm" @click="copyId(m.id)">Copy ID</button>
                <button class="btn btn-danger btn-sm" @click="deleteMem(m.id)">Delete</button>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <div class="empty" x-show="!loadingMem && memories.length === 0">
      <div style="font-size:2rem">🧠</div>
      <p>No memories found.</p>
    </div>

    <!-- History -->
    <div style="margin-top:2rem" x-show="history.length">
      <div class="section-title">Consolidation history</div>
      <template x-for="r in history" :key="r.id">
        <div class="history-row">
          <div class="status-dot" :class="r.status==='completed'?'dot-ok':r.status==='running'?'dot-run':'dot-fail'"></div>
          <div style="flex:1">
            <span x-text="r.agent_id ?? 'All agents'"></span>
            <span style="color:var(--muted)"> · </span>
            <span style="color:var(--muted)" x-text="r.triggered_by"></span>
          </div>
          <div x-show="r.status==='completed'" style="color:var(--muted)">
            <span x-text="r.memories_before"></span>→<span x-text="r.memories_after"></span>
          </div>
          <div style="color:var(--muted)" x-text="relTime(r.started_at)"></div>
        </div>
      </template>
    </div>
  </main>
</div>

<script>
function app() {
  return {
    apiKey: '',
    authed: false,
    loggingIn: false,
    loginError: '',

    stats: {},
    agents: [],
    memories: [],
    history: [],
    selectedAgent: null,
    searchQuery: '',
    expanded: null,
    fullMem: {},
    loadingMem: false,
    consolidating: false,
    consolResult: null,

    async init() {
      const saved = sessionStorage.getItem('mcp-key');
      if (saved) { this.apiKey = saved; await this.login(); }
    },

    async login() {
      this.loggingIn = true;
      this.loginError = '';
      try {
        const r = await this.get('/api/stats');
        if (!r.ok) { this.loginError = 'Invalid API key.'; return; }
        sessionStorage.setItem('mcp-key', this.apiKey);
        this.authed = true;
        this.stats = await r.json();
        await Promise.all([this.loadAgents(), this.loadMemories(), this.loadHistory()]);
      } catch { this.loginError = 'Could not reach server.'; }
      finally { this.loggingIn = false; }
    },

    logout() {
      sessionStorage.removeItem('mcp-key');
      this.authed = false;
      this.apiKey = '';
    },

    async loadAgents() {
      const r = await this.get('/api/agents');
      this.agents = r.ok ? await r.json() : [];
    },

    async loadMemories() {
      this.loadingMem = true;
      const params = new URLSearchParams({ limit: '100' });
      if (this.selectedAgent) params.set('agent_id', this.selectedAgent);
      if (this.searchQuery) params.set('query', this.searchQuery);
      const r = await this.get('/api/memories?' + params);
      this.memories = r.ok ? await r.json() : [];
      this.loadingMem = false;
    },

    async loadHistory() {
      const params = this.selectedAgent ? '?agent_id=' + encodeURIComponent(this.selectedAgent) : '';
      const r = await this.get('/api/consolidation-history' + params);
      this.history = r.ok ? await r.json() : [];
    },

    async selectAgent(id) {
      this.selectedAgent = id;
      this.expanded = null;
      await Promise.all([this.loadMemories(), this.loadHistory()]);
    },

    async toggle(m) {
      if (this.expanded === m.id) { this.expanded = null; return; }
      this.expanded = m.id;
      if (!this.fullMem[m.id]) {
        const r = await this.get('/api/memory/' + m.id);
        if (r.ok) this.fullMem[m.id] = await r.json();
      }
    },

    async deleteMem(id) {
      if (!confirm('Delete this memory?')) return;
      await fetch('/api/memory/' + id, { method: 'DELETE', headers: this.headers() });
      this.memories = this.memories.filter(m => m.id !== id);
      this.expanded = null;
      const sr = await this.get('/api/stats');
      if (sr.ok) this.stats = await sr.json();
    },

    async consolidate(dryRun) {
      this.consolidating = true;
      this.consolResult = null;
      try {
        const r = await fetch('/api/consolidate', {
          method: 'POST',
          headers: { ...this.headers(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent_id: this.selectedAgent, dry_run: dryRun }),
        });
        const data = await r.json();
        data.dry_run = dryRun;
        this.consolResult = data;
        if (!dryRun && data.status === 'completed') {
          await Promise.all([this.loadMemories(), this.loadAgents(), this.loadHistory()]);
          const sr = await this.get('/api/stats');
          if (sr.ok) this.stats = await sr.json();
        } else if (!dryRun) {
          await this.loadHistory();
        }
      } catch (e) {
        this.consolResult = { status: 'failed', error: String(e) };
      }
      this.consolidating = false;
    },

    copyId(id) { navigator.clipboard?.writeText(id); },

    headers() { return { Authorization: 'Bearer ' + this.apiKey }; },
    get(path) { return fetch(path, { headers: this.headers() }); },

    relTime(ts) {
      if (!ts) return '';
      const d = Date.now() - ts;
      if (d < 60000) return 'just now';
      if (d < 3600000) return Math.floor(d/60000) + 'm ago';
      if (d < 86400000) return Math.floor(d/3600000) + 'h ago';
      return Math.floor(d/86400000) + 'd ago';
    },
  };
}
</script>
</body>
</html>`;
}
