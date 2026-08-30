/* The Long Shelf — rendering */
(function () {
  const D = window.SHELF_DATA;
  const KIND = {standalone:"Standalone", series:"Series vol.", omnibus:"Omnibus file",
    multivolume:"Multi-volume", collection:"Collection", anthology:"Anthology"};
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
  document.body.addEventListener("click", e => {
    const sp = e.target.closest(".spine"); if(!sp) return;
    const s = D[sp.dataset.k][+sp.dataset.i];
    $("q").value = s.v || s.t; render();
    $("catalogue").scrollIntoView({behavior:"smooth", block:"start"});
  });

  /* ---- table ---- */
  let sortK = "shelf", sortDir = 1;
  const pagesCell = r =>
    r.pages != null ? nf(r.pages)
    : r.physical != null ? `${nf(r.physical)}<br><span class="muted" style="font-size:11px">omnibus</span>`
    : r.comp_total ? `<span class="muted">${nf(r.comp_total)}</span><br><span class="muted" style="font-size:11px">sum of ${r.ncomp}</span>`
    : `<span class="muted">—</span>`;
  const grCell = r => !r.gr ? `<span class="muted">—</span>`
    : `<span class="star">${r.gr[0].toFixed(2)}</span><br><span class="muted" style="font-size:11px">${shortN(r.gr[1])}</span>`;
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
  // Dropdown stays open while ticking boxes; only these three things close it, matching
  // standard multi-select-popover behavior (a plain click on a checkbox must NOT close it).
  document.addEventListener("click", e=>{
    if(!genreList.hidden && !genreDrop.contains(e.target)) closeGenreDrop(false);
  });
  genreDrop.addEventListener("keydown", e=>{
    if(e.key === "Escape" && !genreList.hidden){ e.preventDefault(); closeGenreDrop(true); }
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
    $("tb").innerHTML = rs.length ? rs.map(r=>`<tr>
      <td><span class="tag ${r.shelf}">${r.shelf==="fiction"?"Fiction":"History"}</span></td>
      <td>${esc(r.author)}</td>
      <td class="t-title">${esc(r.title)}${r.ncomp?` <span class="k">· ${r.ncomp} books</span>`:""}</td>
      <td class="muted">${esc(r.group)||"—"}</td>
      <td class="num muted">${esc(r.vol)||"—"}</td>
      <td class="k">${KIND[r.kind]||r.kind}</td>
      <td class="genrecell">${genreCell(r)}</td>
      <td class="num">${pagesCell(r)}</td>
      <td class="num">${grCell(r)}</td>
      <td class="awards">${awardCell(r)}</td>
      <td class="muted">${esc(r.edition)||"—"}</td>
      <td class="muted">${esc(r.publisher)||"—"}</td>
      <td class="num muted">${esc(r.year)||"—"}</td>
      <td class="muted" style="font-family:var(--mono);font-size:11px">${esc(r.isbn)||"—"}</td>
      <td class="notecell">${esc(r.notes)||""}</td></tr>`).join("")
      : `<tr><td colspan="15" class="muted" style="text-align:center;padding:26px 12px">No entries match these filters.</td></tr>`;
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
      <div class="meta"><span class="tag ${c.shelf}">${c.shelf==="fiction"?"Fiction":"History"}</span> ${esc(c.author)} · ${esc(c.edition||"no print edition")}</div>
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

  /* ---- ratings ---- */
  $("rated").innerHTML = D.topRated.map(w=>`<li>
    <span><span>${esc(w.title)}</span><span class="who">${esc(w.author)}</span></span>
    <span class="pg">${w.r.toFixed(2)}</span>
    <span class="bar"><i class="${w.shelf==="nonfiction"?"nf":""}" style="width:${((w.r-3)/2*100).toFixed(1)}%"></i></span>
    <span class="n" style="grid-column:2/4">${shortN(w.n)} ratings</span></li>`).join("");

  /* ---- duplicates ---- */
  $("dups").innerHTML = D.duplicates.map(d=>`<div class="card">
    <h3>${esc(d.group)}</h3>
    <ol class="books">${d.items.map(i=>`<li><span class="bt">${esc(i)}</span></li>`).join("")}</ol>
    <p class="cardnote">${esc(d.note)}</p></div>`).join("");

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
