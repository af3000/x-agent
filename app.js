/* ============================================================================
   AgenticaTrade — Daily X Content Agent (multi-account)
   ----------------------------------------------------------------------------
   A human-in-the-loop assistant that:
     1. Generates draft X/Twitter posts daily for EACH account, from that
        account's own topics/niche and trending events, with that account's
        own signature tags.
     2. Lays drafts out on a weekly calendar (per account) to review /
        approve / edit / reject.
     3. Publishes ONLY posts approved in advance. When a post's scheduled time
        arrives with no approval, it is NOT posted — it is marked "missed".

   Multi-account: accounts are just a dimension on the data model. Each post
   carries an accountId; the calendar is scoped to the active account; the
   scheduler (time-based) runs across ALL accounts. Add accounts via the UI.

   No build step, no dependencies. State persists in localStorage.
   "Publishing" is simulated; see publishPost() for where a real per-account
   X API call goes.
   ========================================================================== */

"use strict";

/* ----------------------------- Default accounts --------------------------
   The account's topics/niche drive WHAT we draft about; its tags drive the
   hashtags appended. New accounts can be added from the UI. */
const DEFAULT_ACCOUNTS = [
  {
    id: "agentica",
    name: "AgenticaTrade",
    handle: "@AgenticaTrade",
    niche: "AI agents that trade tokenized real-world assets (RWA)",
    topics: ["RWA tokens", "crypto", "trading", "equities", "commodities"],
    tags: ["#RWA", "#Tokenization", "#DeFi", "#Trading", "#Crypto", "#Markets"],
    color: "#1d9bf0",
  },
  {
    id: "publicai",
    name: "PublicAI",
    handle: "@PublicAI",
    niche: "a decentralized network for human data that powers better AI",
    topics: [
      "AI", "data labeling", "DePIN", "open-source AI", "crypto",
      "egocentric video", "robotics", "agent coding", "AI tokens",
      "AI gateway", "AI infra",
    ],
    tags: ["#AI", "#DePIN", "#Web3", "#OpenSource", "#Crowdsourcing", "#Crypto", "#Robotics", "#AIagents"],
    color: "#8b5cf6",
  },
];

/* ----------------------------- Trend sources -----------------------------
   In production these would be pulled live (news/X trends API) per topic.
   Here we keep a representative pool; an account only draws from trends whose
   topic it cares about, and any topic with no curated trend falls back to a
   generic one — so a brand-new account always produces content. */
const TREND_POOL = [
  // AgenticaTrade-leaning
  { topic: "RWA tokens", event: "tokenized US Treasuries cross a new TVL high", angle: "real yield is coming on-chain" },
  { topic: "RWA tokens", event: "a major bank pilots tokenized money-market funds", angle: "TradFi is quietly going on-chain" },
  { topic: "RWA tokens", event: "tokenized private credit funds open to retail", angle: "access that used to be institutions-only" },
  { topic: "crypto", event: "BTC reclaims a key level after a volatile week", angle: "where smart money is rotating next" },
  { topic: "crypto", event: "ETH staking yields shift after a network upgrade", angle: "what it means for passive on-chain income" },
  { topic: "crypto", event: "stablecoin supply hits a record", angle: "dry powder waiting on the sidelines" },
  { topic: "trading", event: "the VIX spikes into a Fed decision", angle: "how disciplined traders position into volatility" },
  { topic: "trading", event: "retail options volume surges again", angle: "the difference between gambling and an edge" },
  { topic: "equities", event: "NVDA earnings beat on data-center demand", angle: "the AI capex supercycle isn't slowing" },
  { topic: "equities", event: "TSLA moves on delivery numbers", angle: "narrative vs. fundamentals on the same chart" },
  { topic: "equities", event: "the S&P notches a fresh all-time high", angle: "breadth matters more than the headline" },
  { topic: "commodities", event: "oil jumps on supply-side headlines", angle: "the macro signal under the price spike" },
  { topic: "commodities", event: "gold breaks out as real rates fall", angle: "why the oldest RWA is back in focus" },
  { topic: "commodities", event: "copper rallies on grid + AI power demand", angle: "the metal nobody's talking about yet" },
  // PublicAI-leaning
  { topic: "AI", event: "a new open model tops the leaderboards", angle: "open beats closed over the long run" },
  { topic: "AI", event: "frontier labs hit a data wall", angle: "high-quality human data is the real bottleneck" },
  { topic: "data labeling", event: "demand for expert human data spikes", angle: "the people behind the models deserve a cut" },
  { topic: "DePIN", event: "a DePIN network crosses a node milestone", angle: "real-world infra, owned by the crowd" },
  { topic: "open-source AI", event: "an open dataset release goes viral", angle: "transparency compounds trust" },
  { topic: "egocentric video", event: "demand explodes for first-person (egocentric) video to train robots", angle: "robots learn fastest from how humans actually do tasks" },
  { topic: "egocentric video", event: "labs race to collect head-mounted camera footage of everyday chores", angle: "the next data moat is lived human experience" },
  { topic: "robotics", event: "humanoid robots move from demos to factory-floor pilots", angle: "the real bottleneck is physical-world training data" },
  { topic: "robotics", event: "robot foundation models keep scaling", angle: "more diverse human demonstrations beat more parameters" },
  { topic: "agent coding", event: "AI coding agents start shipping production PRs", angle: "the dev workflow is going agent-first" },
  { topic: "AI tokens", event: "AI + crypto tokens lead the market narrative", angle: "where real usage finally meets on-chain incentives" },
  { topic: "AI gateway", event: "teams route every model call through a single AI gateway", angle: "one endpoint for every model, with full observability" },
  { topic: "AI infra", event: "AI infrastructure spend outpaces every other budget line", angle: "compute and data are the new moats" },
];

/* ----------------------- Copy templates (engagement) ----------------------
   Styles chosen to grow followers + drive replies. Each returns text we then
   trim to the 280-char limit. `ctx.account` is the active account. */
const TEMPLATES = [
  ({ t }) => `Hot take: ${cap(t.event)} — and most people are reading it wrong.\n\n${cap(t.angle)}. 🧵\n\nWhat's your read? 👇`,
  ({ t }) => `${cap(t.event)}.\n\nThe boring truth nobody wants to hear: ${t.angle}.\n\nAgree or disagree?`,
  ({ t }) => `Quick question for the timeline:\n\nNow that ${t.event}, are you in, out, or watching? 🤔\n\nDrop your reasoning 👇`,
  ({ t, account }) => `📊 Signal, not noise:\n\n${cap(t.event)}.\n\nWhy it matters → ${t.angle}.\n\nFollow ${account.handle} — we break down ${t.topic} every day.`,
  ({ t }) => `Everyone's panicking about ${t.topic}. We're not.\n\n${cap(t.event)} just told us ${t.angle}.\n\nZoom out. 🔭`,
  ({ t }) => `If you only read one thing about ${t.topic} today:\n\n${cap(t.event)}. The takeaway is simple — ${t.angle}.\n\nBookmark this. 🔖`,
  ({ t }) => `Unpopular opinion 🌶️\n\n${cap(t.event)} is bullish for one reason: ${t.angle}.\n\nTell me why I'm wrong.`,
  ({ t, account }) => `The signal just fired.\n\n${cap(t.event)}.\n\nThis is exactly what ${account.handle} watches for — because ${t.angle}. ⚡`,
];

/* Peak engagement slots (local time) we spread daily drafts across. */
const POST_SLOTS = [
  { h: 8, m: 30 },
  { h: 12, m: 30 },
  { h: 17, m: 0 },
  { h: 20, m: 0 },
];
const DRAFTS_PER_DAY = 2; // default batch size when seeding a day

const POSTS_KEY = "agentica.x.posts.v1";
const ACCOUNTS_KEY = "agentica.x.accounts.v1";
const ACTIVE_KEY = "agentica.x.active.v1";
const TICK_MS = 15000; // scheduler re-checks every 15s
const MAX_LEN = 280;

/* ------------------------------ Status model ------------------------------
   draft     → generated, awaiting your decision
   approved  → cleared to auto-publish at its scheduled time
   published → went live (only ever reached from "approved")
   missed    → scheduled time passed without approval → NOT posted
   rejected  → you declined it; never eligible to post                       */
const STATUS = {
  draft: { label: "Draft", cls: "s-draft" },
  approved: { label: "Approved", cls: "s-approved" },
  published: { label: "Published", cls: "s-published" },
  missed: { label: "Missed", cls: "s-missed" },
  rejected: { label: "Rejected", cls: "s-rejected" },
};

/* -------------------------------- State ---------------------------------- */
let accounts = [];         // all accounts
let activeId = null;       // active account id (scopes the calendar)
let posts = [];            // all posts across all accounts
let weekStart = startOfWeek(new Date());
let editingId = null;

/* ------------------------------ Utilities -------------------------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const uid = (p = "px") => p + "_" + Math.random().toString(36).slice(2, 10);
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function trim280(text) {
  return text.length <= MAX_LEN ? text : text.slice(0, MAX_LEN - 1).trimEnd() + "…";
}
function slugify(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "acct";
}
function dayKey(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
function startOfWeek(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const day = (d.getDay() + 6) % 7; // 0 = Monday
  d.setDate(d.getDate() - day);
  return d;
}
function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}
function fmtTime(iso) {
  return new Date(iso).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}
function fmtDayHeader(date) {
  return {
    wd: date.toLocaleDateString([], { weekday: "short" }),
    md: date.toLocaleDateString([], { month: "short", day: "numeric" }),
  };
}
function relativeWhen(iso) {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return "due now";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `in ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `in ${hrs} h`;
  return `in ${Math.round(hrs / 24)} d`;
}
function activeAccount() {
  return accounts.find((a) => a.id === activeId) || accounts[0];
}
function accountById(id) {
  return accounts.find((a) => a.id === id);
}

/* ----------------------------- Persistence ------------------------------- */
function save() {
  try {
    localStorage.setItem(POSTS_KEY, JSON.stringify(posts));
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(accounts));
    localStorage.setItem(ACTIVE_KEY, activeId);
  } catch (e) {
    console.warn("Could not persist state:", e);
  }
}
function load() {
  try {
    accounts = JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "null") || DEFAULT_ACCOUNTS.map((a) => ({ ...a }));
  } catch {
    accounts = DEFAULT_ACCOUNTS.map((a) => ({ ...a }));
  }
  if (!accounts.length) accounts = DEFAULT_ACCOUNTS.map((a) => ({ ...a }));

  try {
    posts = JSON.parse(localStorage.getItem(POSTS_KEY) || "[]");
  } catch {
    posts = [];
  }
  // Migrate any legacy posts that predate multi-account.
  for (const p of posts) if (!p.accountId) p.accountId = accounts[0].id;

  reconcileDefaults();

  activeId = localStorage.getItem(ACTIVE_KEY) || accounts[0].id;
  if (!accountById(activeId)) activeId = accounts[0].id;
}

// Keep built-in accounts in sync with code: add any missing default account,
// and additively merge new default topics/tags into existing ones (so updates
// like new PublicAI topics reach users who already have state saved).
function reconcileDefaults() {
  for (const def of DEFAULT_ACCOUNTS) {
    const existing = accountById(def.id);
    if (!existing) {
      accounts.push({ ...def, topics: [...def.topics], tags: [...def.tags] });
      continue;
    }
    existing.topics = existing.topics || [];
    existing.tags = existing.tags || [];
    for (const t of def.topics) if (!existing.topics.includes(t)) existing.topics.push(t);
    for (const t of def.tags) if (!existing.tags.includes(t)) existing.tags.push(t);
    if (!existing.niche) existing.niche = def.niche;
    if (!existing.color) existing.color = def.color;
  }
}

/* --------------------------- Content generation -------------------------- */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function genericTrend(topic, account) {
  return { topic, event: `${topic} is dominating the conversation`, angle: `what it means for ${account.niche}` };
}

let _lastEvent = null;
function pickTrend(account) {
  // Only trends relevant to this account's topics; fall back to a generic one.
  const relevant = TREND_POOL.filter((t) => account.topics.includes(t.topic));
  let trend;
  if (relevant.length) {
    const pool = relevant.length > 1 ? relevant.filter((t) => t.event !== _lastEvent) : relevant;
    trend = pool[Math.floor(Math.random() * pool.length)];
  } else {
    const topic = account.topics[Math.floor(Math.random() * account.topics.length)] || "the market";
    trend = genericTrend(topic, account);
  }
  _lastEvent = trend.event;
  return trend;
}

function pickTags(account, n = 3) {
  return shuffle(account.tags || []).slice(0, n).join(" ");
}

function composeDraft(account, trend) {
  const template = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
  const body = template({ t: trend, account });
  const tags = pickTags(account);
  return trim280(tags ? `${body}\n\n${tags}` : body);
}

function scheduledIsoFor(date, slotIndex) {
  const slot = POST_SLOTS[slotIndex % POST_SLOTS.length];
  const d = new Date(date);
  d.setHours(slot.h, slot.m, 0, 0);
  return d.toISOString();
}

// Create `count` fresh drafts for a given account+day, skipping used/past slots.
function generateDraftsForDay(account, date, count) {
  const key = dayKey(date);
  const usedSlots = new Set(
    posts
      .filter((p) => p.accountId === account.id && dayKey(new Date(p.scheduledAt)) === key)
      .map((p) => {
        const t = new Date(p.scheduledAt);
        return POST_SLOTS.findIndex((s) => s.h === t.getHours() && s.m === t.getMinutes());
      })
      .filter((i) => i >= 0)
  );

  let made = 0;
  for (let slot = 0; slot < POST_SLOTS.length && made < count; slot++) {
    if (usedSlots.has(slot)) continue;
    // Only place drafts in future slots so a fresh draft is always approvable.
    if (new Date(scheduledIsoFor(date, slot)).getTime() <= Date.now()) continue;
    const trend = pickTrend(account);
    posts.push({
      id: uid(),
      accountId: account.id,
      text: composeDraft(account, trend),
      topic: trend.topic,
      trend: trend.event,
      status: "draft",
      bannerOn: true,
      scheduledAt: scheduledIsoFor(date, slot),
      createdAt: new Date().toISOString(),
      publishedAt: null,
    });
    made++;
  }
  return made;
}

// Seed every day in the visible week that has no drafts yet for the active account.
function generateForVisibleWeek() {
  const account = activeAccount();
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    const key = dayKey(date);
    const existing = posts.some((p) => p.accountId === account.id && dayKey(new Date(p.scheduledAt)) === key);
    if (!existing) total += generateDraftsForDay(account, date, DRAFTS_PER_DAY);
  }
  if (total === 0) total += generateDraftsForDay(account, new Date(), 1);
  save();
  runScheduler();
  render();
  return total;
}

/* ----------------------- Approval-gated scheduler ------------------------
   The heart of the tool. Runs across ALL accounts (it's time-based):
     • approved  → publish (the ONLY path to "published")
     • still a draft and due → mark "missed"; it never posts.               */
function publishPost(post) {
  // === Real integration point ===
  // In production: look up the account's X credentials and post, e.g.:
  //   const account = accountById(post.accountId);
  //   let media;
  //   if (bannerEnabled(post)) {
  //     const png = drawBanner(post, account);            // same banner shown here
  //     media = await xClientFor(account).v1.uploadMedia(png); // upload → media_id
  //   }
  //   await xClientFor(account).v2.tweet({ text: post.text, media });
  // The gate below ensures this is ONLY reachable from an approved post.
  if (post.status !== "approved") {
    console.error("Refusing to publish a post that was not approved:", post.id);
    return false;
  }
  post.status = "published";
  post.publishedAt = new Date().toISOString();
  return true;
}

function runScheduler() {
  const now = Date.now();
  let changed = false;
  for (const post of posts) {
    if (new Date(post.scheduledAt).getTime() > now) continue;
    if (post.status === "approved") {
      if (publishPost(post)) changed = true;
    } else if (post.status === "draft") {
      post.status = "missed"; // due but never approved → gate blocks it
      changed = true;
    }
  }
  if (changed) {
    save();
    render();
  }
  return changed;
}

/* ------------------------------- Actions --------------------------------- */
function getPost(id) {
  return posts.find((p) => p.id === id);
}
function approve(id) {
  const p = getPost(id);
  if (!p || p.status === "published") return;
  if (new Date(p.scheduledAt).getTime() <= Date.now()) {
    p.status = "missed";
    save(); render();
    flash("That slot already passed — reschedule it before approving.");
    return;
  }
  p.status = "approved";
  save(); render();
}
function unapprove(id) {
  const p = getPost(id);
  if (!p || p.status === "published") return;
  p.status = "draft"; save(); render();
}
function reject(id) {
  const p = getPost(id);
  if (!p || p.status === "published") return;
  p.status = "rejected"; save(); render();
}
function restore(id) {
  const p = getPost(id);
  if (!p || p.status === "published") return;
  p.status = "draft"; save(); render();
}
function remove(id) {
  posts = posts.filter((p) => p.id !== id);
  if (editingId === id) editingId = null;
  save(); render();
}
function regenerate(id) {
  const p = getPost(id);
  if (!p || p.status === "published") return;
  const account = accountById(p.accountId) || activeAccount();
  const trend = pickTrend(account);
  p.text = composeDraft(account, trend);
  p.trend = trend.event;
  p.topic = trend.topic;
  p.status = "draft"; // new copy must be re-approved
  save(); render();
}
function toggleBanner(id) {
  const p = getPost(id);
  if (!p) return;
  p.bannerOn = !bannerEnabled(p); // off if currently on, on if currently off
  save(); render();
}
function startEdit(id) { editingId = id; render(); }
function cancelEdit() { editingId = null; render(); }
function saveEdit(id, newText, newScheduleLocal) {
  const p = getPost(id);
  if (!p) return;
  p.text = trim280(newText);
  if (newScheduleLocal) {
    const dt = new Date(newScheduleLocal);
    if (!isNaN(dt)) p.scheduledAt = dt.toISOString();
  }
  // SAFETY: any edit invalidates a prior approval — must be re-approved.
  if (p.status === "approved" || p.status === "missed") p.status = "draft";
  editingId = null;
  save(); render();
}

/* --------------------------- Account actions ----------------------------- */
function switchAccount(id) {
  if (!accountById(id)) return;
  activeId = id;
  editingId = null;
  save();
  render();
}
function addAccount({ name, handle, niche, topics, tags }) {
  const topicList = topics.split(",").map((s) => s.trim()).filter(Boolean);
  if (!name.trim() || !topicList.length) {
    flash("An account needs a name and at least one topic.");
    return null;
  }
  const tagList = (tags || "")
    .split(/[\s,]+/)
    .filter(Boolean)
    .map((t) => (t.startsWith("#") ? t : "#" + t));
  let id = slugify(name);
  while (accountById(id)) id = slugify(name) + "-" + Math.random().toString(36).slice(2, 5);
  const colors = ["#1d9bf0", "#8b5cf6", "#1fbf75", "#f5a623", "#f4505b", "#06b6d4"];
  const account = {
    id,
    name: name.trim(),
    handle: handle.trim() || "@" + slugify(name).replace(/-/g, ""),
    niche: niche.trim() || name.trim(),
    topics: topicList,
    tags: tagList.length ? tagList : ["#" + slugify(name).replace(/-/g, "")],
    color: colors[accounts.length % colors.length],
  };
  accounts.push(account);
  activeId = id;
  save();
  render();
  return account;
}

/* ------------------------------ Rendering -------------------------------- */
function statusBadge(post) {
  const s = STATUS[post.status];
  return `<span class="badge ${s.cls}">${s.label}</span>`;
}
function toLocalInputValue(iso) {
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/* ------------------------- Auto-generated banners -------------------------
   Each post gets a branded banner drawn on a <canvas> from its hook text and
   the account's color. It is generated on the fly (cached in memory by a key
   that includes the headline), so nothing image-heavy is ever persisted to
   localStorage. In production, publishPost() would render this same banner and
   upload it as media before tweeting. */
const _bannerCache = new Map();

function bannerEnabled(post) {
  return post.bannerOn !== false; // on by default
}
function headlineFrom(text) {
  const first = text.split("\n").map((s) => s.trim()).find(Boolean) || text;
  return first.length > 90 ? first.slice(0, 89) + "…" : first;
}
function shade(hex, amt) {
  let h = String(hex || "#1d9bf0").replace("#", "");
  if (h.length === 3) h = h.split("").map((x) => x + x).join("");
  const num = parseInt(h, 16);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const r = clamp((num >> 16) + amt), g = clamp(((num >> 8) & 0xff) + amt), b = clamp((num & 0xff) + amt);
  return `rgb(${r},${g},${b})`;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function wrapText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = text.split(/\s+/);
  let line = "", lines = 0;
  for (let i = 0; i < words.length; i++) {
    const test = line ? line + " " + words[i] : words[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y + lines * lineHeight);
      line = words[i];
      if (++lines >= maxLines - 1) {
        // last allowed line — append remaining and ellipsize if needed
        let rest = words.slice(i).join(" ");
        while (ctx.measureText(rest + "…").width > maxWidth && rest.length > 1) rest = rest.slice(0, -1);
        ctx.fillText(rest + (words.slice(i).join(" ") !== rest ? "…" : ""), x, y + lines * lineHeight);
        return;
      }
    } else {
      line = test;
    }
  }
  ctx.fillText(line, x, y + lines * lineHeight);
}
function drawBanner(post, account) {
  const W = 600, H = 314; // ~1.91:1, X summary-card ratio
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const ctx = c.getContext("2d");
  const FONT = "-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

  // Brand gradient + darkening overlay for text contrast.
  const g = ctx.createLinearGradient(0, 0, W, H);
  g.addColorStop(0, account.color);
  g.addColorStop(1, shade(account.color, -55));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "rgba(8,12,20,0.30)"; ctx.fillRect(0, 0, W, H);

  // Topic chip
  const chip = "#" + String(post.topic).replace(/\s+/g, "");
  ctx.font = "600 18px " + FONT;
  const cw = ctx.measureText(chip).width + 28;
  ctx.fillStyle = "rgba(255,255,255,0.18)";
  roundRect(ctx, 36, 34, cw, 34, 17); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.textBaseline = "middle";
  ctx.fillText(chip, 50, 52);

  // Headline (the post's hook)
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "top";
  ctx.font = "800 36px " + FONT;
  wrapText(ctx, headlineFrom(post.text), 36, 104, W - 72, 44, 3);

  // Handle + brand mark
  ctx.textBaseline = "alphabetic";
  ctx.font = "700 22px " + FONT;
  ctx.fillStyle = "rgba(255,255,255,0.97)";
  ctx.fillText(account.handle, 36, H - 36);
  ctx.textAlign = "right";
  ctx.font = "600 16px " + FONT;
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.fillText("𝕏 · " + account.name, W - 36, H - 38);
  ctx.textAlign = "left";

  return c.toDataURL("image/png");
}
function bannerFor(post) {
  const account = accountById(post.accountId) || activeAccount();
  const key = `${post.id}|${account.id}|${account.color}|${headlineFrom(post.text)}`;
  if (_bannerCache.has(key)) return _bannerCache.get(key);
  const url = drawBanner(post, account);
  _bannerCache.set(key, url);
  return url;
}
function renderActions(post) {
  switch (post.status) {
    case "draft":
      return `
        <button class="mini btn-approve" data-act="approve" data-id="${post.id}">✓ Approve</button>
        <button class="mini" data-act="edit" data-id="${post.id}">✎ Edit</button>
        <button class="mini" data-act="regenerate" data-id="${post.id}">↻ Regenerate</button>
        <button class="mini" data-act="toggle-banner" data-id="${post.id}">${bannerEnabled(post) ? "🖼 Banner ✓" : "🖼 Add banner"}</button>
        <button class="mini btn-danger" data-act="reject" data-id="${post.id}">✕ Reject</button>`;
    case "approved":
      return `
        <button class="mini" data-act="unapprove" data-id="${post.id}">↩ Unapprove</button>
        <button class="mini" data-act="edit" data-id="${post.id}">✎ Edit</button>
        <button class="mini" data-act="toggle-banner" data-id="${post.id}">${bannerEnabled(post) ? "🖼 Banner ✓" : "🖼 Add banner"}</button>
        <button class="mini btn-danger" data-act="reject" data-id="${post.id}">✕ Reject</button>`;
    case "published":
      return `<span class="posted-note">Posted to X ✓</span>`;
    case "missed":
      return `
        <button class="mini btn-approve" data-act="edit" data-id="${post.id}">⏰ Reschedule & edit</button>
        <button class="mini btn-danger" data-act="remove" data-id="${post.id}">🗑 Delete</button>`;
    case "rejected":
      return `
        <button class="mini" data-act="restore" data-id="${post.id}">↩ Restore</button>
        <button class="mini btn-danger" data-act="remove" data-id="${post.id}">🗑 Delete</button>`;
    default:
      return "";
  }
}
function renderPostCard(post) {
  if (editingId === post.id) {
    return `
      <li class="post editing" data-id="${post.id}">
        <form class="edit-form" data-id="${post.id}">
          <textarea class="edit-text" maxlength="${MAX_LEN}" rows="6">${escapeHtml(post.text)}</textarea>
          <div class="edit-meta">
            <span class="counter"><span class="count">${post.text.length}</span>/${MAX_LEN}</span>
            <label class="sched">⏰ <input type="datetime-local" class="edit-time" value="${toLocalInputValue(post.scheduledAt)}" /></label>
          </div>
          <div class="edit-actions">
            <button type="submit" class="mini btn-approve">Save</button>
            <button type="button" class="mini" data-act="cancel-edit">Cancel</button>
          </div>
          <p class="edit-hint">Saving sends this back to <strong>Draft</strong> — re-approve to schedule it.</p>
        </form>
      </li>`;
  }
  const overLimit = post.text.length > MAX_LEN;
  const whenNote =
    post.status === "approved" ? `<span class="when ok">auto-publishes ${relativeWhen(post.scheduledAt)}</span>`
    : post.status === "published" ? `<span class="when">posted ${fmtTime(post.publishedAt)}</span>`
    : post.status === "missed" ? `<span class="when bad">not posted — wasn't approved in time</span>`
    : "";
  const banner = bannerEnabled(post)
    ? `<img class="post-banner" src="${bannerFor(post)}" alt="Generated banner for this post" />`
    : "";
  return `
    <li class="post ${STATUS[post.status].cls}" data-id="${post.id}">
      <div class="post-top">
        <span class="time">${fmtTime(post.scheduledAt)}</span>
        ${statusBadge(post)}
      </div>
      ${banner}
      <p class="post-text">${escapeHtml(post.text)}</p>
      <div class="post-meta">
        <span class="topic">#${String(post.topic).replace(/\s+/g, "")}</span>
        ${whenNote}
        <span class="len ${overLimit ? "over" : ""}">${post.text.length}/${MAX_LEN}</span>
      </div>
      <div class="post-actions">${renderActions(post)}</div>
    </li>`;
}
function renderCalendar() {
  const cal = $("#calendar");
  const account = activeAccount();
  const today = dayKey(new Date());
  let html = "";
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    const key = dayKey(date);
    const { wd, md } = fmtDayHeader(date);
    const dayPosts = posts
      .filter((p) => p.accountId === account.id && dayKey(new Date(p.scheduledAt)) === key)
      .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
    html += `
      <div class="day ${key === today ? "is-today" : ""}">
        <div class="day-head">
          <div class="day-date"><span class="wd">${wd}</span><span class="md">${md}</span></div>
          <button class="add-draft icon-btn" data-act="add-day" data-date="${key}" title="Add a draft for this day">＋</button>
        </div>
        <ul class="day-posts">
          ${dayPosts.length ? dayPosts.map(renderPostCard).join("") : `<li class="empty">No drafts</li>`}
        </ul>
      </div>`;
  }
  cal.innerHTML = html;
}
function renderAccountTabs() {
  const tabs = $("#account-tabs");
  tabs.innerHTML = accounts
    .map((a) => {
      const n = posts.filter((p) => p.accountId === a.id).length;
      const active = a.id === activeId;
      return `
        <button class="acct-tab ${active ? "active" : ""}" data-account="${a.id}"
                style="${active ? `--acct:${a.color}` : ""}">
          <span class="acct-dot" style="background:${a.color}"></span>
          <span class="acct-name">${escapeHtml(a.name)}</span>
          <span class="acct-handle">${escapeHtml(a.handle)}</span>
          ${n ? `<span class="acct-count">${n}</span>` : ""}
        </button>`;
    })
    .join("");
}
function renderStatbar() {
  const account = activeAccount();
  const mine = posts.filter((p) => p.accountId === account.id);
  const counts = { draft: 0, approved: 0, published: 0, missed: 0, rejected: 0 };
  for (const p of mine) counts[p.status]++;
  const nextApproved = mine
    .filter((p) => p.status === "approved")
    .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt))[0];
  const nextNote = nextApproved
    ? `Next auto-publish: <strong>${relativeWhen(nextApproved.scheduledAt)}</strong>`
    : `No posts queued to publish`;
  $("#statbar").innerHTML = `
    <div class="stats">
      <span class="stat s-draft"><b>${counts.draft}</b> drafts</span>
      <span class="stat s-approved"><b>${counts.approved}</b> approved</span>
      <span class="stat s-published"><b>${counts.published}</b> published</span>
      <span class="stat s-missed"><b>${counts.missed}</b> missed</span>
      <span class="stat s-rejected"><b>${counts.rejected}</b> rejected</span>
    </div>
    <div class="next-note">${escapeHtml(account.name)} · ${nextNote}</div>`;
}
function renderWeekLabel() {
  const end = addDays(weekStart, 6);
  const opts = { month: "short", day: "numeric" };
  $("#week-label").textContent =
    `${weekStart.toLocaleDateString([], opts)} – ${end.toLocaleDateString([], { ...opts, year: "numeric" })}`;
}
function render() {
  renderAccountTabs();
  renderWeekLabel();
  renderStatbar();
  renderCalendar();
}

/* ------------------------------- Helpers --------------------------------- */
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
let _flashTimer = null;
function flash(msg) {
  let el = $("#flash");
  if (!el) {
    el = document.createElement("div");
    el.id = "flash"; el.className = "flash";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(_flashTimer);
  _flashTimer = setTimeout(() => el.classList.remove("show"), 3200);
}

/* --------------------------- Account modal ------------------------------- */
function openAccountModal() {
  const modal = $("#account-modal");
  $("#account-form").reset();
  modal.hidden = false;
}
function closeAccountModal() {
  $("#account-modal").hidden = true;
}

/* ------------------------------ Event wiring ----------------------------- */
function onCalendarClick(e) {
  const btn = e.target.closest("[data-act]");
  if (!btn) return;
  const act = btn.dataset.act;
  const id = btn.dataset.id;
  switch (act) {
    case "approve": return approve(id);
    case "unapprove": return unapprove(id);
    case "reject": return reject(id);
    case "restore": return restore(id);
    case "remove": return remove(id);
    case "regenerate": return regenerate(id);
    case "toggle-banner": return toggleBanner(id);
    case "edit": return startEdit(id);
    case "cancel-edit": return cancelEdit();
    case "add-day": {
      const d = new Date(btn.dataset.date + "T00:00:00");
      const made = generateDraftsForDay(activeAccount(), d, 1);
      if (made) { save(); render(); } else flash("All time slots for that day are full or in the past.");
      return;
    }
  }
}
function onCalendarSubmit(e) {
  const form = e.target.closest(".edit-form");
  if (!form) return;
  e.preventDefault();
  saveEdit(form.dataset.id, $(".edit-text", form).value, $(".edit-time", form).value);
}
function onCalendarInput(e) {
  if (e.target.classList.contains("edit-text")) {
    const counter = e.target.closest(".edit-form").querySelector(".count");
    if (counter) counter.textContent = e.target.value.length;
  }
}

function init() {
  load();
  save(); // persist any reconciled default topics/tags

  if (posts.length === 0) {
    generateForVisibleWeek(); // seed active account's week on first run
  } else {
    runScheduler();
    render();
  }

  // Header actions
  $("#generate-week").addEventListener("click", () => {
    const n = generateForVisibleWeek();
    flash(n ? `Generated ${n} new draft${n === 1 ? "" : "s"} for ${activeAccount().name}.` : "Week is fully drafted.");
  });
  $("#run-scheduler").addEventListener("click", () => {
    const changed = runScheduler();
    flash(changed ? "Scheduler ran: due posts processed." : "Nothing due right now.");
  });

  // Account switcher + add account
  $("#account-tabs").addEventListener("click", (e) => {
    const tab = e.target.closest(".acct-tab");
    if (tab) switchAccount(tab.dataset.account);
  });
  $("#add-account").addEventListener("click", openAccountModal);
  $("#account-close").addEventListener("click", closeAccountModal);
  $("#account-cancel").addEventListener("click", closeAccountModal);
  $("#account-modal").addEventListener("click", (e) => {
    if (e.target.id === "account-modal") closeAccountModal(); // click backdrop
  });
  $("#account-form").addEventListener("submit", (e) => {
    e.preventDefault();
    const f = e.target.elements;
    const acct = addAccount({
      name: f.name.value, handle: f.handle.value, niche: f.niche.value,
      topics: f.topics.value, tags: f.tags.value,
    });
    if (acct) {
      closeAccountModal();
      const n = generateForVisibleWeek();
      flash(`Added ${acct.name}${n ? ` and drafted ${n} post${n === 1 ? "" : "s"}` : ""}.`);
    }
  });

  // Calendar navigation
  $("#prev-week").addEventListener("click", () => { weekStart = addDays(weekStart, -7); render(); });
  $("#next-week").addEventListener("click", () => { weekStart = addDays(weekStart, 7); render(); });
  $("#today-btn").addEventListener("click", () => { weekStart = startOfWeek(new Date()); render(); });

  // Delegated calendar events
  const cal = $("#calendar");
  cal.addEventListener("click", onCalendarClick);
  cal.addEventListener("submit", onCalendarSubmit);
  cal.addEventListener("input", onCalendarInput);

  setInterval(runScheduler, TICK_MS);
}

document.addEventListener("DOMContentLoaded", init);
