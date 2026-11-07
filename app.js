"use strict";

// ---------- Storage ----------
const STORE_KEY = "tally.expenses.v1";
const SETTINGS_KEY = "tally.settings.v1";

const CATEGORY_COLORS = {
  Food: "#b4583a",
  Groceries: "#5f8a5c",
  Transport: "#3f6c9b",
  Shopping: "#8a5f95",
  Bills: "#6f6a62",
  Health: "#2f8578",
  Entertainment: "#b8892f",
  Travel: "#4d5c9e",
  Other: "#9a968f",
};
const CATEGORY_NAMES = Object.keys(CATEGORY_COLORS);

function load(key, fallback) {
  try {
    return JSON.parse(localStorage.getItem(key)) ?? fallback;
  } catch {
    return fallback;
  }
}

function regionDefaults(code) {
  const region = REGIONS[code] || REGIONS.US;
  return { region: code, locale: region.locale, currency: region.currency, lang: region.lang, weekStart: region.weekStart };
}

function detectRegion() {
  const code = ((navigator.language || "en-US").split("-")[1] || "US").toUpperCase();
  return REGIONS[code] ? code : "US";
}

const savedSettings = load(SETTINGS_KEY, {});
const store = {
  expenses: load(STORE_KEY, []),
  settings: {
    ...regionDefaults(savedSettings.region || detectRegion()),
    uiLang: "auto",
    budgetTotal: 0,
    budgets: {},
    ...savedSettings,
  },
};

let demoMode = false;

function persist() {
  if (demoMode) {
    return;
  }
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store.expenses));
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(store.settings));
  } catch {
    showToast(t("storageFull"), [{ label: t("backup"), run: downloadBackup }]);
  }
}

function uiLanguage() {
  return store.settings.uiLang === "auto" ? (REGIONS[store.settings.region] || REGIONS.US).ui : store.settings.uiLang;
}

// Gregorian calendar everywhere (e.g. th-TH would otherwise show Buddhist years).
const locale = () => `${store.settings.locale}-u-ca-gregory`;
const catName = (cat) => t(`cat_${cat}`);

// ---------- Helpers ----------
const $ = (selector, root = document) => root.querySelector(selector);
const pad = (n) => String(n).padStart(2, "0");
const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const fromKey = (k) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d);
};
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const daysBetween = (a, b) => Math.round((b - a) / 86400000);
const sum = (items) => items.reduce((total, e) => total + e.amount, 0);
const today = () => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
};

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function money(value, options = {}) {
  const rounded = Math.round(value * 100) / 100;
  try {
    return new Intl.NumberFormat(locale(), {
      style: "currency",
      currency: store.settings.currency,
      currencyDisplay: "symbol",
      minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2,
      maximumFractionDigits: 2,
      ...options,
    }).format(rounded);
  } catch {
    return rounded.toLocaleString();
  }
}

function compactMoney(value) {
  if (Math.abs(value) < 10000) {
    return money(Math.round(value), { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }
  try {
    return new Intl.NumberFormat(locale(), {
      style: "currency",
      currency: store.settings.currency,
      notation: "compact",
      maximumSignificantDigits: 3,
    }).format(value);
  } catch {
    return Math.round(value).toLocaleString();
  }
}

// Budget fields show "30,000" (or "30.000" in id-ID); parseLocalNumber reads either back.
function groupedNumber(value) {
  return value ? new Intl.NumberFormat(locale(), { maximumFractionDigits: 2 }).format(value) : "";
}

// Typed amounts follow the region: "1.234,5" in id-ID / de-DE, "1,234.5" elsewhere.
function parseLocalNumber(text) {
  const decimal = new Intl.NumberFormat(locale()).format(1.5).charAt(1);
  let clean = String(text).replace(/[\s\u00a0]/g, "");
  clean = decimal === "," ? clean.replace(/\./g, "").replace(",", ".") : clean.replace(/,/g, "");
  return parseFloat(clean.replace(/[^\d.]/g, ""));
}

function dayLabel(key) {
  const diff = daysBetween(fromKey(key), today());
  if (diff === 0) {
    return t("today");
  }
  if (diff === 1) {
    return t("yesterday");
  }
  return fromKey(key).toLocaleDateString(locale(), { weekday: "short", month: "short", day: "numeric" });
}

function byNewest(a, b) {
  return b.date.localeCompare(a.date) || (b.created || 0) - (a.created || 0);
}

function markHtml(expense) {
  const color = CATEGORY_COLORS[expense.cat] || CATEGORY_COLORS.Other;
  const letter = escapeHtml([...(expense.desc || catName(expense.cat)).trim()][0].toUpperCase());
  return `<span class="mark" style="--mark:${color}">${letter}</span>`;
}

function txRowHtml(expense, showDate = false) {
  const sub = [catName(expense.cat), showDate ? dayLabel(expense.date) : "", expense.note].filter(Boolean).map(escapeHtml).join(" · ");
  return `<button class="tx" data-edit="${expense.id}">
    ${markHtml(expense)}
    <span class="body"><div class="title">${escapeHtml(expense.desc)}</div><div class="sub">${sub}</div></span>
    <span class="amount num">${money(expense.amount)}</span>
  </button>`;
}

// ---------- Periods ----------
const ui = { tab: "overview", period: "month", anchor: today(), query: "", category: "", day: null, justAdded: null };

function rangeFor(period, anchor) {
  if (period === "week") {
    const offset = (anchor.getDay() - store.settings.weekStart + 7) % 7;
    const start = addDays(anchor, -offset);
    return { start, end: addDays(start, 7) };
  }
  if (period === "year") {
    return { start: new Date(anchor.getFullYear(), 0, 1), end: new Date(anchor.getFullYear() + 1, 0, 1) };
  }
  return { start: new Date(anchor.getFullYear(), anchor.getMonth(), 1), end: new Date(anchor.getFullYear(), anchor.getMonth() + 1, 1) };
}

function shiftAnchor(period, anchor, direction) {
  if (period === "week") {
    return addDays(anchor, 7 * direction);
  }
  if (period === "year") {
    return new Date(anchor.getFullYear() + direction, anchor.getMonth(), 1);
  }
  return new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1);
}

function periodLabel(period, range) {
  if (period === "year") {
    return range.start.toLocaleDateString(locale(), { year: "numeric" });
  }
  if (period === "month") {
    const sameYear = range.start.getFullYear() === today().getFullYear();
    return range.start.toLocaleDateString(locale(), sameYear ? { month: "long" } : { month: "short", year: "numeric" });
  }
  const last = addDays(range.end, -1);
  const fmt = new Intl.DateTimeFormat(locale(), { month: "short", day: "numeric" });
  // "Nov 2 – 8" / "11月2日至8日": the locale's compact range form keeps the header narrow.
  return fmt.formatRange ? fmt.formatRange(range.start, last) : `${fmt.format(range.start)} – ${fmt.format(last)}`;
}

const inRange = (expense, range) => expense.date >= keyOf(range.start) && expense.date < keyOf(range.end);

// Averages only count days since tracking began, so a new user's first year isn't diluted.
function trackingStart() {
  const first = store.expenses.reduce((min, e) => (e.date < min ? e.date : min), keyOf(today()));
  return fromKey(first);
}

function summarize(range) {
  const items = store.expenses.filter((e) => inRange(e, range));
  const now = today();
  const isCurrent = now >= range.start && now < range.end;
  const spanDays = daysBetween(range.start, range.end);
  const elapsed = isCurrent ? daysBetween(range.start, now) + 1 : range.start > now ? 0 : spanDays;
  const countFrom = new Date(Math.max(range.start, trackingStart()));
  const lastDay = isCurrent ? now : addDays(range.end, -1);
  const trackedDays = Math.max(0, daysBetween(countFrom, lastDay) + 1);
  return { items, total: sum(items), isCurrent, elapsed, spanDays, trackedDays };
}

// ---------- Empty states ----------
// Empty screens point at the next action instead of only saying "nothing here".
function emptyStateHtml(title, hint, style = "") {
  return `<div class="panel empty cta" ${style ? `style="${style}"` : ""}>
    <span class="empty-mic" aria-hidden="true">${MIC_ICON}</span>
    <strong>${title}</strong><span class="empty-hint">${hint}</span>
    <div class="empty-actions">
      <button class="btn primary" data-record>${t("logByVoice")}</button>
      <button class="link" data-add>${t("addManually")}</button>
    </div>
  </div>`;
}

// ---------- Overview ----------
function renderOverview() {
  const range = rangeFor(ui.period, ui.anchor);
  const current = summarize(range);
  const view = $("#view-overview");

  if (!store.expenses.length) {
    view.innerHTML = `${heroHtml(current, null)}
      ${emptyStateHtml(t("noExpensesYet"), t("emptyHint"), "margin-top:24px")}`;
    return;
  }

  const previousRange = rangeFor(ui.period, shiftAnchor(ui.period, ui.anchor, -1));
  if (current.isCurrent) {
    previousRange.end = addDays(previousRange.start, Math.min(current.elapsed, daysBetween(previousRange.start, previousRange.end)));
  }
  const previousTotal = sum(store.expenses.filter((e) => inRange(e, previousRange)));

  view.innerHTML = [
    justAddedHtml(),
    heroHtml(current, previousTotal),
    statsHtml(current),
    ui.period === "month" ? budgetSummaryHtml(current) : "",
    chartHtml(range, current),
    categoriesHtml(current),
    payeesHtml(current),
    recentHtml(),
  ].join("");
}

function heroHtml(current, previousTotal) {
  const unit = { week: "Week", month: "Month", year: "Year" }[ui.period];
  let delta = "";
  if (previousTotal) {
    const change = ((current.total - previousTotal) / previousTotal) * 100;
    const basis = t(current.isCurrent ? `vsSame${unit}` : `vsPrev${unit}`);
    delta = `<span class="${change >= 0 ? "up" : "down"}">${change >= 0 ? "+" : "−"}${Math.abs(change).toFixed(0)}%</span> ${basis} (${money(previousTotal)})`;
  } else if (previousTotal === 0) {
    delta = t(`noPrev${unit}`);
  }
  return `<div class="hero">
    <div class="caption">${t("totalSpent")}</div>
    <div class="total num">${money(current.total)}</div>
    <div class="delta">${delta}</div>
  </div>`;
}

function statsHtml(current) {
  const largest = current.items.reduce((best, e) => (!best || e.amount > best.amount ? e : best), null);
  const perDay = current.trackedDays ? current.total / current.trackedDays : 0;
  return `<dl class="panel stats">
    <div><dt>${t("perDay")}</dt><dd class="num">${money(perDay, { maximumFractionDigits: 0, minimumFractionDigits: 0 })}</dd></div>
    <div><dt>${t("transactions")}</dt><dd class="num">${current.items.length}</dd></div>
    <div><dt>${t("largest")}</dt><dd class="num">${largest ? money(largest.amount) : "—"}</dd></div>
  </dl>`;
}

function budgetSummaryHtml(current) {
  const budget = store.settings.budgetTotal;
  if (!budget) {
    return `<div class="block"><div class="block-head"><h2>${t("budget")}</h2><button class="link" data-goto="budgets">${t("setBudget")}</button></div></div>`;
  }
  const used = current.total / budget;
  const pace = current.elapsed / current.spanDays;
  const remaining = budget - current.total;
  let note;
  if (remaining < 0) {
    note = t("overBudgetBy", { amount: money(-remaining) });
  } else if (current.isCurrent) {
    const daysLeft = current.spanDays - current.elapsed + 1;
    note = t("perDayLeft", { amount: money(remaining / daysLeft, { maximumFractionDigits: 0, minimumFractionDigits: 0 }), days: daysLeft });
  } else {
    note = t("finishedUnder", { amount: money(remaining) });
  }
  // Month-end projection from the pace so far (needs a few days of data to mean anything).
  let paceNote = "";
  if (remaining >= 0 && current.isCurrent && current.elapsed >= 3) {
    const whole = { maximumFractionDigits: 0, minimumFractionDigits: 0 };
    const projected = (current.total / current.elapsed) * current.spanDays;
    paceNote = projected > budget
      ? `<div class="note warn">${t("paceOver", { amount: money(projected, whole), over: `<span class="neg">${money(projected - budget, whole)}</span>` })}</div>`
      : `<div class="note">${t("paceUnder", { amount: money(projected, whole) })}</div>`;
  }
  return `<div class="block">
    <div class="block-head"><h2>${t("budget")}</h2><button class="link" data-goto="budgets">${t("edit")}</button></div>
    <div class="panel budget-line">
      <div class="row-top num"><span>${t("ofBudget", { spent: money(current.total), budget: money(budget) })}</span><span>${Math.round(used * 100)}%</span></div>
      <div class="meter"><i class="${used > 1 ? "over" : ""}" style="width:${Math.min(used, 1) * 100}%"></i>${current.isCurrent ? `<b class="today" style="left:${(pace * 100).toFixed(1)}%"></b>` : ""}</div>
      <div class="note">${note}</div>${paceNote}
    </div>
  </div>`;
}

function chartHtml(range, current) {
  const now = today();
  const start = trackingStart();
  const buckets = [];
  if (ui.period === "year") {
    for (let m = 0; m < 12; m++) {
      const prefix = `${range.start.getFullYear()}-${pad(m + 1)}`;
      const monthStart = new Date(range.start.getFullYear(), m, 1);
      buckets.push({
        label: monthStart.toLocaleDateString(locale(), { month: "narrow" }),
        value: sum(current.items.filter((e) => e.date.startsWith(prefix))),
        future: monthStart > now,
        untracked: new Date(range.start.getFullYear(), m + 1, 0) < start,
        now: monthStart.getFullYear() === now.getFullYear() && m === now.getMonth(),
        showLabel: true,
      });
    }
  } else {
    for (let i = 0; i < current.spanDays; i++) {
      const day = addDays(range.start, i);
      const key = keyOf(day);
      buckets.push({
        label: ui.period === "week" ? day.toLocaleDateString(locale(), { weekday: "narrow" }) : String(day.getDate()),
        value: sum(current.items.filter((e) => e.date === key)),
        future: day > now,
        untracked: day < start,
        now: key === keyOf(now),
        showLabel: ui.period === "week" || [1, 8, 15, 22, 29].includes(day.getDate()),
      });
    }
  }

  const width = 320;
  const height = 150;
  const top = 22;
  const bottom = 18;
  const plot = height - top - bottom;
  const slot = width / buckets.length;
  const barWidth = Math.max(2, slot * (buckets.length > 14 ? 0.62 : 0.5));
  const max = Math.max(...buckets.map((b) => b.value), 1);
  const counted = buckets.filter((b) => !b.future && !b.untracked);
  const average = counted.length ? counted.reduce((s, b) => s + b.value, 0) / counted.length : 0;

  const bars = buckets.map((b, i) => {
    const x = i * slot + (slot - barWidth) / 2;
    const h = b.value ? Math.max(2, (b.value / max) * plot) : 1;
    const cls = b.future ? "bar future" : b.value ? "bar" : "bar zero";
    const label = b.showLabel ? `<text class="axis" x="${i * slot + slot / 2}" y="${height - 4}" text-anchor="middle">${b.label}</text>` : "";
    const dayAttr = ui.period === "year" || b.future ? "" : ` data-day="${keyOf(addDays(range.start, i))}"`;
    return `<rect${dayAttr} class="${cls}" x="${x.toFixed(1)}" y="${(top + plot - h).toFixed(1)}" width="${barWidth.toFixed(1)}" height="${h.toFixed(1)}" rx="1.5"/>${label}`;
  }).join("");
  const averageY = top + plot - (average / max) * plot;
  const averageLine = average ? `<line class="avg" x1="0" x2="${width}" y1="${averageY.toFixed(1)}" y2="${averageY.toFixed(1)}"/>` : "";
  const isYear = ui.period === "year";
  const peak = buckets.some((b) => b.value) ? max : 0;
  const pct = (y) => `${((y / height) * 100).toFixed(1)}%`;
  const peakLine = peak ? `<line class="grid" x1="0" x2="${width}" y1="${top}" y2="${top}"/>` : "";
  const peakTick = peak ? `<span class="y-tick" style="top:${pct(top)}">${compactMoney(peak)}</span>` : "";
  // Skip the average label when it would sit on top of the peak label.
  const averageTick = average && averageY - top > 16
    ? `<span class="y-tick avg" style="top:${pct(averageY)}">${t("avgShort")} ${compactMoney(average)}</span>`
    : "";
  const hint = !isYear && peak ? `<div class="chart-hint">${t("tapBarHint")}</div>` : "";

  return `<div class="block">
    <div class="block-head"><h2>${t(isYear ? "spendingByMonth" : "spendingByDay")}</h2></div>
    <div class="panel chart">
      <div class="chart-plot">
        <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img">${peakLine}${bars}${averageLine}</svg>
        ${peakTick}${averageTick}
      </div>
      <div class="legend num"><span>${t(isYear ? "avgPerMonth" : "avgPerDay", { amount: compactMoney(average) })}</span><span>${t("peak", { amount: compactMoney(peak) })}</span></div>
      ${hint}
    </div>
  </div>`;
}

function categoriesHtml(current) {
  if (!current.items.length) {
    return `<div class="block">${emptyStateHtml(t("noExpensesPeriod"), t("emptyPeriodHint"))}</div>`;
  }
  const totals = {};
  const counts = {};
  for (const e of current.items) {
    totals[e.cat] = (totals[e.cat] || 0) + e.amount;
    counts[e.cat] = (counts[e.cat] || 0) + 1;
  }
  const rows = Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([cat, total]) => {
    const share = total / current.total;
    const color = CATEGORY_COLORS[cat] || CATEGORY_COLORS.Other;
    return `<button class="cat-row" data-cat="${cat}">
      <span class="swatch" style="background:${color}"></span>
      <span class="name">${catName(cat)}</span>
      <span class="amount num">${money(total)}</span>
      <span class="share num"><span class="meter"><i style="width:${share * 100}%;background:${color}"></i></span>${(share * 100).toFixed(0)}% · ${counts[cat] === 1 ? t("expense") : t("expenses", { n: counts[cat] })}</span>
    </button>`;
  }).join("");
  return `<div class="block"><div class="block-head"><h2>${t("categories")}</h2></div><div class="panel rows">${rows}</div></div>`;
}

function payeesHtml(current) {
  const groups = {};
  for (const e of current.items) {
    const key = e.desc.toLowerCase();
    groups[key] = groups[key] || { ...e, amount: 0, count: 0 };
    groups[key].amount += e.amount;
    groups[key].count += 1;
  }
  const top = Object.values(groups).sort((a, b) => b.amount - a.amount).slice(0, 5);
  if (top.length < 2) {
    return "";
  }
  const rows = top.map((g) => `<div class="tx">
      ${markHtml(g)}
      <span class="body"><div class="title">${escapeHtml(g.desc)}</div><div class="sub">${g.count === 1 ? t("payment") : t("payments", { n: g.count })} · ${catName(g.cat)}</div></span>
      <span class="amount num">${money(g.amount)}</span>
    </div>`).join("");
  return `<div class="block"><div class="block-head"><h2>${t("topSpending")}</h2></div><div class="panel rows">${rows}</div></div>`;
}

function recentHtml() {
  const recent = [...store.expenses].sort(byNewest).slice(0, 5);
  return `<div class="block">
    <div class="block-head"><h2>${t("recent")}</h2><button class="link" data-goto="transactions">${t("seeAll")}</button></div>
    <div class="panel rows">${recent.map((e) => txRowHtml(e, true)).join("")}</div>
  </div>`;
}

// ---------- Transactions ----------
function renderTransactions() {
  const view = $("#view-transactions");
  view.innerHTML = `<div class="toolbar">
      <input class="field" id="txSearch" type="search" placeholder="${t("searchAll")}" autocomplete="off">
      <select class="field" id="txCategory"><option value="">${t("allCategories")}</option>${CATEGORY_NAMES.map((c) => `<option value="${c}">${catName(c)}</option>`).join("")}</select>
    </div>
    <div id="txList"></div>`;
  $("#txSearch").value = ui.query;
  $("#txCategory").value = ui.category;
  $("#txSearch").addEventListener("input", (event) => {
    ui.query = event.target.value.trim().toLowerCase();
    renderTransactionList();
  });
  $("#txCategory").addEventListener("change", (event) => {
    ui.category = event.target.value;
    renderTransactionList();
  });
  renderTransactionList();
}

function renderTransactionList() {
  const range = rangeFor(ui.period, ui.anchor);
  let items = ui.day
    ? store.expenses.filter((e) => e.date === ui.day)
    : ui.query
      ? store.expenses.filter((e) => `${e.desc} ${e.cat} ${catName(e.cat)} ${e.note || ""} ${e.raw || ""}`.toLowerCase().includes(ui.query))
      : store.expenses.filter((e) => inRange(e, range));
  if (ui.category) {
    items = items.filter((e) => e.cat === ui.category);
  }
  items.sort(byNewest);

  const scope = [
    ui.category ? catName(ui.category) : "",
    ui.day ? dayLabel(ui.day) : ui.query ? t("allTime") : periodLabel(ui.period, range),
  ].filter(Boolean).join(" · ");
  const count = items.length === 1 ? t("expense") : t("expenses", { n: items.length });
  let html = ui.day ? `<button class="filter-chip" data-clear-day>${dayLabel(ui.day)} · ${t("showAll")}</button>` : "";
  // Drilled in from an Overview category: say so, and offer one tap back to everything.
  if (ui.category) {
    const color = CATEGORY_COLORS[ui.category] || CATEGORY_COLORS.Other;
    html += `<button class="filter-chip" data-clear-cat><span class="swatch" style="background:${color}"></span>${catName(ui.category)} · ${t("showAll")}</button>`;
  }
  html = justAddedHtml() + html;
  html += `<div class="summary-line num"><span>${scope} · ${count}</span><span>${money(sum(items))}</span></div>`;
  if (!items.length) {
    html += ui.query
      ? `<div class="panel empty" style="margin-top:14px">${t("noMatches")}</div>`
      : emptyStateHtml(t("noExpensesPeriod"), t("emptyPeriodHint"), "margin-top:14px");
  }
  const days = {};
  for (const e of items) {
    (days[e.date] = days[e.date] || []).push(e);
  }
  for (const [date, dayItems] of Object.entries(days)) {
    html += `<div class="day-head num"><span>${dayLabel(date)}</span><span>${money(sum(dayItems))}</span></div>
      <div class="panel rows">${dayItems.map((e) => txRowHtml(e)).join("")}</div>`;
  }
  $("#txList").innerHTML = html;
}

// ---------- Budgets ----------
// Round up to two significant digits: 1,276 -> 1,300; 1,523,000 -> 1,600,000.
function niceCeil(value) {
  const digits = Math.floor(Math.log10(Math.max(value, 1))) + 1;
  const step = 10 ** Math.max(0, digits - 2);
  return Math.ceil(value / step) * step;
}

// Average monthly spend over up to 3 previous months that were tracked from their first day.
function suggestedLimits() {
  const start = trackingStart();
  const now = today();
  const totals = {};
  let months = 0;
  for (let back = 1; back <= 3; back++) {
    const monthStart = new Date(now.getFullYear(), now.getMonth() - back, 1);
    if (monthStart < start) {
      break;
    }
    const prefix = keyOf(monthStart).slice(0, 7);
    for (const e of store.expenses) {
      if (e.date.startsWith(prefix)) {
        totals[e.cat] = (totals[e.cat] || 0) + e.amount;
        totals.__total = (totals.__total || 0) + e.amount;
      }
    }
    months++;
  }
  const suggestions = {};
  for (const [key, total] of Object.entries(totals)) {
    if (months && total > 0) {
      suggestions[key] = niceCeil(total / months);
    }
  }
  return suggestions;
}

function renderBudgets() {
  const range = rangeFor("month", today());
  const current = summarize(range);
  const spentBy = {};
  for (const e of current.items) {
    spentBy[e.cat] = (spentBy[e.cat] || 0) + e.amount;
  }
  const monthName = range.start.toLocaleDateString(locale(), { month: "long", year: "numeric" });

  const suggestions = suggestedLimits();
  const whole = { maximumFractionDigits: 0, minimumFractionDigits: 0 };
  // Thin tick at how far through the month we are: a bar left of it is on pace.
  const pace = current.elapsed / current.spanDays;
  const todayMark = `<b class="today" style="left:${(pace * 100).toFixed(1)}%"></b>`;
  const anyBudget = store.settings.budgetTotal || Object.values(store.settings.budgets).some(Boolean);
  const statusHtml = (spent, budget, key) => {
    if (!budget) {
      const suggestion = suggestions[key];
      const right = suggestion
        ? `<button class="link suggest" data-suggest="${key}" data-amount="${suggestion}">${t("useSuggested", { amount: money(suggestion, whole) })}</button>`
        : `<span>${t("noLimit")}</span>`;
      return `<div class="status num"><span>${t("spentAmount", { amount: money(spent) })}</span>${right}</div>`;
    }
    const ratio = spent / budget;
    const left = budget - spent;
    return `<div class="meter"><i class="${ratio > 1 ? "over" : ""}" style="width:${Math.min(ratio, 1) * 100}%"></i>${todayMark}</div>
      <div class="status num"><span>${t("ofBudget", { spent: money(spent), budget: money(budget) })}</span><span>${left >= 0 ? t("left", { amount: money(left) }) : t("over", { amount: money(-left) })}</span></div>`;
  };

  const categoryRows = CATEGORY_NAMES.map((cat) => `<div class="budget-row">
      <div class="top">
        <span class="swatch" style="background:${CATEGORY_COLORS[cat]}"></span>
        <span class="name">${catName(cat)}</span>
        <input class="field num" inputmode="decimal" placeholder="${t("setLimit")}" data-budget="${cat}" value="${groupedNumber(store.settings.budgets[cat])}">
      </div>
      ${statusHtml(spentBy[cat] || 0, store.settings.budgets[cat] || 0, cat)}
    </div>`).join("");

  $("#view-budgets").innerHTML = `
    <div class="block">
      <div class="block-head"><h2>${monthName}</h2></div>
      <div class="panel budget-row">
        <div class="top">
          <span class="name"><strong>${t("monthlyBudget")}</strong></span>
          <input class="field num" inputmode="decimal" placeholder="${t("notSet")}" data-budget="__total" value="${groupedNumber(store.settings.budgetTotal)}">
        </div>
        ${statusHtml(current.total, store.settings.budgetTotal, "__total")}
      </div>
    </div>
    <div class="block">
      <div class="block-head"><h2>${t("byCategory")}</h2></div>
      <div class="panel rows">${categoryRows}</div>
    </div>
    <p class="foot">${anyBudget ? `${t("paceTickHint")} ` : ""}${t("budgetsNote")}</p>`;
}

// ---------- Settings ----------
function renderSettings() {
  const s = store.settings;
  const shortcutUrl = location.protocol.startsWith("http") ? `${location.origin}${location.pathname}?add=` : "https://your-app-link/?add=";
  const option = (value, label, selected) => `<option value="${value}" ${selected ? "selected" : ""}>${label}</option>`;
  const regionOptions = Object.entries(REGIONS)
    .sort((a, b) => a[1].name.localeCompare(b[1].name))
    .map(([code, r]) => option(code, r.name, code === s.region))
    .join("");

  $("#view-settings").innerHTML = `
    <div class="block">
      <div class="block-head"><h2>${t("preferences")}</h2></div>
      <div class="panel rows">
        <div class="setting"><label for="setRegion">${t("region")}<span class="hint">${t("regionHint")}</span></label>
          <select class="field" id="setRegion">${regionOptions}</select></div>
        <div class="setting"><label for="setCurrency">${t("currency")}</label>
          <select class="field" id="setCurrency">${CURRENCIES.map((c) => option(c, c, c === s.currency)).join("")}</select></div>
        <div class="setting"><label for="setLang">${t("voiceLanguage")}</label>
          <select class="field" id="setLang">${VOICE_LANGUAGES.map(([code, name]) => option(code, name, code === s.lang)).join("")}</select></div>
        <div class="setting"><label for="setUi">${t("appLanguage")}</label>
          <select class="field" id="setUi">${option("auto", t("automatic"), s.uiLang === "auto")}${UI_LANGUAGES.map(([code, name]) => option(code, name, code === s.uiLang)).join("")}</select></div>
        <div class="setting"><label for="setWeek">${t("weekStartsOn")}</label>
          <select class="field" id="setWeek">${option(1, t("monday"), s.weekStart === 1)}${option(0, t("sunday"), s.weekStart === 0)}</select></div>
      </div>
    </div>
    <div class="block">
      <div class="block-head"><h2>${t("siriTitle")}</h2></div>
      <div class="panel help">
        ${t("siriIntro")}
        <ol>
          <li>${t("siriStep1")}</li>
          <li>${t("siriStep2")}</li>
          <li>${t("siriStep3", { url: `<code>${escapeHtml(shortcutUrl)}</code>` })}</li>
        </ol>
        ${t("siriOutro")}
      </div>
    </div>
    <div class="block">
      <div class="block-head"><h2>${t("data")}</h2></div>
      <div class="panel rows">
        <button class="setting action" id="exportCsv">${t("exportCsv")}</button>
        <button class="setting action" id="backup">${t("backup")}</button>
        <button class="setting action" id="restore">${t("restore")}</button>
        <button class="setting action danger" id="eraseAll">${t("erase")}</button>
      </div>
      <input type="file" id="restoreFile" accept="application/json,.json" hidden>
    </div>
    <p class="foot">${t("storedLocally", { n: store.expenses.length })}<br>${s.lastBackup ? t("lastBackup", { date: fromKey(s.lastBackup).toLocaleDateString(locale(), { dateStyle: "medium" }) }) : t("noBackup")}</p>`;

  $("#setRegion").onchange = (event) => {
    Object.assign(store.settings, regionDefaults(event.target.value));
    persist();
    applyLanguage();
    render();
  };
  $("#setCurrency").onchange = (event) => updateSetting("currency", event.target.value);
  $("#setLang").onchange = (event) => updateSetting("lang", event.target.value);
  $("#setUi").onchange = (event) => {
    store.settings.uiLang = event.target.value;
    persist();
    applyLanguage();
    render();
  };
  $("#setWeek").onchange = (event) => updateSetting("weekStart", Number(event.target.value));
  $("#exportCsv").onclick = exportCsv;
  $("#backup").onclick = downloadBackup;
  $("#restore").onclick = () => $("#restoreFile").click();
  $("#restoreFile").onchange = restoreBackup;
  $("#eraseAll").onclick = () => {
    if (confirm(t("eraseConfirm"))) {
      store.expenses = [];
      store.settings.budgets = {};
      store.settings.budgetTotal = 0;
      persist();
      render();
    }
  };
}

function updateSetting(name, value) {
  store.settings[name] = value;
  persist();
  render();
}

function download(filename, content, type) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(content instanceof Blob ? content : new Blob([content], { type }));
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

function exportCsv() {
  const quote = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = [...store.expenses]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => [e.date, quote(e.desc), quote(catName(e.cat)), e.amount, store.settings.currency, quote(e.note), quote(e.raw)].join(","));
  const header = [t("date"), t("description"), t("category"), t("amount"), t("currency"), t("note"), t("recordedAs")].map(quote).join(",");
  download(`expenses-${keyOf(today())}.csv`, "\ufeff" + [header, ...lines].join("\n"), "text/csv");
}

function downloadBackup() {
  const backup = { app: "tally", version: 1, exported: new Date().toISOString(), settings: store.settings, expenses: store.expenses };
  download(`tally-backup-${keyOf(today())}.json`, JSON.stringify(backup, null, 1), "application/json");
  store.settings.lastBackup = keyOf(today());
  persist();
  if (ui.tab === "settings") {
    render();
  }
}

async function restoreBackup(event) {
  const file = event.target.files[0];
  if (!file) {
    return;
  }
  try {
    const backup = JSON.parse(await file.text());
    const known = new Set(store.expenses.map((e) => e.id));
    const incoming = (backup.expenses || []).filter((e) => e.id && !known.has(e.id));
    store.expenses.push(...incoming);
    store.settings = { ...store.settings, ...(backup.settings || {}) };
    persist();
    applyLanguage();
    render();
    showToast(t("restored", { n: incoming.length }));
  } catch {
    showToast(t("invalidBackup"));
  }
}

// ---------- Adding expenses ----------
let lastAdded = [];

function undoLastAdded() {
  store.expenses = store.expenses.filter((e) => !lastAdded.includes(e.id));
  ui.justAdded = null;
  persist();
  render();
}

// A quiet chip that keeps Edit/Undo reachable for 10 minutes after a voice entry,
// so a missed toast never turns a correction into a hunt through Activity.
const JUST_ADDED_MS = 10 * 60 * 1000;

function justAddedHtml() {
  const recent = ui.justAdded;
  if (!recent || Date.now() - recent.at > JUST_ADDED_MS) {
    return "";
  }
  const items = recent.ids.map((id) => store.expenses.find((e) => e.id === id)).filter(Boolean);
  if (!items.length) {
    return "";
  }
  const summary = items.slice(0, 2).map((e) => `${escapeHtml(e.desc)} ${money(e.amount)}`).join(" · ")
    + (items.length > 2 ? ` +${items.length - 2}` : "");
  const edit = items.length === 1 ? `<button class="link" data-edit="${items[0].id}">${t("edit")}</button>` : "";
  return `<div class="just-added" role="status">
    <span class="label">${t("justAdded")}</span>
    <span class="what num">${summary}</span>
    ${edit}<button class="link" data-undo-last>${t("undo")}</button>
    <button class="icon-x" data-dismiss-added aria-label="${t("dismiss")}">×</button>
  </div>`;
}

function addExpenses(parsed, spoken) {
  const stamp = Date.now();
  const added = parsed.map((e, i) => ({ ...e, id: `${stamp}-${i}`, created: stamp + i, raw: spoken, note: "" }));
  store.expenses.push(...added);
  lastAdded = added.map((e) => e.id);
  ui.justAdded = { ids: lastAdded, at: Date.now() };
  persist();
  render();
  const label = added.length === 1
    ? t("added1", { desc: added[0].desc, amount: money(added[0].amount) })
    : t("addedN", { n: added.length, amount: money(sum(added)) });
  const undo = {
    label: t("undo"),
    run: undoLastAdded,
  };
  const edit = { label: t("edit"), run: () => openEditor(added[0].id) };
  showToast(label, added.length === 1 ? [edit, undo] : [undo]);
  if (navigator.vibrate && navigator.userActivation?.hasBeenActive) {
    navigator.vibrate(20);
  }
}

// ---------- Sheets ----------
let closeHook = null;

function openSheet(html, onClose) {
  $("#sheet").innerHTML = `<div class="grabber"></div>${html}`;
  $("#sheet").hidden = false;
  $("#scrim").hidden = false;
  closeHook = onClose || null;
}

function closeSheet() {
  if (closeHook) {
    closeHook();
    closeHook = null;
  }
  $("#sheet").hidden = true;
  $("#scrim").hidden = true;
  $("#sheet").innerHTML = "";
}

$("#scrim").addEventListener("click", closeSheet);

function openEditor(id) {
  const existing = store.expenses.find((e) => e.id === id);
  const e = existing || { amount: "", desc: "", cat: "Other", date: keyOf(today()), note: "" };
  openSheet(`
    <div class="sheet-head">
      <button data-close style="color:var(--muted)">${t("cancel")}</button>
      <h3>${existing ? t("editExpense") : t("newExpense")}</h3>
      <button type="submit" form="editForm">${t("save")}</button>
    </div>
    <form id="editForm" class="form-grid" autocomplete="off">
      <label>${t("amount")} (${store.settings.currency})<input class="field amount-field num" name="amount" inputmode="decimal" required value="${e.amount}"></label>
      <label>${t("description")}<input class="field" name="desc" required value="${escapeHtml(e.desc)}"></label>
      <div class="two">
        <label>${t("category")}<select class="field" name="cat">${CATEGORY_NAMES.map((c) => `<option value="${c}" ${c === e.cat ? "selected" : ""}>${catName(c)}</option>`).join("")}</select></label>
        <label>${t("date")}<input class="field" type="date" name="date" required value="${e.date}"></label>
      </div>
      <label>${t("note")}<input class="field" name="note" placeholder="${t("optional")}" value="${escapeHtml(e.note || "")}"></label>
      ${existing && existing.raw ? `<label>${t("recordedAs")}<span style="color:var(--text);font-size:14px">“${escapeHtml(existing.raw)}”</span></label>` : ""}
    </form>
    ${existing ? `<button class="btn quiet" id="deleteExpense">${t("deleteExpense")}</button>` : ""}`);

  $("#editForm").onsubmit = (event) => {
    event.preventDefault();
    const form = new FormData(event.target);
    const amount = parseLocalNumber(form.get("amount"));
    if (!(amount > 0)) {
      $("#editForm [name=amount]").focus();
      return;
    }
    const values = {
      amount: Math.round(amount * 100) / 100,
      desc: String(form.get("desc")).trim(),
      cat: form.get("cat"),
      date: form.get("date"),
      note: String(form.get("note")).trim(),
    };
    if (existing) {
      Object.assign(existing, values);
    } else {
      const stamp = Date.now();
      store.expenses.push({ ...values, id: `${stamp}-m`, created: stamp, raw: "" });
    }
    persist();
    closeSheet();
    render();
  };
  if (existing) {
    $("#deleteExpense").onclick = () => {
      store.expenses.splice(store.expenses.indexOf(existing), 1);
      persist();
      closeSheet();
      render();
      showToast(t("deleted", { desc: existing.desc }), [{
        label: t("undo"),
        run: () => {
          store.expenses.push(existing);
          persist();
          render();
        },
      }]);
    };
  }
}

// ---------- Voice recording ----------
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
const MIC_ICON = `<svg viewBox="0 0 24 24"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>`;
let recognizer = null;
let listeningCancelled = false;

function openRecorder() {
  openSheet(`
    <div class="record">
      <div class="status" id="recStatus"></div>
      <div class="transcript placeholder" id="recText">${t("recPlaceholder")}</div>
      <div class="panel rows preview" id="recPreview" hidden></div>
      <div class="hint rec-hint" id="recEditHint" hidden>${t("tapRowToEdit")}</div>
      <button class="mic" id="recMic" aria-label="${t("record")}">${MIC_ICON}</button>
      <form id="recForm" autocomplete="off">
        <input class="field" id="recInput" placeholder="${t("recType")}" enterkeyhint="done">
        <button class="btn primary">${t("save")}</button>
      </form>
      <button class="manual" id="recManual">${t("manual")}</button>
    </div>`, cancelListening);

  $("#recMic").onclick = () => (recognizer ? stopListening() : startListening());
  heardSource = "";
  heardRows = [];
  heardEditing = -1;
  $("#recInput").oninput = (event) => showHeard(event.target.value, false);
  $("#recPreview").onclick = (event) => {
    const remove = event.target.closest("[data-heard-remove]");
    const toggle = event.target.closest("[data-heard-toggle]");
    if (remove) {
      heardRows[Number(remove.dataset.heardRemove)].removed = true;
      heardEditing = -1;
    } else if (toggle) {
      const index = Number(toggle.dataset.heardToggle);
      heardEditing = heardEditing === index ? -1 : index;
    } else {
      return;
    }
    renderHeardRows();
    updateRecorderStatus(heardSource, false);
  };
  $("#recPreview").onchange = (event) => {
    const category = event.target.closest("[data-heard-cat]");
    const amount = event.target.closest("[data-heard-amount]");
    if (category) {
      heardRows[Number(category.dataset.heardCat)].cat = category.value;
    }
    if (amount) {
      const value = parseLocalNumber(amount.value);
      if (value > 0) {
        heardRows[Number(amount.dataset.heardAmount)].amount = value;
      }
    }
    renderHeardRows();
  };
  $("#recForm").onsubmit = (event) => {
    event.preventDefault();
    commitHeard($("#recInput").value);
  };
  $("#recManual").onclick = () => {
    closeSheet();
    openEditor(null);
  };

  if (Recognition) {
    startListening();
  } else {
    $("#recStatus").textContent = t("useKeyboardMic");
    $("#recMic").hidden = true;
    $("#recInput").focus();
  }
}

// What the status line says when there is nothing to warn about.
function recorderIdleStatus(found = 0) {
  if (recognizer) {
    return found ? t("listeningFound", { n: found }) : t("listening");
  }
  return Recognition ? "" : t("useKeyboardMic");
}

// Parsed rows in the record sheet. Edits and removals stick until the text itself changes.
let heardSource = "";
let heardRows = [];
let heardEditing = -1;
const REMOVE_ICON = `<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>`;

function heardRowHtml(expense, index) {
  const editing = index === heardEditing;
  const options = CATEGORY_NAMES
    .map((cat) => `<option value="${cat}" ${cat === expense.cat ? "selected" : ""}>${catName(cat)}</option>`)
    .join("");
  const editor = editing
    ? `<div class="heard-edit">
        <select class="field" data-heard-cat="${index}" aria-label="${t("category")}">${options}</select>
        <input class="field num" inputmode="decimal" data-heard-amount="${index}" value="${expense.amount}" aria-label="${t("amount")}">
      </div>`
    : "";
  return `<div class="tx heard-row${editing ? " editing" : ""}">
      ${markHtml(expense)}
      <button class="body heard-toggle" data-heard-toggle="${index}" aria-expanded="${editing}">
        <span class="title">${escapeHtml(expense.desc)}</span><span class="sub">${catName(expense.cat)} · ${dayLabel(expense.date)}</span>
      </button>
      <span class="amount num">${money(expense.amount)}</span>
      <button class="heard-remove" data-heard-remove="${index}" aria-label="${t("removeRow")}">${REMOVE_ICON}</button>
    </div>${editor}`;
}

function renderHeardRows() {
  const preview = $("#recPreview");
  const hint = $("#recEditHint");
  const visible = heardRows.filter((row) => !row.removed).length;
  preview.hidden = !visible;
  hint.hidden = !visible;
  preview.innerHTML = heardRows.map((row, index) => (row.removed ? "" : heardRowHtml(row, index))).join("");
}

function updateRecorderStatus(text, fromVoice) {
  const status = $("#recStatus");
  if (!status) {
    return;
  }
  const found = heardRows.filter((row) => !row.removed).length;
  if (!fromVoice) {
    status.textContent = text.trim().length > 2 && !heardRows.length ? t("noAmount") : recorderIdleStatus(found);
  } else if (recognizer) {
    status.textContent = recorderIdleStatus(found);
  }
}

function showHeard(text, fromVoice) {
  const transcript = $("#recText");
  const preview = $("#recPreview");
  if (!transcript) {
    return;
  }
  if (fromVoice && text) {
    transcript.textContent = `“${text}”`;
    transcript.classList.remove("placeholder");
  }
  if (!preview) {
    return;
  }
  if (text !== heardSource) {
    heardSource = text;
    heardRows = text ? parseExpenses(text) : [];
    heardEditing = -1;
  }
  renderHeardRows();
  updateRecorderStatus(text, fromVoice);
}

function commitHeard(text) {
  const spoken = text.trim();
  const edited = spoken && text === heardSource;
  const parsed = edited ? heardRows.filter((row) => !row.removed) : spoken ? parseExpenses(spoken) : [];
  if (!parsed.length) {
    if ($("#recStatus")) {
      const allRemoved = edited && heardRows.length;
      $("#recStatus").textContent = spoken && !allRemoved ? t("noAmount") : t("nothingYet");
    }
    return;
  }
  closeSheet();
  addExpenses(parsed, spoken);
}

function startListening() {
  listeningCancelled = false;
  // Android Chrome sends audio to an online service; without a connection, go straight to typing.
  if (navigator.onLine === false) {
    voiceFallback("voiceOffline", true);
    return;
  }
  recognizer = new Recognition();
  recognizer.lang = store.settings.lang;
  recognizer.interimResults = true;
  recognizer.continuous = false;
  let heard = "";
  recognizer.onresult = (event) => {
    heard = [...event.results].map((r) => r[0].transcript).join(" ").trim();
    showHeard(heard, true);
  };
  recognizer.onerror = (event) => {
    if (event.error === "aborted") {
      return;
    }
    // "no-speech" is worth a retry; everything else means voice will not work right now.
    voiceFallback(VOICE_ERRORS[event.error] || "voiceStopped", event.error !== "no-speech");
  };
  recognizer.onend = () => {
    recognizer = null;
    if ($("#recMic")) {
      $("#recMic").classList.remove("live");
    }
    if (!listeningCancelled && heard) {
      commitHeard(heard);
    }
  };
  $("#recMic").classList.add("live");
  $("#recStatus").textContent = t("listening");
  try {
    recognizer.start();
  } catch {
    recognizer = null;
    voiceFallback("voiceStopped", true);
  }
}

// Speech errors from Chrome (Android) and Safari (iOS) mapped to plain messages.
const VOICE_ERRORS = {
  "not-allowed": "micBlocked",
  "service-not-allowed": "micBlocked",
  "audio-capture": "noMic",
  network: "voiceOffline",
  "language-not-supported": "voiceLangUnsupported",
  "no-speech": "noSpeech",
};

// Show why voice stopped; when it cannot work, hand over to the text field.
function voiceFallback(messageKey, switchToTyping) {
  const status = $("#recStatus");
  if (!status) {
    return;
  }
  status.textContent = t(messageKey);
  status.classList.add("warn");
  $("#recMic")?.classList.remove("live");
  if (switchToTyping) {
    $("#recInput")?.focus();
  }
}

// Stop = finish and save what was heard; cancel = closing the sheet discards it.
function stopListening() {
  if (recognizer) {
    recognizer.stop();
  }
}

function cancelListening() {
  listeningCancelled = true;
  if (recognizer) {
    recognizer.abort();
  }
}

// ---------- Toast ----------
let toastTimer;

function showToast(message, actions = []) {
  $("#toastText").textContent = message;
  const holder = $("#toastActions");
  holder.innerHTML = "";
  for (const action of actions) {
    const button = document.createElement("button");
    button.textContent = action.label;
    button.onclick = () => {
      $("#toast").hidden = true;
      action.run();
    };
    holder.append(button);
  }
  $("#toast").hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    $("#toast").hidden = true;
  }, 5000);
}

// ---------- Shell ----------
function applyLanguage() {
  setLanguage(uiLanguage());
  document.documentElement.lang = { en: "en", id: "id", "zh-Hant": "zh-Hant", "zh-Hans": "zh-Hans" }[uiLanguage()] || "en";
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  $("#recordButton").setAttribute("aria-label", t("record"));
  $("#shareButton").setAttribute("aria-label", t("share"));
}

function render() {
  $("#screenTitle").textContent = t(ui.tab === "transactions" ? "activity" : ui.tab);
  document.querySelectorAll(".tabbar [data-tab]").forEach((b) => b.classList.toggle("on", b.dataset.tab === ui.tab));
  document.querySelectorAll(".view").forEach((v) => {
    v.hidden = v.id !== `view-${ui.tab}`;
  });

  const showPeriod = ui.tab === "overview" || ui.tab === "transactions";
  $("#periodBar").hidden = !showPeriod;
  $("#shareButton").hidden = ui.tab !== "overview" || !store.expenses.length;
  const range = rangeFor(ui.period, ui.anchor);
  document.querySelectorAll("[data-period]").forEach((b) => b.classList.toggle("on", b.dataset.period === ui.period));
  $("#periodLabel").textContent = periodLabel(ui.period, range);
  $("#nextPeriod").disabled = range.end > today();

  if (ui.tab === "overview") {
    renderOverview();
  } else if (ui.tab === "transactions") {
    renderTransactions();
  } else if (ui.tab === "budgets") {
    renderBudgets();
  } else {
    renderSettings();
  }
}

function goTo(tab) {
  ui.tab = tab;
  window.scrollTo(0, 0);
  render();
}

document.querySelectorAll(".tabbar [data-tab]").forEach((b) => {
  b.onclick = () => {
    ui.day = null;
    goTo(b.dataset.tab);
  };
});
document.querySelectorAll("[data-period]").forEach((b) => {
  b.onclick = () => {
    ui.period = b.dataset.period;
    ui.anchor = today();
    render();
  };
});
$("#prevPeriod").onclick = () => {
  ui.anchor = shiftAnchor(ui.period, ui.anchor, -1);
  render();
};
$("#nextPeriod").onclick = () => {
  ui.anchor = shiftAnchor(ui.period, ui.anchor, 1);
  render();
};
$("#recordButton").onclick = openRecorder;
$("#shareButton").onclick = () => openShare();

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-edit],[data-goto],[data-cat],[data-close],[data-day],[data-clear-day],[data-clear-cat]");
  if (!target) {
    return;
  }
  if (target.dataset.day) {
    ui.day = target.dataset.day;
    ui.query = "";
    ui.category = "";
    goTo("transactions");
  } else if (target.hasAttribute("data-clear-day")) {
    ui.day = null;
    render();
  } else if (target.hasAttribute("data-clear-cat")) {
    ui.category = "";
    render();
  } else if (target.dataset.edit) {
    openEditor(target.dataset.edit);
  } else if (target.dataset.goto) {
    goTo(target.dataset.goto);
  } else if (target.dataset.cat) {
    ui.category = target.dataset.cat;
    ui.query = "";
    goTo("transactions");
  } else if (target.hasAttribute("data-close")) {
    closeSheet();
  }
});

document.addEventListener("click", (event) => {
  if (event.target.closest("[data-record]")) {
    openRecorder();
  } else if (event.target.closest("[data-add]")) {
    openEditor(null);
  } else if (event.target.closest("[data-undo-last]")) {
    undoLastAdded();
  } else if (event.target.closest("[data-dismiss-added]")) {
    ui.justAdded = null;
    render();
  }
});

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-suggest]");
  if (!button) {
    return;
  }
  const value = Number(button.dataset.amount);
  if (button.dataset.suggest === "__total") {
    store.settings.budgetTotal = value;
  } else {
    store.settings.budgets[button.dataset.suggest] = value;
  }
  persist();
  render();
});

// The sticky top bar gets a shadow once content scrolls under it.
document.addEventListener("scroll", () => {
  const scrolled = (window.scrollY || document.documentElement.scrollTop) > 4;
  document.querySelector(".topbar")?.classList.toggle("scrolled", scrolled);
}, { passive: true });

document.addEventListener("change", (event) => {
  const field = event.target.closest("[data-budget]");
  if (!field) {
    return;
  }
  const value = Math.max(0, parseLocalNumber(field.value) || 0);
  if (field.dataset.budget === "__total") {
    store.settings.budgetTotal = value;
  } else if (value) {
    store.settings.budgets[field.dataset.budget] = value;
  } else {
    delete store.settings.budgets[field.dataset.budget];
  }
  persist();
  render();
});

// ---------- Demo data (?demo=1): sample expenses in memory only, never saved ----------
const DEMO_SCALE = {
  USD: 1, EUR: 0.92, GBP: 0.8, TWD: 30, HKD: 8, CNY: 7, IDR: 15000, SGD: 1.35, MYR: 4.5, PHP: 55,
  THB: 35, VND: 24000, JPY: 150, KRW: 1300, INR: 80, AUD: 1.5, NZD: 1.6, CAD: 1.35, CHF: 0.9,
};
const DEMO_ITEMS = [
  ["Lunch", "Food", 8, 16], ["Coffee", "Food", 3, 6], ["Dinner", "Food", 14, 40], ["Taxi", "Transport", 6, 20],
  ["Metro", "Transport", 1, 3], ["Groceries", "Groceries", 20, 70], ["Pharmacy", "Health", 5, 25],
  ["Movie", "Entertainment", 9, 18], ["Clothes", "Shopping", 25, 70], ["Phone bill", "Bills", 30, 30],
];

function loadDemo() {
  demoMode = true;
  let seed = 7;
  const random = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  const scale = DEMO_SCALE[store.settings.currency] || 1;
  const step = scale >= 1000 ? 1000 : scale >= 20 ? 5 : 0.5;
  const expenses = [];
  for (let offset = 40; offset >= 0; offset--) {
    const day = addDays(today(), -offset);
    const count = 1 + Math.floor(random() * 3);
    for (let n = 0; n < count; n++) {
      const [desc, cat, low, high] = DEMO_ITEMS[Math.floor(random() * DEMO_ITEMS.length)];
      const amount = Math.max(step, Math.round(((low + random() * (high - low)) * scale) / step) * step);
      const created = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 8 + Math.floor(random() * 13), Math.floor(random() * 60)).getTime();
      expenses.push({ id: `demo-${offset}-${n}`, created, date: keyOf(day), desc, cat, amount, note: "", raw: "" });
    }
  }
  store.expenses = expenses;
  store.settings.budgetTotal = Math.round((1200 * scale) / step) * step;
}

// ---------- Start ----------
applyLanguage();
const params = new URLSearchParams(location.search);
if (params.get("demo")) {
  loadDemo();
}
render();
if (params.get("add")) {
  const spoken = params.get("add");
  const parsed = parseExpenses(spoken);
  history.replaceState(null, "", location.pathname);
  if (parsed.length) {
    addExpenses(parsed, spoken);
  } else {
    showToast(t("noAmountIn", { text: spoken }));
  }
} else if (params.get("voice")) {
  history.replaceState(null, "", location.pathname);
  openRecorder();
}

if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js");
}
