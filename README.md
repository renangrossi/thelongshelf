# The Long Shelf

A researched catalogue of a personal library — 457 entries, 595 physical books, 266,112 pages.

Live at **https://renangrossi.github.io/thelongshelf/**

## What it is

Two shelves catalogued to the same standard:

- a 352-entry fiction library
- a 105-entry world history canon

Every entry gets a representative **print** edition — page counts come from physical books, never from EPUB or Kindle location counts. Omnibuses, collections and multi-volume works are opened up into the books they actually contain, series are regrouped, duplicates are flagged, and 68 award-winning books are listed by prize.

## Files

```
.
├── index.html          # the whole site
├── 404.html
├── .nojekyll           # tells GitHub Pages to skip Jekyll processing
└── assets/
    ├── styles.css
    ├── app.js          # rendering + search/sort/filter
    └── data.js         # the catalogue itself (window.SHELF_DATA)
```

All paths are relative, so the site works from a project subpath like `/thelongshelf/`.

## Preview locally

Opening `index.html` directly works, but serving it is closer to production:

```bash
cd thelongshelf-website
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Publish

```bash
cd /media/amaterasu/Books/thelongshelf-website
git init -b main
git add .
git commit -m "The Long Shelf"
git remote add origin git@github.com:nangrossi/thelongshelf.git
git push -u origin main
```

Then on GitHub: **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`**.
First build takes a minute or two.

## Updating the catalogue

All the data lives in `assets/data.js` as a single `window.SHELF_DATA` object. Editing a page count, adding an award, or filling in a Goodreads rating means editing that file and committing — no build step.

## Caveats

Page counts are researched working figures, not audited bibliographic records. Goodreads ratings are a snapshot and drift daily; only 36 of 569 books have one, because a rating that wasn't actually looked up is left blank rather than invented. See the Method section on the site for the full accounting.
