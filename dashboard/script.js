/* =========================================================
   DATA SOURCE — notebooks/dashboard_data/
   Written by notebooks/01_skincare_review_analysis.ipynb (Step 7).
   The path is relative to this page (dashboard/index.html), so serve
   the repository root. Column names must match the notebook export
   (see docs/data_dictionary.md). Change FILES if file names differ.
   ========================================================= */
const DATA_DIR = "../notebooks/dashboard_data/";
const FILES = {
  stats: "overall_stats.json", // ringkasan keseluruhan
  products: "product_summary.csv", // ranking per produk
  reviews: "reviews_clean.csv", // ulasan mentah
  ai: "ai_summaries.json", // ringkasan AI (top 3 & bottom 3)
};

/* ---------- data-reading helpers ---------- */
const toNum = (v) => {
    const n = Number(v);
    return v === "" || v == null || !Number.isFinite(n) ? null : n;
  },
  toBool = (v) =>
    typeof v === "boolean"
      ? v
      : ["true", "1", "yes", "y"].includes(String(v).trim().toLowerCase());

// Escape dataset text before it goes into innerHTML (reviews and product names are untrusted text)
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

// CSV parser: supports quotes, commas and newlines inside text, BOM, CRLF
function parseCSV(text) {
  text = text.replace(/^\uFEFF/, "");
  const rows = [];
  let row = [],
    cell = "",
    q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else q = false;
      } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      cell = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  const head = rows.shift().map((h) => h.trim());
  return rows.map((r) =>
    Object.fromEntries(head.map((h, i) => [h, r[i] ?? ""])),
  );
}

async function loadFile(name) {
  const res = await fetch(DATA_DIR + name, { cache: "no-store" });
  if (!res.ok) throw new Error(`${DATA_DIR}${name} (HTTP ${res.status})`);
  return name.endsWith(".json") ? res.json() : parseCSV(await res.text());
}

let rawStats, rawProducts, rawReviews, rawAI;
try {
  [rawStats, rawProducts, rawReviews, rawAI] = await Promise.all([
    loadFile(FILES.stats),
    loadFile(FILES.products),
    loadFile(FILES.reviews),
    loadFile(FILES.ai),
  ]);
} catch (err) {
  document.querySelector(".shell").insertAdjacentHTML(
    "afterbegin",
    `<div class="load-error"><b>Could not load the data.</b> ${err.message}<br>
     Make sure the files exist in <code>${DATA_DIR}</code> (run the notebook, or
     <code>python scripts/generate_demo_data.py</code>) and that the page is served
     over HTTP from the repository root (e.g. <code>python -m http.server</code>),
     not opened by double-clicking the HTML file.</div>`,
  );
  throw err;
}

/* ---------- normalise data ---------- */
const SENT = ["Positive", "Neutral", "Negative"],
  SCOL = { Positive: "pos", Neutral: "neu", Negative: "neg" },
  REVIEWS = rawReviews.map((r) => ({
    Product: r.Product,
    SkinType: r.SkinType,
    AgeGroup: r.AgeGroup,
    PostDate: String(r.PostDate).slice(0, 10),
    Review: r.Review,
    Rating: Number(r.Rating),
    Sentiment: r.Sentiment,
    Recommended: toBool(r.Recommended),
  })),
  STATS = rawStats,
  N = STATS.total_reviews ?? REVIEWS.length,
  uniq = (k) =>
    [...new Set(REVIEWS.map((r) => r[k]).filter(Boolean))].sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true }),
    ),
  SKIN = uniq("SkinType"),
  AGE = uniq("AgeGroup");

const {
    min_reviews: MIN,
    prior_weight: M,
    global_mean_rating: C,
  } = STATS.ranking,
  PRODUCTS = rawProducts.map((r) => {
    const n = Number(r.Review_Count);
    return {
      Product: r.Product,
      Review_Count: n,
      Avg_Rating: Number(r.Avg_Rating),
      Pct_Positive: Number(r.Pct_Positive),
      Pct_Neutral: Number(r.Pct_Neutral),
      Pct_Negative: Number(r.Pct_Negative),
      Weighted_Rating: Number(r.Weighted_Rating),
      Eligible: r.Eligible === undefined ? n >= MIN : toBool(r.Eligible),
      Rank: toNum(r.Rank),
    };
  });
PRODUCTS.sort(
  (a, b) =>
    b.Eligible - a.Eligible ||
    (a.Rank ?? Infinity) - (b.Rank ?? Infinity) ||
    b.Weighted_Rating - a.Weighted_Rating ||
    b.Review_Count - a.Review_Count ||
    a.Product.localeCompare(b.Product),
);
PRODUCTS.forEach((p, i) => (p.Rank = p.Eligible ? (p.Rank ?? i + 1) : null));
const ranked = PRODUCTS.filter((p) => p.Eligible),
  AI = (Array.isArray(rawAI) ? rawAI : (rawAI.items ?? [])).map((a) => ({
    ...a,
    rank: toNum(a.rank),
    review_count: Number(a.review_count),
    weighted_rating: Number(a.weighted_rating),
    sentiment_review_count: Number(a.sentiment_review_count),
    summary_points: Array.isArray(a.summary_points)
      ? a.summary_points
      : String(a.summary_points ?? "")
          .split(/\n|;/)
          .map((x) => x.trim())
          .filter(Boolean),
  }));
const $ = (s) => document.querySelector(s),
  fmt = (n) => n.toLocaleString("en-US"),
  posPct = (STATS.sentiment_counts.Positive / N) * 100,
  recPct = (REVIEWS.filter((r) => r.Recommended).length / N) * 100;
$("#meta").textContent = `Updated ${STATS.generated_at.slice(0, 10)}`;
$("#dateWindow").textContent =
  `${STATS.date_range.start.slice(0, 7)} — ${STATS.date_range.end.slice(0, 7)}`;
$("#datasetLabel").textContent = STATS.dataset + " · " + STATS.ai_model;
$("#kpis").innerHTML = [
  [fmt(N), "Total reviews"],
  [`${ranked.length} / ${STATS.total_products}`, "Products ranked"],
  [STATS.avg_rating.toFixed(2), "Average rating"],
  [posPct.toFixed(0) + "%", "Positive reviews"],
  [recPct.toFixed(0) + "%", "Would recommend"],
  [
    `${STATS.date_range.start.slice(0, 7)} → ${STATS.date_range.end.slice(0, 7)}`,
    "Review period",
  ],
]
  .map(([v, l]) => `<div class="kpi"><b>${v}</b><span>${l}</span></div>`)
  .join("");
let off = 25;
$("#donut").innerHTML = SENT.map((s) => {
  let p = (STATS.sentiment_counts[s] / N) * 100,
    c = `<circle cx="18" cy="18" r="15.9155" fill="none" stroke-width="5" stroke="var(--${SCOL[s]})" stroke-dasharray="${p} ${100 - p}" stroke-dashoffset="${off}"/>`;
  off -= p;
  return c;
}).join("");
$("#legend").innerHTML = SENT.map(
  (s) =>
    `<div><i class="${SCOL[s]}"></i>${s}: ${((STATS.sentiment_counts[s] / N) * 100).toFixed(1)}% (${fmt(STATS.sentiment_counts[s])})</div>`,
).join("");
let maxR = Math.max(...Object.values(STATS.rating_counts));
$("#rates").innerHTML = [5, 4, 3, 2, 1]
  .map(
    (k) =>
      `<div class="rate"><span>${k} ★</span><div><i style="width:${(STATS.rating_counts[k] / maxR) * 100}%"></i></div><span>${STATS.rating_counts[k]}</span></div>`,
  )
  .join("");
let mo = {};
REVIEWS.forEach(
  (r) => r.PostDate && (mo[r.PostDate.slice(0, 7)] ??= []).push(r.Rating),
); // undated reviews are left out of the monthly trend
let keys = Object.keys(mo).sort(),
  pts = keys.map((k, i) => [
    10 + i * (280 / Math.max(1, keys.length - 1)),
    80 - ((mo[k].reduce((a, b) => a + b, 0) / mo[k].length - 1) / 4) * 70,
  ]);
$("#trend").innerHTML =
  `<polyline fill="none" stroke="var(--mint-dark)" stroke-width="2.5" points="${pts.map((p) => p.join(",")).join(" ")}"/>` +
  pts
    .map(
      (p) => `<circle cx="${p[0]}" cy="${p[1]}" r="2.5" fill="var(--coral)"/>`,
    )
    .join("");
let mode = "top";
function drawRank() {
  let q = $("#rankSearch").value.toLowerCase(),
    rows =
      mode == "top"
        ? ranked.slice(0, 10)
        : mode == "bottom"
          ? ranked.slice(-10).reverse()
          : PRODUCTS.filter((p) => p.Product.toLowerCase().includes(q));
  $("#rankSearch").hidden = mode !== "all";
  $("#rankBody").innerHTML =
    rows
      .map(
        (p) =>
          `<tr tabindex="0" data-p="${esc(p.Product)}"><td class="rank">${p.Rank ?? "–"}</td><td>${esc(p.Product)}</td><td><div class="wr"><i style="width:${(p.Weighted_Rating / 5) * 110}px"></i>${p.Weighted_Rating.toFixed(2)}</div></td><td>${p.Avg_Rating.toFixed(2)}</td><td>${p.Review_Count}</td><td><div class="stk"><i class="pos" style="width:${p.Pct_Positive}%"></i><i class="neu" style="width:${p.Pct_Neutral}%"></i><i class="neg" style="width:${p.Pct_Negative}%"></i></div></td></tr>`,
      )
      .join("") ||
    `<tr><td colspan="6">No product matches your search.</td></tr>`;
  $("#rankNote").textContent =
    `Weighted rating pulls each average toward the global mean (${C.toFixed(2)}). Click a row to open its reviews.`;
}
document.querySelectorAll("#rankTabs .tab").forEach(
  (b) =>
    (b.onclick = () => {
      mode = b.dataset.m;
      document
        .querySelectorAll("#rankTabs .tab")
        .forEach((x) => x.setAttribute("aria-pressed", x === b));
      drawRank();
    }),
);
$("#rankSearch").oninput = drawRank;
const open = (e) => {
  let tr = e.target.closest("tr[data-p]");
  if (!tr || (e.type == "keydown" && e.key !== "Enter")) return;
  $("#fProduct").value = tr.dataset.p;
  drawRev();
  $("#explorer").scrollIntoView({ behavior: "smooth" });
};
$("#rankBody").onclick = open;
$("#rankBody").onkeydown = open;
drawRank();
const col = (g, title, cls) =>
  `<section class="card"><div class="${cls}"><h3>${title}</h3><p class="sub">AI summary · group “${esc(g)}”</p></div>` +
  AI.filter((a) => a.group === g)
    .map(
      (a) =>
        `<div class="item"><b>#${a.rank} ${esc(a.product)}</b> <small>${a.weighted_rating.toFixed(2)} · ${a.review_count} reviews</small><ul>${a.summary_points.map((x) => `<li>${esc(x)}</li>`).join("")}</ul><small>From ${a.sentiment_review_count} ${esc(a.sentiment.toLowerCase())} reviews · ${esc(STATS.ai_model)}</small></div>`,
    )
    .join("") +
  `</section>`;
$("#ai").innerHTML =
  col("top", "What customers praise in the top 3", "good") +
  col("bottom", "What customers complain about in the bottom 3", "bad");
const opts = (id, label, arr) =>
  ($(id).innerHTML =
    `<option value="">${label}</option>` +
    arr.map((x) => `<option>${esc(x)}</option>`).join(""));
opts("#fProduct", "All products", PRODUCTS.map((p) => p.Product).sort());
opts("#fSkin", "All skin types", SKIN);
opts("#fAge", "All age groups", AGE);
const PAGE_SIZE = 8;
let revPage = 0;
function drawRev(keepPage) {
  if (keepPage !== true) revPage = 0; // filter changed -> back to page 1
  let f = {
      Product: $("#fProduct").value,
      Sentiment: $("#fSent").value,
      SkinType: $("#fSkin").value,
      AgeGroup: $("#fAge").value,
    },
    t = $("#fText").value.toLowerCase(),
    rows = REVIEWS.filter(
      (r) =>
        Object.entries(f).every(([k, v]) => !v || r[k] === v) &&
        r.Review.toLowerCase().includes(t),
    ).sort((a, b) => b.PostDate.localeCompare(a.PostDate)),
    pages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  revPage = Math.min(revPage, pages - 1);
  const from = revPage * PAGE_SIZE,
    shown = rows.slice(from, from + PAGE_SIZE);
  $("#revCount").textContent = rows.length
    ? `Showing ${from + 1}–${from + shown.length} of ${rows.length} reviews`
    : "Showing 0 of 0 reviews";
  $("#revList").innerHTML =
    shown
      .map(
        (r) =>
          `<div class="rev"><b>${esc(r.Product)}</b> <span class="chip ${SCOL[r.Sentiment] ?? ""}">${esc(r.Sentiment)}</span><span class="chip">${r.Rating} ★</span>${r.SkinType ? `<span class="chip">${esc(r.SkinType)}</span>` : ""}${r.AgeGroup ? `<span class="chip">${esc(r.AgeGroup)}</span>` : ""}${r.PostDate ? `<span class="chip">${esc(r.PostDate)}</span>` : ""}${r.Recommended ? '<span class="chip">Recommended</span>' : ""}<div>${esc(r.Review)}</div></div>`,
      )
      .join("") ||
    `<div class="rev">No reviews match these filters. Clear a filter to see more.</div>`;
  $("#revPager").hidden = !rows.length;
  $("#revPage").textContent = `Page ${revPage + 1} of ${pages}`;
  $("#revPrev").disabled = revPage === 0;
  $("#revNext").disabled = revPage >= pages - 1;
}
$("#revPrev").onclick = () => {
  revPage--;
  drawRev(true);
};
$("#revNext").onclick = () => {
  revPage++;
  drawRev(true);
};
$("#fProduct").onchange = drawRev;
["#fSent", "#fSkin", "#fAge", "#fText"].forEach(
  (s) => ($(s).oninput = drawRev),
);
drawRev();
