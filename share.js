"use strict";

// Shareable progress card (Story 1080x1920 or Square 1080x1080) drawn from real data.

const CARD_THEMES = {
  light: { bg: "#f6f5f2", panel: "#ffffff", text: "#141414", muted: "#6e6b66", line: "#e4e2dd", accent: "#1f3b5c", soft: "rgba(31,59,92,0.10)", up: "#a8321e", down: "#2f6b45" },
  dark: { bg: "#111315", panel: "#1a1d20", text: "#f2f1ee", muted: "#8f8c87", line: "#2b2f34", accent: "#9db8d6", soft: "rgba(157,184,214,0.14)", up: "#e07a63", down: "#7fbf93" },
  navy: { bg: "#1f3b5c", panel: "#264669", text: "#f6f5f2", muted: "#a9bbd0", line: "#37587e", accent: "#f6f5f2", soft: "rgba(246,245,242,0.13)", up: "#f2a28f", down: "#9fd8b0" },
  forest: { bg: "#1f3a30", panel: "#274638", text: "#f3f1ea", muted: "#a9bfb2", line: "#355747", accent: "#e8e3d3", soft: "rgba(232,227,211,0.13)", up: "#f2a28f", down: "#a8dcb6" },
  clay: { bg: "#9a4630", panel: "#a65239", text: "#fff8f3", muted: "#f1cdbf", line: "#b8664c", accent: "#fff5ee", soft: "rgba(255,245,238,0.16)", up: "#ffd9a8", down: "#d8f0c8" },
  sand: { bg: "#ebe3d3", panel: "#f6f1e7", text: "#1d1a15", muted: "#6b6254", line: "#d8cdb8", accent: "#7a4a1f", soft: "rgba(122,74,31,0.12)", up: "#a8321e", down: "#2f6b45" },
  dusk: { bg: "#1f3b5c", gradient: ["#1c3557", "#5b3a5f"], panel: "rgba(255,255,255,0.10)", text: "#f6f5f2", muted: "#c3c3d6", line: "rgba(255,255,255,0.22)", accent: "#f6f5f2", soft: "rgba(246,245,242,0.14)", up: "#f2a28f", down: "#9fd8b0" },
  ember: { bg: "#8f3f2b", gradient: ["#a3492f", "#3a2230"], panel: "rgba(255,255,255,0.10)", text: "#fff8f3", muted: "#efc9bb", line: "rgba(255,255,255,0.22)", accent: "#fff5ee", soft: "rgba(255,245,238,0.15)", up: "#ffd9a8", down: "#d8f0c8" },
  // Sticker: no background at all, so the PNG keeps its alpha channel. Ink picks white or dark text.
  transparent: { bg: null, shadow: "rgba(0,0,0,0.45)", panel: "rgba(255,255,255,0.14)", text: "#ffffff", muted: "rgba(255,255,255,0.80)", line: "rgba(255,255,255,0.35)", accent: "#ffffff", soft: "rgba(255,255,255,0.18)", up: "#ffb4a3", down: "#b8f0c8" },
  transparentDark: { bg: null, panel: "rgba(20,20,20,0.06)", text: "#141414", muted: "rgba(20,20,20,0.70)", line: "rgba(20,20,20,0.22)", accent: "#141414", soft: "rgba(20,20,20,0.10)", up: "#a8321e", down: "#2f6b45" },
  // The user's own photo behind a dark scrim, white text on top.
  photo: { bg: null, photo: true, shadow: "rgba(0,0,0,0.40)", panel: "rgba(0,0,0,0.34)", text: "#ffffff", muted: "rgba(255,255,255,0.82)", line: "rgba(255,255,255,0.32)", accent: "#ffffff", soft: "rgba(255,255,255,0.18)", up: "#ffb4a3", down: "#b8f0c8" },
};
// Swatch order in the picker; colours are only for the swatch chips.
const CARD_BACKGROUNDS = [
  ["light", "#f6f5f2"], ["dark", "#111315"], ["navy", "#1f3b5c"], ["forest", "#1f3a30"], ["clay", "#9a4630"],
  ["sand", "#ebe3d3"], ["dusk", "linear-gradient(160deg,#1c3557,#5b3a5f)"], ["ember", "linear-gradient(160deg,#a3492f,#3a2230)"],
  ["transparent", ""], ["photo", ""],
];
// Picked photo lives in memory only; it is never written to storage.
let sharePhoto = null;
const CARD_FONT = '-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, "Helvetica Neue", Arial, "PingFang TC", "Microsoft JhengHei", "Noto Sans CJK TC", sans-serif';

function cardTheme(options) {
  if (options.theme === "transparent" && options.ink === "dark") {
    return CARD_THEMES.transparentDark;
  }
  return CARD_THEMES[options.theme] || CARD_THEMES.light;
}

function paintBackground(ctx, W, H, theme) {
  ctx.clearRect(0, 0, W, H);
  if (theme.photo && sharePhoto) {
    const scale = Math.max(W / sharePhoto.width, H / sharePhoto.height);
    const w = sharePhoto.width * scale;
    const h = sharePhoto.height * scale;
    ctx.drawImage(sharePhoto, (W - w) / 2, (H - h) / 2, w, h);
    const scrim = ctx.createLinearGradient(0, 0, 0, H);
    scrim.addColorStop(0, "rgba(0,0,0,0.50)");
    scrim.addColorStop(0.45, "rgba(0,0,0,0.28)");
    scrim.addColorStop(1, "rgba(0,0,0,0.62)");
    ctx.fillStyle = scrim;
    ctx.fillRect(0, 0, W, H);
  } else if (theme.photo) {
    ctx.fillStyle = "#1b1d20";
    ctx.fillRect(0, 0, W, H);
  } else if (theme.gradient) {
    const fill = ctx.createLinearGradient(0, 0, W * 0.4, H);
    fill.addColorStop(0, theme.gradient[0]);
    fill.addColorStop(1, theme.gradient[1]);
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, W, H);
  } else if (theme.bg) {
    ctx.fillStyle = theme.bg;
    ctx.fillRect(0, 0, W, H);
  }
}

// ---------- Data ----------
function daySpend(key) {
  return sum(store.expenses.filter((e) => e.date === key));
}

function loggingStreak() {
  const logged = new Set(store.expenses.map((e) => e.date));
  let day = today();
  if (!logged.has(keyOf(day))) {
    day = addDays(day, -1);
  }
  let streak = 0;
  while (logged.has(keyOf(day))) {
    streak += 1;
    day = addDays(day, -1);
  }
  return streak;
}

function buildShareData(kind) {
  const now = today();
  const anchor = ui.anchor > now ? now : ui.anchor;
  const range = kind === "day" ? { start: now, end: addDays(now, 1) } : rangeFor(kind, anchor);
  const current = summarize(range);
  const items = [...current.items].sort((a, b) => (a.created || 0) - (b.created || 0));

  // Comparison: a day against the 30-day daily average, a week/month against the same point last period.
  let compare = null;
  if (kind === "day") {
    const before = summarize({ start: addDays(now, -30), end: now });
    const average = before.trackedDays ? before.total / before.trackedDays : 0;
    if (average) {
      compare = { change: ((current.total - average) / average) * 100, label: t("vsAvg30") };
    }
  } else {
    const previous = rangeFor(kind, shiftAnchor(kind, anchor, -1));
    if (current.isCurrent) {
      previous.end = addDays(previous.start, Math.min(current.elapsed, daysBetween(previous.start, previous.end)));
    }
    const previousTotal = sum(store.expenses.filter((e) => inRange(e, previous)));
    if (previousTotal) {
      const key = current.isCurrent ? (kind === "week" ? "vsSameWeek" : "vsSameMonth") : (kind === "week" ? "vsPrevWeek" : "vsPrevMonth");
      compare = { change: ((current.total - previousTotal) / previousTotal) * 100, label: t(key) };
    }
  }

  // Days at or under the daily share of the monthly budget.
  const budget = store.settings.budgetTotal;
  const countFrom = new Date(Math.max(range.start, trackingStart()));
  const lastDay = current.isCurrent ? now : addDays(range.end, -1);
  let underBudget = null;
  if (budget && current.trackedDays) {
    let under = 0;
    for (let day = countFrom; day <= lastDay; day = addDays(day, 1)) {
      const daysInMonth = new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate();
      if (daySpend(keyOf(day)) <= budget / daysInMonth) {
        under += 1;
      }
    }
    underBudget = { under, of: current.trackedDays };
  }

  const totals = {};
  for (const e of items) {
    totals[e.cat] = (totals[e.cat] || 0) + e.amount;
  }
  const topCategories = Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat, total]) => ({ cat, total, share: current.total ? total / current.total : 0 }));

  let series = [];
  if (kind !== "day") {
    let running = 0;
    for (let i = 0; i < current.spanDays; i++) {
      const day = addDays(range.start, i);
      const value = daySpend(keyOf(day));
      running += value;
      series.push({ day, value, running, future: day > now });
    }
  }

  const monthBudget = kind === "month" && budget ? budget : 0;
  return {
    kind,
    range,
    label: kind === "day"
      ? now.toLocaleDateString(locale(), { weekday: "long", month: "long", day: "numeric" })
      : periodLabel(kind, range),
    total: current.total,
    count: items.length,
    items,
    perDay: current.trackedDays ? current.total / current.trackedDays : 0,
    largest: items.reduce((max, e) => Math.max(max, e.amount), 0),
    daysLogged: new Set(items.map((e) => e.date)).size,
    trackedDays: current.trackedDays,
    compare,
    underBudget,
    streak: loggingStreak(),
    topCategories,
    series,
    budget: monthBudget,
    budgetUsed: monthBudget ? current.total / monthBudget : null,
  };
}

// ---------- Drawing helpers ----------
const cardFont = (weight, size) => `${weight} ${size}px ${CARD_FONT}`;

function fitFont(ctx, text, maxWidth, weight, size, minimum) {
  let current = size;
  ctx.font = cardFont(weight, current);
  while (ctx.measureText(text).width > maxWidth && current > minimum) {
    current -= 4;
    ctx.font = cardFont(weight, current);
  }
  return current;
}

function spacedText(ctx, text, x, y, spacing) {
  let cursor = x;
  for (const ch of text) {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + spacing;
  }
}

function ellipsize(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) {
    return text;
  }
  let cut = text;
  while (cut.length > 1 && ctx.measureText(cut + "…").width > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return cut + "…";
}

function micGlyph(ctx, x, y, size, color) {
  const s = size / 24;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.2 * s;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.roundRect(x + 9 * s, y + 3 * s, 6 * s, 11 * s, 3 * s);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x + 12 * s, y + 11 * s, 7 * s, 0, Math.PI);
  ctx.moveTo(x + 12 * s, y + 18 * s);
  ctx.lineTo(x + 12 * s, y + 21 * s);
  ctx.stroke();
  ctx.restore();
}

const plainMoney = (value) => money(Math.round(value), { minimumFractionDigits: 0, maximumFractionDigits: 0 });

// ---------- Visuals ----------
function drawMonthTrail(ctx, data, box, theme, hide) {
  const points = data.series.filter((p) => !p.future);
  const days = data.series.length;
  const top = Math.max(data.total, data.budget || 0, 1) * 1.1;
  const x = (i) => box.x + (i / Math.max(days - 1, 1)) * box.w;
  const y = (v) => box.y + box.h - (v / top) * box.h;

  ctx.strokeStyle = theme.line;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(box.x, box.y + box.h);
  ctx.lineTo(box.x + box.w, box.y + box.h);
  ctx.stroke();

  if (data.budget) {
    ctx.save();
    ctx.setLineDash([14, 12]);
    ctx.strokeStyle = theme.muted;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x(0), y(0));
    ctx.lineTo(x(days - 1), y(data.budget));
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = theme.muted;
    ctx.font = cardFont(500, 26);
    ctx.textAlign = "right";
    ctx.fillText(t("budgetPace"), box.x + box.w, y(data.budget) - 18);
    ctx.textAlign = "left";
  }

  if (points.length) {
    ctx.beginPath();
    ctx.moveTo(x(0), y(0));
    points.forEach((p, i) => ctx.lineTo(x(i), y(p.running)));
    ctx.lineTo(x(points.length - 1), box.y + box.h);
    ctx.lineTo(x(0), box.y + box.h);
    ctx.closePath();
    ctx.fillStyle = theme.soft;
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(x(0), y(0));
    points.forEach((p, i) => ctx.lineTo(x(i), y(p.running)));
    ctx.strokeStyle = theme.accent;
    ctx.lineWidth = 7;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.stroke();

    const end = points.length - 1;
    const ex = x(end);
    const ey = y(points[end].running);
    // Halo ring only on flat backgrounds; on stickers, gradients and photos it would show as a blob.
    if (theme.bg && !theme.gradient) {
      ctx.fillStyle = theme.bg;
      ctx.beginPath();
      ctx.arc(ex, ey, 16, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = theme.accent;
    ctx.beginPath();
    ctx.arc(ex, ey, 11, 0, Math.PI * 2);
    ctx.fill();
    if (!hide) {
      ctx.fillStyle = theme.text;
      ctx.font = cardFont(650, 32);
      const label = plainMoney(points[end].running);
      const width = ctx.measureText(label).width;
      const lx = Math.min(Math.max(ex - width / 2, box.x), box.x + box.w - width);
      ctx.fillText(label, lx, ey - 34);
    }
  }

  ctx.fillStyle = theme.muted;
  ctx.font = cardFont(500, 26);
  const first = data.series[0].day.toLocaleDateString(locale(), { month: "short", day: "numeric" });
  const last = data.series[days - 1].day.toLocaleDateString(locale(), { month: "short", day: "numeric" });
  ctx.fillText(first, box.x, box.y + box.h + 44);
  ctx.textAlign = "right";
  ctx.fillText(last, box.x + box.w, box.y + box.h + 44);
  ctx.textAlign = "left";
}

function drawWeekBars(ctx, data, box, theme, hide) {
  const values = data.series;
  const max = Math.max(...values.map((v) => v.value), 1);
  const slot = box.w / values.length;
  const barWidth = slot * 0.56;
  const chartHeight = box.h - 60;
  const pastValues = values.filter((v) => !v.future);
  const average = pastValues.length ? pastValues.reduce((s, v) => s + v.value, 0) / pastValues.length : 0;
  const todayKey = keyOf(today());

  values.forEach((v, i) => {
    const bx = box.x + i * slot + (slot - barWidth) / 2;
    const h = v.value ? Math.max(8, (v.value / max) * (chartHeight - 50)) : 4;
    const by = box.y + chartHeight - h;
    ctx.fillStyle = v.future ? theme.line : theme.accent;
    ctx.globalAlpha = v.future || keyOf(v.day) === todayKey ? 1 : 0.82;
    ctx.beginPath();
    ctx.roundRect(bx, by, barWidth, h, 8);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (!hide && v.value) {
      ctx.fillStyle = theme.text;
      ctx.font = cardFont(600, 24);
      ctx.textAlign = "center";
      ctx.fillText(compactMoney(v.value), bx + barWidth / 2, by - 14);
    }
    ctx.fillStyle = theme.muted;
    ctx.font = cardFont(500, 26);
    ctx.textAlign = "center";
    ctx.fillText(v.day.toLocaleDateString(locale(), { weekday: "short" }), bx + barWidth / 2, box.y + box.h - 8);
    ctx.textAlign = "left";
  });

  if (average) {
    const ay = box.y + chartHeight - (average / max) * (chartHeight - 50);
    ctx.save();
    ctx.setLineDash([10, 10]);
    ctx.strokeStyle = theme.muted;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(box.x, ay);
    ctx.lineTo(box.x + box.w, ay);
    ctx.stroke();
    ctx.restore();
  }
}

function drawDayPips(ctx, data, box, theme, hide, isStory) {
  const lineY = box.y + 110;
  ctx.strokeStyle = theme.line;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(box.x, lineY);
  ctx.lineTo(box.x + box.w, lineY);
  ctx.stroke();

  ctx.fillStyle = theme.muted;
  ctx.font = cardFont(500, 24);
  [0, 6, 12, 18, 24].forEach((hour) => {
    const tx = box.x + (hour / 24) * box.w;
    ctx.textAlign = hour === 0 ? "left" : hour === 24 ? "right" : "center";
    ctx.fillText(`${String(hour).padStart(2, "0")}:00`, tx, lineY + 52);
  });
  ctx.textAlign = "left";

  const max = Math.max(...data.items.map((e) => e.amount), 1);
  data.items.forEach((e, i) => {
    const stamp = e.created > 1e12 ? new Date(e.created) : null;
    const hours = stamp ? stamp.getHours() + stamp.getMinutes() / 60 : 8 + (i * 12) / Math.max(data.items.length, 1);
    const px = box.x + 20 + (hours / 24) * (box.w - 40);
    const radius = 12 + Math.sqrt(e.amount / max) * 30;
    ctx.fillStyle = CATEGORY_COLORS[e.cat] || CATEGORY_COLORS.Other;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(px, lineY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  });

  const rows = isStory ? 4 : 0;
  let rowY = lineY + 120;
  [...data.items].sort((a, b) => b.amount - a.amount).slice(0, rows).forEach((e) => {
    ctx.fillStyle = CATEGORY_COLORS[e.cat] || CATEGORY_COLORS.Other;
    ctx.beginPath();
    ctx.roundRect(box.x, rowY - 24, 20, 20, 4);
    ctx.fill();
    ctx.fillStyle = theme.text;
    ctx.font = cardFont(550, 34);
    ctx.fillText(ellipsize(ctx, e.desc, box.w * 0.6), box.x + 40, rowY);
    if (!hide) {
      ctx.textAlign = "right";
      ctx.font = cardFont(650, 34);
      ctx.fillText(plainMoney(e.amount), box.x + box.w, rowY);
      ctx.textAlign = "left";
    }
    rowY += 68;
  });
}

// ---------- Card ----------
function drawShareCard(canvas, data, options) {
  const isStory = options.format === "story";
  const W = 1080;
  const H = isStory ? 1920 : 1080;
  const P = 88;
  const theme = cardTheme(options);
  const hide = options.hideAmounts;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.textBaseline = "alphabetic";
  paintBackground(ctx, W, H, theme);
  if (theme.shadow) {
    ctx.shadowColor = theme.shadow;
    ctx.shadowBlur = 14;
    ctx.shadowOffsetY = 2;
  }

  // Header
  let y = isStory ? 150 : 112;
  ctx.fillStyle = theme.text;
  ctx.font = cardFont(800, 32);
  spacedText(ctx, "TALLY", P, y, 7);
  ctx.fillStyle = theme.muted;
  ctx.font = cardFont(600, 30);
  ctx.textAlign = "right";
  ctx.fillText(data.label.toLocaleUpperCase(locale()), W - P, y);
  ctx.textAlign = "left";
  y += 36;
  ctx.fillStyle = theme.line;
  ctx.fillRect(P, y, W - 2 * P, 2);

  // Headline number
  y += isStory ? 108 : 82;
  ctx.fillStyle = theme.muted;
  ctx.font = cardFont(500, 38);
  ctx.fillText(t("totalSpent"), P, y);
  y += isStory ? 158 : 128;
  let headline;
  let subline = "";
  if (!hide) {
    headline = plainMoney(data.total);
  } else if (data.budgetUsed !== null) {
    headline = `${Math.round(data.budgetUsed * 100)}%`;
    subline = t("budgetUsed");
  } else {
    headline = String(data.count);
    subline = t("expensesLogged");
  }
  ctx.fillStyle = theme.text;
  fitFont(ctx, headline, W - 2 * P, 750, isStory ? 172 : 136, 72);
  ctx.fillText(headline, P, y);
  if (subline) {
    const width = ctx.measureText(headline).width;
    ctx.fillStyle = theme.muted;
    ctx.font = cardFont(500, 34);
    ctx.fillText(ellipsize(ctx, subline, W - 2 * P - width - 24), P + width + 24, y);
  }

  // Comparison line
  y += 70;
  if (data.compare) {
    const change = data.compare.change;
    const text = `${change >= 0 ? "+" : "−"}${Math.abs(change).toFixed(0)}%`;
    ctx.font = cardFont(700, 34);
    ctx.fillStyle = change >= 0 ? theme.up : theme.down;
    ctx.fillText(text, P, y);
    const offset = ctx.measureText(text).width + 16;
    ctx.font = cardFont(500, 34);
    ctx.fillStyle = theme.muted;
    ctx.fillText(ellipsize(ctx, data.compare.label, W - 2 * P - offset), P + offset, y);
  }

  // Visual
  const box = { x: P, y: y + (isStory ? 90 : 60), w: W - 2 * P, h: isStory ? 420 : 250 };
  if (data.kind === "month") {
    drawMonthTrail(ctx, data, box, theme, hide);
  } else if (data.kind === "week") {
    drawWeekBars(ctx, data, box, theme, hide);
  } else {
    drawDayPips(ctx, data, { ...box, h: isStory ? 420 : 180 }, theme, hide, isStory);
  }
  y = box.y + box.h + (isStory ? 110 : 90);

  // Stats
  const topCat = data.topCategories[0] ? catName(data.topCategories[0].cat) : "—";
  const days = (n) => (n === 1 ? t("dayN") : t("daysN", { n }));
  const stats = data.kind === "day"
    ? [
        { label: t("transactions"), value: String(data.count) },
        { label: t("topCategory"), value: topCat },
        ...(hide ? [] : [{ label: t("largest"), value: data.largest ? plainMoney(data.largest) : "—" }]),
        { label: t("loggingStreak"), value: days(data.streak) },
      ]
    : [
        hide ? { label: t("daysLogged"), value: `${data.daysLogged}/${data.trackedDays}` } : { label: t("perDay"), value: plainMoney(data.perDay) },
        { label: t("transactions"), value: String(data.count) },
        data.underBudget
          ? { label: t("daysUnderBudget"), value: `${data.underBudget.under}/${data.underBudget.of}` }
          : { label: t("topCategory"), value: topCat },
        { label: t("loggingStreak"), value: days(data.streak) },
      ];
  // Square cards keep the three most important stats so labels never truncate.
  const shown = isStory ? stats : stats.slice(0, 3);
  const columns = isStory ? 2 : shown.length;
  const cellW = (W - 2 * P) / columns;
  const cellH = isStory ? 150 : 140;
  const rowsCount = Math.ceil(shown.length / columns);
  ctx.fillStyle = theme.panel;
  ctx.beginPath();
  ctx.roundRect(P, y - 20, W - 2 * P, rowsCount * cellH + 10, 28);
  ctx.fill();
  shown.forEach((stat, i) => {
    const cx = P + (i % columns) * cellW + (isStory ? 40 : 28);
    const cy = y - 20 + Math.floor(i / columns) * cellH;
    ctx.fillStyle = theme.muted;
    ctx.font = cardFont(500, isStory ? 30 : 24);
    ctx.fillText(ellipsize(ctx, stat.label, cellW - 50), cx, cy + (isStory ? 62 : 52));
    ctx.fillStyle = theme.text;
    fitFont(ctx, stat.value, cellW - 50, 700, isStory ? 54 : 40, 26);
    ctx.fillText(stat.value, cx, cy + (isStory ? 122 : 104));
  });
  ctx.fillStyle = theme.line;
  for (let c = 1; c < columns; c++) {
    ctx.fillRect(P + c * cellW, y, 2, rowsCount * cellH - 30);
  }
  if (rowsCount > 1) {
    ctx.fillRect(P + 30, y - 20 + cellH, W - 2 * P - 60, 2);
  }
  y += rowsCount * cellH + (isStory ? 80 : 40);

  // Top categories (story only), never running into the footer
  const footY = H - (isStory ? 80 : 64);
  if (isStory && data.topCategories.length) {
    ctx.fillStyle = theme.muted;
    ctx.font = cardFont(600, 26);
    spacedText(ctx, t("categories").toLocaleUpperCase(locale()), P, y, 3);
    y += 60;
    data.topCategories.filter((_, i) => y + i * 84 + 40 < footY - 30).forEach((c) => {
      const color = CATEGORY_COLORS[c.cat] || CATEGORY_COLORS.Other;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(P, y - 24, 22, 22, 5);
      ctx.fill();
      ctx.fillStyle = theme.text;
      ctx.font = cardFont(550, 36);
      ctx.fillText(catName(c.cat), P + 42, y);
      ctx.textAlign = "right";
      ctx.font = cardFont(650, 36);
      ctx.fillText(hide ? `${Math.round(c.share * 100)}%` : `${plainMoney(c.total)}  ·  ${Math.round(c.share * 100)}%`, W - P, y);
      ctx.textAlign = "left";
      ctx.fillStyle = theme.line;
      ctx.beginPath();
      ctx.roundRect(P + 42, y + 20, W - 2 * P - 42, 8, 4);
      ctx.fill();
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(P + 42, y + 20, Math.max(8, (W - 2 * P - 42) * c.share), 8, 4);
      ctx.fill();
      y += 84;
    });
  }

  // Footer
  micGlyph(ctx, P, footY - 30, 36, theme.muted);
  ctx.fillStyle = theme.muted;
  ctx.font = cardFont(500, 28);
  ctx.fillText(t("cardFooter"), P + 50, footY);
}

// ---------- Share sheet ----------
function shareOptions() {
  store.settings.share = { kind: "month", format: "story", theme: "light", ink: "light", hideAmounts: false, ...(store.settings.share || {}) };
  return store.settings.share;
}

function openShare() {
  const options = shareOptions();
  if (ui.period === "week" || ui.period === "month") {
    options.kind = ui.period;
  }
  // The photo is not saved, so a reopened sheet cannot show it; fall back to a flat background.
  if (options.theme === "photo" && !sharePhoto) {
    options.theme = "dark";
  }
  const segment = (name, values) => `<div class="segmented" data-share="${name}">${values
    .map(([value, label]) => `<button data-value="${value}" class="${options[name] === value ? "on" : ""}">${label}</button>`)
    .join("")}</div>`;
  const swatches = CARD_BACKGROUNDS
    .map(([value, fill]) => `<button class="swatch swatch-${value} ${options.theme === value ? "on" : ""}" data-bg="${value}"
      aria-label="${t(value)}" aria-pressed="${options.theme === value}" title="${t(value)}"${fill ? ` style="background:${fill}"` : ""}>${value === "photo" ? photoGlyph() : ""}</button>`)
    .join("");

  openSheet(`
    <div class="sheet-head">
      <button data-close style="color:var(--muted)">${t("close")}</button>
      <h3>${t("shareTitle")}</h3>
      <span style="width:48px"></span>
    </div>
    <div class="share-controls">
      ${segment("kind", [["day", t("day")], ["week", t("week")], ["month", t("month")]])}
      ${segment("format", [["story", t("story")], ["square", t("square")]])}
      <div class="bg-picker">
        <div class="bg-label">${t("background")} <span id="shareBgName">${t(options.theme)}</span></div>
        <div class="swatches">${swatches}</div>
        <input type="file" accept="image/*" id="sharePhotoInput" hidden>
      </div>
      <div class="switch-row" id="shareInkRow" ${options.theme === "transparent" ? "" : "hidden"}>
        <span>${t("textColor")}</span>
        ${segment("ink", [["light", t("light")], ["dark", t("dark")]])}
      </div>
      <label class="switch-row"><span>${t("hideAmounts")}</span><input type="checkbox" class="switch" id="shareHide" ${options.hideAmounts ? "checked" : ""}></label>
    </div>
    <div class="share-preview"><canvas id="shareCanvas"></canvas></div>
    <div class="share-actions">
      <button class="btn secondary" id="shareSave">${t("saveImage")}</button>
      <button class="btn primary" id="shareSend">${t("shareImage")}</button>
    </div>`);

  const redraw = () => {
    const canvas = $("#shareCanvas");
    canvas.classList.toggle("is-transparent", options.theme === "transparent");
    canvas.classList.toggle("ink-dark", options.ink === "dark");
    drawShareCard(canvas, buildShareData(options.kind), options);
  };
  const selectBackground = (value) => {
    options.theme = value;
    document.querySelectorAll("[data-bg]").forEach((b) => {
      b.classList.toggle("on", b.dataset.bg === value);
      b.setAttribute("aria-pressed", String(b.dataset.bg === value));
    });
    $("#shareBgName").textContent = t(value);
    $("#shareInkRow").hidden = value !== "transparent";
    persist();
    redraw();
  };
  document.querySelectorAll("[data-bg]").forEach((button) => {
    button.onclick = () => {
      if (button.dataset.bg === "photo") {
        $("#sharePhotoInput").click();
        return;
      }
      selectBackground(button.dataset.bg);
    };
  });
  $("#sharePhotoInput").onchange = async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) {
      return;
    }
    try {
      sharePhoto = await loadPhoto(file);
      selectBackground("photo");
    } catch {
      // unreadable image: keep the current background
    }
    event.target.value = "";
  };
  document.querySelectorAll("[data-share]").forEach((group) => {
    group.onclick = (event) => {
      const button = event.target.closest("[data-value]");
      if (!button) {
        return;
      }
      options[group.dataset.share] = button.dataset.value;
      group.querySelectorAll("button").forEach((b) => b.classList.toggle("on", b === button));
      persist();
      redraw();
    };
  });
  $("#shareHide").onchange = (event) => {
    options.hideAmounts = event.target.checked;
    persist();
    redraw();
  };
  $("#shareSave").onclick = () => exportCard(false);
  $("#shareSend").onclick = () => exportCard(true);
  redraw();
}

function loadPhoto(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image"));
    };
    image.src = url;
  });
}

function photoGlyph() {
  return `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/></svg>`;
}

function exportCard(viaShareSheet) {
  const canvas = $("#shareCanvas");
  const name = `tally-${shareOptions().kind}-${keyOf(today())}.png`;
  canvas.toBlob(async (blob) => {
    const file = new File([blob], name, { type: "image/png" });
    if (viaShareSheet && navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] });
      } catch {
        // user closed the share sheet
      }
      return;
    }
    download(name, blob, "image/png");
  }, "image/png");
}
