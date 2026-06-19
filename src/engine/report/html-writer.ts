import { writeFileSync } from "node:fs";
import type {
  CoverageResults,
  OperationCoverage,
  OperationCoverageState,
} from "../results.js";
import { MESSAGES, t as translate, type Locale, type MessageKey } from "../i18n.js";
import { formatNumber } from "./number-format.js";

export const DEFAULT_HTML_FILENAME = "pw-radar-report.html";

export type { Locale } from "../i18n.js";

export interface HtmlWriterOptions {
  filename?: string;
  /** Initial language; all languages are embedded with a runtime switcher. */
  locale?: Locale;
  /** Initial theme key (e.g. "tech", "terminal", "monochrome", "cyber"). All themes are embedded. */
  theme?: string;
  /** Percentage display pattern, e.g. "0.##" (default "0.###"). */
  numberFormat?: string;
}

function esc(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Inlines a value into a <script> safely (prevents </script> / tag breakouts). */
function jsonForScript(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

/**
 * A localized `<span>` carrying its catalog key (and params) so the in-page
 * switcher can re-render it in another language.
 */
function msgSpan(
  loc: Locale,
  key: MessageKey,
  params?: Record<string, string>,
  cls?: string,
): string {
  const text = translate(loc, key, params);
  const args = params ? ` data-i18n-args="${esc(JSON.stringify(params))}"` : "";
  const classAttr = cls ? ` class="${cls}"` : "";
  return `<span${classAttr} data-i18n="${key}"${args}>${esc(text)}</span>`;
}

const THEMES: Record<string, Record<string, string>> = {
  tech: {
    "--full": "#1B4332", "--partial": "#B45309", "--empty": "#7F1D1D", "--deprecated": "#6B7280",
    "--accent": "#1D3557", "--method-col": "#1D3557",
    "--bg": "#FDFCF8", "--card": "#F0EEE5", "--ink": "#0A0A0A", "--line": "#0A0A0A", "--soft": "#4A4A4A",
    "--font-body": "'IBM Plex Mono','SF Mono',monospace",
    "--bg-image": "linear-gradient(rgba(10,10,10,0.06) 1px,transparent 1px),linear-gradient(90deg,rgba(10,10,10,0.06) 1px,transparent 1px)",
    "--bg-size": "24px 24px", "--shadow-offset": "4px", "--group-hd-text": "#fff",
  },
  terminal: {
    "--full": "#3FB950", "--partial": "#D29922", "--empty": "#F85149", "--deprecated": "#8B949E",
    "--accent": "#58A6FF", "--method-col": "#58A6FF",
    "--bg": "#0D1117", "--card": "#161B22", "--ink": "#C9D1D9", "--line": "#30363D", "--soft": "#8B949E",
    "--font-body": "'IBM Plex Mono','SF Mono',monospace",
    "--bg-image": "linear-gradient(rgba(201,209,217,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(201,209,217,0.05) 1px,transparent 1px)",
    "--bg-size": "24px 24px", "--shadow-offset": "0px", "--group-hd-text": "#fff",
  },
  monochrome: {
    "--full": "#059669", "--partial": "#D97706", "--empty": "#B91C1C", "--deprecated": "#9CA3AF",
    "--accent": "#000000", "--method-col": "#000000",
    "--bg": "#FFFFFF", "--card": "#F5F5F5", "--ink": "#000000", "--line": "#000000", "--soft": "#666666",
    "--font-body": "'IBM Plex Mono','SF Mono',monospace",
    "--bg-image": "linear-gradient(rgba(0,0,0,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,0.05) 1px,transparent 1px)",
    "--bg-size": "24px 24px", "--shadow-offset": "4px", "--group-hd-text": "#fff",
  },
  cyber: {
    "--full": "#00FF41", "--partial": "#FFEA00", "--empty": "#FF003C", "--deprecated": "#A0A0A0",
    "--accent": "#8B5CF6", "--method-col": "#8B5CF6",
    "--bg": "#0F0F0F", "--card": "#1A1A1A", "--ink": "#FFFFFF", "--line": "#FFFFFF", "--soft": "#A0A0A0",
    "--font-body": "'IBM Plex Mono','SF Mono',monospace",
    "--bg-image": "linear-gradient(rgba(255,255,255,0.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.05) 1px,transparent 1px)",
    "--bg-size": "24px 24px", "--shadow-offset": "4px", "--group-hd-text": "#0A0A0A",
  },
};

const STATE_ORDER: OperationCoverageState[] = ["empty", "partial", "full", "deprecated"];

const STATE_SYM: Record<OperationCoverageState, string> = {
  full: "●", partial: "◐", empty: "○", deprecated: "—",
};

function operationItem(op: OperationCoverage, loc: Locale): string {
  const conds = op.conditions
    .map((c) => {
      const mark = c.covered ? "●" : "○";
      const cls = c.covered ? "cov" : "unc";
      const name = msgSpan(loc, c.nameKey as MessageKey, c.nameParams);
      const reason = c.reasonKey
        ? ` <span class="reason">${msgSpan(loc, c.reasonKey as MessageKey, c.reasonParams)}</span>`
        : "";
      return `<li class="${cls}"><span class="mark">${mark}</span>${name}${reason}</li>`;
    })
    .join("");
  return `<div class="op-item">
  <div class="op-hd">
    <div><span class="method">${esc(op.method)}</span><span class="path">${esc(op.path)}</span></div>
    <span class="op-stats">${op.processCount} ${msgSpan(loc, "calls")} · ${op.coveredConditionCount}/${op.conditionCount}</span>
  </div>
  <ul class="cond-list">${conds || `<li class="muted">—</li>`}</ul>
</div>`;
}

function operationGroup(state: OperationCoverageState, results: CoverageResults, loc: Locale): string {
  const ops = results.operations.filter((o) => o.state === state);
  if (ops.length === 0) return "";
  const sym = STATE_SYM[state];
  return `<div class="op-group ${state}">
  <div class="op-gd"><span>${sym} ${msgSpan(loc, state)} (${ops.length})</span></div>
  ${ops.map((o) => operationItem(o, loc)).join("\n")}
</div>`;
}

function summaryBar(results: CoverageResults, loc: Locale, nf: string): string {
  const s = results.summary;
  const ts = results.tagStats;
  const tagsTotal = ts.length;
  const tagsFull = ts.filter((t) => t.full === t.total && t.total > 0).length;
  const sub = [
    tagsTotal > 0 ? `${tagsFull}/${tagsTotal} ${msgSpan(loc, "tags")}` : "",
    `${s.conditionsCovered}/${s.conditionsTotal} ${msgSpan(loc, "conditions")}`,
    `${s.total} ${msgSpan(loc, "operations")}`,
  ].filter(Boolean).join(" · ");

  return `<section id="summary">
<h2><span class="sec-num">/01</span> ${msgSpan(loc, "coverage")}</h2>
<div class="coverage-meter">
  <div class="cov-pct">${formatNumber(s.fullPercent, nf)}%</div>
  <div class="cov-bar">
    ${s.fullPercent > 0 ? `<div class="cov-seg full" style="width:${s.fullPercent.toFixed(2)}%"></div>` : ""}
    ${s.partialPercent > 0 ? `<div class="cov-seg partial" style="width:${s.partialPercent.toFixed(2)}%"></div>` : ""}
  </div>
  <div class="status-indicators">
    <span class="status-item full">● ${msgSpan(loc, "full")}: ${s.full}</span>
    <span class="status-item partial">◐ ${msgSpan(loc, "partial")}: ${s.partial}</span>
    <span class="status-item empty">○ ${msgSpan(loc, "empty")}: ${s.empty}</span>
  </div>
  <div class="cov-sub">${sub}</div>
</div>
</section>`;
}

function tagsTable(results: CoverageResults, loc: Locale): string {
  if (results.tagStats.length === 0) return "";
  const rows = results.tagStats
    .map(
      (tag) =>
        `<tr><td>${esc(tag.tag)}</td><td class="full">${tag.full}</td><td class="partial">${tag.partial}</td><td class="empty">${tag.empty}</td><td>${tag.total}</td></tr>`,
    )
    .join("");
  return `<section id="tags">
<h2><span class="sec-num">/03</span> ${msgSpan(loc, "tags")}</h2>
<table><thead><tr><th>${msgSpan(loc, "tags")}</th><th>${msgSpan(loc, "full")}</th><th>${msgSpan(loc, "partial")}</th><th>${msgSpan(loc, "empty")}</th><th>${msgSpan(loc, "operations")}</th></tr></thead>
<tbody>${rows}</tbody></table></section>`;
}

function conditionStatsTable(results: CoverageResults, loc: Locale, nf: string): string {
  if (results.conditionStats.length === 0) return "";
  const rows = results.conditionStats
    .map((c) => {
      const pct = c.total === 0 ? 0 : (c.covered / c.total) * 100;
      return `<tr><td>${esc(c.type)}</td><td>${c.covered}</td><td>${c.total}</td><td>${formatNumber(pct, nf)}%</td></tr>`;
    })
    .join("");
  return `<section id="conditions">
<h2><span class="sec-num">/04</span> ${msgSpan(loc, "conditionTypes")}</h2>
<table><thead><tr><th>type</th><th>${msgSpan(loc, "covered")}</th><th>${msgSpan(loc, "total")}</th><th>%</th></tr></thead>
<tbody>${rows}</tbody></table></section>`;
}

function neverAndMissedSection(results: CoverageResults, loc: Locale): string {
  const zero = results.operations.filter((o) => o.processCount === 0 && o.state !== "deprecated");
  const missed = results.missed;
  if (zero.length === 0 && missed.length === 0) return "";
  const zeroBlock = zero.length > 0
    ? `<div class="list-block"><h3>${msgSpan(loc, "zeroCall")} (${zero.length})</h3>
       <ul>${zero.map((o) => `<li>${esc(o.method)} ${esc(o.path)}</li>`).join("")}</ul></div>`
    : "";
  const missedBlock = missed.length > 0
    ? `<div class="list-block"><h3>${msgSpan(loc, "missed")} (${missed.length})</h3>
       <ul>${missed.map((m) => `<li>${esc(m.method)} ${esc(m.path)} <span class="muted">×${m.count}</span></li>`).join("")}</ul></div>`
    : "";
  return `<section id="never-missed">
<h2><span class="sec-num">/05</span> ${msgSpan(loc, "zeroCall")} &amp; ${msgSpan(loc, "missed")}</h2>
${zeroBlock}${missedBlock}</section>`;
}

function generationSection(results: CoverageResults, loc: Locale): string {
  const g = results.generation;
  const rows: string[] = [];
  if (g.specSource) rows.push(`<tr><th>${msgSpan(loc, "specSource")}</th><td>${esc(g.specSource)}</td></tr>`);
  rows.push(`<tr><th>${msgSpan(loc, "filesRead")}</th><td>${g.fileCount ?? "—"}</td></tr>`);
  rows.push(`<tr><th>${msgSpan(loc, "callsRecorded")}</th><td>${g.callCount}</td></tr>`);
  rows.push(`<tr><th>${msgSpan(loc, "generated")}</th><td>${esc(results.generatedAt)}</td></tr>`);
  return `<section id="generation">
<h2><span class="sec-num">/06</span> ${msgSpan(loc, "generation")}</h2>
<table><tbody>${rows.join("")}</tbody></table></section>`;
}

const STYLE = `
:root{
  --full:#1faa59;--partial:#ba9443;--empty:#d92d1a;--deprecated:#9a958c;
  --accent:#ff3b00;--method-col:#ff3b00;
  --bg:#d9d7d0;--card:#f6f5f1;--ink:#171614;--line:#171614;--soft:#8a857b;
  --bg-image:radial-gradient(#d9d7d0 1px,transparent 1px);--bg-size:7px 7px;
  --font-body:'Helvetica Neue',Arial,sans-serif;
  --shadow-offset:0px;--group-hd-text:#fff;
}
*{box-sizing:border-box}
body{font-family:var(--font-body);margin:0;background:var(--bg);color:var(--ink);
  background-image:var(--bg-image);background-size:var(--bg-size)}

/* header */
header{background:var(--bg);color:var(--ink);border-bottom:2px solid var(--line);
  padding:14px 22px;display:flex;justify-content:space-between;align-items:baseline;
  flex-wrap:wrap;gap:16px;position:sticky;top:0;z-index:10}
.header-brand{font-size:1.4rem;font-weight:700;text-transform:lowercase;letter-spacing:.02em;white-space:nowrap}
.header-brand::before{content:'◉ ';font-size:.9em;opacity:.7}
.header-nav{display:flex;gap:10px;flex-wrap:wrap;font-size:.8rem;font-weight:500;
  text-transform:uppercase;letter-spacing:.08em}
.header-nav a{color:var(--ink);text-decoration:none;border-bottom:1px solid transparent;transition:border-color .2s}
.header-nav a:hover{border-bottom:1px solid var(--line)}
.header-nav .sep{color:var(--soft);font-weight:400}

/* layout */
main{max-width:1100px;margin:0 auto;padding:24px 24px 60px}
section{margin-bottom:48px}

/* h2 */
h2{font-size:1rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;
  margin-bottom:16px;padding-bottom:8px;border-bottom:2px solid var(--line);
  display:flex;align-items:center;gap:10px}
h2::before{content:'/';color:var(--soft);font-weight:400;flex-shrink:0}
.sec-num{color:var(--soft);font-weight:400;font-size:.85em}
.muted{color:var(--soft)}

/* coverage */
.coverage-meter{background:var(--card);border:2px solid var(--line);padding:20px 24px;
  box-shadow:var(--shadow-offset) var(--shadow-offset) 0 var(--line)}
.cov-pct{font-size:3rem;font-weight:700;line-height:1;margin-bottom:14px;
  font-family:'SF Mono',ui-monospace,Menlo,monospace}
.cov-bar{height:26px;background:var(--bg);border:2px solid var(--line);margin-bottom:18px;display:flex;overflow:hidden}
.cov-seg{height:100%}
.cov-seg.full{background:var(--full);
  background-image:repeating-linear-gradient(45deg,transparent,transparent 4px,rgba(255,255,255,0.1) 4px,rgba(255,255,255,0.1) 8px)}
.cov-seg.partial{background:var(--partial)}
.status-indicators{display:flex;gap:20px;flex-wrap:wrap;margin-bottom:10px;font-weight:600;
  font-family:'SF Mono',ui-monospace,Menlo,monospace;font-size:13px}
.status-item.full{color:var(--full)}.status-item.partial{color:var(--partial)}.status-item.empty{color:var(--empty)}
.cov-sub{font-size:.85rem;color:var(--soft);border-top:1px dashed var(--line);padding-top:10px;margin-top:10px;
  font-family:'SF Mono',ui-monospace,Menlo,monospace}

/* operation groups */
.op-group{border:2px solid var(--line);margin:0 0 20px;
  box-shadow:var(--shadow-offset) var(--shadow-offset) 0 var(--line)}
.op-gd{padding:10px 16px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;
  color:var(--group-hd-text);border-bottom:2px solid var(--line);
  display:flex;justify-content:space-between;font-size:.85rem;
  font-family:'SF Mono',ui-monospace,Menlo,monospace}
.op-group.empty .op-gd{background:var(--empty)}
.op-group.partial .op-gd{background:var(--partial)}
.op-group.full .op-gd{background:var(--full)}
.op-group.deprecated .op-gd{background:var(--deprecated)}
.op-item{padding:14px 16px;border-bottom:1px solid var(--bg);
  font-family:'SF Mono',ui-monospace,Menlo,monospace}
.op-item:last-child{border-bottom:none}
.op-hd{display:flex;justify-content:space-between;align-items:baseline;
  margin-bottom:10px;flex-wrap:wrap;gap:8px;font-size:13px}
.method{font-weight:700;text-transform:uppercase;color:var(--method-col);margin-right:6px}
.path{font-weight:600;color:var(--ink)}
.op-stats{color:var(--soft);font-size:.85rem}
.cond-list{list-style:none;padding:0;margin:0}
.cond-list li{padding:4px 0;display:flex;align-items:flex-start;gap:8px;font-size:.9rem}
.cond-list .cov{color:var(--full);font-weight:700}
.cond-list .unc{color:var(--empty);font-weight:700}
.mark{font-size:1.1rem;line-height:1;margin-top:1px;flex-shrink:0}
.reason{color:var(--soft);font-size:.85rem;font-style:italic;margin-left:4px}

/* tables */
table{width:100%;border-collapse:collapse;border:2px solid var(--line);margin-bottom:16px;background:var(--bg)}
th,td{border:1px solid var(--line);padding:8px 12px;text-align:left;
  font-family:'SF Mono',ui-monospace,Menlo,monospace;font-size:.85rem}
th{background:var(--ink);color:var(--bg);font-weight:700;text-transform:uppercase;
  font-size:.78rem;letter-spacing:.1em}
tr:nth-child(even) td{background:var(--card)}
td.full{color:var(--full)}td.partial{color:var(--partial)}td.empty{color:var(--empty)}

/* never called / missed */
.list-block{margin-bottom:16px}
.list-block h3{font-size:.85rem;font-weight:700;margin-bottom:8px;text-transform:uppercase;
  letter-spacing:.05em;color:var(--soft);font-family:'SF Mono',ui-monospace,Menlo,monospace}
.list-block ul{list-style:none}
.list-block li{padding:5px 0;border-bottom:1px dashed var(--line);font-size:.9rem;font-weight:500;
  font-family:'SF Mono',ui-monospace,Menlo,monospace}
.list-block li:last-child{border-bottom:none}

/* footer */
footer{margin-top:60px;padding-top:20px;border-top:2px solid var(--line);
  font-family:var(--font-body)}
.footer-controls{display:flex;flex-wrap:wrap;gap:24px;align-items:center;
  margin-bottom:16px;padding-bottom:16px;border-bottom:1px dashed var(--line)}
.control-group{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.control-label{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;
  color:var(--soft);margin-right:4px}
.theme-btn,.lang-btn{padding:4px 10px;font-family:var(--font-body);font-size:.7rem;font-weight:600;
  text-transform:uppercase;letter-spacing:.05em;background:var(--bg);color:var(--ink);
  border:1px solid var(--line);cursor:pointer;transition:all .15s}
.theme-btn:hover,.lang-btn:hover{background:var(--ink);color:var(--bg)}
.theme-btn.active,.lang-btn.active{background:var(--ink);color:var(--bg)}
.footer-status{display:flex;justify-content:space-between;flex-wrap:wrap;gap:12px;
  font-size:.75rem;font-weight:600;text-transform:uppercase;letter-spacing:.1em;color:var(--soft)}
.f-status{color:var(--full)}
`;

/** Inline runtime language switcher (self-contained, no deps). */
function i18nScript(initialLocale: Locale, specTitle: string): string {
  return `<script>
(function(){
  var I18N=${jsonForScript(MESSAGES)};
  var SPEC=${jsonForScript(specTitle)};
  var SEP=SPEC?SPEC+" — ":"";
  function fmt(tpl,args){return tpl.replace(/\\{(\\w+)\\}/g,function(_,k){return args&&args[k]!=null?args[k]:"{"+k+"}";});}
  function apply(loc){
    var dict=I18N[loc];
    if(!dict)return;
    document.documentElement.lang=loc;
    document.querySelectorAll("[data-i18n]").forEach(function(el){
      var k=el.getAttribute("data-i18n");
      if(dict[k]==null)return;
      var a=el.getAttribute("data-i18n-args"),args=null;
      if(a){try{args=JSON.parse(a);}catch(e){}}
      el.textContent=args?fmt(dict[k],args):dict[k];
    });
    document.title=SEP+(dict.title||"");
    document.querySelectorAll("[data-lang]").forEach(function(b){
      b.classList.toggle("active",b.getAttribute("data-lang")===loc);
    });
    try{localStorage.setItem("pw-radar-locale",loc);}catch(e){}
  }
  document.addEventListener("click",function(e){
    var b=e.target.closest&&e.target.closest("[data-lang]");
    if(b)apply(b.getAttribute("data-lang"));
  });
  var saved;try{saved=localStorage.getItem("pw-radar-locale");}catch(e){}
  if(saved&&saved!==${jsonForScript(initialLocale)})apply(saved);
})();
</script>`;
}

function themeScript(): string {
  return `<script>
(function(){
  var T=${jsonForScript(THEMES)};
  function apply(key){
    var t=T[key];if(!t)return;
    var r=document.documentElement;
    for(var tk in T)for(var v in T[tk])r.style.removeProperty(v);
    for(var k in t)r.style.setProperty(k,t[k]);
    document.querySelectorAll('[data-theme]').forEach(function(b){
      b.classList.toggle('active',b.getAttribute('data-theme')===key);
    });
    try{localStorage.setItem('pw-radar-theme',key);}catch(e){}
  }
  document.addEventListener('click',function(e){
    var b=e.target.closest&&e.target.closest('[data-theme]');
    if(b)apply(b.getAttribute('data-theme'));
  });
  var saved;try{saved=localStorage.getItem('pw-radar-theme');}catch(e){}
  if(saved&&T[saved])apply(saved);
})();
</script>`;
}

/** Renders a self-contained HTML report with an in-page language switcher. */
export function renderHtml(results: CoverageResults, locale: Locale = "en", numberFormat = "0.###", initialTheme = ""): string {
  const loc: Locale = MESSAGES[locale] ? locale : "en";

  const headTitle = MESSAGES[loc].title;

  const langButtons = (Object.keys(MESSAGES) as Locale[])
    .map((l) => `<button class="lang-btn${l === loc ? " active" : ""}" data-lang="${l}">${l.toUpperCase()}</button>`)
    .join("");

  const activeTheme = THEMES[initialTheme] ? initialTheme : Object.keys(THEMES)[0];
  const themeButtons = Object.keys(THEMES)
    .map((t) => `<button class="theme-btn${t === activeTheme ? " active" : ""}" data-theme="${t}">${t.toUpperCase()}</button>`)
    .join("");
  const themeVars = Object.entries(THEMES[activeTheme])
    .map(([k, v]) => `${k}:${v}`)
    .join(";");
  const themeInit = `<style>:root{${themeVars}}</style>`;

  const opGroups = STATE_ORDER.map((s) => operationGroup(s, results, loc)).filter(Boolean).join("\n");
  const body = [
    summaryBar(results, loc, numberFormat),
    opGroups ? `<section id="operations">\n<h2><span class="sec-num">/02</span> ${msgSpan(loc, "navOperations")}</h2>\n${opGroups}\n</section>` : "",
    tagsTable(results, loc),
    conditionStatsTable(results, loc, numberFormat),
    neverAndMissedSection(results, loc),
    generationSection(results, loc),
  ]
    .filter(Boolean)
    .join("\n");

  const navItems: [string, MessageKey][] = [
    ["#summary", "navSummary"],
    ["#operations", "navOperations"],
    ["#tags", "tags"],
    ["#conditions", "conditions"],
    ["#generation", "generation"],
  ];
  const nav = navItems
    .map(([href, key], i) =>
      `${i > 0 ? '<span class="sep">/</span>' : ""}<a href="${href}">${msgSpan(loc, key)}</a>`,
    )
    .join("");

  return `<!doctype html>
<html lang="${loc}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(headTitle)}</title>
<style>${STYLE}</style>
${themeInit}
</head>
<body>
<header>
  <div class="header-brand"><span data-i18n="title">${esc(MESSAGES[loc].title)}</span></div>
  <nav class="header-nav">${nav}</nav>
</header>
<main>
${body}
</main>
<footer>
  <div class="footer-controls">
    <div class="control-group">
      <span class="control-label">Theme</span>
      ${themeButtons}
    </div>
    <div class="control-group">
      <span class="control-label">Lang</span>
      ${langButtons}
    </div>
  </div>
  <div class="footer-status">
    <div class="f-status">CONNECTION SECURE ●</div>
    <div>SCN: 0007 · NODE: RADAR_01</div>
  </div>
</footer>
${i18nScript(loc, results.specTitle ?? "")}
${themeScript()}
</body>
</html>`;
}

/** Renders and writes the HTML report to disk. */
export function writeHtmlReport(results: CoverageResults, options: HtmlWriterOptions = {}): string {
  const filename = options.filename ?? DEFAULT_HTML_FILENAME;
  writeFileSync(filename, renderHtml(results, options.locale ?? "en", options.numberFormat, options.theme));
  return filename;
}
