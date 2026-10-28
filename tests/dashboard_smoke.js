// Smoke test: runs dashboard/script.js in jsdom against a data folder and checks the DOM.
// Usage: node tests/dashboard_smoke.js [data_folder]   (default: notebooks/dashboard_data)
// Not a real browser - it verifies that the data schema renders without errors.
const { JSDOM } = require("jsdom");
const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const dataDir = path.resolve(root, process.argv[2] || "notebooks/dashboard_data");
const html = fs
  .readFileSync(path.join(root, "dashboard/index.html"), "utf8")
  .replace(/<script[^>]*src="script.js"[^>]*><\/script>/, "")
  .replace(/<link[^>]*>/g, "");
const code = fs.readFileSync(path.join(root, "dashboard/script.js"), "utf8");

// Load the dashboard; `extraReviewRows` are appended to reviews_clean.csv (as {column: value} objects).
function runDashboard(extraReviewRows = []) {
  const dom = new JSDOM(html, { url: "http://localhost:8000/dashboard/", runScripts: "outside-only", pretendToBeVisual: true });
  const w = dom.window;
  w.Element.prototype.scrollIntoView = () => {};
  w.fetch = async (u) => {
    const file = path.join(dataDir, path.basename(u));
    if (!fs.existsSync(file)) return { ok: false, status: 404 };
    let text = fs.readFileSync(file, "utf8");
    if (path.basename(u) === "reviews_clean.csv" && extraReviewRows.length) {
      const header = text.split(/\r?\n/, 1)[0].split(",");
      const quote = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      text = text.replace(/\s*$/, "\n") + extraReviewRows.map((row) => header.map((h) => quote(row[h])).join(",")).join("\n") + "\n";
    }
    return { ok: true, status: 200, text: async () => text, json: async () => JSON.parse(text) };
  };
  // script.js is an ES module with top-level await; jsdom has no module support, so wrap it.
  w.eval(`(async()=>{${code}\n})().then(()=>{window.__done=true}).catch(e=>{window.__err=String(e&&e.stack||e)})`);
  return new Promise((resolve) => setTimeout(() => resolve(w), 800));
}

(async () => {
  const failures = [];
  const expect = (label, ok) => { if (!ok) failures.push(label); console.log(`${ok ? "ok  " : "FAIL"} ${label}`); };

  const w = await runDashboard();
  const d = w.document;
  if (w.__err) { console.error("script error:", w.__err); process.exit(1); }
  expect("script finished", w.__done === true);
  expect("no load-error banner", !d.querySelector(".load-error"));
  expect("6 KPI tiles", d.querySelectorAll("#kpis .kpi").length === 6);
  expect("ranking shows 10 rows (Top 10)", d.querySelectorAll("#rankBody tr").length === 10);
  expect("sentiment donut has 3 segments", d.querySelectorAll("#donut circle").length === 3);
  expect("5 rating bars", d.querySelectorAll("#rates .rate").length === 5);
  expect("6 AI summary cards (top 3 + bottom 3)", d.querySelectorAll("#ai .item").length === 6);
  expect("review explorer lists reviews", d.querySelectorAll("#revList .rev").length > 0);
  d.querySelector('#rankTabs [data-m="all"]').click();
  expect("'All products' tab lists every product", d.querySelectorAll("#rankBody tr").length > 10);
  d.querySelector("#rankBody tr").click();
  expect("clicking a ranking row filters the explorer", d.querySelector("#fProduct").value !== "");
  const baselinePoints = d.querySelectorAll("#trend circle").length;
  const csv = fs.readFileSync(path.join(dataDir, "reviews_clean.csv"), "utf8");
  const months = new Set([...csv.matchAll(/(?<![\d-])(\d{4}-\d{2})-\d{2}(?![\d-])/g)].map((m) => m[1]));
  expect("trend has exactly one point per month that has dated reviews", baselinePoints === months.size);

  // Untrusted text must not become markup, and undated reviews must not add a trend point.
  const known = d.querySelector("#fProduct option:nth-child(2)").value;
  const base = { Product: known, Rating: 5, Sentiment: "Positive", Recommended: "True", Review_Truncated: "False" };
  const w2 = await runDashboard([
    { ...base, PostDate: "", Review: "undated <b>bold</b> zzmarker" },
    { ...base, PostDate: "2020-03-30", Review: 'inject <img src=x onerror="window.__pwned=1"> & "quotes" zzmarker' },
  ]);
  const d2 = w2.document;
  if (w2.__err) { console.error("script error (injected run):", w2.__err); process.exit(1); }
  const box = d2.querySelector("#fText");
  box.value = "zzmarker";
  box.dispatchEvent(new w2.Event("input"));
  expect("both injected reviews are listed", d2.querySelectorAll("#revList .rev").length === 2);
  expect("HTML in review text is shown as text, not parsed", d2.querySelectorAll("#revList img, #revList b b").length === 0 && d2.querySelector("#revList").innerHTML.includes("&lt;img"));
  expect("undated review has no empty date chip", ![...d2.querySelectorAll("#revList .chip")].some((c) => c.textContent.trim() === ""));
  expect("undated reviews do not add a trend point", d2.querySelectorAll("#trend circle").length === baselinePoints);

  if (failures.length) { console.error(`\n${failures.length} check(s) failed`); process.exit(1); }
  console.log("\nAll dashboard checks passed.");
  process.exit(0);
})();
