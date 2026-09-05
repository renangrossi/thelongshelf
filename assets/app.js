/* The Long Shelf — rendering */
(function () {
  const D = window.SHELF_DATA;
  const esc = s => String(s==null?"":s).replace(/[&<>"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
  const nf  = n => n==null ? "—" : n.toLocaleString("en-US");
  const shortN = n => n>=1e6 ? (n/1e6).toFixed(1)+"M" : n>=1e3 ? Math.round(n/1e3)+"k" : n;
  const $ = id => document.getElementById(id);
  const S = D.stats;

  /* ---- stats ---- */
  $("stats").innerHTML = [
    [S.entries,"Catalogue entries"],[S.works,"Physical books"],
    [S.fic_entries,"Fiction files"],[S.nf_entries,"Canon entries"],
    [S.fic_omnibus,"Fiction omnibus files"],[S.nf_multivol,"Multi-volume canon works"],
    [S.multi_series,"Multi-volume series"],[S.sections,"Canon sections"],
    [S.awarded,"Award-winning books"],[S.rated,"Books with a rating"],
    [nf(S.pages),"Pages, deduplicated"],[S.unknown,"Unknown page counts"]
  ].map(([v,l])=>`<div class="stat"><b>${v}</b><span>${l}</span></div>`).join("");

  /* ---- shelves ---- */
  function drawShelf(id, arr){
    $(id).innerHTML = `<div class="shelf">` + arr.map((s,i)=>
      `<div class="spine" tabindex="0" role="button" aria-label="${esc(s.t)}" data-k="${id==="shelfFic"?"shelfFic":"shelfNf"}" data-i="${i}" style="width:${Math.max(3,s.p*0.031).toFixed(2)}px;background:${s.c}"></div>`
    ).join("") + `</div>`;
  }
  drawShelf("shelfFic", D.shelfFic); drawShelf("shelfNf", D.shelfNf);

  const tip = $("tip");
  document.body.addEventListener("mousemove", e => {
    const sp = e.target.closest(".spine");
    if(!sp){ tip.style.opacity = 0; return; }
    const s = D[sp.dataset.k][+sp.dataset.i];
    tip.innerHTML = `<strong>${esc(s.t)}</strong><em>${esc(s.a)}</em><br><span>${nf(s.p)} pp</span>`
      + (s.g ? ` <span>· ${s.g[0].toFixed(2)}★</span>` : "")
      + (s.aw ? `<br><em>${s.aw} award${s.aw>1?"s":""}</em>` : "")
      + (s.v ? `<br><em>in ${esc(s.v)}</em>` : "");
    tip.style.opacity = 1;
    tip.style.left = Math.min(e.clientX + 14, window.innerWidth - 320) + "px";
    tip.style.top  = Math.max(8, e.clientY - 74) + "px";
  });
  function activateSpine(sp){
    const s = D[sp.dataset.k][+sp.dataset.i];
    $("q").value = s.v || s.t; render();
    $("catalogue").scrollIntoView({behavior:"smooth", block:"start"});
  }
  document.body.addEventListener("click", e => {
    const sp = e.target.closest(".spine"); if(!sp) return;
    activateSpine(sp);
  });
  // Spines are role="button" and tabbable, but a <div> never gets a native Enter/Space
  // activation the way a real <button> does — without this, keyboard users can Tab to a
  // spine and land on it, but pressing Enter or Space does nothing at all.
  document.body.addEventListener("keydown", e => {
    if(e.key !== "Enter" && e.key !== " ") return;
    const sp = e.target.closest(".spine"); if(!sp) return;
    e.preventDefault();
    activateSpine(sp);
  });

  /* ---- table ---- */
  let sortK = "shelf", sortDir = 1;

  /* Vol: "k of X" is shown only where X is verified from the catalogue's own vol values —
     never invented and never derived from outside knowledge of the real series. Within a
     group, gather every row whose vol is a plain integer or a plain "A–B" range; if their
     combined coverage is an exact, gapless 1..max run, X=max is verified (an overlap from
     an intentional duplicate — e.g. "The Eye of the World" cataloged both alone and inside
     The Complete Wheel of Time — is fine, since it doesn't create a gap). Anything else
     aborts the whole group rather than guessing: a real gap (Discworld, Shadowrun — only
     some volumes held, true total unknown), a decimal (Stormlight Archive's "2.5"), or a
     compound label (Drizzt's "4 (Icewind Dale 1)") all leave every row in that group
     exactly as it already was. Note this also correctly reuses `group` for the history
     canon's roman-numeral section headers, which bundle many unrelated books: sections
     with no real sub-series in them never produce ≥2 contributing rows, so nothing fires;
     sections that do contain a real multi-volume work (e.g. "VII · China"'s five-volume
     History of Imperial China) get verified exactly like a fiction series would. */
  const RANGE_RE = /^(\d+)\s*[–-]\s*(\d+)$/, INT_RE = /^\d+$/;
  const volTotal = new Map();
  {
    const groups = {};
    D.rows.forEach(r=>{ if(r.group) (groups[r.group] = groups[r.group]||[]).push(r); });
    for(const rows of Object.values(groups)){
      const contributing = [];
      let weird = false;
      for(const r of rows){
        const v = (r.vol||"").trim();
        if(v==="" || v==="—") continue;
        const rm = v.match(RANGE_RE);
        if(rm){ contributing.push({r, lo:+rm[1], hi:+rm[2]}); continue; }
        if(INT_RE.test(v)){ contributing.push({r, lo:+v, hi:+v}); continue; }
        if(/^\d/.test(v)) weird = true; // e.g. "2.5", "60+", "4 (Icewind Dale 1)"
      }
      if(weird || contributing.length < 2) continue;
      const covered = new Set();
      for(const c of contributing) for(let n=c.lo; n<=c.hi; n++) covered.add(n);
      const max = Math.max(...covered);
      let gap = false;
      for(let n=1; n<=max; n++) if(!covered.has(n)) gap = true;
      if(gap) continue;
      for(const c of contributing) if(c.lo===c.hi) volTotal.set(c.r, max);
    }
  }
  const volCell = r => {
    const v = (r.vol||"").trim();
    if(!v) return "—";
    const x = volTotal.get(r);
    return x ? `${esc(v)} of ${x}` : esc(v);
  };

  /* Pages: the 30 omnibus/collection rows that carry ncomp+comp_total get their real
     per-book breakdown from D.collections (matched 1:1 by title+author — verified against
     every current row, none unmatched), numbered from the row's own vol range start so a
     row like "Byzantium: The Apogee and Byzantium: The Decline and Fall" (vol "2–3") reads
     "2: …  3: …" rather than restarting at 1. A component with no known page count (2 of
     the 30 rows have exactly one) shows "—" rather than an invented figure; the total is
     the existing comp_total, already the sum of the known components only. */
  const collByKey = new Map(D.collections.map(c => [c.title+"|"+c.author, c]));
  const pageBreakdown = r => {
    if(!r.ncomp || r.comp_total==null) return null;
    const c = collByKey.get(r.title+"|"+r.author);
    if(!c) return null;
    const rm = (r.vol||"").trim().match(RANGE_RE);
    const start = (rm && (+rm[2]-+rm[1]+1)===c.comps.length) ? +rm[1] : 1;
    const lines = c.comps.map((comp,i)=>({label:`Book ${start+i}:`, val: comp.pages!=null?nf(comp.pages):"—"}));
    lines.push({label:"Total:", val: nf(r.comp_total)});
    return lines;
  };
  const pagesCell = r => {
    const bd = pageBreakdown(r);
    if(bd) return `<span class="pgbreak">${bd.map((l,i)=>
        `<span${i===bd.length-1?' class="pgtotal"':""}>${esc(l.label)}<br>${esc(l.val)}</span>`).join("")}</span>`
      + (r.physical!=null ? `<span class="pgphys muted">bound: ${nf(r.physical)} pp</span>` : "");
    return r.pages != null ? nf(r.pages)
    : r.physical != null ? `${nf(r.physical)}<br><span class="muted" style="font-size:11px">omnibus</span>`
    : r.comp_total ? `<span class="muted">${nf(r.comp_total)}</span><br><span class="muted" style="font-size:11px">sum of ${r.ncomp}</span>`
    : `<span class="muted">—</span>`;
  };
  const grCell = r => !r.gr ? `<span class="muted">—</span>`
    // r.gr[1] (ratings count) is optional: a handful of ratings are confirmed from the
    // owner's own Goodreads shelf but the shelf's list view doesn't expose a count, and
    // one wasn't otherwise found — show the star rating alone rather than a fabricated count.
    : `<span class="star">${r.gr[0].toFixed(2)}</span>` + (r.gr[1] != null
        ? `<br><span class="muted" style="font-size:11px">${shortN(r.gr[1])}</span>` : "");
  const awardCell = r => !r.awards || !r.awards.length ? `<span class="muted">—</span>`
    : r.awards.map(a=>`<span class="aw${a.indexOf("Author:")===0?" auth":""}">${esc(a)}</span>`).join("")
      + (r.awards_via ? `<span class="k">via components</span>` : "");
  const genreCell = r => !r.genre || !r.genre.length ? `<span class="muted">—</span>`
    : esc(r.genre.join(" · "));
  function sortVal(r){
    if(sortK==="grr") return r.gr ? r.gr[0] : -1;
    if(sortK==="nawards") return r.awards ? r.awards.length : 0;
    if(sortK==="pages") return r.pages!=null ? r.pages : (r.physical!=null ? r.physical : (r.comp_total || -1));
    return (r[sortK]||"").toString().toLowerCase();
  }

  /* ---- genre: built from what's actually in the data, not a hardcoded list ---- */
  const ALL_GENRES = [...new Set(D.rows.flatMap(r=>r.genre||[]))].sort((a,b)=>a.localeCompare(b));
  const selectedGenres = new Set();
  $("genreList").insertAdjacentHTML("beforeend", ALL_GENRES.map(g=>
    `<label class="gchk"><input type="checkbox" value="${esc(g)}"> ${esc(g)}</label>`
  ).join(""));
  $("genreList").addEventListener("change", e=>{
    if(e.target.type !== "checkbox") return;
    if(e.target.checked) selectedGenres.add(e.target.value); else selectedGenres.delete(e.target.value);
    render();
  });
  const genreDrop = $("genreDrop"), genreBtn = $("genreBtn"), genreList = $("genreList");
  function openGenreDrop(){
    genreList.hidden = false;
    genreBtn.setAttribute("aria-expanded", "true");
  }
  function closeGenreDrop(returnFocus){
    if(genreList.hidden) return;
    genreList.hidden = true;
    genreBtn.setAttribute("aria-expanded", "false");
    if(returnFocus) genreBtn.focus();
  }
  genreBtn.addEventListener("click", ()=> genreList.hidden ? openGenreDrop() : closeGenreDrop(false));
  // Dropdown stays open while ticking boxes; only these four things close it, matching
  // standard multi-select-popover behavior (a plain click on a checkbox must NOT close it).
  document.addEventListener("click", e=>{
    if(!genreList.hidden && !genreDrop.contains(e.target)) closeGenreDrop(false);
  });
  genreDrop.addEventListener("keydown", e=>{
    if(e.key === "Escape" && !genreList.hidden){ e.preventDefault(); closeGenreDrop(true); }
  });
  // Tabbing off the end of the checklist (or anywhere else outside .genredrop) left the
  // popover visibly open and overlapping whatever was focused next — the click-outside
  // listener above only ever fires on a mouse click, never on keyboard focus moving on.
  // focusout's relatedTarget is the element about to receive focus, so this only closes
  // when focus is actually leaving .genredrop, not when it's moving around inside it.
  genreDrop.addEventListener("focusout", e=>{
    if(!genreList.hidden && !genreDrop.contains(e.relatedTarget)) closeGenreDrop(false);
  });

  /* ---- filters: labels, active-filter chips, clear, count ---- */
  const CHIP_LABELS = {
    fs: {fiction:"Fiction", nonfiction:"History canon"},
    fk: {standalone:"Standalone", series:"Series volume", omnibus:"Omnibus file",
      multivolume:"Multi-volume work", collection:"Story collection", anthology:"Anthology"},
    fa: {"1":"Award winners only", "2":"Rated on Goodreads only"}
  };
  function activeFilters(){
    const out = [];
    const q = $("q").value.trim();
    if(q) out.push({key:"q", label:`Search: “${q}”`});
    selectedGenres.forEach(g=>out.push({key:"genre:"+g, label:`Genre: ${g}`}));
    ["fs","fk","fa"].forEach(id=>{
      const v = $(id).value;
      if(v) out.push({key:id, label:`${{fs:"Shelf",fk:"Format",fa:"Awards"}[id]}: ${CHIP_LABELS[id][v]}`});
    });
    return out;
  }
  function clearFilterKey(key){
    if(key.indexOf("genre:")===0){
      const g = key.slice(6);
      selectedGenres.delete(g);
      const cb = genreList.querySelector(`input[value="${CSS.escape(g)}"]`);
      if(cb) cb.checked = false;
    } else $(key).value = "";
    render();
  }
  document.getElementById("clearFilters").addEventListener("click", ()=>{
    ["q","fs","fk","fa"].forEach(id=>{ $(id).value = ""; });
    selectedGenres.clear();
    genreList.querySelectorAll("input[type=checkbox]").forEach(cb=>cb.checked=false);
    render();
  });
  $("activeFilters").addEventListener("click", e=>{
    const chip = e.target.closest(".chip");
    if(chip) clearFilterKey(chip.dataset.key);
  });
  function renderFilterChrome(){
    const active = activeFilters();
    const panelCount = ["fs","fk","fa"].filter(id=>$(id).value).length + (selectedGenres.size ? 1 : 0);
    $("activeFilters").innerHTML = active.map(f=>
      `<button type="button" class="chip" data-key="${f.key}" aria-label="Remove filter: ${esc(f.label)}">${esc(f.label)} <span aria-hidden="true">×</span></button>`
    ).join("");
    $("activeFilters").hidden = active.length === 0;
    $("clearFilters").hidden = active.length === 0;
    $("filtersToggle").textContent = panelCount ? `Filters (${panelCount})` : "Filters";
    genreBtn.classList.toggle("on", selectedGenres.size > 0);
    const genreLabel = selectedGenres.size === 0 ? "Genre"
      : selectedGenres.size === 1 ? `Genre: ${[...selectedGenres][0]}`
      : `Genres: ${selectedGenres.size} selected`;
    genreBtn.innerHTML = `${esc(genreLabel)}<span class="caret" aria-hidden="true"> ▾</span>`;
    return active.length > 0;
  }
  function render(){
    const q  = $("q").value.toLowerCase().trim();
    const fs = $("fs").value, fk = $("fk").value, fa = $("fa").value;
    const rs = D.rows.filter(r=>{
      if(fs && r.shelf!==fs) return false;
      if(fk && r.kind!==fk) return false;
      if(fa==="1" && !(r.awards && r.awards.length)) return false;
      if(fa==="2" && !r.gr) return false;
      if(selectedGenres.size && !(r.genre||[]).some(g=>selectedGenres.has(g))) return false;
      if(!q) return true;
      return [r.author,r.title,r.group,r.publisher,r.edition,r.notes,r.isbn,(r.genre||[]).join(" ")].join(" ").toLowerCase().includes(q);
    });
    rs.sort((a,b)=>{ const x=sortVal(a), y=sortVal(b); return (x>y?1:x<y?-1:0)*sortDir; });
    const anyFilterActive = renderFilterChrome();
    $("cnt").textContent = anyFilterActive
      ? `${rs.length} of ${D.rows.length} entries`
      : `${D.rows.length} entries`;
    const groupVolCell = r => {
      const g = r.group ? esc(r.group) : "";
      const v = volCell(r);
      const vPart = v !== "—" ? `<span class="k">${v}</span>` : "";
      if(!g && !vPart) return `<span class="muted">—</span>`;
      return g && vPart ? `${g}<br>${vPart}` : (g || vPart);
    };
    $("tb").innerHTML = rs.length ? rs.map(r=>`<tr>
      <td><span class="tag ${r.shelf}">${r.shelf==="fiction"?"Fiction":"Non-fiction"}</span></td>
      <td>${esc(r.author)}</td>
      <td class="t-title">${esc(r.title)}${r.ncomp?` <span class="k">· ${r.ncomp} books</span>`:""}</td>
      <td class="muted">${groupVolCell(r)}</td>
      <td class="genrecell">${genreCell(r)}</td>
      <td class="num">${pagesCell(r)}</td>
      <td class="num">${grCell(r)}</td>
      <td class="awards">${awardCell(r)}</td>
      <td class="num muted">${esc(r.year)||"—"}</td>
      <td class="notecell">${esc(r.notes)||""}</td></tr>`).join("")
      : `<tr><td colspan="10" class="muted" style="text-align:center;padding:26px 12px">No entries match these filters.</td></tr>`;
  }
  function sortBy(th){
    const k = th.dataset.k;
    if(sortK===k) sortDir *= -1;
    else { sortK = k; sortDir = (k==="pages"||k==="grr"||k==="nawards") ? -1 : 1; }
    document.querySelectorAll("#tbl th").forEach(x=>{ x.classList.remove("on"); x.removeAttribute("aria-sort"); });
    th.classList.add("on");
    th.setAttribute("aria-sort", sortDir>0 ? "ascending" : "descending");
    render();
  }
  document.querySelectorAll("#tbl th").forEach(th=>{
    th.setAttribute("tabindex","0");
    th.setAttribute("role","button");
    th.addEventListener("click",()=>sortBy(th));
    th.addEventListener("keydown",e=>{
      if(e.key==="Enter" || e.key===" "){ e.preventDefault(); sortBy(th); }
    });
  });
  ["q","fs","fk","fa"].forEach(id=>$(id).addEventListener("input", render));
  const filtersToggle = $("filtersToggle"), filterPanel = $("filterPanel");
  filtersToggle.addEventListener("click", ()=>{
    const open = filterPanel.classList.toggle("is-open");
    filtersToggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
  render();

  /* ---- canon ---- */
  $("canonGrid").innerHTML = D.canon.map(s=>`<div class="card">
    <h3>${esc(s.name)}</h3>
    <div class="meta">${s.listed} entries · ${s.volumes} volume${s.volumes===1?"":"s"}${s.listed!==s.claimed?` · file's table says ${s.claimed}`:""}</div>
    <ol class="books">${s.books.map(b=>`<li><span class="bt">${esc(b.title)}<br><span class="k">${esc(b.author)}</span>
      ${b.comps.length?`<ul class="sub">${b.comps.map(c=>`<li>${esc(c.title)}<span class="sp">${c.pages?nf(c.pages)+" pp":"—"}</span></li>`).join("")}</ul>`:""}</span>
      <span class="bp">${b.pages?nf(b.pages)+" pp":(b.comp_total?nf(b.comp_total)+" pp":"—")}</span></li>`).join("")}</ol>
    <div class="tot"><span>Section total</span><b>${nf(s.total)} pp</b></div></div>`).join("");

  $("cnotes").innerHTML = D.canonNotes.map(n=>
    `<div class="card"><p class="flag"><b>${esc(n.t)}</b>${esc(n.d)}</p></div>`).join("");

  /* ---- series ---- */
  $("seriesGrid").innerHTML = D.series.map(s=>`<div class="card">
    <h3>${esc(s.name)}</h3>
    <div class="meta">${s.count} volume${s.count===1?"":"s"} held</div>
    <ol class="books">${s.books.map(b=>`<li class="${b.dupe?"dupe":""}">
      <span class="bt">${esc(b.title)}${b.via?`<br><span class="k">via ${esc(b.via)}</span>`:""}</span>
      <span class="bp">${b.pages?nf(b.pages)+" pp":"—"}</span></li>`).join("")}</ol>
    <div class="tot"><span>Series total (held volumes)</span><b>${nf(s.total)} pp</b></div></div>`).join("");

  /* ---- collections ---- */
  $("cols").innerHTML = D.collections.map(c=>{
    const un = c.comps.filter(x=>x.pages==null).length;
    return `<div class="card">
      <h3>${esc(c.title)}</h3>
      <div class="meta"><span class="tag ${c.shelf}">${c.shelf==="fiction"?"Fiction":"Non-fiction"}</span> ${esc(c.author)} · ${esc(c.edition||"no print edition")}</div>
      <ol class="books">${c.comps.map(b=>`<li><span class="bt">${esc(b.title)}${b.note?`<br><span class="k">${esc(b.note)}</span>`:""}</span>
        <span class="bp">${b.pages?nf(b.pages)+" pp":"—"}</span></li>`).join("")}</ol>
      <div class="ledger">
        <span class="lbl">Physical single volume</span><span class="val">${c.physical?nf(c.physical)+" pp":"no single-volume edition"}</span>
        <span class="lbl">Component total${un?` (${c.comps.length-un} of ${c.comps.length} costed)`:""}</span><span class="val hi">${nf(c.comp_total)} pp</span>
        ${c.diff!=null?`<span class="lbl">Difference</span><span class="val">${c.diff>0?"+":""}${nf(c.diff)} pp</span>`:""}
      </div>
      <p class="cardnote">${esc(c.notes)}</p></div>`;}).join("");

  /* ---- ranks ---- */
  function ranklist(el, arr){
    const mx = Math.max(...arr.map(w=>w.pages));
    $(el).innerHTML = arr.map(w=>`<li>
      <span><span>${esc(w.title)}</span><span class="who">${esc(w.author)}</span></span>
      <span class="pg">${nf(w.pages)}</span>
      <span class="bar"><i class="${w.shelf==="nonfiction"?"nf":""}" style="width:${(w.pages/mx*100).toFixed(1)}%"></i></span></li>`).join("");
  }
  ranklist("long", D.longest); ranklist("short", D.shortest);

  /* ---- awards ---- */
  $("awardsGrid").innerHTML = D.awardGroups.map(g=>`<div class="card">
    <h3>${esc(g.label)}</h3>
    <div class="meta">${g.books.length} book${g.books.length===1?"":"s"}</div>
    <ul class="awlist">${g.books.map(b=>`<li>
      <span class="wt">${esc(b.title)}</span><span class="wa">${esc(b.author)}</span>
      ${b.awards.map(a=>`<span class="wx">${esc(a)}</span>`).join("")}</li>`).join("")}</ul></div>`).join("");

  /* ---- duplicates ---- */
  $("dups").innerHTML = D.duplicates.map(d=>`<div class="card">
    <h3>${esc(d.group)}</h3>
    <ol class="books">${d.items.map(i=>`<li><span class="bt">${esc(i)}</span></li>`).join("")}</ol>
    <p class="cardnote">${esc(d.note)}</p></div>`).join("");

  /* ---- reading orders: sequences transcribed from the source library's own
     reading-order notes, not derived from the catalogue. An item is only
     ever linked to a row when its title matches one exactly; anything else
     is shown as not yet catalogued rather than guessed at. ---- */
  if ($("readingOrders") && D.readingOrders) {
    $("readingOrders").innerHTML = D.readingOrders.map(ro=>{
      const n = ro.groups.reduce((s,g)=>s+g.items.length,0);
      const have = ro.groups.reduce((s,g)=>s+g.items.filter(i=>i.match).length,0);
      return `<div class="card">
      <h3>${esc(ro.title)}</h3>
      <div class="meta">${have} of ${n} already catalogued · from ${esc(ro.source)}</div>
      ${ro.groups.map(g=>`<div class="rogroup">
        ${g.heading?`<h4>${esc(g.heading)}</h4>`:""}
        <ol class="books">${g.items.map(i=>
          i.match
            ? `<li class="ro-hit" tabindex="0" role="button" data-title="${esc(i.match)}"><span class="bt">${esc(i.label)}</span></li>`
            : `<li class="ro-miss"><span class="bt">${esc(i.label)}</span><span class="ro-tag">${i.owned===false?"not owned":"not yet catalogued"}</span></li>`
        ).join("")}</ol></div>`).join("")}
      </div>`;
    }).join("");
    function activateRoHit(li){
      $("q").value = li.dataset.title; render();
      $("catalogue").scrollIntoView({behavior:"smooth", block:"start"});
    }
    $("readingOrders").addEventListener("click", e=>{
      const li = e.target.closest(".ro-hit"); if(!li) return;
      activateRoHit(li);
    });
    // Same reasoning as the shelf spines: tabindex/role="button" make these focusable, but
    // a <li> gets no native Enter/Space activation, so it needs its own keydown handler.
    $("readingOrders").addEventListener("keydown", e=>{
      if(e.key !== "Enter" && e.key !== " ") return;
      const li = e.target.closest(".ro-hit"); if(!li) return;
      e.preventDefault();
      activateRoHit(li);
    });
  }

  /* ---- nav scroll-spy ---- */
  const links = [...document.querySelectorAll("nav.top a")];
  const map = new Map(links.map(a=>[a.getAttribute("href").slice(1), a]));
  const obs = new IntersectionObserver(es=>{
    es.forEach(e=>{
      const a = map.get(e.target.id); if(!a) return;
      if(e.isIntersecting){ links.forEach(l=>l.classList.remove("active")); a.classList.add("active"); }
    });
  }, {rootMargin:"-70px 0px -70% 0px", threshold:0});
  document.querySelectorAll("section[id]").forEach(s=>obs.observe(s));
})();
