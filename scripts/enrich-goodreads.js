#!/usr/bin/env node
/*
 * enrich-goodreads.js — matches catalogue rows in assets/data.js against a
 * legitimately-obtained Goodreads dataset (e.g. your own Goodreads library
 * CSV export: Account Settings -> Import/Export) and writes a reviewable
 * goodreads-enrichment.csv. It NEVER writes to data.js and NEVER invents,
 * guesses, or infers a rating — a row with no confident match is reported
 * as not_found/ambiguous/needs_review, not filled in.
 *
 * Why it needs a --source file at all: Goodreads has not issued new public
 * API keys since December 2020 and the legacy API was fully retired after
 * that; goodreads.com/robots.txt disallows crawling individual /book/show
 * pages for general-purpose bots. There is no legitimate way for this
 * script to fetch ratings on its own. See README section below / the
 * session's final report for the full explanation.
 *
 * Usage:
 *   node scripts/enrich-goodreads.js [--source path/to/export.csv] [--out goodreads-enrichment.csv]
 *
 * --source accepts either:
 *   (a) a raw Goodreads library-export CSV (its own column names: "Book Id",
 *       "Title", "Author", "ISBN", "ISBN13", "Average Rating", ...), or
 *   (b) a generic CSV with any of: isbn, isbn13, title, author,
 *       average_rating (or rating), ratings_count, book_id, url
 * Column names are matched case-insensitively with a few known aliases.
 *
 * Output columns (one row per catalogue entry):
 *   index, author, title, isbn, kind, matched_title, matched_author,
 *   goodreads_rating, goodreads_ratings_count, goodreads_url, confidence,
 *   status, notes
 *
 * Statuses: already_present | matched | ambiguous | not_found | needs_review
 */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const DATA_PATH = path.join(ROOT, "assets", "data.js");

function parseArgs(argv) {
  const out = { source: null, out: path.join(ROOT, "goodreads-enrichment.csv") };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--source") out.source = argv[++i];
    else if (argv[i] === "--out") out.out = path.resolve(argv[++i]);
  }
  return out;
}

function loadCatalogue() {
  const code = fs.readFileSync(DATA_PATH, "utf8");
  const sandbox = {};
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.SHELF_DATA;
}

// ---- minimal RFC4180-ish CSV parser (handles quoted fields with , and "") ----
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i], next = text[i + 1];
    if (inQuotes) {
      if (c === '"' && next === '"') { field += '"'; i++; }
      else if (c === '"') { inQuotes = false; }
      else field += c;
    } else {
      if (c === '"') inQuotes = true;
      else if (c === ",") { row.push(field); field = ""; }
      else if (c === "\r") { /* skip */ }
      else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
      else field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  if (!rows.length) return [];
  const header = rows[0].map(h => h.trim());
  return rows.slice(1).filter(r => r.length > 1 || r[0] !== "").map(r => {
    const obj = {};
    header.forEach((h, i) => obj[h] = (r[i] || "").trim());
    return obj;
  });
}

const COLUMN_ALIASES = {
  isbn: ["isbn", "ISBN"],
  isbn13: ["isbn13", "ISBN13"],
  title: ["title", "Title"],
  // "Author l-f" (Goodreads' own "Last, First" column) has to come before "Author"
  // ("First Last") — the catalogue's own author field is "Last, First", and
  // authorLastName() only takes what's before the first comma. Against "Author" that
  // silently mis-extracts a single-word first name as the whole "last name" (e.g.
  // "Jane Austen" -> "jane austen", never reduced to "austen"), which was turning real
  // matches into false "author did not match" ambiguous results.
  author: ["Author l-f", "author", "Author"],
  rating: ["average_rating", "Average Rating", "rating"],
  ratings_count: ["ratings_count", "Ratings Count", "ratings count", "num_ratings"],
  book_id: ["book_id", "Book Id", "id"],
  url: ["url", "URL", "link"],
};
function pick(rec, key) {
  for (const alias of COLUMN_ALIASES[key]) if (rec[alias] != null && rec[alias] !== "") return unEscapeExcel(rec[alias]);
  return "";
}
// Goodreads' own library-export CSV wraps ISBN/ISBN13 cells as ="0141439523" —
// an Excel trick to preserve leading zeros / stop scientific-notation mangling.
// Strip that wrapper so the value underneath is usable.
function unEscapeExcel(s) {
  const m = /^="(.*)"$/.exec(String(s || ""));
  return m ? m[1] : s;
}
function normISBN(s) {
  return String(s || "").replace(/[^0-9Xx]/g, "").toUpperCase();
}
function normText(s) {
  return String(s || "")
    .toLowerCase()
    .normalize("NFKD").replace(/[̀-ͯ]/g, "") // strip accents
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/^(the|a|an)\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
}
function authorLastName(a) {
  // catalogue authors are "Last, First" (possibly multiple, "; "-joined) — take first author's last name
  const first = String(a || "").split(";")[0].trim();
  return normText(first.split(",")[0]);
}

function buildSourceIndex(records) {
  const byISBN = new Map();
  const byTitleAuthor = new Map(); // key: normTitle -> array of records
  records.forEach(rec => {
    const isbn13 = normISBN(pick(rec, "isbn13"));
    const isbn10 = normISBN(pick(rec, "isbn"));
    if (isbn13) byISBN.set(isbn13, rec);
    if (isbn10) byISBN.set(isbn10, rec);
    const nt = normText(pick(rec, "title"));
    if (nt) {
      if (!byTitleAuthor.has(nt)) byTitleAuthor.set(nt, []);
      byTitleAuthor.get(nt).push(rec);
    }
  });
  return { byISBN, byTitleAuthor };
}

const RISKY_KINDS = new Set(["omnibus", "multivolume", "collection", "anthology"]);

function matchRow(row, index, src) {
  const base = {
    index, author: row.author, title: row.title, isbn: row.isbn || "", kind: row.kind,
    matched_title: "", matched_author: "", goodreads_rating: "", goodreads_ratings_count: "",
    goodreads_url: "", confidence: "", status: "", notes: "",
  };

  if (row.gr) {
    base.status = "already_present";
    base.goodreads_rating = row.gr[0];
    base.goodreads_ratings_count = row.gr[1] != null ? row.gr[1] : "";
    base.confidence = "n/a (existing)";
    if (src) {
      // check for a discrepancy against the source, but never overwrite
      const rowIsbn = normISBN(row.isbn);
      const hit = rowIsbn && src.byISBN.get(rowIsbn);
      if (hit) {
        const srcRating = parseFloat(pick(hit, "rating"));
        if (!isNaN(srcRating) && Math.abs(srcRating - row.gr[0]) > 0.05) {
          base.notes = `DISCREPANCY: catalogue has ${row.gr[0]}, source has ${srcRating} for ISBN ${row.isbn} — review, not auto-changed`;
        }
      }
    }
    return base;
  }

  if (!src) {
    base.status = "not_found";
    base.notes = "no --source dataset supplied to match against";
    return base;
  }

  // 1. ISBN match (primary key per spec)
  const rowIsbn = normISBN(row.isbn);
  if (rowIsbn) {
    const hit = src.byISBN.get(rowIsbn);
    if (hit) {
      return finishMatch(base, row, hit, "high (isbn)");
    }
  }

  // 2. author + normalized title fallback
  const nt = normText(row.title);
  const candidates = src.byTitleAuthor.get(nt) || [];
  const authLast = authorLastName(row.author);
  const authorMatches = candidates.filter(c => authorLastName(pick(c, "author")) === authLast);

  if (authorMatches.length === 1) {
    const conf = RISKY_KINDS.has(row.kind) ? "medium (title+author, verify edition)" : "medium (title+author)";
    // Omnibuses/collections/multivolume/anthology: a plain title+author hit is not
    // enough to trust it's the *work*-level edition rather than a component volume —
    // route these to needs_review instead of matched, per the special-case requirement.
    if (RISKY_KINDS.has(row.kind)) {
      return finishMatch(base, row, authorMatches[0], conf, "needs_review",
        "kind=" + row.kind + " — confirm this Goodreads page is the omnibus/collection edition, not a single component volume, before applying");
    }
    return finishMatch(base, row, authorMatches[0], conf, "matched");
  }
  if (authorMatches.length > 1) {
    base.status = "ambiguous";
    base.notes = `${authorMatches.length} source records share this normalized title+author — cannot pick one without more distinguishing data (edition/publisher/year)`;
    return base;
  }
  if (candidates.length > 0) {
    base.status = "ambiguous";
    base.notes = `title matched but author did not (source author(s): ${candidates.map(c=>pick(c,"author")).join(" / ")}) — needs manual check`;
    return base;
  }

  base.status = "not_found";
  base.notes = "no source record matched by ISBN or by normalized title+author";
  return base;
}

function finishMatch(base, row, hit, confidence, status, notes) {
  base.matched_title = pick(hit, "title");
  base.matched_author = pick(hit, "author");
  base.goodreads_rating = pick(hit, "rating");
  base.goodreads_ratings_count = pick(hit, "ratings_count");
  const bookId = pick(hit, "book_id");
  base.goodreads_url = pick(hit, "url") || (bookId ? `https://www.goodreads.com/book/show/${bookId}` : "");
  base.confidence = confidence;
  base.status = status || "matched";
  if (notes) base.notes = notes;
  return base;
}

function toCSV(rows) {
  const cols = ["index","author","title","isbn","kind","matched_title","matched_author",
    "goodreads_rating","goodreads_ratings_count","goodreads_url","confidence","status","notes"];
  const esc = v => {
    const s = String(v == null ? "" : v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [cols.join(",")].concat(rows.map(r => cols.map(c => esc(r[c])).join(","))).join("\n") + "\n";
}

function main() {
  const args = parseArgs(process.argv);
  const D = loadCatalogue();

  let src = null;
  if (args.source) {
    if (!fs.existsSync(args.source)) {
      console.error(`--source file not found: ${args.source}`);
      process.exit(1);
    }
    const records = parseCSV(fs.readFileSync(args.source, "utf8"));
    src = buildSourceIndex(records);
    console.log(`Loaded source dataset: ${records.length} records from ${args.source}`);
  } else {
    console.log("No --source supplied. Every row without an existing rating will be reported");
    console.log("as not_found (this script never fabricates a rating). See the final report");
    console.log("for what a legitimate --source file looks like (a Goodreads library export).");
  }

  const results = D.rows.map((row, i) => matchRow(row, i, src));

  const counts = results.reduce((acc, r) => { acc[r.status] = (acc[r.status]||0)+1; return acc; }, {});
  console.log("\nSummary:");
  ["already_present","matched","ambiguous","not_found","needs_review"].forEach(s =>
    console.log(`  ${s.padEnd(16)} ${counts[s] || 0}`));
  console.log(`  ${"TOTAL".padEnd(16)} ${results.length}`);

  const discrepancies = results.filter(r => r.notes && r.notes.startsWith("DISCREPANCY"));
  if (discrepancies.length) {
    console.log(`\n${discrepancies.length} discrepancy(ies) found between existing data and source — see notes column.`);
  }

  fs.writeFileSync(args.out, toCSV(results));
  console.log(`\nWrote ${args.out}`);
  console.log("\nThis file is a REVIEW artifact only — assets/data.js was not touched.");
}

main();
