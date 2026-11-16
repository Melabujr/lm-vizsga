/* LM vizsgafelkészítő – statikus kliens, Supabase fiókkal vagy helyi móddal */
(() => {
const CFG = window.LM_CONFIG || {};
const SEC = {1:'Introduction to Lifestyle Medicine',2:'Health Behavior Change',3:'Key Clinical Processes',4:'Practitioner Health & Community Advocacy',5:'Nutrition',6:'Physical Activity',7:'Emotional & Mental Health',8:'Sleep Health',9:'Tobacco & Toxic Exposures',10:'Connectedness & Positive Psychology'};
const WEIGHT = {1:5.5,2:9.2,3:8.2,4:5.5,5:24.5,6:12.9,7:9,8:8.4,9:9,10:7.7};
const TYPE = {data:'Konkrét adat',study:'Kulcstanulmány',case:'Esettanulmány',comm:'Kommunikáció'};
const SRC = {orig:'Eredeti',gen:'Szimulált'};
const EXAM_N = 150, EXAM_SEC = 240*60, SEC_PER_Q = 96;
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const shuffle = a => { a = a.slice(); for (let i = a.length-1; i > 0; i--) { const j = Math.floor(Math.random()*(i+1)); [a[i],a[j]] = [a[j],a[i]]; } return a; };
const pct = (a,b) => b ? Math.round(100*a/b) : 0;
const fmtT = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s/3600), m = Math.floor(s%3600/60), x = s%60; return (h? h+':' : '') + String(m).padStart(h?2:1,'0') + ':' + String(x).padStart(2,'0'); };
const NOSHUF = /\b(all|none) of (the|these)( above)?\b|\bboth [a-e] and [a-e]\b|\b[a-e] and [a-e] are\b|\bare correct\b/i;

let sb = null, user = null, local = false, Q = [], QM = {}, store = null, view = {name:'home'}, timer = null, saveT = null, remoteOk = false;
const blank = () => ({stats:{}, attempts:[], current:null, updated:0});

/* ---------- tárolás ---------- */
const lsKey = () => 'lm_store_' + (user ? user.id : 'local');
function loadLocal() { try { return JSON.parse(localStorage.getItem(lsKey())) || blank(); } catch { return blank(); } }
function save() {
  store.updated = Date.now();
  try { localStorage.setItem(lsKey(), JSON.stringify(store)); } catch {}
  if (sb && user) { clearTimeout(saveT); saveT = setTimeout(pushRemote, 1500); }
}
function merge(a, b) { // két eszköz haladásának összefésülése: kérdésenként a frissebb adat, tesztek uniója
  const newer = (b.updated || 0) > (a.updated || 0) ? b : a, o = blank(), seen = {};
  o.stats = Object.assign({}, a.stats);
  for (const k in (b.stats || {})) { const x = o.stats[k], y = b.stats[k]; if (!x || (y.ts || 0) > (x.ts || 0)) o.stats[k] = y; }
  o.attempts = [...(a.attempts || []), ...(b.attempts || [])].filter(t => !seen[t.id] && (seen[t.id] = 1)).sort((x, y) => y.id - x.id).slice(0, 80);
  o.current = newer.current || null; o.updated = Math.max(a.updated || 0, b.updated || 0);
  return o;
}
async function pullRemote() {
  try {
    const { data, error } = await sb.from('progress').select('data').eq('user_id', user.id).maybeSingle();
    if (error) return false;
    if (data && data.data) store = merge(store, Object.assign(blank(), data.data));
    return true;
  } catch { return false; }
}
async function pushRemote() {
  if (!remoteOk) { // a szerveren lévő haladást még nem láttuk: előbb összefésüljük, nehogy felülírjuk
    remoteOk = await pullRemote();
    if (!remoteOk) return setSync('Nincs kapcsolat – a haladás ezen az eszközön megvan');
    try { localStorage.setItem(lsKey(), JSON.stringify(store)); } catch {}
  }
  let error; try { ({ error } = await sb.from('progress').upsert({ user_id: user.id, data: store, updated_at: new Date().toISOString() })); } catch (e) { error = e; }
  setSync(error ? 'Mentési hiba – a haladás ezen az eszközön megvan' : 'Mentve');
}
function setSync(t) { const e = $('#sync'); if (e) e.textContent = t; }
async function loadStore() {
  store = loadLocal(); remoteOk = false;
  if (sb && user) remoteOk = await pullRemote();
}
async function loadQuestions() {
  if (local) { Q = window.QUESTIONS || []; }
  else {
    const { data, error } = await sb.storage.from('content').download('questions.json');
    if (error) throw new Error('A kérdésbank nem tölthető le: ' + error.message);
    Q = JSON.parse(await data.text());
  }
  QM = Object.fromEntries(Q.map(q => [q.id, q]));
}

/* ---------- indulás, belépés ---------- */
async function boot() {
  if (CFG.url && CFG.key && window.supabase) sb = window.supabase.createClient(CFG.url, CFG.key);
  if (sb) {
    const { data } = await sb.auth.getSession();
    if (data.session) { user = data.session.user; return enter(); }
  }
  renderAuth();
}
async function enter() {
  $('#app').innerHTML = '<div class="card center">Betöltés…</div>';
  try { await loadQuestions(); await loadStore(); } catch (e) { $('#app').innerHTML = `<div class="card"><p class="bad">${esc(e.message)}</p><button data-act="logout">Vissza</button></div>`; return; }
  go(store.current ? 'test' : 'home');
}
function renderAuth(msg, mode = 'login') {
  const canLocal = !!window.QUESTIONS;
  $('#app').innerHTML = `<div class="card auth"><h1>Lifestyle Medicine vizsgafelkészítő</h1>
  <p class="muted">IBLM vizsgaszimulátor – 150 kérdés, 4 óra, válaszonkénti magyarázattal.</p>
  ${sb ? `<div class="seg"><button data-act="authmode" data-m="login" class="${mode==='login'?'on':''}">Belépés</button><button data-act="authmode" data-m="reg" class="${mode==='reg'?'on':''}">Regisztráció</button></div>
  <form id="authf" data-mode="${mode}">
    <label>E-mail<input name="email" type="email" required autocomplete="email"></label>
    <label>Jelszó<input name="pw" type="password" required minlength="8" autocomplete="${mode==='reg'?'new-password':'current-password'}"></label>
    ${mode==='reg' ? '<label>Meghívókód<input name="invite" required autocomplete="off"></label>' : ''}
    <button class="primary">${mode==='reg' ? 'Fiók létrehozása' : 'Belépés'}</button>
  </form>` : ''}
  ${msg ? `<p class="bad">${esc(msg)}</p>` : ''}
  ${canLocal ? '<hr><button data-act="local">Helyi mód fiók nélkül (csak ezen a gépen ment)</button>' : ''}</div>`;
}
async function onAuth(f) {
  const d = Object.fromEntries(new FormData(f)), mode = f.dataset.mode;
  const btn = f.querySelector('button'); btn.disabled = true;
  let res;
  try {
  if (mode === 'reg') res = await sb.auth.signUp({ email: d.email, password: d.pw, options: { data: { invite: (d.invite || '').trim() } } });
  else res = await sb.auth.signInWithPassword({ email: d.email, password: d.pw });
  } catch (e) { res = { error: e, data: {} }; }
  if (res.error) {
    const m = res.error.message || '';
    let t;
    if (mode === 'reg') t = /database error/i.test(m) ? 'Érvénytelen meghívókód.' : /already registered/i.test(m) ? 'Ezzel az e-mail-címmel már van fiók – a Belépés fülön lépj be.' : 'A regisztráció nem sikerült: ' + m;
    else t = /invalid login/i.test(m) ? 'Hibás e-mail-cím vagy jelszó.' : 'A belépés nem sikerült: ' + m;
    return renderAuth(t, mode);
  }
  if (!res.data.session) return renderAuth('A fiók létrejött. Erősítsd meg az e-mail-címedet a kapott levélben, majd lépj be.', 'login');
  user = res.data.session.user; enter();
}

/* ---------- kérdésválasztás ---------- */
const pool = src => Q.filter(q => q.src === src);
function rank(qs) { // előbb a még nem látott, aztán a legutóbb hibás, végül a legrégebben látott
  return shuffle(qs).sort((a,b) => { const x = store.stats[a.id], y = store.stats[b.id];
    const k = s => !s ? 0 : (s.last ? 2 : 1); return k(x)-k(y) || ((x&&x.ts)||0)-((y&&y.ts)||0); });
}
function pick(qs, n, weighted) {
  if (!weighted) return shuffle(rank(qs).slice(0, n));
  const secs = [...new Set(qs.map(q => q.sec))], tot = secs.reduce((s,k) => s+WEIGHT[k], 0);
  let out = [], rest = [];
  for (const k of secs) { const r = rank(qs.filter(q => q.sec === k)), need = Math.round(n*WEIGHT[k]/tot); out.push(...r.slice(0, need)); rest.push(...r.slice(need)); }
  if (out.length > n) out = shuffle(out).slice(0, n);
  if (out.length < n) out.push(...rank(rest).slice(0, n-out.length));
  return shuffle(out);
}
function startTest({label, qs, exam, limit}) {
  if (!qs.length) return modal('Ehhez a beállításhoz nincs elérhető kérdés.');
  store.current = { id: Date.now(), label, exam, limit, start: Date.now(), cur: 0, ans: {}, flag: {}, shown: {},
    items: qs.map(q => ({ id: q.id, order: q.src === 'orig' && Object.values(q.opts).some(o => NOSHUF.test(o)) ? Object.keys(q.opts) : shuffle(Object.keys(q.opts)) })) };
  save(); go('test');
}
function launch(f) {
  const d = Object.fromEntries(new FormData(f)), kind = d.kind, mode = d.mode || 'exam';
  const secs = [...f.querySelectorAll('input[name=sec]:checked')].map(i => +i.value);
  const inSec = q => !secs.length || secs.includes(q.sec);
  let qs = [], n = +d.n || 25, label = '';
  if (kind === 'exam') { n = EXAM_N; qs = pick(pool(d.src), n, true); label = `Vizsgaszimuláció – ${SRC[d.src]}`; }
  else if (kind === 'short') { qs = pick(pool(d.src), n, true); label = `Rövid teszt (${n}) – ${SRC[d.src]}`; }
  else if (kind === 'section') { if (!secs.length) return modal('Válassz legalább egy szekciót.'); qs = pick(pool(d.src).filter(inSec), n, false); label = `Szekciós teszt (${secs.join(', ')}.) – ${SRC[d.src]}`; }
  else if (kind === 'mix') {
    n = +d.n || 50; let no = d.unit === 'pct' ? Math.round(n*(+d.orig||0)/100) : (+d.orig||0), ng = d.unit === 'pct' ? n-no : (+d.gen||0);
    const a = pick(pool('orig').filter(inSec), no, !secs.length), b = pick(pool('gen').filter(inSec), ng, !secs.length);
    qs = shuffle([...a, ...b]); label = `Kevert teszt – ${a.length} eredeti + ${b.length} szimulált`;
  } else if (kind === 'wrong') { qs = shuffle(Q.filter(q => store.stats[q.id] && !store.stats[q.id].last && (!d.src || q.src === d.src))).slice(0, n); label = 'Hibanapló gyakorlás'; }
  const exam = kind === 'exam' ? true : mode === 'exam';
  startTest({ label, qs, exam, limit: kind === 'exam' ? EXAM_SEC : (exam ? qs.length*SEC_PER_Q : 0) });
}
/* oldalon belüli párbeszédablak (a böngésző saját confirm/alert ablaka beágyazott nézetben nem mindig jelenik meg) */
function modal(msg, onOk, okLabel) {
  document.querySelectorAll('.modal').forEach(x => x.remove());
  const m = document.createElement('div'); m.className = 'modal';
  m.innerHTML = `<div class="card" role="dialog" aria-modal="true"><p>${esc(msg)}</p><div class="mrow">${onOk ? '<button data-m="no">Mégse</button>' : ''}<button class="primary" data-m="ok">${esc(okLabel || 'Rendben')}</button></div></div>`;
  m.addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (!b && e.target !== m) return; e.stopPropagation(); m.remove(); if (b && b.dataset.m === 'ok' && onOk) onOk(); });
  m.addEventListener('keydown', e => { if (e.key === 'Escape') m.remove(); });
  document.body.appendChild(m); m.querySelector('[data-m=ok]').focus();
}
function finish() {
  const t = store.current; if (!t) return;
  clearInterval(timer);
  const rows = t.items.map((it, i) => [it.id, t.ans[i] || '', QM[it.id] ? QM[it.id].key : '']);
  let ok = 0; const now = Date.now();
  rows.forEach(([id, a, k]) => { const c = a && a === k; if (c) ok++; if (a) { const s = store.stats[id] || (store.stats[id] = {n:0,c:0}); s.n++; if (c) s.c++; s.last = c ? 1 : 0; s.ts = now; } });
  const att = { id: t.id, label: t.label, exam: t.exam, date: now, secs: Math.round((now-t.start)/1000), n: rows.length, ok, rows, orders: t.items.map(i => i.order.join('')) };
  store.attempts.unshift(att); if (store.attempts.length > 80) store.attempts.length = 80;
  store.current = null; save(); go('result', { att: att.id });
}

/* ---------- nézetek ---------- */
function go(name, p = {}) { view = { name, ...p }; clearInterval(timer); render(); window.scrollTo(0,0); }
function nav() {
  const tabs = [['home','Áttekintés'],['orig','Eredeti kérdések'],['gen','Szimulált kérdések'],['mix','Kevert teszt'],['progress','Haladás'],['wrong','Hibanapló']];
  return `<header><b>LM vizsgafelkészítő</b><nav>${tabs.map(([k,l]) => `<button data-act="go" data-v="${k}" class="${view.name===k?'on':''}">${l}</button>`).join('')}</nav>
  <span class="muted sm"><span id="sync"></span> ${local ? 'Helyi mód' : esc(user.email)} · <a href="#" data-act="logout">Kilépés</a></span></header>`;
}
function summary(src) {
  const qs = pool(src); let seen = 0, n = 0, c = 0, good = 0;
  qs.forEach(q => { const s = store.stats[q.id]; if (s) { seen++; n += s.n; c += s.c; if (s.last) good++; } });
  return { total: qs.length, seen, acc: pct(c,n), good };
}
const bar = (a,b,cls='') => `<div class="bar ${cls}"><i style="width:${pct(a,b)}%"></i></div>`;
function secChecks() { return `<div class="secs">${Object.keys(SEC).map(k => `<label class="chk"><input type="checkbox" name="sec" value="${k}"> ${k}. ${SEC[k]}</label>`).join('')}</div>`; }
const modeSel = `<label>Mód<select name="mode"><option value="exam">Vizsga mód – javítás a végén, időre</option><option value="practice">Gyakorló mód – azonnali magyarázat</option></select></label>`;

function vHome() {
  const o = summary('orig'), g = summary('gen'), ex = store.attempts.filter(a => a.n === EXAM_N && a.exam);
  const card = (t, s, v) => `<div class="card"><h3>${t}</h3><div class="big">${s.seen} / ${s.total}</div><div class="muted">megválaszolt kérdés · ${s.acc}% helyes válasz</div>${bar(s.seen, s.total)}<button data-act="go" data-v="${v}">Megnyitás</button></div>`;
  return `<div class="grid3">${card('Eredeti kérdések', o, 'orig')}${card('Szimulált kérdések', g, 'gen')}
  <div class="card"><h3>Vizsgaszimulációk</h3><div class="big">${ex.length}</div><div class="muted">${ex.length ? `legjobb: ${Math.max(...ex.map(a => pct(a.ok,a.n)))}% · utolsó: ${pct(ex[0].ok,ex[0].n)}%` : 'még nem volt teljes szimuláció'}</div><button data-act="go" data-v="progress">Részletek</button></div></div>
  <div class="card"><h3>A vizsgáról</h3><p>150 egyszerű választásos kérdés 4 óra alatt (átlagosan 96 másodperc kérdésenként). Kérdéstípusok: konkrét adat, kulcstanulmány, esettanulmány, kommunikáció. A szimulált kérdések forrása kizárólag a <i>Foundations of Lifestyle Medicine Board Review Manual, 4th Edition</i>; minden válaszlehetőséghez tartozik magyarázat és pontos hely (szekció, Objective, vázlatpont, oldal).</p></div>`;
}
function vBank(src) {
  const s = summary(src);
  if (!s.total) return `<div class="card"><h2>${SRC[src]} kérdések</h2><p class="muted">Ez a kérdésbank még feldolgozás alatt áll.</p></div>`;
  const hid = `<input type="hidden" name="src" value="${src}">`;
  return `<div class="card"><h2>${SRC[src]} kérdések</h2><p class="muted">${s.total} kérdés · ${s.seen} megválaszolva · ${s.acc}% helyes. Az új tesztek először a még nem látott, majd a legutóbb elrontott kérdésekből válogatnak.</p></div>
  <div class="grid3">
  <form class="card launch"><h3>Vizsgaszimuláció</h3><p>150 kérdés, 240 perc, szekciók a vizsga arányai szerint, javítás csak a végén.</p>${hid}<input type="hidden" name="kind" value="exam"><button class="primary" ${s.total < 150 ? 'disabled' : ''}>Indítás</button>${s.total < 150 ? '<p class="muted sm">Legalább 150 kérdés kell hozzá.</p>' : ''}</form>
  <form class="card launch"><h3>Rövid teszt</h3>${hid}<input type="hidden" name="kind" value="short"><label>Kérdésszám<select name="n"><option>25</option><option>50</option></select></label>${modeSel}<button class="primary">Indítás</button></form>
  <form class="card launch"><h3>Szekciós teszt</h3>${hid}<input type="hidden" name="kind" value="section"><label>Kérdésszám<select name="n"><option>10</option><option selected>25</option><option>50</option><option>100</option></select></label>${modeSel}${secChecks()}<button class="primary">Indítás</button></form></div>`;
}
function vMix() {
  return `<form class="card launch"><h2>Kevert teszt</h2><p class="muted">Állítsd be, mennyi eredeti és mennyi szimulált kérdés legyen a tesztben.</p><input type="hidden" name="kind" value="mix">
  <label>Megadás módja<select name="unit" id="unit"><option value="pct">Százalékosan</option><option value="cnt">Darabszámra</option></select></label>
  <div id="mixpct"><label>Összes kérdés<input type="number" name="n" value="50" min="5" max="150"></label><label>Eredeti kérdések aránya: <b id="pv">50</b>% (a többi szimulált)<input type="range" name="orig" min="0" max="100" step="5" value="50" id="pr"></label></div>
  <div id="mixcnt" hidden><label>Eredeti kérdések (db)<input type="number" name="orig" value="25" min="0" max="150" disabled></label><label>Szimulált kérdések (db)<input type="number" name="gen" value="25" min="0" max="150" disabled></label></div>
  ${modeSel}<p class="muted sm">Szekciószűrő (nem kötelező):</p>${secChecks()}<button class="primary">Indítás</button></form>`;
}
function vProgress() {
  const row = k => { const f = src => { const qs = pool(src).filter(q => q.sec == k); let seen = 0, n = 0, c = 0; qs.forEach(q => { const s = store.stats[q.id]; if (s) { seen++; n += s.n; c += s.c; } }); return { t: qs.length, seen, n, c }; };
    const o = f('orig'), g = f('gen'), acc = pct(o.c+g.c, o.n+g.n);
    return `<tr><td>${k}. ${SEC[k]}</td><td>${o.seen}/${o.t}</td><td>${g.seen}/${g.t}</td><td class="${o.n+g.n ? (acc >= 75 ? 'good' : acc < 60 ? 'bad' : '') : 'muted'}">${o.n+g.n ? acc+'%' : '–'}</td><td class="w">${bar(o.seen+g.seen, o.t+g.t)}</td></tr>`; };
  const ty = Object.keys(TYPE).map(t => { let n = 0, c = 0; Q.filter(q => q.type === t).forEach(q => { const s = store.stats[q.id]; if (s) { n += s.n; c += s.c; } }); return `<tr><td>${TYPE[t]}</td><td>${n}</td><td>${n ? pct(c,n)+'%' : '–'}</td></tr>`; }).join('');
  const o = summary('orig'), g = summary('gen');
  return `<div class="grid3"><div class="card"><h3>Eredeti</h3><div class="big">${o.seen} / ${o.total}</div><div class="muted">${o.acc}% helyes · ${o.good} kérdés legutóbb jó</div>${bar(o.seen,o.total)}</div>
  <div class="card"><h3>Szimulált</h3><div class="big">${g.seen} / ${g.total}</div><div class="muted">${g.acc}% helyes · ${g.good} kérdés legutóbb jó</div>${bar(g.seen,g.total)}</div>
  <div class="card"><h3>Összes teszt</h3><div class="big">${store.attempts.length}</div><div class="muted">kitöltött teszt</div></div></div>
  <div class="card"><h3>Szekciónként</h3><div class="scroll"><table><tr><th>Szekció</th><th>Eredeti</th><th>Szimulált</th><th>Helyes</th><th></th></tr>${Object.keys(SEC).map(row).join('')}</table></div></div>
  <div class="card"><h3>Kérdéstípusonként</h3><table><tr><th>Típus</th><th>Válaszok</th><th>Helyes</th></tr>${ty}</table></div>
  <div class="card"><h3>Korábbi tesztek</h3>${store.attempts.length ? `<div class="scroll"><table><tr><th>Dátum</th><th>Teszt</th><th>Eredmény</th><th>Idő</th><th></th></tr>${store.attempts.map(a => `<tr><td>${new Date(a.date).toLocaleString('hu-HU',{dateStyle:'short',timeStyle:'short'})}</td><td>${esc(a.label)}</td><td>${a.ok}/${a.n} (${pct(a.ok,a.n)}%)</td><td>${fmtT(a.secs)}</td><td><button data-act="review" data-id="${a.id}">Megnézem</button></td></tr>`).join('')}</table></div>` : '<p class="muted">Még nincs kitöltött teszt.</p>'}</div>`;
}
function vWrong() {
  const w = Q.filter(q => store.stats[q.id] && !store.stats[q.id].last);
  return `<form class="card launch"><h2>Hibanapló</h2><p>${w.length} kérdés, amelyet legutóbb elrontottál (${w.filter(q => q.src==='orig').length} eredeti, ${w.filter(q => q.src==='gen').length} szimulált). Ha egy kérdést újra jól válaszolsz meg, kikerül innen.</p>
  <input type="hidden" name="kind" value="wrong"><input type="hidden" name="mode" value="practice"><label>Kérdésszám<select name="n"><option>10</option><option selected>25</option><option>50</option></select></label>
  <button class="primary" ${w.length ? '' : 'disabled'}>Gyakorlás azonnali magyarázattal</button></form>
  <div class="card"><h3>Hibák szekciónként</h3><table>${Object.keys(SEC).map(k => `<tr><td>${k}. ${SEC[k]}</td><td>${w.filter(q => q.sec == k).length}</td></tr>`).join('')}</table></div>`;
}
function refHtml(q) {
  if (q.src === 'orig' && !q.ref) {
    return `<div class="ref"><b>Forrás:</b> ${esc(q.set || 'Eredeti kérdés')}${q.ext ? ' · <span class="tag warn">nem a tankönyv a forrás</span>' + (q.cit ? `<details><summary>Hivatkozott irodalom</summary>${esc(q.cit)}</details>` : '') : ' · a Board Review Manual azonos szekciójához tartozó kvíz'}</div>${q.note ? `<div class="ref">${esc(q.note)}</div>` : ''}`;
  }
  const parts = String(q.ref || '').split(';').map(p => p.trim()).filter(Boolean).map(p => { const a = p.split('|').map(x => x.trim()); if (a[0] === 'EXT') return 'Nem a tankönyv a forrás: ' + esc(a.slice(1).join(', '));
    const obj = /^Obj/.test(a[0]) ? a[0].replace('Obj','Objective') : null, rest = obj ? a.slice(1) : a; const pg = rest.filter(x => /^p\./.test(x)).map(x => x.replace('p.','') + '. o.'), oth = rest.filter(x => !/^p\./.test(x));
    return [`Section ${q.sec}`, obj, ...oth, ...pg].filter(Boolean).map(esc).join(' · '); });
  return `<div class="ref"><b>Forrás:</b> ${q.ext ? '<span class="tag warn">nem a tankönyv</span> ' : 'Board Review Manual, 4th ed. – '}${parts.join('; ')}</div>${q.note ? `<div class="ref">${esc(q.note)}</div>` : ''}`;
}
function qHtml(q, order, chosen, reveal, idx) {
  const L = 'ABCDE';
  return `<div class="qtext">${esc(q.q)}</div><div class="opts">${order.map((o, i) => { const isKey = o === q.key, sel = chosen === o;
    const cls = reveal ? (isKey ? 'ok' : sel ? 'no' : '') : (sel ? 'sel' : '');
    return `<button class="opt ${cls}" ${reveal ? 'disabled' : ''} data-act="ans" data-i="${idx}" data-o="${o}"><span class="l">${L[i]}</span><span><span class="ot">${esc(q.opts[o])}</span>${reveal ? `<span class="ex">${isKey ? '✓ Helyes. ' : sel ? '✗ Ezt jelölted. ' : ''}${esc(String((q.exp||{})[o] || '').replace(/^Helyes[:.]\s*/, ''))}</span>` : ''}</span></button>`; }).join('')}</div>
  ${reveal ? (q.fb ? (Object.keys(q.exp || {}).length ? `<details class="ref"><summary>Eredeti magyarázat (angol)</summary>${esc(q.fb)}</details>` : `<div class="ref fb"><b>Magyarázat (eredeti, angol):</b> ${esc(q.fb)}</div>`) : '') + refHtml(q) : ''}`;
}
function vTest() {
  const t = store.current, i = t.cur, it = t.items[i], q = QM[it.id], n = t.items.length, done = Object.keys(t.ans).length;
  const reveal = !t.exam && !!t.shown[i];
  return `<div class="tbar"><b>${esc(t.label)}</b><span>${i+1} / ${n}</span><span>${done} megválaszolva</span>${t.limit ? '<span id="clock" class="clock"></span>' : ''}<button data-act="finish" class="danger">Befejezés</button></div>
  <div class="card q"><div class="meta"><span class="tag">${SRC[q.src]}</span><span class="tag">${q.sec}. ${SEC[q.sec]}</span><label class="chk"><input type="checkbox" data-act="flag" ${t.flag[i] ? 'checked' : ''}> Megjelölöm</label></div>
  ${qHtml(q, it.order, t.ans[i], reveal, i)}
  <div class="row"><button data-act="step" data-d="-1" ${i ? '' : 'disabled'}>← Előző</button>${!t.exam && !reveal ? `<button data-act="show" ${t.ans[i] ? '' : 'disabled'} class="primary">Ellenőrzés</button>` : ''}<button data-act="step" data-d="1" ${i < n-1 ? '' : 'disabled'} class="${t.exam || reveal ? 'primary' : ''}">Következő →</button></div></div>
  <div class="card"><div class="navg">${t.items.map((_, k) => `<button data-act="jump" data-k="${k}" class="${k===i?'cur':''} ${t.ans[k]?'a':''} ${t.flag[k]?'f':''}">${k+1}</button>`).join('')}</div><p class="muted sm">Kitöltött = megválaszolt · narancs keret = megjelölt</p></div>`;
}
function vResult() {
  const a = store.attempts.find(x => x.id == view.att); if (!a) return '<div class="card">A teszt nem található.</div>';
  const bySec = {}, byT = {};
  a.rows.forEach(([id, ans, k]) => { const q = QM[id]; if (!q) return; const s = bySec[q.sec] || (bySec[q.sec] = [0,0]), t = byT[q.type] || (byT[q.type] = [0,0]); s[1]++; t[1]++; if (ans === k) { s[0]++; t[0]++; } });
  const only = view.only || 'all';
  const list = a.rows.map(([id, ans, k], i) => ({ q: QM[id], ans, i, order: (a.orders[i] || '').split('') })).filter(r => r.q && (only === 'all' || (only === 'wrong' ? r.ans !== r.q.key : r.ans === r.q.key)));
  return `<div class="card"><h2>${esc(a.label)}</h2><div class="big ${pct(a.ok,a.n) >= 70 ? 'good' : 'bad'}">${a.ok} / ${a.n} · ${pct(a.ok,a.n)}%</div><div class="muted">Idő: ${fmtT(a.secs)} · átlag ${Math.round(a.secs/a.n)} mp/kérdés · megválaszolatlan: ${a.rows.filter(r => !r[1]).length}</div>
  <div class="grid2"><table><tr><th>Szekció</th><th>Eredmény</th></tr>${Object.keys(bySec).map(k => `<tr><td>${k}. ${SEC[k]}</td><td>${bySec[k][0]}/${bySec[k][1]} (${pct(...bySec[k])}%)</td></tr>`).join('')}</table>
  <table><tr><th>Típus</th><th>Eredmény</th></tr>${Object.keys(byT).map(k => `<tr><td>${TYPE[k] || k}</td><td>${byT[k][0]}/${byT[k][1]} (${pct(...byT[k])}%)</td></tr>`).join('')}</table></div>
  <div class="seg">${[['all','Mind'],['wrong','Csak a hibásak'],['right','Csak a helyesek']].map(([k,l]) => `<button data-act="only" data-o="${k}" class="${only===k?'on':''}">${l}</button>`).join('')}</div></div>
  ${list.map(r => `<div class="card q"><div class="meta"><b>${r.i+1}.</b><span class="tag">${SRC[r.q.src]}</span><span class="tag">${r.q.sec}. ${SEC[r.q.sec]}</span><span class="tag">${TYPE[r.q.type] || ''}</span>${r.ans ? '' : '<span class="tag warn">nem válaszoltál</span>'}</div>${qHtml(r.q, r.order.length ? r.order : Object.keys(r.q.opts), r.ans, true, r.i)}</div>`).join('')}`;
}
function render() {
  const v = view.name, body = v === 'home' ? vHome() : v === 'orig' || v === 'gen' ? vBank(v) : v === 'mix' ? vMix() : v === 'progress' ? vProgress() : v === 'wrong' ? vWrong() : v === 'test' ? vTest() : vResult();
  $('#app').innerHTML = (v === 'test' ? '' : nav()) + `<main>${body}</main>`;
  if (v === 'test' && store.current.limit) { const tick = () => { const t = store.current; if (!t) return; const left = t.limit - (Date.now()-t.start)/1000, c = $('#clock'); if (c) { c.textContent = '⏱ ' + fmtT(left); c.classList.toggle('low', left < 300); } if (left <= 0) { modal('Lejárt az idő – a tesztet lezárom.'); finish(); } }; tick(); timer = setInterval(tick, 1000); }
}

/* ---------- események ---------- */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'INPUT') return;
  const act = b.dataset.act, t = store && store.current;
  if (act === 'go') go(b.dataset.v);
  else if (act === 'authmode') renderAuth('', b.dataset.m);
  else if (act === 'local') { local = true; user = null; enter(); }
  else if (act === 'logout') { e.preventDefault(); (sb && user ? sb.auth.signOut() : Promise.resolve()).then(() => { user = null; local = false; renderAuth(); }); }
  else if (act === 'ans') { const i = +b.dataset.i; if (!t || (!t.exam && t.shown[i])) return; t.ans[i] = t.ans[i] === b.dataset.o && t.exam ? undefined : b.dataset.o; if (t.ans[i] === undefined) delete t.ans[i]; save(); render(); }
  else if (act === 'show') { t.shown[t.cur] = 1; save(); render(); }
  else if (act === 'step') { t.cur += +b.dataset.d; save(); render(); window.scrollTo(0,0); }
  else if (act === 'jump') { t.cur = +b.dataset.k; save(); render(); window.scrollTo(0,0); }
  else if (act === 'finish') { const left = t.items.length - Object.keys(t.ans).length; modal(left ? `Még ${left} kérdésre nem válaszoltál. Biztosan befejezed?` : 'Befejezed és kiértékeled a tesztet?', finish, 'Befejezés'); }
  else if (act === 'review') go('result', { att: b.dataset.id });
  else if (act === 'only') { view.only = b.dataset.o; render(); }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.act === 'flag') { const t = store.current; if (el.checked) t.flag[t.cur] = 1; else delete t.flag[t.cur]; save(); render(); }
  if (el.id === 'unit') { const p = el.value === 'pct'; $('#mixpct').hidden = !p; $('#mixcnt').hidden = p; document.querySelectorAll('#mixpct input').forEach(i => i.disabled = !p); document.querySelectorAll('#mixcnt input').forEach(i => i.disabled = p); }
});
document.addEventListener('input', e => { if (e.target.id === 'pr') $('#pv').textContent = e.target.value; });
document.addEventListener('submit', e => { e.preventDefault(); const f = e.target; if (f.id === 'authf') onAuth(f); else if (f.classList.contains('launch')) launch(f); });
boot();
})();
