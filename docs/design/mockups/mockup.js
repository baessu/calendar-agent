/* 캘린더 레이아웃 목업 — 공용 데이터 & 렌더링 로직
 * 막대색 = hsl(project.hue, taskType.s, taskType.l), 텍스트색 = WCAG 대비 자동.
 * 팔레트를 주입 가능: 표준(PALETTE_STD) / 에디토리얼(PALETTE_ED).
 */

// 표준 팔레트 (docs/design/color-system.md)
const PROJECTS = [
  { id: "web", name: "웹사이트 리뉴얼", hue: 215 },
  { id: "app", name: "모바일 앱", hue: 142 },
  { id: "mkt", name: "마케팅", hue: 25 },
  { id: "me",  name: "개인", hue: 272 },
];
const TASK_TYPES = [
  { id: "deadline", name: "마감",   s: 68, l: 38 },
  { id: "work",     name: "작업",   s: 60, l: 49 },
  { id: "meeting",  name: "회의",   s: 50, l: 68 },
  { id: "research", name: "리서치", s: 42, l: 84 },
];

// 같은 톤(S58 L46) · 다른 색조 8색 — 막대는 원색의 dark/tint 톤. 32조합 WCAG AA↑ 검증
const PROJECTS_ED = [
  { id: "web", name: "웹사이트 리뉴얼", color: "#3175B9" }, // 블루
  { id: "app", name: "모바일 앱", color: "#31B96A" },       // 그린
  { id: "mkt", name: "마케팅", color: "#B97131" },          // 오렌지
  { id: "me",  name: "개인", color: "#B9313D" },            // 레드
];
// mode: dark(원색 어둡게) | tint(흰색 섞기), k = 비율
const TASK_TYPES_ED = [
  { id: "deadline", name: "마감",   mode: "dark", k: 0.40 },
  { id: "work",     name: "작업",   mode: "tint", k: 0.32 },
  { id: "meeting",  name: "회의",   mode: "tint", k: 0.56 },
  { id: "research", name: "리서치", mode: "tint", k: 0.80 },
];

const PALETTE_STD = { projects: PROJECTS, taskTypes: TASK_TYPES };
const PALETTE_ED  = { projects: PROJECTS_ED, taskTypes: TASK_TYPES_ED };

// 팔레트 쇼케이스용 전체 8색조 (color-system.md)
const SHOWCASE_STD = {
  name: "표준 (기능형)",
  hues: [["잉크블루",215],["틸",178],["그린",142],["앰버",45],["오렌지",25],["레드",358],["핑크",328],["바이올렛",272]],
  tones: TASK_TYPES,
};
const SHOWCASE_ED = {
  name: "같은 톤 8색조 (S58 L46)",
  colors: [["레드","#B9313D"],["오렌지","#B97131"],["앰버","#B99E31"],["그린","#31B96A"],["틸","#31B5B9"],["블루","#3175B9"],["인디고","#5A31B9"],["퍼플","#B9319E"]],
  tones: TASK_TYPES_ED,
};

const TASKS = [
  { t: "디자인 시스템 구축", p: "web", k: "work",     s: "2026-05-04", e: "2026-05-12" },
  { t: "사용자 인터뷰",      p: "app", k: "research", s: "2026-05-06", e: "2026-05-08" },
  { t: "회고 미팅",          p: "web", k: "meeting",  s: "2026-05-15", e: "2026-05-15" },
  { t: "QA 테스트",          p: "app", k: "work",     s: "2026-05-13", e: "2026-05-20" },
  { t: "런칭 캠페인",        p: "mkt", k: "deadline", s: "2026-05-18", e: "2026-05-27" },
  { t: "API 연동",           p: "app", k: "deadline", s: "2026-05-19", e: "2026-05-22" },
  { t: "경쟁사 리서치",      p: "mkt", k: "research", s: "2026-05-20", e: "2026-05-25" },
  { t: "휴가",               p: "me",  k: "meeting",  s: "2026-05-22", e: "2026-05-24" },
  { t: "스프린트 회의",      p: "web", k: "meeting",  s: "2026-05-11", e: "2026-05-11" },
  { t: "카피 마감",          p: "mkt", k: "deadline", s: "2026-05-28", e: "2026-05-29" },
  { t: "분기 기획",          p: "web", k: "work",     s: "2026-04-27", e: "2026-05-06" },
  { t: "런칭 후속",          p: "mkt", k: "meeting",  s: "2026-05-29", e: "2026-06-02" },
];

// 특정 날짜 마커 (기간 막대와 별개). kind: event | deadline
const MARKERS = [
  { date: "2026-05-08", kind: "event",    label: "워크숍" },
  { date: "2026-05-15", kind: "deadline", label: "기획안 제출" },
  { date: "2026-05-21", kind: "event",    label: "데모데이" },
  { date: "2026-05-27", kind: "deadline", label: "런칭" },
];

const YEAR = 2026, MONTH = 5;
const TODAY = "2026-05-21";
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

// ── 색 유틸 ──
function hslToRgb(h, s, l) {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r, g, b;
  if (h < 60)       [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else              [r, g, b] = [c, 0, x];
  return [(r + m) * 255, (g + m) * 255, (b + m) * 255];
}
function relLum([r, g, b]) {
  const lin = [r, g, b].map(v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
}
function pickText(h, s, l) {
  const lum = relLum(hslToRgb(h, s, l));
  return (1.05 / (lum + 0.05)) >= ((lum + 0.05) / 0.05) ? "#FFFFFF" : "#1A1A1A";
}
function hexToRgb(h) { h = h.replace("#", ""); return [0, 2, 4].map(i => parseInt(h.substr(i, 2), 16)); }
function rgbToHex(rgb) { return "#" + rgb.map(c => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, "0")).join("").toUpperCase(); }
// 톤 적용: dark=원색 어둡게, tint=흰색 섞기
function applyTone(hex, tone) {
  const rgb = hexToRgb(hex);
  const out = tone.mode === "dark" ? rgb.map(c => c * (1 - tone.k)) : rgb.map(c => c * (1 - tone.k) + 255 * tone.k);
  return rgbToHex(out);
}
function pickTextHex(hex) {
  const lum = relLum(hexToRgb(hex));
  return (1.05 / (lum + 0.05)) >= ((lum + 0.05) / 0.05) ? "#FFFFFF" : "#1A1A1A";
}
function projById(id, pal) { return pal.projects.find(p => p.id === id); }
function typeById(id, pal) { return pal.taskTypes.find(t => t.id === id); }
function barColors(task, pal) {
  const p = projById(task.p, pal), k = typeById(task.k, pal);
  const bg = p.color ? applyTone(p.color, k) : hslToHex(p.hue, k.s, k.l);
  return { bg, fg: pickTextHex(bg) };
}
function swatch(p) { return p.color ? p.color : `hsl(${p.hue} 72% 48%)`; } // 프로젝트 대표색

// ── 날짜 유틸 ──
function d(str) { const [y, m, dd] = str.split("-").map(Number); return Date.UTC(y, m - 1, dd, 12); }
function addDays(ts, n) { return ts + n * 86400000; }
function fmtMD(ts) { const dt = new Date(ts); return `${dt.getUTCMonth() + 1}/${dt.getUTCDate()}`; }
function iso(ts) { const dt = new Date(ts); return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`; }
function dayMarkers(ts) {
  return MARKERS.filter(m => m.date === iso(ts)).map(m => m.kind === "deadline"
    ? `<span class="mk mk-dl" title="하드 데드라인 · ${m.label}">⚑ ${m.label}</span>`
    : `<span class="mk mk-ev" title="이벤트 · ${m.label}">◆ ${m.label}</span>`).join("");
}

function buildWeeks() {
  const first = Date.UTC(YEAR, MONTH - 1, 1, 12);
  const gridStart = addDays(first, -new Date(first).getUTCDay());
  const weeks = [];
  for (let w = 0; w < 6; w++) {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const ts = addDays(gridStart, w * 7 + i), dt = new Date(ts);
      days.push({ ts, day: dt.getUTCDate(), inMonth: dt.getUTCMonth() === MONTH - 1, isToday: ts === d(TODAY) });
    }
    weeks.push(days);
  }
  return weeks;
}
function layoutWeek(week) {
  const wStart = week[0].ts, wEnd = week[6].ts, segs = [];
  for (const task of TASKS) {
    const ts0 = d(task.s), ts1 = d(task.e);
    if (ts1 < wStart || ts0 > wEnd) continue;
    segs.push({
      task,
      startCol: Math.max(0, Math.round((ts0 - wStart) / 86400000)),
      endCol: Math.min(6, Math.round((ts1 - wStart) / 86400000)),
      contL: ts0 < wStart, contR: ts1 > wEnd,
    });
  }
  segs.sort((a, b) => a.startCol - b.startCol || (b.endCol - b.startCol) - (a.endCol - a.startCol));
  const laneEnds = [];
  for (const seg of segs) {
    let lane = 0;
    while (lane < laneEnds.length && laneEnds[lane] >= seg.startCol) lane++;
    laneEnds[lane] = seg.endCol; seg.lane = lane;
  }
  return segs;
}

// ── 렌더러 (opts.pal 로 팔레트 주입) ──
function renderCalendar(el, opts = {}) {
  if (!el) return;
  const pal = opts.pal || PALETTE_STD;
  const rowH = opts.rowH || 96, barH = opts.barH || 22, barGap = 3, headH = 26;
  const weeks = buildWeeks();
  let html = `<div class="cal-head">${WEEKDAYS.map((w, i) =>
    `<div class="cal-hd${i === 0 ? " sun" : i === 6 ? " sat" : ""}">${w}</div>`).join("")}</div>`;
  for (const week of weeks) {
    const segs = layoutWeek(week);
    const lanes = Math.max(1, ...segs.map(s => s.lane + 1));
    const wh = Math.max(rowH, headH + lanes * (barH + barGap) + 6);
    html += `<div class="cal-week" style="height:${wh}px">`;
    for (const dy of week)
      html += `<div class="cal-cell${dy.inMonth ? "" : " out"}${dy.isToday ? " today" : ""}"><span class="cal-daynum">${dy.day}</span></div>`;
    for (const seg of segs) {
      const { bg, fg } = barColors(seg.task, pal);
      const left = (seg.startCol / 7) * 100, width = ((seg.endCol - seg.startCol + 1) / 7) * 100;
      const top = headH + seg.lane * (barH + barGap);
      const rad = `${seg.contL ? "0" : "5px"} ${seg.contR ? "0" : "5px"} ${seg.contR ? "0" : "5px"} ${seg.contL ? "0" : "5px"}`;
      html += `<div class="cal-bar" title="${seg.task.t}" style="left:${left}%;width:calc(${width}% - 4px);top:${top}px;height:${barH}px;background:${bg};color:${fg};border-radius:${rad}">${seg.task.t}</div>`;
    }
    html += `</div>`;
  }
  el.innerHTML = html;
}
// 연속 주 생성 (from~to 월 범위)
function buildWeeksRange(fromY, fromM, toY, toM) {
  const first = Date.UTC(fromY, fromM - 1, 1, 12);
  const gridStart = addDays(first, -new Date(first).getUTCDay());
  const lastDay = Date.UTC(toY, toM, 0, 12);
  const gridEnd = addDays(lastDay, 6 - new Date(lastDay).getUTCDay());
  const weeks = [];
  for (let ts = gridStart; ts <= gridEnd; ts = addDays(ts, 7)) {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const t = addDays(ts, i), dt = new Date(t);
      days.push({ ts: t, day: dt.getUTCDate(), month: dt.getUTCMonth(), year: dt.getUTCFullYear(), isToday: t === d(TODAY) });
    }
    weeks.push(days);
  }
  return weeks;
}

// 무한 스크롤 캘린더: 월별 그룹(목요일 기준) + sticky 월 헤더
function renderInfinite(el, opts = {}) {
  if (!el) return;
  const pal = opts.pal || PALETTE_STD, rowH = opts.rowH || 84, barH = opts.barH || 20, barGap = opts.barGap || 4, headH = opts.headH || 26;
  const weeks = buildWeeksRange(opts.from.y, opts.from.m, opts.to.y, opts.to.m);
  const groups = [];
  for (const wk of weeks) {
    const th = wk[4]; // 목요일이 속한 월이 그 주의 소유 월
    const key = th.year + "-" + th.month;
    let g = groups[groups.length - 1];
    if (!g || g.key !== key) { g = { key, y: th.year, m: th.month, weeks: [] }; groups.push(g); }
    g.weeks.push(wk);
  }
  let html = "";
  for (const g of groups) {
    html += `<section class="month-sec" data-key="${g.y}-${g.m + 1}">`;
    html += `<div class="month-head"><span class="month-name">${g.y}년 ${g.m + 1}월</span><div class="cal-head">${WEEKDAYS.map((w, i) => `<div class="cal-hd${i === 0 ? " sun" : i === 6 ? " sat" : ""}">${w}</div>`).join("")}</div></div>`;
    html += `<div class="month-body">`;
    for (const week of g.weeks) {
      const segs = layoutWeek(week);
      const lanes = Math.max(1, ...segs.map(s => s.lane + 1));
      const wh = Math.max(rowH, headH + lanes * (barH + barGap) + 6);
      html += `<div class="cal-week" style="height:${wh}px">`;
      for (const dy of week)
        html += `<div class="cal-cell${dy.month !== g.m ? " out" : ""}${dy.isToday ? " today" : ""}"><span class="cal-daynum">${dy.day}</span>${dayMarkers(dy.ts)}</div>`;
      for (const seg of segs) {
        const { bg, fg } = barColors(seg.task, pal);
        const left = (seg.startCol / 7) * 100, width = ((seg.endCol - seg.startCol + 1) / 7) * 100;
        const top = headH + seg.lane * (barH + barGap);
        const rad = `${seg.contL ? "0" : "5px"} ${seg.contR ? "0" : "5px"} ${seg.contR ? "0" : "5px"} ${seg.contL ? "0" : "5px"}`;
        html += `<div class="cal-bar" title="${seg.task.t}" style="left:${left}%;width:calc(${width}% - 4px);top:${top}px;height:${barH}px;background:${bg};color:${fg};border-radius:${rad}">${seg.task.t}</div>`;
      }
      html += `</div>`;
    }
    html += `</div></section>`;
  }
  el.innerHTML = html;
  const t = el.querySelector(".cal-cell.today");
  if (t) t.scrollIntoView({ block: "center" });
}

function renderProjectList(el, opts = {}) {
  if (!el) return;
  const pal = opts.pal || PALETTE_STD;
  el.innerHTML = pal.projects.map(p =>
    `<label class="proj-item${opts.compact ? " compact" : ""}"><input type="checkbox" checked><span class="proj-dot" style="background:${swatch(p)}"></span><span class="proj-name">${p.name}</span></label>`).join("");
}
function renderLegend(el, opts = {}) {
  if (!el) return;
  const pal = opts.pal || PALETTE_STD, rep = pal.projects[0];
  el.innerHTML = pal.taskTypes.map(k => {
    const bg = rep.color ? applyTone(rep.color, k) : hslToHex(rep.hue, k.s, k.l);
    return `<span class="legend-chip" style="background:${bg};color:${pickTextHex(bg)}">${k.name}</span>`;
  }).join("");
}
function renderTaskPanel(el, opts = {}) {
  if (!el) return;
  const pal = opts.pal || PALETTE_STD;
  const sorted = [...TASKS].sort((a, b) => d(a.s) - d(b.s));
  el.innerHTML = sorted.map(task => {
    const p = projById(task.p, pal), k = typeById(task.k, pal);
    const range = task.s === task.e ? fmtMD(d(task.s)) : `${fmtMD(d(task.s))} – ${fmtMD(d(task.e))}`;
    return `<div class="tp-item${opts.compact ? " compact" : ""}"><span class="tp-dot" style="background:${swatch(p)}"></span><div class="tp-body"><div class="tp-title">${task.t}</div><div class="tp-meta">${range} · ${p.name} · ${k.name}</div></div></div>`;
  }).join("");
}
function renderProjectTabs(el, opts = {}) {
  if (!el) return;
  const pal = opts.pal || PALETTE_STD;
  el.innerHTML = `<button class="ptab on">전체</button>` + pal.projects.map(p =>
    `<button class="ptab"><span class="pd" style="background:${swatch(p)}"></span>${p.name}</button>`).join("");
}

function hslToHex(h, s, l) {
  const [r, g, b] = hslToRgb(h, s, l);
  return "#" + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
}
// 8색조 × 4톤 스와치 매트릭스
function renderSwatchMatrix(el, sc) {
  if (!el) return;
  const cols = sc.colors || sc.hues; // [name, value] (value = hex 또는 hue)
  let html = `<div class="sw-title">${sc.name}</div><div class="sw-grid" style="grid-template-columns:64px repeat(${cols.length},1fr)">`;
  html += `<div class="sw-corner"></div>`;
  for (const [cn] of cols) html += `<div class="sw-colh">${cn}</div>`;
  for (const tone of sc.tones) {
    html += `<div class="sw-rowh">${tone.name}</div>`;
    for (const [, val] of cols) {
      const hex = sc.colors ? applyTone(val, tone) : hslToHex(val, tone.s, tone.l);
      html += `<div class="sw-cell" style="background:${hex};color:${pickTextHex(hex)}">${hex}</div>`;
    }
  }
  html += `</div>`;
  el.innerHTML = html;
}

function init() {
  // 표준 팔레트 변형
  renderCalendar(document.getElementById("cal-A"), { rowH: 96 });
  renderCalendar(document.getElementById("cal-B"), { rowH: 104 });
  renderCalendar(document.getElementById("cal-C"), { rowH: 64 });
  renderCalendar(document.getElementById("cal-D"), { rowH: 128 });
  renderProjectList(document.getElementById("proj-A"));
  renderProjectList(document.getElementById("proj-D"));
  renderLegend(document.getElementById("legend-A"));
  renderLegend(document.getElementById("legend-C"));
  renderLegend(document.getElementById("legend-D"));
  renderTaskPanel(document.getElementById("tp-A"));
  renderTaskPanel(document.getElementById("tp-B"));
  renderTaskPanel(document.getElementById("tp-C"), { compact: true });
  renderTaskPanel(document.getElementById("tp-D"));
  const railB = document.getElementById("proj-B-rail");
  if (railB) railB.innerHTML = PROJECTS.map(p => `<div class="rdot" title="${p.name}" style="background:${swatch(p)}"></div>`).join("");

  // F — 에디토리얼, 무한 스크롤 캘린더 (ED 팔레트)
  renderProjectTabs(document.getElementById("ptabs-F"), { pal: PALETTE_ED });
  renderLegend(document.getElementById("legend-F"), { pal: PALETTE_ED });
  const calF = document.getElementById("cal-F");
  renderInfinite(calF, { pal: PALETTE_ED, rowH: 116, barH: 22, barGap: 5, headH: 34, from: { y: 2026, m: 1 }, to: { y: 2026, m: 12 } });
  renderTaskPanel(document.getElementById("tp-F"), { pal: PALETTE_ED, compact: true });
  document.querySelectorAll("#F .numbadge").forEach(b => b.textContent = TASKS.length);
  // 타이틀이 스크롤 위치(현재 월)를 따라가기
  if (calF) {
    const wrapF = calF.closest(".ed-calwrap"), ttlF = document.querySelector("#F .ed-ttl");
    const updTitle = () => {
      if (!wrapF || !ttlF) return;
      const top = wrapF.getBoundingClientRect().top;
      let cur = null;
      calF.querySelectorAll(".month-sec").forEach(s => { if (s.getBoundingClientRect().top - top <= 8) cur = s; });
      if (cur) { const [y, m] = cur.dataset.key.split("-"); ttlF.innerHTML = `${y}<span class="sl">/</span>${m.padStart(2, "0")}`; }
    };
    if (wrapF) { wrapF.addEventListener("scroll", updTitle); updTitle(); }
    const todayBtn = document.querySelector("#F .ed-today");
    if (todayBtn) todayBtn.addEventListener("click", () => { const t = calF.querySelector(".cal-cell.today"); if (t) t.scrollIntoView({ block: "center", behavior: "smooth" }); });
  }

  // 그리드 시안 3종 (에디토리얼 팔레트)
  renderCalendar(document.getElementById("cal-G1"), { pal: PALETTE_ED, rowH: 78, barH: 20 });
  renderCalendar(document.getElementById("cal-G2"), { pal: PALETTE_ED, rowH: 80, barH: 20 });
  renderCalendar(document.getElementById("cal-G3"), { pal: PALETTE_ED, rowH: 88, barH: 20 });

  // 팔레트 쇼케이스
  renderSwatchMatrix(document.getElementById("sw-ed"), SHOWCASE_ED);
  renderSwatchMatrix(document.getElementById("sw-std"), SHOWCASE_STD);

  const tabs = document.querySelectorAll(".tab"), variants = document.querySelectorAll(".variant");
  tabs.forEach(tab => tab.addEventListener("click", () => {
    tabs.forEach(t => t.classList.remove("active"));
    tab.classList.add("active");
    variants.forEach(v => v.classList.toggle("hidden", v.id !== tab.dataset.target));
  }));
}
if (typeof document !== "undefined") document.addEventListener("DOMContentLoaded", init);
