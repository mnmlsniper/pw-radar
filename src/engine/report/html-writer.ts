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

const STATE_ORDER: OperationCoverageState[] = ["empty", "partial", "full", "deprecated"];

function operationCard(op: OperationCoverage, loc: Locale): string {
  const conditions = op.conditions
    .map((c) => {
      const mark = c.covered ? "●" : "○";
      const cls = c.covered ? "cov" : "unc";
      const name = msgSpan(loc, c.nameKey as MessageKey, c.nameParams);
      const reason = c.reasonKey
        ? ` ${msgSpan(loc, c.reasonKey as MessageKey, c.reasonParams, "reason")}`
        : "";
      return `<li class="${cls}"><span class="mark">${mark}</span> ${name}${reason}</li>`;
    })
    .join("");
  return `<details class="op op-${op.state}">
  <summary>
    <span class="led"></span>
    <span class="method">${esc(op.method)}</span>
    <span class="path">${esc(op.path)}</span>
    <span class="badge">${op.coveredConditionCount}/${op.conditionCount}</span>
    <span class="calls">${op.processCount} ${msgSpan(loc, "calls")}</span>
  </summary>
  <ul class="conditions">${conditions || "<li class='muted'>—</li>"}</ul>
</details>`;
}

function section(state: OperationCoverageState, results: CoverageResults, loc: Locale): string {
  const ops = results.operations.filter((o) => o.state === state);
  if (ops.length === 0) return "";
  return `<section>
  <h2 class="h-${state}">${msgSpan(loc, state)} <span class="count">(${ops.length})</span></h2>
  ${ops.map((o) => operationCard(o, loc)).join("\n")}
</section>`;
}

function summaryBar(results: CoverageResults, loc: Locale, nf: string): string {
  const s = results.summary;
  const bar = (cls: string, pct: number): string =>
    pct > 0 ? `<div class="seg ${cls}" style="width:${pct}%">${formatNumber(pct, nf)}%</div>` : "";
  return `<div class="summary">
  <div class="readout">
    <div class="big"><span class="num">${formatNumber(s.fullPercent, nf)}</span><span class="pct">%</span></div>
    <div class="rlabel">${msgSpan(loc, "full")} ${msgSpan(loc, "coverage")}</div>
  </div>
  <div class="bar">
    ${bar("full", s.fullPercent)}
    ${bar("partial", s.partialPercent)}
    ${bar("empty", s.emptyPercent)}
  </div>
  <div class="legend">
    <span class="chip full"><i></i>${msgSpan(loc, "full")} ${s.full}</span>
    <span class="chip partial"><i></i>${msgSpan(loc, "partial")} ${s.partial}</span>
    <span class="chip empty"><i></i>${msgSpan(loc, "empty")} ${s.empty}</span>
    ${s.deprecated ? `<span class="chip deprecated"><i></i>${msgSpan(loc, "deprecated")} ${s.deprecated}</span>` : ""}
    <span class="chip muted">${msgSpan(loc, "conditions")} ${s.conditionsCovered}/${s.conditionsTotal}</span>
  </div>
</div>`;
}

function generationSection(results: CoverageResults, loc: Locale): string {
  const g = results.generation;
  const rows: string[] = [];
  if (g.specSource) rows.push(`<tr><td>${msgSpan(loc, "specSource")}</td><td>${esc(g.specSource)}</td></tr>`);
  rows.push(`<tr><td>${msgSpan(loc, "filesRead")}</td><td>${g.fileCount ?? "—"}</td></tr>`);
  rows.push(`<tr><td>${msgSpan(loc, "callsRecorded")}</td><td>${g.callCount}</td></tr>`);
  rows.push(`<tr><td>${msgSpan(loc, "generated")}</td><td>${esc(results.generatedAt)}</td></tr>`);
  return `<section><h2>${msgSpan(loc, "generation")}</h2>
  <table class="tags"><tbody>${rows.join("")}</tbody></table></section>`;
}

function tagsTable(results: CoverageResults, loc: Locale): string {
  if (results.tagStats.length === 0) return "";
  const rows = results.tagStats
    .map(
      (tag) =>
        `<tr><td>${esc(tag.tag)}</td><td class="full">${tag.full}</td><td class="partial">${tag.partial}</td><td class="empty">${tag.empty}</td><td>${tag.total}</td></tr>`,
    )
    .join("");
  return `<section><h2>${msgSpan(loc, "tags")}</h2>
  <table class="tags"><thead><tr><th>${msgSpan(loc, "tags")}</th><th>${msgSpan(loc, "full")}</th><th>${msgSpan(loc, "partial")}</th><th>${msgSpan(loc, "empty")}</th><th>${msgSpan(loc, "operations")}</th></tr></thead>
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
  return `<section><h2>${msgSpan(loc, "conditionTypes")}</h2>
  <table class="tags"><thead><tr><th>type</th><th>${msgSpan(loc, "covered")}</th><th>${msgSpan(loc, "total")}</th><th>%</th></tr></thead>
  <tbody>${rows}</tbody></table></section>`;
}

function zeroCallSection(results: CoverageResults, loc: Locale): string {
  const zero = results.operations.filter((o) => o.processCount === 0 && o.state !== "deprecated");
  if (zero.length === 0) return "";
  const items = zero.map((o) => `<li>${esc(o.method)} ${esc(o.path)}</li>`).join("");
  return `<section><h2>${msgSpan(loc, "zeroCall")} <span class="count">(${zero.length})</span></h2>
  <ul class="missed">${items}</ul></section>`;
}

function missedSection(results: CoverageResults, loc: Locale): string {
  if (results.missed.length === 0) return "";
  const items = results.missed
    .map((m) => `<li>${esc(m.method)} ${esc(m.path)} <span class="muted">×${m.count}</span></li>`)
    .join("");
  return `<section><h2>${msgSpan(loc, "missed")} <span class="count">(${results.missed.length})</span></h2>
  <ul class="missed">${items}</ul></section>`;
}

const STYLE = `
/* Teenage Engineering inspired: warm grey, black, signature orange, LED dots, monospace data */
:root{
  --full:#1faa59;--partial:#f59e00;--empty:#d92d1a;--deprecated:#9a958c;
  --accent:#ff3b00;--bg:#d9d7d0;--panel:#eceae3;--card:#f6f5f1;--ink:#171614;--line:#171614;--soft:#8a857b;
}
*{box-sizing:border-box}
body{font-family:'Helvetica Neue',Arial,sans-serif;margin:0;background:var(--bg);color:var(--ink);
  background-image:radial-gradient(var(--bg) 1px,transparent 1px);background-size:7px 7px}
.mono{font-family:'SF Mono',ui-monospace,Menlo,Consolas,monospace}
header{padding:18px 22px;background:var(--ink);color:#f6f5f1;display:flex;align-items:center;gap:14px;
  border-bottom:3px solid var(--accent)}
header .knob{width:34px;height:34px;border-radius:50%;background:var(--accent);
  box-shadow:inset 0 0 0 3px var(--ink),inset 0 0 0 5px var(--accent);flex:0 0 auto}
header h1{margin:0;font-size:15px;font-weight:700;text-transform:uppercase;letter-spacing:.14em}
header .meta{margin-left:auto;font-size:11px;letter-spacing:.08em;color:#b9b4a8;text-transform:uppercase;
  font-family:'SF Mono',ui-monospace,Menlo,monospace}
header .lang{display:flex;gap:4px;margin-left:12px}
header .lang button{font:700 10px 'SF Mono',monospace;letter-spacing:.1em;color:#b9b4a8;background:transparent;
  border:1px solid #3a3833;border-radius:6px;padding:3px 8px;cursor:pointer;text-transform:uppercase}
header .lang button.active{color:var(--ink);background:var(--accent);border-color:var(--accent)}
main{max-width:1000px;margin:0 auto;padding:22px 22px 56px}
section{margin-top:26px}

/* summary as a device "display" panel */
.summary{background:var(--ink);color:#f6f5f1;border-radius:10px;padding:18px 20px;display:grid;
  grid-template-columns:auto 1fr;grid-gap:16px 24px;align-items:center}
.readout{grid-row:span 2;text-align:center;background:#0d0c0b;border-radius:8px;padding:12px 18px;min-width:150px;
  box-shadow:inset 0 0 0 2px #2a2824}
.readout .big{font-family:'SF Mono',ui-monospace,Menlo,monospace;font-weight:700;line-height:1;color:var(--accent)}
.readout .num{font-size:46px}.readout .pct{font-size:20px;margin-left:2px}
.readout .rlabel{margin-top:6px;font-size:9px;letter-spacing:.22em;text-transform:uppercase;color:#b9b4a8}
.bar{display:flex;height:22px;border-radius:11px;overflow:hidden;background:#0d0c0b;box-shadow:inset 0 0 0 2px #2a2824}
.seg{color:#0d0c0b;font:700 11px 'SF Mono',monospace;line-height:22px;text-align:center;min-width:0}
.seg.full{background:var(--full)}.seg.partial{background:var(--partial)}.seg.empty{background:var(--empty)}
.legend{display:flex;gap:10px;flex-wrap:wrap;align-self:start}
.chip{display:inline-flex;align-items:center;gap:6px;font-size:11px;text-transform:uppercase;letter-spacing:.08em;
  background:#26241f;padding:4px 10px;border-radius:20px}
.chip i{width:9px;height:9px;border-radius:50%;display:inline-block}
.chip.full i{background:var(--full)}.chip.partial i{background:var(--partial)}.chip.empty i{background:var(--empty)}
.chip.deprecated i{background:var(--deprecated)}.chip.muted{color:#b9b4a8}

/* section labels */
h2{font-size:12px;text-transform:uppercase;letter-spacing:.2em;margin:0 0 10px;display:flex;align-items:center;gap:10px}
h2:before{content:"";width:14px;height:14px;border-radius:50%;background:var(--accent);box-shadow:inset 0 0 0 3px var(--bg)}
h2.h-full:before{background:var(--full)}h2.h-partial:before{background:var(--partial)}h2.h-empty:before{background:var(--empty)}
.count{color:var(--soft);font-weight:400;letter-spacing:0}

/* operation modules */
.op{background:var(--card);border:1.5px solid var(--line);border-radius:8px;margin:8px 0;overflow:hidden}
summary{cursor:pointer;padding:11px 14px;display:flex;align-items:center;gap:12px;font-size:13px;list-style:none}
summary::-webkit-details-marker{display:none}
.led{width:11px;height:11px;border-radius:50%;flex:0 0 auto;background:var(--soft);box-shadow:0 0 0 2px var(--card),0 0 6px currentColor}
.op-full .led{background:var(--full);color:var(--full)}.op-partial .led{background:var(--partial);color:var(--partial)}
.op-empty .led{background:var(--empty);color:var(--empty)}.op-deprecated .led{background:var(--deprecated);color:var(--deprecated)}
.method{font:700 12px 'SF Mono',monospace;text-transform:uppercase;min-width:54px;letter-spacing:.05em}
.path{font-family:'SF Mono',ui-monospace,Menlo,monospace;font-size:13px}
.badge{margin-left:auto;background:var(--ink);color:var(--accent);border-radius:20px;padding:2px 10px;
  font:700 11px 'SF Mono',monospace}
.calls{font-size:10px;color:var(--soft);text-transform:uppercase;letter-spacing:.1em;min-width:64px;text-align:right}
.conditions{list-style:none;margin:0;padding:4px 14px 12px 40px;font-size:13px;border-top:1px dashed #cfccc3}
.conditions li{padding:3px 0}.conditions .cov .mark{color:var(--full)}.conditions .unc .mark{color:var(--empty)}
.mark{display:inline-block;width:16px}.reason{color:var(--soft);font-style:italic}.muted{color:var(--soft)}

/* tables */
table.tags{border-collapse:collapse;width:100%;font-size:12px;background:var(--card);
  border:1.5px solid var(--line);border-radius:8px;overflow:hidden}
table.tags th{background:var(--ink);color:#f6f5f1;text-transform:uppercase;letter-spacing:.12em;font-size:10px}
table.tags th,table.tags td{padding:7px 11px;text-align:left;border-bottom:1px solid #ddd9cf}
table.tags tr:last-child td{border-bottom:none}.tags .mono,table.tags td{font-family:'SF Mono',ui-monospace,Menlo,monospace}
table.tags td.full{color:var(--full)}table.tags td.partial{color:var(--partial)}table.tags td.empty{color:var(--empty)}
ul.missed{font-family:'SF Mono',ui-monospace,Menlo,monospace;font-size:12px;list-style:none;padding:12px 16px;margin:0;
  background:var(--card);border:1.5px solid var(--line);border-radius:8px;columns:2;column-gap:24px}
ul.missed li{padding:2px 0;break-inside:avoid}
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

/** Renders a self-contained HTML report with an in-page language switcher. */
export function renderHtml(results: CoverageResults, locale: Locale = "en", numberFormat = "0.###"): string {
  const loc: Locale = MESSAGES[locale] ? locale : "en";

  const specTitle = results.specTitle ?? "";
  const titleSep = specTitle ? `${esc(specTitle)} — ` : "";
  const headTitle = (specTitle ? `${specTitle} — ` : "") + MESSAGES[loc].title;

  const langButtons = (Object.keys(MESSAGES) as Locale[])
    .map(
      (l) => `<button data-lang="${l}"${l === loc ? ' class="active"' : ""}>${l.toUpperCase()}</button>`,
    )
    .join("");

  const body = [
    summaryBar(results, loc, numberFormat),
    ...STATE_ORDER.map((s) => section(s, results, loc)),
    tagsTable(results, loc),
    conditionStatsTable(results, loc, numberFormat),
    zeroCallSection(results, loc),
    missedSection(results, loc),
    generationSection(results, loc),
  ]
    .filter(Boolean)
    .join("\n");

  return `<!doctype html>
<html lang="${loc}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(headTitle)}</title>
<style>${STYLE}</style>
</head>
<body>
<header>
  <span class="knob"></span>
  <h1>${titleSep}<span data-i18n="title">${esc(MESSAGES[loc].title)}</span></h1>
  <div class="meta">OAS ${esc(results.specVersion)} · ${esc(results.generatedAt)}</div>
  <div class="lang">${langButtons}</div>
</header>
<main>
${body}
</main>
${i18nScript(loc, specTitle)}
</body>
</html>`;
}

/** Renders and writes the HTML report to disk. */
export function writeHtmlReport(results: CoverageResults, options: HtmlWriterOptions = {}): string {
  const filename = options.filename ?? DEFAULT_HTML_FILENAME;
  writeFileSync(filename, renderHtml(results, options.locale ?? "en", options.numberFormat));
  return filename;
}
