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

function persist() {
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
  return `<span class="mark" style="color:${color};background:color-mix(in srgb, ${color} 14%, transparent)">${letter}</span>`;
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
const ui = { tab: "overview", period: "month", anchor: today(), query: "", category: "", day: null };

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

// ---------- Overview ----------
function renderOverview() {
  const range = rangeFor(ui.period, ui.anchor);
  const current = summarize(range);
  const view = $("#view-overview");

  if (!store.expenses.length) {
    view.innerHTML = `${heroHtml(current, null)}
      <div class="panel empty" style="margin-top:24px"><strong>${t("noExpensesYet")}</strong>${t("emptyHint")}</div>`;
    return;
  }

  const previousRange = rangeFor(ui.period, shiftAnchor(ui.period, ui.anchor, -1));
  if (current.isCurrent) {
    previousRange.end = addDays(previousRange.start, Math.min(current.elapsed, daysBetween(previousRange.start, previousRange.end)));
  }
  const previousTotal = sum(store.expenses.filter((e) => inRange(e, previousRange)));

  view.innerHTML = [
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
  return `<div class="block">
    <div class="block-head"><h2>${t("budget")}</h2><button class="link" data-goto="budgets">${t("edit")}</button></div>
    <div class="panel budget-line">
      <div class="row-top num"><span>${t("ofBudget", { spent: money(current.total), budget: money(budget) })}</span><span>${Math.round(used * 100)}%</span></div>
      <div class="meter"><i class="${used > 1 ? "over" : ""}" style="width:${Math.min(used, 1) * 100}%"></i>${current.isCurrent ? `<b style="left:${pace * 100}%"></b>` : ""}</div>
      <div class="note">${note}</div>
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
  const top = 8;
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

  return `<div class="block">
    <div class="block-head"><h2>${t(isYear ? "spendingByMonth" : "spendingByDay")}</h2></div>
    <div class="panel chart">
      <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img">${bars}${averageLine}</svg>
      <div class="legend num"><span>${t(isYear ? "avgPerMonth" : "avgPerDay", { amount: compactMoney(average) })}</span><span>${t("peak", { amount: compactMoney(peak) })}</span></div>
    </div>
  </div>`;
}

function categoriesHtml(current) {
  if (!current.items.length) {
    return `<div class="block"><div class="panel empty">${t("noExpensesPeriod")}</div></div>`;
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
      <span class="share num"><span class="meter"><i style="width:${share * 100}%;background:${color}"></i></span>${(share * 100).toFixed(0)}% · ${counts[cat]}</span>
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

  const scope = ui.day ? dayLabel(ui.day) : ui.query ? t("allTime") : periodLabel(ui.period, range);
  const count = items.length === 1 ? t("expense") : t("expenses", { n: items.length });
  let html = ui.day ? `<button class="filter-chip" data-clear-day>${dayLabel(ui.day)} · ${t("showAll")}</button>` : "";
  html += `<div class="summary-line num"><span>${scope} · ${count}</span><span>${money(sum(items))}</span></div>`;
  if (!items.length) {
    html += `<div class="panel empty" style="margin-top:14px">${ui.query ? t("noMatches") : t("noExpensesPeriod")}</div>`;
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
function renderBudgets() {
  const range = rangeFor("month", today());
  const current = summarize(range);
  const spentBy = {};
  for (const e of current.items) {
    spentBy[e.cat] = (spentBy[e.cat] || 0) + e.amount;
  }
  const monthName = range.start.toLocaleDateString(locale(), { month: "long", year: "numeric" });

  const statusHtml = (spent, budget) => {
    if (!budget) {
      return `<div class="status num"><span>${t("spentAmount", { amount: money(spent) })}</span><span>${t("noLimit")}</span></div>`;
    }
    const ratio = spent / budget;
    const left = budget - spent;
    return `<div class="meter"><i class="${ratio > 1 ? "over" : ""}" style="width:${Math.min(ratio, 1) * 100}%"></i></div>
      <div class="status num"><span>${t("ofBudget", { spent: money(spent), budget: money(budget) })}</span><span>${left >= 0 ? t("left", { amount: money(left) }) : t("over", { amount: money(-left) })}</span></div>`;
  };

  const categoryRows = CATEGORY_NAMES.map((cat) => `<div class="budget-row">
      <div class="top">
        <span class="swatch" style="background:${CATEGORY_COLORS[cat]}"></span>
        <span class="name">${catName(cat)}</span>
        <input class="field num" inputmode="decimal" placeholder="${t("noLimit")}" data-budget="${cat}" value="${store.settings.budgets[cat] || ""}">
      </div>
      ${statusHtml(spentBy[cat] || 0, store.settings.budgets[cat] || 0)}
    </div>`).join("");

  $("#view-budgets").innerHTML = `
    <div class="block">
      <div class="block-head"><h2>${monthName}</h2></div>
      <div class="panel budget-row">
        <div class="top">
          <span class="name"><strong>${t("monthlyBudget")}</strong></span>
          <input class="field num" inputmode="decimal" placeholder="${t("notSet")}" data-budget="__total" value="${store.settings.budgetTotal || ""}">
        </div>
        ${statusHtml(current.total, store.settings.budgetTotal)}
      </div>
    </div>
    <div class="block">
      <div class="block-head"><h2>${t("byCategory")}</h2></div>
      <div class="panel rows">${categoryRows}</div>
    </div>
    <p class="foot">${t("budgetsNote")}</p>`;
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

function addExpenses(parsed, spoken) {
  const stamp = Date.now();
  const added = parsed.map((e, i) => ({ ...e, id: `${stamp}-${i}`, created: stamp + i, raw: spoken, note: "" }));
  store.expenses.push(...added);
  lastAdded = added.map((e) => e.id);
  persist();
  render();
  const label = added.length === 1
    ? t("added1", { desc: added[0].desc, amount: money(added[0].amount) })
    : t("addedN", { n: added.length, amount: money(sum(added)) });
  const undo = {
    label: t("undo"),
    run: () => {
      store.expenses = store.expenses.filter((e) => !lastAdded.includes(e.id));
      persist();
      render();
    },
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
      <button class="mic" id="recMic" aria-label="${t("record")}">${MIC_ICON}</button>
      <form id="recForm" autocomplete="off">
        <input class="field" id="recInput" placeholder="${t("recType")}" enterkeyhint="done">
        <button class="btn primary">${t("save")}</button>
      </form>
      <button class="manual" id="recManual">${t("manual")}</button>
    </div>`, cancelListening);

  $("#recMic").onclick = () => (recognizer ? stopListening() : startListening());
  $("#recInput").oninput = (event) => showHeard(event.target.value, false);
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
  const parsed = text ? parseExpenses(text) : [];
  preview.hidden = !parsed.length;
  preview.innerHTML = parsed.map((e) => `<div class="tx">${markHtml(e)}
      <span class="body"><div class="title">${escapeHtml(e.desc)}</div><div class="sub">${catName(e.cat)} · ${dayLabel(e.date)}</div></span>
      <span class="amount num">${money(e.amount)}</span></div>`).join("");
}

function commitHeard(text) {
  const spoken = text.trim();
  const parsed = spoken ? parseExpenses(spoken) : [];
  if (!parsed.length) {
    if ($("#recStatus")) {
      $("#recStatus").textContent = spoken ? t("noAmount") : t("nothingYet");
    }
    return;
  }
  closeSheet();
  addExpenses(parsed, spoken);
}

function startListening() {
  listeningCancelled = false;
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
    const messages = { "not-allowed": t("micBlocked"), "no-speech": t("noSpeech") };
    if ($("#recStatus")) {
      $("#recStatus").textContent = messages[event.error] || t("voiceStopped");
    }
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
  recognizer.start();
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
  const target = event.target.closest("[data-edit],[data-goto],[data-cat],[data-close],[data-day],[data-clear-day]");
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

// ---------- Start ----------
applyLanguage();
const params = new URLSearchParams(location.search);
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
