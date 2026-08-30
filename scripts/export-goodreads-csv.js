#!/usr/bin/env node
/*
 * export-goodreads-csv.js — exports every row of assets/data.js as a CSV
 * matching the column set of sample_export.csv (a Goodreads library-export
 * layout), plus a block of extra columns at the end for catalogue-specific
 * data that format has no room for (Genre, Format, Series/Vol, Pages,
 * Awards, Notes, ...) so nothing in the catalogue is lost.
 *
 * Deliberate deviations from a strict re-creation of sample_export.csv,
 * and why:
 *   - Author stays "Last, First" (the catalogue's own convention) rather
 *     than being flipped to "First Last" like the sample. Many rows are
 *     multi-author, edited, or carry suffixes ("Guthrie, A. B., Jr.",
 *     "Zondervan (Lucado, Max; Frazee, Randy, eds.)") where an automated
 *     reversal risks silently mangling a name. Accuracy over format
 *     fidelity on this one field.
 *   - My Rating / Date Read / Date Added / Shelves (reading status) are
 *     left blank: the catalogue has no personal-rating or reading-progress
 *     data at all, and this script never invents any.
 *   - Original Publication Year is left blank: the catalogue's single
 *     `year` field is documented as the *edition's* year, which is not
 *     reliably the same thing as the work's first-publication year, and
 *     the two aren't distinguished in the source data.
 *   - Binding is filled in only when the `edition` text itself contains a
 *     recognizable keyword ("hardcover", "paperback", "ebook", ...) —
 *     inferred from real text already in the catalogue, not guessed.
 *   - My Review is left blank (it has a specific meaning on Goodreads —
 *     your own review text); the catalogue's bibliographic `notes` field
 *     is exported separately instead, in the extras block.
 *
 * Usage: node scripts/export-goodreads-csv.js [--out path.csv]
 */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const DATA_PATH = path.join(ROOT, "assets", "data.js");

function parseArgs(argv) {
  const out = { out: path.join(ROOT, "longshelf-goodreads-export.csv") };
  for (let i = 2; i < argv.length; i++) if (argv[i] === "--out") out.out = path.resolve(argv[++i]);
  return out;
}

function loadCatalogue() {
  const code = fs.readFileSync(DATA_PATH, "utf8");
  const sandbox = {}; sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  return sandbox.SHELF_DATA;
}

function csvField(v) {
  const s = String(v == null ? "" : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

const BINDING_KEYWORDS = [
  [/mass-market paperback/i, "Mass Market Paperback"],
  [/trade paperback/i, "Paperback"],
  [/paperback/i, "Paperback"],
  [/hardcover|hardback/i, "Hardcover"],
  [/e-?book|kindle|digital/i, "ebook"],
];
function guessBinding(edition) {
  if (!edition) return "";
  for (const [re, label] of BINDING_KEYWORDS) if (re.test(edition)) return label;
  return "";
}

function slug(s) {
  return String(s).toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function splitAuthors(a) {
  return String(a || "").split(";").map(s => s.trim()).filter(Boolean);
}

const KIND_LABEL = { standalone: "Standalone", series: "Series volume", omnibus: "Omnibus file",
  multivolume: "Multi-volume work", collection: "Story collection", anthology: "Anthology" };

function buildRow(r) {
  const authors = splitAuthors(r.author);
  const primaryAuthor = authors[0] || "";
  const additionalAuthors = authors.slice(1).join(", ");

  const bookshelves = [
    r.shelf,
    ...(r.genre || []).map(slug),
  ].filter(Boolean).join(" ");

  return {
    // --- columns matching sample_export.csv, in its order ---
    "Title": r.title,
    "Author": primaryAuthor,
    "ISBN": r.isbn || "",
    "My Rating": "",
    "Average Rating": r.gr ? r.gr[0] : "",
    "Publisher": r.publisher || "",
    "Binding": guessBinding(r.edition),
    "Year Published": r.year || "",
    "Original Publication Year": "",
    "Date Read": "",
    "Date Added": "",
    "Shelves": "",
    "Bookshelves": bookshelves,
    "My Review": "",
    // --- extras: real catalogue data with no home in the sample's columns ---
    "Additional Authors": additionalAuthors,
    "Ratings Count": r.gr && r.gr[1] != null ? r.gr[1] : "",
    "Shelf": r.shelf,
    "Genre": (r.genre || []).join("; "),
    "Format": KIND_LABEL[r.kind] || r.kind,
    "Series / Section": r.group || "",
    "Volume": r.vol || "",
    "Pages": r.pages != null ? r.pages : (r.physical != null ? r.physical : (r.comp_total || "")),
    "Awards": (r.awards || []).join("; "),
    "Notes": r.notes || "",
  };
}

function main() {
  const args = parseArgs(process.argv);
  const D = loadCatalogue();
  const rows = D.rows.map(buildRow);
  const cols = Object.keys(rows[0]);
  const lines = [cols.join(",")].concat(rows.map(r => cols.map(c => csvField(r[c])).join(",")));
  fs.writeFileSync(args.out, lines.join("\n") + "\n");

  console.log(`Wrote ${args.out}`);
  console.log(`${rows.length} rows, ${cols.length} columns`);
  console.log(`  columns 1-14 match sample_export.csv's layout`);
  console.log(`  columns 15-${cols.length} are catalogue-specific extras`);
  const withRating = rows.filter(r => r["Average Rating"] !== "").length;
  const withIsbn = rows.filter(r => r["ISBN"] !== "").length;
  const withBinding = rows.filter(r => r["Binding"] !== "").length;
  console.log(`  Average Rating populated: ${withRating}/${rows.length}`);
  console.log(`  ISBN populated: ${withIsbn}/${rows.length}`);
  console.log(`  Binding inferred: ${withBinding}/${rows.length}`);
}

main();
