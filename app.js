/* ============================================================================
   AgenticaTrade — Daily X Content Agent
   ----------------------------------------------------------------------------
   A human-in-the-loop assistant that:
     1. Generates draft X/Twitter posts daily from the account's topics/niche
        and trending events in that space.
     2. Lays drafts out on a weekly calendar to review / approve / edit / reject.
     3. Publishes ONLY posts approved in advance. When a post's scheduled time
        arrives with no approval, it is NOT posted — it is marked "missed".

   No build step, no dependencies. State persists in localStorage.
   "Publishing" is simulated; see publishPost() for where a real X API call goes.
   ========================================================================== */

"use strict";

/* ----------------------------- Account profile --------------------------- */
const ACCOUNT = {
  handle: "@AgenticaTrade",
  niche: "AI agents that trade tokenized real-world assets (RWA)",
  // The account's topics / niche drive what we draft about.
  topics: ["RWA tokens", "crypto", "trading", "equities", "commodities"],
};

/* ----------------------------- Trend sources -----------------------------
   In a production build these would be pulled live (news/X trends API).
   Here we keep a representative pool relevant to the account's topics. Each
   "trend" carries the angle the agent can build engagement-driving copy on. */
const TREND_POOL = [
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
];

/* ----------------------- Copy templates (engagement) ----------------------
   Styles chosen to grow followers + drive replies: hot takes, questions,
   data hooks, contrarian angles, and short educational threads. Each returns
   text we then trim to the 280-char limit. */
const TEMPLATES = [
  ({ t }) => `Hot take: ${cap(t.event)} — and most people are reading it wrong.\n\n${cap(t.angle)}. 🧵\n\nWhat's your read? 👇`,
  ({ t }) => `${cap(t.event)}.\n\nThe boring truth nobody wants to hear: ${t.angle}.\n\nAgree or disagree?`,
  ({ t }) => `Quick question for the timeline:\n\nNow that ${t.event}, are you adding, trimming, or sitting on your hands? 🤔\n\nDrop your reasoning 👇`,
  ({ t }) => `📊 Signal, not noise:\n\n${cap(t.event)}.\n\nWhy it matters → ${t.angle}.\n\nFollow ${ACCOUNT.handle} — we break down ${t.topic} every day.`,
  ({ t }) => `Everyone's panicking about ${t.topic}. We're not.\n\n${cap(t.event)} just told us ${t.angle}.\n\nZoom out. 🔭`,
  ({ t }) => `If you only read one thing about ${t.topic} today:\n\n${cap(t.event)}. The takeaway is simple — ${t.angle}.\n\nBookmark this. 🔖`,
  ({ t }) => `Unpopular opinion 🌶️\n\n${cap(t.event)} is bullish for one reason: ${t.angle}.\n\nTell me why I'm wrong.`,
  ({ t }) => `The market gave us a tell today.\n\n${cap(t.event)}.\n\nOur agents flagged it instantly — because ${t.angle}.\n\nThis is why on-chain + automated > emotional. ⚡`,
];

const HASHTAGS = {
  "RWA tokens": "#RWA #Tokenization #DeFi",
  crypto: "#Crypto #Bitcoin #DeFi",
  trading: "#Trading #Markets #Risk",
  equities: "#Stocks #Equities #Investing",
  commodities: "#Commodities #Gold #Oil",
};

/* Peak engagement slots (local time) we spread daily drafts across. */
const POST_SLOTS = [
  { h: 8, m: 30 },
  { h: 12, m: 30 },
  { h: 17, m: 0 },
  { h: 20, m: 0 },
];
const DRAFTS_PER_DAY = 2; // default batch size when seeding a day

const STORAGE_KEY = "agentica.x.posts.v1";
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
let posts = [];            // all posts across all days
let weekStart = startOfWeek(new Date()); // Monday of the visible week
let editingId = null;      // id of post currently in edit mode

/* ------------------------------ Utilities -------------------------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const uid = () => "px_" + Math.random().toString(36).slice(2, 10);
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

function trim280(text) {
  return text.length <= MAX_LEN ? text : text.slice(0, MAX_LEN - 1).trimEnd() + "…";
}

function dayKey(date) {
  // Local YYYY-MM-DD key
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

/* ----------------------------- Persistence ------------------------------- */
function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(posts));
  } catch (e) {
    console.warn("Could not persist posts:", e);
  }
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    posts = raw ? JSON.parse(raw) : [];
  } catch {
    posts = [];
  }
}

/* --------------------------- Content generation -------------------------- */
let _lastTrendIdx = -1;
function pickTrend(topicFilter) {
  const pool = topicFilter ? TREND_POOL.filter((t) => t.topic === topicFilter) : TREND_POOL;
  const list = pool.length ? pool : TREND_POOL;
  let idx;
  do {
    idx = Math.floor(Math.random() * list.length);
  } while (list.length > 1 && list[idx] === TREND_POOL[_lastTrendIdx]);
  _lastTrendIdx = TREND_POOL.indexOf(list[idx]);
  return list[idx];
}

function composeDraft(trend) {
  const template = TEMPLATES[Math.floor(Math.random() * TEMPLATES.length)];
  const body = template({ t: trend, account: ACCOUNT });
  const tags = HASHTAGS[trend.topic] || "";
  const text = tags ? `${body}\n\n${tags}` : body;
  return trim280(text);
}

function scheduledIsoFor(date, slotIndex) {
  const slot = POST_SLOTS[slotIndex % POST_SLOTS.length];
  const d = new Date(date);
  d.setHours(slot.h, slot.m, 0, 0);
  return d.toISOString();
}

// Create `count` fresh drafts for a given day, skipping slots already used.
function generateDraftsForDay(date, count) {
  const key = dayKey(date);
  const usedSlots = new Set(
    posts
      .filter((p) => dayKey(new Date(p.scheduledAt)) === key)
      .map((p) => {
        const t = new Date(p.scheduledAt);
        return POST_SLOTS.findIndex((s) => s.h === t.getHours() && s.m === t.getMinutes());
      })
      .filter((i) => i >= 0)
  );

  let made = 0;
  for (let slot = 0; slot < POST_SLOTS.length && made < count; slot++) {
    if (usedSlots.has(slot)) continue;
    // Only place drafts in slots still in the future, so a freshly generated
    // draft is always something you can review and approve in advance.
    if (new Date(scheduledIsoFor(date, slot)).getTime() <= Date.now()) continue;
    const trend = pickTrend();
    posts.push({
      id: uid(),
      text: composeDraft(trend),
      topic: trend.topic,
      trend: trend.event,
      status: "draft",
      scheduledAt: scheduledIsoFor(date, slot),
      createdAt: new Date().toISOString(),
      publishedAt: null,
    });
    made++;
  }
  return made;
}

// Seed every day in the visible week that has no drafts yet.
function generateForVisibleWeek() {
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    const key = dayKey(date);
    const existing = posts.some((p) => dayKey(new Date(p.scheduledAt)) === key);
    if (!existing) total += generateDraftsForDay(date, DRAFTS_PER_DAY);
  }
  if (total === 0) {
    // Week already populated — add one more idea to today instead.
    total += generateDraftsForDay(new Date(), 1);
  }
  save();
  runScheduler(); // a freshly generated past-due unapproved draft shouldn't linger as pending
  render();
  return total;
}

/* ----------------------- Approval-gated scheduler ------------------------
   This is the heart of the tool. On every tick we look at posts whose
   scheduled time has passed:
     • approved  → publish (this is the ONLY path to "published")
     • anything else still pending (draft) → mark "missed"; it never posts.
   Already-published / rejected / missed posts are left untouched.          */
function publishPost(post) {
  // === Real integration point ===
  // In production this is where we'd call the X API, e.g.:
  //   await xClient.v2.tweet(post.text)
  // We hard-gate it so it can ONLY be reached from an approved post.
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
    const due = new Date(post.scheduledAt).getTime() <= now;
    if (!due) continue;

    if (post.status === "approved") {
      if (publishPost(post)) changed = true;
    } else if (post.status === "draft") {
      // Due but never approved → gate blocks it. It does NOT post.
      post.status = "missed";
      changed = true;
    }
    // published / rejected / missed → no action
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
  // Guard: can't approve something already past its time (it can't be
  // "approved in advance"). Nudge the user to reschedule first.
  if (new Date(p.scheduledAt).getTime() <= Date.now()) {
    p.status = "missed";
    save();
    render();
    flash("That slot already passed — reschedule it before approving.");
    return;
  }
  p.status = "approved";
  save();
  render();
}

function unapprove(id) {
  const p = getPost(id);
  if (!p || p.status === "published") return;
  p.status = "draft";
  save();
  render();
}

function reject(id) {
  const p = getPost(id);
  if (!p || p.status === "published") return;
  p.status = "rejected";
  save();
  render();
}

function restore(id) {
  // Bring a rejected/missed post back to draft so it can be edited & re-approved.
  const p = getPost(id);
  if (!p || p.status === "published") return;
  p.status = "draft";
  save();
  render();
}

function remove(id) {
  posts = posts.filter((p) => p.id !== id);
  if (editingId === id) editingId = null;
  save();
  render();
}

function regenerate(id) {
  const p = getPost(id);
  if (!p || p.status === "published") return;
  const trend = pickTrend(p.topic);
  p.text = composeDraft(trend);
  p.trend = trend.event;
  p.status = "draft"; // new copy must be re-approved
  save();
  render();
}

function startEdit(id) {
  editingId = id;
  render();
}

function cancelEdit() {
  editingId = null;
  render();
}

function saveEdit(id, newText, newScheduleLocal) {
  const p = getPost(id);
  if (!p) return;
  p.text = trim280(newText);
  if (newScheduleLocal) {
    const dt = new Date(newScheduleLocal);
    if (!isNaN(dt)) p.scheduledAt = dt.toISOString();
  }
  // SAFETY: any edit invalidates a prior approval — must be re-approved so we
  // never publish content the human didn't sign off on.
  if (p.status === "approved" || p.status === "missed") p.status = "draft";
  editingId = null;
  save();
  render();
}

/* ------------------------------ Rendering -------------------------------- */
function statusBadge(post) {
  const s = STATUS[post.status];
  return `<span class="badge ${s.cls}">${s.label}</span>`;
}

function toLocalInputValue(iso) {
  // Format an ISO string into a value usable by <input type="datetime-local">
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderActions(post) {
  switch (post.status) {
    case "draft":
      return `
        <button class="mini btn-approve" data-act="approve" data-id="${post.id}">✓ Approve</button>
        <button class="mini" data-act="edit" data-id="${post.id}">✎ Edit</button>
        <button class="mini" data-act="regenerate" data-id="${post.id}">↻ Regenerate</button>
        <button class="mini btn-danger" data-act="reject" data-id="${post.id}">✕ Reject</button>`;
    case "approved":
      return `
        <button class="mini" data-act="unapprove" data-id="${post.id}">↩ Unapprove</button>
        <button class="mini" data-act="edit" data-id="${post.id}">✎ Edit</button>
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
    post.status === "approved"
      ? `<span class="when ok">auto-publishes ${relativeWhen(post.scheduledAt)}</span>`
      : post.status === "published"
      ? `<span class="when">posted ${fmtTime(post.publishedAt)}</span>`
      : post.status === "missed"
      ? `<span class="when bad">not posted — wasn't approved in time</span>`
      : "";

  return `
    <li class="post ${STATUS[post.status].cls}" data-id="${post.id}">
      <div class="post-top">
        <span class="time">${fmtTime(post.scheduledAt)}</span>
        ${statusBadge(post)}
      </div>
      <p class="post-text">${escapeHtml(post.text)}</p>
      <div class="post-meta">
        <span class="topic">#${post.topic.replace(/\s+/g, "")}</span>
        ${whenNote}
        <span class="len ${overLimit ? "over" : ""}">${post.text.length}/${MAX_LEN}</span>
      </div>
      <div class="post-actions">${renderActions(post)}</div>
    </li>`;
}

function renderCalendar() {
  const cal = $("#calendar");
  const today = dayKey(new Date());
  let html = "";

  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    const key = dayKey(date);
    const { wd, md } = fmtDayHeader(date);
    const dayPosts = posts
      .filter((p) => dayKey(new Date(p.scheduledAt)) === key)
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

function renderStatbar() {
  const counts = { draft: 0, approved: 0, published: 0, missed: 0, rejected: 0 };
  for (const p of posts) counts[p.status]++;

  const nextApproved = posts
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
    <div class="next-note">${nextNote}</div>`;
}

function renderWeekLabel() {
  const end = addDays(weekStart, 6);
  const opts = { month: "short", day: "numeric" };
  $("#week-label").textContent =
    `${weekStart.toLocaleDateString([], opts)} – ${end.toLocaleDateString([], { ...opts, year: "numeric" })}`;
}

function render() {
  renderWeekLabel();
  renderStatbar();
  renderCalendar();
}

/* ------------------------------- Helpers --------------------------------- */
function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let _flashTimer = null;
function flash(msg) {
  let el = $("#flash");
  if (!el) {
    el = document.createElement("div");
    el.id = "flash";
    el.className = "flash";
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  clearTimeout(_flashTimer);
  _flashTimer = setTimeout(() => el.classList.remove("show"), 3200);
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
    case "edit": return startEdit(id);
    case "cancel-edit": return cancelEdit();
    case "add-day": {
      const d = new Date(btn.dataset.date + "T00:00:00");
      const made = generateDraftsForDay(d, 1);
      if (made) { save(); render(); } else flash("All time slots for that day are full.");
      return;
    }
  }
}

function onCalendarSubmit(e) {
  const form = e.target.closest(".edit-form");
  if (!form) return;
  e.preventDefault();
  const id = form.dataset.id;
  const text = $(".edit-text", form).value;
  const time = $(".edit-time", form).value;
  saveEdit(id, text, time);
}

function onCalendarInput(e) {
  if (e.target.classList.contains("edit-text")) {
    const counter = e.target.closest(".edit-form").querySelector(".count");
    if (counter) counter.textContent = e.target.value.length;
  }
}

function init() {
  load();

  // First run with an empty store → seed the current week so there's something to review.
  if (posts.length === 0) {
    generateForVisibleWeek();
  } else {
    runScheduler();
    render();
  }

  // Header actions
  $("#generate-week").addEventListener("click", () => {
    const n = generateForVisibleWeek();
    flash(n ? `Generated ${n} new draft${n === 1 ? "" : "s"}.` : "Week is fully drafted.");
  });
  $("#run-scheduler").addEventListener("click", () => {
    const changed = runScheduler();
    flash(changed ? "Scheduler ran: due posts processed." : "Nothing due right now.");
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

  // Keep the gate honest: re-run the scheduler on an interval.
  setInterval(runScheduler, TICK_MS);
}

document.addEventListener("DOMContentLoaded", init);
