/* הממשק. הנתונים נשמרים רק בטלפון (localStorage). אין שרת ואין AI. */
(function () {
'use strict';
const E = window.Engine, KEY = 'run_state_v1';
let st = load(), tab = 'today', opts = [];
const NATIVE = !!(window.Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform());

function load() {
  try {
    const r = localStorage.getItem(KEY);
    if (r) {
      const o = Object.assign(E.newState(), JSON.parse(r));
      if (!o.weights.some(w => w.start)) o.weights.push({ date: '2026-11-18', kg: 113.6, start: true });   // משקל התחלה לפני הירידה
      o.weights.forEach(w => { if (w.date === E.CFG.startWeightDate && w.kg === 109) w.kg = 111; });
      if (o.settings.weighTime === '08:00') o.settings.weighTime = '10:00';
      if (!o.v || o.v < 2) {   // מעבר לשבוע שבת עד שישי: תוכניות שבועיות ישנות נמחקות (רק מה שבוצע נשמר) ומתכננים מחדש
        o.sessions = o.sessions.filter(s => s.kind === 'race' || s.status === 'done' || s.week === 0);
        o.sessions.forEach(s => { s.week = s.kind === 'race' ? 16 : Math.max(0, E.weekNo(s.date)); });
        o.plannedWeeks = o.plannedWeeks.filter(w => w === 0); o.reviews = []; o.v = 2;
      }       // תיקון: 109 היה טעות
      return o;
    }
  } catch (e) {}
  return E.newState();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { toast('השמירה נכשלה: האחסון מלא או חסום'); } if (NATIVE) queueSchedule(); }
function todayIso() { const n = new Date(); return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0') + '-' + String(n.getDate()).padStart(2, '0'); }
function nowHM() { const n = new Date(); return String(n.getHours()).padStart(2, '0') + ':' + String(n.getMinutes()).padStart(2, '0'); }
const $ = s => document.querySelector(s);
const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
let toastT;
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('on'), 3200); }
function sheet(html) { const s = $('#sheet'); s.innerHTML = '<div class="in">' + html + '</div>'; s.hidden = false; }
function closeSheet() { $('#sheet').hidden = true; $('#sheet').innerHTML = ''; }
function dirty() { st.icsDirty = true; save(); }

/* ---------- תחזוקה בכל פתיחה ---------- */
function curWeek() { return Math.max(0, E.weekNo(todayIso())); }
function maintain() {
  const t = todayIso(), cw = E.weekNo(t);
  if (st.sessions.some(s => s.week === 0) && !st.sessions.some(s => s.id === '0-strA') && t <= '2026-11-27')
    st.sessions.push({ id: '0-strA', week: 0, kind: 'strA', date: '2026-11-27', level: 1, status: 'planned', seq: 0, taper: false });
  for (let w = 1; w < cw && w <= E.CFG.lastWeek; w++) {
    if (st.reviews.some(r => r.week === w)) continue;
    if (st.plannedWeeks.indexOf(w) >= 0) E.closeWeek(st, w);
    else { const f = st.level; st.level = Math.max(1, st.level - 1); st.reviews.push({ week: w, from: f, to: st.level, why: 'השבוע לא תוכנן ולא בוצעו אימונים, אז חוזרים צעד אחורה' }); }
  }
  save();
}

/* ---------- ניווט ---------- */
const TABS = [['today', '🏠', 'היום'], ['week', '📅', 'שבוע'], ['progress', '📈', 'התקדמות'], ['weight', '⚖️', 'משקל'], ['more', '⚙️', 'עוד']];
function render() {
  $('#nav').innerHTML = TABS.map(t => '<button data-act="tab" data-v="' + t[0] + '" class="' + (tab === t[0] ? 'on' : '') + '"><b>' + t[1] + '</b>' + t[2] + '</button>').join('');
  const t = todayIso(), d = E.diff(t, E.CFG.race);
  $('#sub').textContent = E.dayName(t) + ' ' + E.fmt(t) + (d > 0 ? ' · ' + d + ' ימים למרוץ' : d === 0 ? ' · היום המרוץ!' : '');
  ({ today: vToday, week: vWeek, progress: vProgress, weight: vWeight, more: vMore })[tab]();
  window.scrollTo(0, 0);
}

/* ---------- כרטיס אימון ---------- */
function logSummary(s) {
  const l = s.log; if (!l) return '';
  const p = [];
  if (l.substitute === 'walk') p.push('הליכה מהירה במקום ריצה'); else if (l.substitute === 'activity') p.push('הוחלף בפעילות אחרת');
  if (l.minutes) p.push(l.minutes + ' דקות'); if (l.km) p.push(l.km + ' ק"מ'); if (l.rpe) p.push('מאמץ ' + l.rpe + ' מתוך 10');
  if (l.soreness != null && !l.substitute) p.push('כאבי שרירים מהאימון הקודם ' + l.soreness); if (l.pain) p.push('היה כאב');
  return '<div class="mut" style="margin-top:6px">✓ בוצע: ' + esc(p.join(' · ')) + '</div>';
}
function sessionCard(s, big) {
  const d = E.describe(s), tg = s.status === 'done' ? '<span class="tag ok">בוצע</span>' : s.status === 'skipped' ? '<span class="tag">לא בוצע</span>' : s.postponed ? '<span class="tag warn">נדחה לעוד היום</span>' : '';
  let h = '<div class="card"><h2>' + esc(d.title) + tg + '</h2><div class="mut">' + E.dayName(s.date) + ' ' + E.fmt(s.date) + ' · כ-' + d.minutes + ' דקות · שלב ' + s.level + '</div>' + logSummary(s);
  if (big || s.status === 'planned') h += '<ul class="l">' + d.lines.map(l => '<li>' + esc(l) + '</li>').join('') + '</ul><div class="tip">' + esc(d.tip) + '</div>';
  if (s.status === 'planned') h += '<div class="row"><button class="b coral" style="flex-basis:100%" data-act="livestart" data-sid="' + s.id + '">▶️ התחל אימון</button><button class="b alt" data-act="done" data-sid="' + s.id + '">✅ בוצע</button><button class="b alt" data-act="later" data-sid="' + s.id + '">⏰ היום, אחר כך</button><button class="b alt" data-act="unsure" data-sid="' + s.id + '">🤔 לא בטוח</button></div>';
  return h + '</div>';
}

/* ---------- היום ---------- */
function vToday() {
  $('#title').textContent = 'היום';
  const t = todayIso(), wn = curWeek(); let h = '';
  const missed = E.missedSessions(st, t);
  missed.forEach(s => {
    const d = E.describe(s);
    h += '<div class="card banner"><h3>לא עדכנת על ' + esc(d.title) + ' של יום ' + E.dayName(s.date) + '</h3><div class="mut">מה קרה?</div><div class="row"><button class="b alt" data-act="done" data-sid="' + s.id + '">בוצע בעצם</button><button class="b" data-act="unsure" data-sid="' + s.id + '">לא בוצע</button></div></div>';
  });
  if (t > E.CFG.race) { const x = E.totals(st); return $('#main').innerHTML = h + '<div class="card good"><h2>סיימת את המסע 🎉</h2><p>' + x.runs + ' ריצות, ' + x.strength + ' אימוני כוח, ' + x.minutes + ' דקות של אימון. מה שבנית נשאר איתך.</p></div>'; }
  const fri = E.dow(t) === 5, nx = wn + 1;
  if (fri && nx >= 1 && nx <= E.CFG.lastWeek && st.plannedWeeks.indexOf(nx) < 0) h += '<div class="card banner"><h2>📅 היום מתכננים את שבוע ' + nx + '</h2><p>השבוע הבא מתחיל מחר, שבת ' + E.fmt(E.weekStartOf(nx)) + ', ונגמר בשישי ' + E.fmt(E.addDays(E.weekStartOf(nx), 6)) + '. נסכם את השבוע הזה ונבחר ימים לריצה ולכוח.</p><div class="row"><button class="b coral" data-act="plan" data-wn="' + nx + '">לתכנון השבוע הבא</button></div></div>';
  else if (wn === 0 && st.plannedWeeks.indexOf(1) < 0) h += '<div class="card banner"><h2>שבוע 1 מתחיל בשבת ' + E.fmt(E.CFG.start) + '</h2><p>שבוע הפתיחה נגמר ביום שישי ' + E.fmt(E.addDays(E.CFG.start, -1)) + ' עם אימון כוח. ביום שישי מתכננים את שבוע 1 (שבת עד שישי). אפשר גם כבר עכשיו.</p><div class="row"><button class="b alt" data-act="plan" data-wn="1">לתכנון שבוע 1</button></div></div>';
  if (wn >= 1 && st.plannedWeeks.indexOf(wn) < 0 && wn <= E.CFG.lastWeek) {
    const early = t < E.CFG.start;
    h += '<div class="card banner"><h2>' + (early ? 'מתחילים בשבת ' + E.fmt(E.CFG.start) : 'שבוע חדש: ' + wn + ' מתוך 16') + '</h2><p>' + (early ? 'אפשר כבר עכשיו לתכנן את השבוע הראשון.' : 'עוד לא תכננו את השבוע. נסכם את הקודם ונסדר את הימים.') + '</p><div class="row"><button class="b coral" data-act="plan" data-wn="' + wn + '">לתכנון השבוע</button></div></div>';
  }
  if (!NATIVE && st.icsDirty) h += '<div class="card"><h3>היומן לא מעודכן</h3><div class="mut">התוכנית השתנתה. כדי שהתזכורת תקפוץ ביומן בשעה הנכונה, הורד קובץ יומן ופתח אותו.</div><div class="row"><button class="b alt" data-act="ics">עדכון היומן</button></div></div>';
  const wd = E.weighDue(st, t);
  if (wd) h += '<div class="card banner"><h2>⚖️ ' + (wd.today ? 'יום שקילה' : 'עוד לא נשקלת השבוע') + '</h2><div class="mut">לפני האימון, בבוקר, אחרי שירותים ולפני אכילה. מספר אחד אחרי הנקודה, למשל 108.4</div><input id="tw" type="number" inputmode="decimal" step="0.1" min="30" max="300" placeholder="' + E.weightList(st).slice(-1)[0].kg.toFixed(1) + '" style="margin-top:8px"><div class="row"><button class="b coral" data-act="todayweight">שמירת משקל</button></div></div>';
  if (t < E.CFG.start && !st.sessions.some(x => x.week === 0)) {
    const smp = { kind: 'easy1', level: 1 }, dd = E.describe(smp), ww = E.workoutFor(smp);
    h += '<div class="card banner"><h2>רוצה להתחיל כבר היום?</h2><p>ריצה קלה ראשונה, כ-' + dd.minutes + ' דקות: חימום, ' + (ww.cont ? ww.cont + ' דקות ריצה' : 'דקה ריצה ושתי דקות הליכה (' + ww.reps + ' פעמים)') + ', וקירור. אחרי זה נחים, בשישי אימון כוח קל, ושבוע 1 מתחיל בשבת.</p><div class="row"><button class="b coral" data-act="startnow">🏃 מתחילים היום</button><button class="b alt" data-act="pastopening">כבר ביצעתי ב-' + E.fmt(E.CFG.firstDay) + '</button></div></div>';
  }
  const today = st.sessions.filter(s => s.date === t);
  if (t === E.CFG.race) h += sessionCard(today.find(s => s.kind === 'race'), true);
  else if (today.length) h += today.map(s => sessionCard(s, true)).join('');
  else {
    const next = st.sessions.filter(s => s.status === 'planned' && s.date > t && s.kind !== 'race').sort((a, b) => a.date < b.date ? -1 : 1)[0];
    h += '<div class="card"><h2>היום מנוחה</h2><p>מנוחה היא חלק מהאימון, כאן הגוף נבנה. מותר (לא חובה) הליכה מהירה של 30 עד 40 דקות או אופניים.</p>' + (next ? '<div class="mut">האימון הבא: ' + esc(E.describe(next).title) + ', יום ' + E.dayName(next.date) + ' ' + E.fmt(next.date) + '</div>' : '') + '</div>';
  }
  const c = E.cheer(st, t); if (c) h += '<div class="card good">' + esc(c) + '</div>';
  h += '<div class="mut" style="text-align:center">שלב ' + st.level + ' מתוך 16 · התוכנית אינה תחליף לייעוץ רפואי</div>';
  $('#main').innerHTML = h;
}

/* ---------- שבוע ---------- */
let viewWeek = null;
function weekRows(wn) {   // שורות לשבוע: מה שנשמר, או הצעת האפליקציה / תחזית
  const planned = st.plannedWeeks.indexOf(wn) >= 0, real = st.sessions.filter(s => s.week === wn && s.kind !== 'race' && !s.dropped);
  if (wn === 0 || planned || real.length) return { list: real, kind: 'real' };
  const cw = Math.max(curWeek(), 1), lvl = wn <= cw ? st.level : Math.min(16, st.level + (wn - cw));
  return { list: E.previewWeek(lvl, wn), kind: (wn === cw || wn === cw + 1 || wn === curWeek() + 1) ? 'proposal' : 'forecast', level: lvl };
}
function vWeek() {
  $('#title').textContent = 'השבוע'; const t = todayIso(), cw = curWeek(), wn = Math.min(16, Math.max(0, viewWeek == null ? cw : viewWeek)), hasW0 = st.sessions.some(x => x.week === 0);
  const r = weekRows(wn), race = st.sessions.find(s => s.kind === 'race');
  let h = '<div class="card"><div class="row" style="margin:0 0 8px;align-items:center"><button class="b alt sm" data-act="weekgo" data-wn="' + (wn - 1) + '" ' + (wn <= (hasW0 ? 0 : 1) ? 'disabled' : '') + ' aria-label="השבוע הקודם">›</button><div style="flex:3;text-align:center"><h2 style="margin:0">' + (wn === 0 ? 'שבוע פתיחה' : 'שבוע ' + wn + ' מתוך 16') + '</h2><div class="mut">' + E.fmt(wn === 0 ? E.CFG.firstDay : E.weekStartOf(wn)) + ' עד ' + E.fmt(E.addDays(E.weekStartOf(wn), 6)) + (wn === cw ? ' · השבוע הנוכחי' : '') + '</div></div><button class="b alt sm" data-act="weekgo" data-wn="' + (wn + 1) + '" ' + (wn >= 16 ? 'disabled' : '') + ' aria-label="השבוע הבא">‹</button></div>';
  if (r.kind === 'proposal') h += '<div class="tip">זו הצעה של האפליקציה, עוד לא אושרה. אם כל הימים פנויים, זה הסידור. כדי לבחור ימים אחרים או לאשר, לחץ על "תכנון השבוע".</div>';
  if (r.kind === 'forecast') h += '<div class="tip">תחזית בלבד (שלב ' + r.level + '), בהנחה שהכול מתקדם כמתוכנן. היא תתעדכן לפי הביצוע בפועל.</div>';
  E.weekDatesVisible(wn).forEach(d => {
    const ss = r.list.filter(s => s.date === d);
    if (wn === 16 && d === E.CFG.race) ss.push(race);
    h += '<div class="wk' + (d === t ? ' today' : '') + '"><div class="d">' + E.dayName(d) + '<small>' + E.fmt(d) + '</small></div><div class="t">';
    if (!ss.length) h += '<span class="mut">מנוחה</span>';
    ss.forEach(s => {
      const x = E.describe(s);
      if (s.status === 'preview') h += '<details><summary>' + esc(x.title) + ' <span class="mut">' + x.minutes + ' דק׳</span></summary><ul class="l">' + x.lines.map(l => '<li>' + esc(l) + '</li>').join('') + '</ul></details>';
      else h += '<div class="st-' + s.status + '"><a href="#" data-act="detail" data-sid="' + s.id + '" style="color:inherit">' + esc(x.title) + '</a> <span class="mut">' + x.minutes + ' דק׳</span>' + (s.status === 'done' ? ' ✓ בוצע' + (s.log && s.log.minutes ? ' · ' + s.log.minutes + ' דק׳' + (s.log.rpe ? ' · מאמץ ' + s.log.rpe : '') : '') : s.status === 'skipped' ? ' ✗ לא בוצע' : '') + '</div>';
    });
    h += '</div></div>';
  });
  h += '<div class="row">' + ((wn >= 1 && (wn === cw || wn === cw + 1)) ? '<button class="b coral" data-act="plan" data-wn="' + wn + '">' + (r.kind === 'real' ? 'תכנון מחדש של השבוע' : 'תכנון השבוע') + '</button>' : '') + '<button class="b alt" data-act="allweeks">כל השבועות</button>' + (wn !== cw ? '<button class="b alt" data-act="weekgo" data-wn="' + cw + '">לשבוע הנוכחי</button>' : '') + '</div></div>';
  h += '<div class="card"><h3>רשמת משחק או פעילות אחרת?</h3><div class="mut">טניס, כדורסל וכדומה. אפשר שזה יחליף ריצה קלה.</div><div class="row"><button class="b alt" data-act="activity">רישום פעילות</button>' + (NATIVE ? '' : '<button class="b alt" data-act="ics">עדכון יומן (לא חובה)</button>') + '</div></div>';
  $('#main').innerHTML = h;
}
function allWeeksSheet() {
  const cw = curWeek(); let h = '<h2>כל השבועות</h2><div class="mut">שבוע מתחיל בשבת ונגמר בשישי. בכל שישי מתכננים את השבוע הבא. המרוץ: שישי 19.3, היום האחרון של שבוע 16.</div>';
  for (let w = st.sessions.some(x => x.week === 0) ? 0 : 1; w <= 16; w++) {
    const r = weekRows(w), lvl = r.kind === 'real' ? (r.list[0] ? r.list[0].level : st.level) : r.level, long = r.list.find(s => s.kind === 'long') || r.list.find(s => s.kind === 'easy1');
    const x = E.weekStats(st, w), status = r.kind === 'real' ? (w < cw ? 'בוצע ' + x.runCredit + ' מתוך ' + x.runPlanned + ' ריצות' : 'מתוכנן') : (r.kind === 'proposal' ? 'הצעה' : 'תחזית');
    h += '<div class="card" data-act="weekgo" data-wn="' + w + '" style="cursor:pointer;' + (w === cw ? 'border-color:var(--coral)' : '') + '"><h3>' + (w === 0 ? 'ריצת הפתיחה' : 'שבוע ' + w) + ' · ' + E.fmt(w === 0 ? E.CFG.firstDay : E.weekStartOf(w)) + ' <span class="tag' + (w === cw ? ' coral' : '') + '">' + status + '</span></h3><div class="mut">שלב ' + lvl + (long ? ' · ' + (long.kind === 'long' ? 'ארוכה' : 'קלה') + ': ' + E.describe(long).lines[1] : '') + '</div></div>';
  }
  h += '<div class="row"><button class="b alt" data-act="close">סגירה</button></div>'; sheet(h);
}

/* ---------- התקדמות ---------- */
function bars(vals, labels, max, color) {
  const W = 320, H = 130, bw = W / vals.length; let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + (H + 22) + '" role="img">';
  vals.forEach((v, i) => { const h = max ? v / max * H : 0; s += '<rect x="' + (i * bw + 3) + '" y="' + (H - h) + '" width="' + (bw - 6) + '" height="' + Math.max(h, 0) + '" rx="3" fill="' + color + '"/><text x="' + (i * bw + bw / 2) + '" y="' + (H + 14) + '" font-size="10" text-anchor="middle" fill="#5d6882">' + labels[i] + '</text>'; });
  return s + '<line x1="0" y1="' + H + '" x2="' + W + '" y2="' + H + '" stroke="#dbe1ee"/></svg>';
}
function vProgress() {
  $('#title').textContent = 'התקדמות'; const x = E.totals(st), cw = Math.min(curWeek(), 16);
  let h = '<div class="kpi"><div><b>' + x.runs + '</b><span>ריצות</span></div><div><b>' + x.strength + '</b><span>אימוני כוח</span></div><div><b>' + x.minutes + '</b><span>דקות סה"כ</span></div></div>';
  h += '<div class="card"><h3>שלב ' + st.level + ' מתוך 16</h3><div class="bar"><i style="width:' + (st.level / 16 * 100) + '%"></i></div>';
  const lag = E.behindBy(st, cw), streak = E.streak(st, todayIso());
  h += '<div class="mut" style="margin-top:6px">' + (lag > 1 ? 'אתה כ-' + lag + ' שלבים מאחורי התוכנית. זה בסדר: במרוץ מותר לשלב הליכה, והמטרה היא לסיים בכיף.' : lag <= 0 && cw > 1 ? 'אתה בקצב התוכנית.' : 'אתה בקצב התוכנית.') + (streak ? ' ' + streak + ' שבועות רצופים עם 2 ריצות ויותר.' : '') + '</div></div>';
  if (cw >= 12 && st.level < 9) h += '<div class="card banner"><h3>תכנית למרוץ: ריצה והליכה לסירוגין</h3><div class="mut">אתה נמצא בשלב ' + st.level + ', מתחת ל-9, ולכן כדאי לתכנן את המרוץ כריצה והליכה לסירוגין, למשל 8 דקות ריצה ודקה הליכה. זה עדיין נחשב סיום של 5 ק"מ, ובלי לוחצים על הגוף.</div></div>';
  const vals = [], labs = []; for (let w = 1; w <= cw; w++) { vals.push(E.weekStats(st, w).minutes); labs.push(w); }
  h += '<div class="card"><h3>דקות אימון בכל שבוע</h3>' + bars(vals, labs, Math.max.apply(null, vals.concat([30])), '#f5b700') + '</div>';
  const cv = [], cl = []; for (let w = 1; w <= cw; w++) { const s = E.weekStats(st, w); cv.push(s.runPlanned ? Math.round(s.runCredit / s.runPlanned * 100) : 0); cl.push(w); }
  h += '<div class="card"><h3>אחוז ריצות שבוצעו</h3>' + bars(cv, cl, 100, '#16213a') + '</div>';
  if (st.reviews.length) h += '<div class="card"><h3>סיכומי שבועות</h3>' + st.reviews.slice().reverse().map(r => '<div style="margin:6px 0"><b>שבוע ' + r.week + '</b> · שלב ' + r.from + (r.to !== r.from ? ' ← ' + r.to : '') + '<div class="mut">' + esc(r.why) + '</div></div>').join('') + '</div>';
  $('#main').innerHTML = h;
}

/* ---------- משקל ---------- */
function vWeight() {
  $('#title').textContent = 'משקל'; const w = E.weightList(st), x = E.weightSummary(st), g = st.settings;
  let h = '<div class="kpi"><div><b>' + x.last.kg.toFixed(1) + '</b><span>ק"ג כעת</span></div><div><b>' + (x.change > 0 ? '+' : '') + x.change.toFixed(1) + '</b><span>מההתחלה</span></div><div><b>' + x.bmi.toFixed(1) + '</b><span>BMI</span></div></div>';
  h += '<div class="card"><div class="mut">BMI ' + x.bmi.toFixed(1) + ': ' + E.bmiLabel(x.bmi) + (g.targetKg ? ' · יעד ' + g.targetKg + ' ק"ג (נשארו ' + Math.max(0, x.last.kg - g.targetKg).toFixed(1) + ')' : '') + '</div><p>' + esc(E.weightMessage(st)) + '</p><div class="mut">לפי הרופא והתזונאי: כל יעד משקל וקצב ירידה נקבעים איתם.</div></div>';
  h += '<div class="card"><h3>שקילה חדשה</h3><label for="wkg">משקל בק"ג, עם נקודה ומספר אחד אחריה (פעם בשבוע, ביום ' + E.dayName(E.weekDates(1)[(E.weighDay(st) - 5 + 7) % 7]) + ')</label><input id="wkg" type="number" inputmode="decimal" step="0.1" min="30" max="300" value="' + x.last.kg.toFixed(1) + '"><div class="row"><button class="b coral" data-act="addweight">שמירה</button></div></div>';
  if (w.length >= 2) {
    const W = 320, PH = 112, GAP = 30, t0 = E.pd(w[0].date), t1 = Math.max(E.pd(w[w.length - 1].date), t0 + 864e5 * 7), px = p => 34 + (E.pd(p.date) - t0) / (t1 - t0) * (W - 44);
    const panel = (top, vals, color, label, lines, dec) => {
      const arr = vals.map(v => v.v), lo0 = Math.min.apply(null, arr.concat(lines.map(l => l.v))), hi0 = Math.max.apply(null, arr.concat(lines.map(l => l.v))), pad = (hi0 - lo0) * 0.12 || 1, lo = lo0 - pad, hi = hi0 + pad;
      const py = v => top + 14 + (hi - v) / (hi - lo) * (PH - 22);
      let q = '<text x="' + W + '" y="' + (top + 10) + '" font-size="11" text-anchor="end" fill="' + color + '" font-weight="700">' + label + '</text>';
      [Math.min.apply(null, arr), Math.max.apply(null, arr)].forEach(v => { q += '<line x1="34" x2="' + W + '" y1="' + py(v) + '" y2="' + py(v) + '" stroke="#e8ecf4"/><text x="30" y="' + (py(v) + 4) + '" font-size="10" text-anchor="end" fill="#5d6882">' + v.toFixed(dec) + '</text>'; });
      lines.forEach(l => { q += '<line x1="34" x2="' + W + '" y1="' + py(l.v) + '" y2="' + py(l.v) + '" stroke="' + l.c + '" stroke-dasharray="4 4"/><text x="36" y="' + (py(l.v) - 3) + '" font-size="10" fill="' + l.c + '">' + l.t + '</text>'; });
      return q + '<polyline fill="none" stroke="' + color + '" stroke-width="2.5" points="' + vals.map(p => px(p) + ',' + py(p.v)).join(' ') + '"/>' + vals.map(p => '<circle cx="' + px(p) + '" cy="' + py(p.v) + '" r="3.5" fill="' + color + '"/>').join('');
    };
    const bm = w.map(p => E.bmi(p.kg, g.heightCm)), bl = [];
    if (Math.max.apply(null, bm) >= 27) bl.push({ v: 30, c: '#b7791f', t: 'BMI 30' });
    if (Math.min.apply(null, bm) <= 28) bl.push({ v: 25, c: '#2f7d57', t: 'BMI 25' });
    const wl = g.targetKg ? [{ v: g.targetKg, c: '#2f7d57', t: 'יעד' }] : [];
    const H2 = 2 * PH + GAP + 16;
    h += '<div class="card"><h3>מגמה</h3><svg class="chart" viewBox="0 0 ' + W + ' ' + H2 + '" role="img" aria-label="גרף משקל וגרף BMI">' +
      panel(0, w.map(p => ({ date: p.date, v: p.kg })), '#16213a', 'משקל (ק"ג)', wl, 1) +
      panel(PH + GAP, w.map((p, i) => ({ date: p.date, v: bm[i] })), '#d9a000', 'BMI', bl, 1) +
      '<text x="34" y="' + (H2 - 2) + '" font-size="10" fill="#5d6882">' + E.fmt(w[0].date) + '</text><text x="' + W + '" y="' + (H2 - 2) + '" font-size="10" text-anchor="end" fill="#5d6882">' + E.fmt(w[w.length - 1].date) + '</text></svg>' +
      '<div class="mut">ה-BMI מחושב מהמשקל ומהגובה, ולכן שתי העקומות באותה צורה. בעקומת ה-BMI אפשר לראות את המרחק מהקווים 30 ו-25.</div></div>';
  }
  h += '<div class="card"><h3>היסטוריה</h3>' + w.slice().reverse().map(p => '<div class="wk" data-act="editw" data-d="' + p.date + '" style="cursor:pointer"><div class="d">' + (p.start ? 'התחלה' : E.fmt(p.date)) + '</div><div class="t">' + p.kg.toFixed(1) + ' ק"ג · BMI ' + E.bmi(p.kg, g.heightCm).toFixed(1) + ' <span class="mut">· עריכה</span></div></div>').join('') + '</div>';
  $('#main').innerHTML = h;
}

/* ---------- עוד ---------- */
function vMore() {
  $('#title').textContent = 'עוד'; const g = st.settings;
  $('#main').innerHTML =
    '<div class="card"><h3>תזכורות</h3><label for="rem">שעת תזכורת יומית</label><input id="rem" type="time" value="' + g.reminder + '"><label for="wd">יום שקילה שבועי (התזכורת באה יחד עם האימון)</label><select id="wd">' + [0,1,2,3,4,5,6].map(i => '<option value="' + i + '"' + (E.weighDay(st) === i ? ' selected' : '') + '>' + E.DAYNAMES[i] + '</option>').join('') + '</select><label for="wt">שעת תזכורת לתכנון בשישי</label><input id="wt" type="time" value="' + g.weighTime + '">' +
    remindersExtra() + '</div>' +
    '<div class="card"><h3>פרטים</h3><label for="ht">גובה בס"מ</label><input id="ht" type="number" inputmode="numeric" value="' + g.heightCm + '"><label for="tg">משקל יעד בק"ג (אפשר להשאיר ריק)</label><input id="tg" type="number" inputmode="decimal" step="0.5" value="' + (g.targetKg || '') + '"><div class="row"><button class="b coral" data-act="savesettings">שמירה</button></div></div>' +
    backupCard() +
    '<div class="card"><h3>בטיחות</h3><div class="mut">התוכנית כללית ואינה תחליף לייעוץ רפואי. כאב בחזה, סחרור, קוצר נשימה חריג או כאב חד במפרק הם סיבה לעצור ולפנות לרופא. בגשם ובחושך: נעליים עם אחיזה ובגדים בולטים.</div><div class="row"><button class="b alt sm" data-act="reset">איפוס כל הנתונים</button></div></div>';
  if (NATIVE && LN()) LN().getPending().then(p => { const e = $('#pendinfo'); if (e) e.textContent = 'תזכורות מתוזמנות כרגע: ' + p.notifications.length; }).catch(() => {});
  const imp = $('#imp'); if (imp) imp.onchange = e => { const f = e.target.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => { try { const o = JSON.parse(r.result); if (!o.sessions || !o.settings) throw 0; st = Object.assign(E.newState(), o); save(); toast('שוחזר'); render(); } catch (x) { toast('הקובץ לא תקין'); } }; r.readAsText(f); };
}

function saveWeight(raw) {
  const v = E.round1(+String(raw).replace(',', '.'));
  if (!(v >= 30 && v <= 300)) { toast('משקל לא סביר'); return false; }
  const t = todayIso(); st.weights = st.weights.filter(w => w.date !== t); st.weights.push({ date: t, kg: v }); save();
  toast('נשמר: ' + v.toFixed(1) + ' ק"ג'); return true;
}

/* ---------- אימון בוצע ---------- */
const RPE = ['', 'קל מאוד', 'קל מאוד', 'קל', 'קל', 'בינוני (אפשר לדבר)', 'בינוני', 'מאמץ', 'קשה', 'קשה מאוד', 'מקסימום'];
function doneSheet(sid, mins) {
  const s = st.sessions.find(x => x.id === sid), d = E.describe(s), run = E.isRun(s.kind);
  sheet('<h2>' + esc(d.title) + ' – איך היה?</h2><label for="f-min">כמה דקות בפועל?</label><input id="f-min" type="number" inputmode="numeric" value="' + (mins || d.minutes) + '">' +
    (run ? '<label for="f-km">מרחק בק"מ (אם ידוע, אפשר לדלג)</label><input id="f-km" type="number" inputmode="decimal" step="0.1">' : '') +
    '<label for="f-rpe">כמה קשה זה היה? <span id="f-rpe-t">5 – ' + RPE[5] + '</span></label><input id="f-rpe" type="range" min="1" max="10" value="5"><label for="f-sore">כאבי שרירים מהאימון הקודם: <span id="f-sore-t">0</span> מתוך 10</label><input id="f-sore" type="range" min="0" max="10" value="0"><label><input type="checkbox" id="f-pain"> היה כאב חד או כאב שמטריד</label>' +
    '<div class="row"><button class="b coral" data-act="savedone" data-sid="' + sid + '">שמירה</button><button class="b alt" data-act="close">ביטול</button></div>');
  $('#f-rpe').oninput = e => { $('#f-rpe-t').textContent = e.target.value + ' – ' + RPE[e.target.value]; };
  $('#f-sore').oninput = e => { $('#f-sore-t').textContent = e.target.value; };
}
function saveDone(sid) {
  const s = st.sessions.find(x => x.id === sid), pain = $('#f-pain').checked, rpe = +$('#f-rpe').value;
  const sore = +$('#f-sore').value, log = { date: s.date < todayIso() ? s.date : todayIso(), minutes: +$('#f-min').value || 0, rpe, pain, soreness: sore };
  const km = $('#f-km') && +$('#f-km').value; if (km) log.km = km;
  E.markDone(st, sid, log); dirty(); closeSheet(); render();
  toast(pain ? 'נרשם. כאב הוא סימן לנוח: אם הוא נמשך, כדאי להיבדק.' : sore >= 5 ? 'כאבי שרירים גבוהים. אפשר להחליף את הריצה הבאה בהליכה מהירה או באופניים.' : rpe >= 9 ? 'כל הכבוד, אבל זה היה מאמץ גבוה. בפעם הבאה לאט יותר.' : E.cheer(st, todayIso()) || 'כל הכבוד!');
}

/* ---------- לא בטוח / לא בוצע ---------- */
const REASONS = [['rain', '🌧️ גשם או מזג אוויר'], ['tired', '😴 עייף / אין כוח'], ['busy', '📆 ערב עמוס'], ['pain', '🤕 כאב'], ['nomood', '😐 אין חשק'], ['forgot', '🙈 שכחתי']];
function reasonSheet(sid) {
  const s = st.sessions.find(x => x.id === sid);
  sheet('<h2>מה קרה?</h2><div class="mut">' + esc(E.describe(s).title) + ' של יום ' + E.dayName(s.date) + '. נבחר יחד מה הכי נכון.</div><div class="row" style="flex-direction:column">' + REASONS.map(r => '<button class="b alt" data-act="reason" data-sid="' + sid + '" data-r="' + r[0] + '">' + r[1] + '</button>').join('') + '</div><div class="row"><button class="b alt" data-act="close">סגירה</button></div>');
}
function optionsSheet(sid, reason) {
  const r = E.suggest(st, sid, reason, todayIso()); opts = r.options;
  sheet('<h2>האפשרויות</h2>' + (r.advice ? '<div class="tip">' + esc(r.advice) + '</div>' : '') +
    opts.map((o, i) => '<div class="card"><h3>' + esc(o.label) + '</h3><div class="mut">' + esc(o.hint) + '</div><div class="row"><button class="b coral sm" data-act="opt" data-i="' + i + '">בחירה</button></div></div>').join('') +
    '<div class="row"><button class="b alt" data-act="close">עוד לא מחליט</button></div>');
}

/* ---------- תכנון שבוע ---------- */
let plan = { wn: 1, review: null, props: null };
function planSheet(wn) {
  plan.wn = wn; plan.review = null;
  if (wn > 1 && st.plannedWeeks.indexOf(wn - 1) >= 0 && !st.reviews.some(r => r.week === wn - 1)) E.closeWeek(st, wn - 1, todayIso());
  const rv = st.reviews.find(r => r.week === wn - 1), t = todayIso(), dates = E.weekDates(wn);
  let h = '<h2>תכנון שבוע ' + wn + '</h2>';
  if (rv && wn > 1) { const x = E.weekStats(st, wn - 1); h += '<div class="card"><h3>סיכום שבוע ' + (wn - 1) + '</h3><div>ריצות: ' + x.runCredit + ' מתוך ' + x.runPlanned + ' · כוח: ' + x.strCredit + ' מתוך ' + x.strPlanned + (x.avgRpe ? ' · מאמץ ממוצע ' + x.avgRpe.toFixed(1) : '') + '</div><div class="mut">' + esc(rv.why) + (rv.to !== rv.from ? ' (שלב ' + rv.from + ' ← ' + rv.to + ')' : ' (נשארים בשלב ' + rv.to + ')') + '</div></div>'; }
  const chips = noFri => dates.map(d => { const off = d < t || (noFri && E.dow(d) === 5); return '<label class="' + (off ? '' : 'on') + '" data-day="' + d + '"><input type="checkbox" value="' + d + '" ' + (off ? 'disabled' : 'checked') + '>' + E.dayName(d) + '<br><small>' + E.fmt(d) + '</small></label>'; }).join('');
  h += '<div class="card"><h3>🏃 באילו ימים אתה פנוי לרוץ?</h3><div class="mut">שישי לא מסומן כי בו לא רצים. בין ריצות יהיה יום הפרש.</div><div class="days" data-g="run">' + chips(true) + '</div></div>';
  h += '<div class="card"><h3>💪 ובאילו ימים אפשר אימון כוח?</h3><div class="mut">כוח אפשר גם בשישי. סמן בנפרד, כי לא תמיד אלה אותם ימים.</div><div class="days" data-g="str">' + chips(false) + '</div></div>';
  h += '<div id="props"></div><div class="row"><button class="b coral" data-act="propose">הצע לי תוכנית</button><button class="b alt" data-act="close">סגירה</button></div>';
  sheet(h);
  document.querySelectorAll('#sheet .days label').forEach(l => l.onclick = e => { e.preventDefault(); const i = l.querySelector('input'); if (i.disabled) return; i.checked = !i.checked; l.classList.toggle('on', i.checked); });
}
function propose() {
  const pick = g => Array.from(document.querySelectorAll('#sheet .days[data-g=' + g + '] input:checked')).map(i => i.value);
  const r = E.proposeWeek(st, plan.wn, pick('run'), pick('str')); plan.props = r;
  if (!r.options.length) { $('#props').innerHTML = '<div class="card banner">אין ימים מתאימים. נסה לסמן עוד ימים (ריצות לא יכולות להיות בשישי, ולא בשני ימים ברצף).</div>'; return; }
  const names = { long: 'ריצה ארוכה', easy1: 'ריצה קלה', easy2: 'ריצה קלה', strA: 'כוח A', strB: 'כוח B' };
  $('#props').innerHTML = (r.dropped.length ? '<div class="card banner">לא נכנסים השבוע: ' + r.dropped.map(k => names[k]).join(', ') + '. הסדר: קודם הריצות, אחר כך הכוח.</div>' : '') +
    r.options.map((o, i) => '<div class="card"><h3>הצעה ' + (i + 1) + '</h3>' + o.items.slice().sort((a, b) => a.date < b.date ? -1 : 1).map(it => '<div>' + E.dayName(it.date) + ' ' + E.fmt(it.date) + ' – ' + names[it.kind] + '</div>').join('') + '<div class="row"><button class="b coral sm" data-act="applyplan" data-i="' + i + '">מאשר</button></div></div>').join('');
}
function applyPlan(i) {
  const o = plan.props.options[i]; E.applyWeek(st, plan.wn, o, plan.props.dropped);
  dirty(); closeSheet(); tab = 'week'; render(); toast('התוכנית נשמרה. עדכן את היומן מ"עוד".');
}

/* ---------- פעילות אחרת ---------- */
function activitySheet() {
  sheet('<h2>רישום פעילות</h2><label for="a-s">מה עשית?</label><select id="a-s"><option>טניס</option><option>כדורסל</option><option>כדורגל</option><option>אופניים</option><option>הליכה</option><option>אחר</option></select><label for="a-m">כמה דקות?</label><input id="a-m" type="number" inputmode="numeric" value="60"><label for="a-r">כמה קשה? <span id="a-rt">5</span></label><input id="a-r" type="range" min="1" max="10" value="5"><div class="row"><button class="b coral" data-act="saveactivity">שמירה</button><button class="b alt" data-act="close">ביטול</button></div>');
  $('#a-r').oninput = e => { $('#a-rt').textContent = e.target.value; };
}
function saveActivity() {
  const act = { date: todayIso(), sport: $('#a-s').value, minutes: +$('#a-m').value || 0, rpe: +$('#a-r').value };
  const r = E.activityImpact(st, act); save();
  if (r.replaced) { sheet('<h2>נרשם</h2><p>' + esc(r.text) + '</p><div class="row"><button class="b coral" data-act="useact" data-sid="' + r.replaced + '">כן, שיחליף את הריצה</button><button class="b alt" data-act="close">לא, רק לרשום</button></div>'); window._act = act; }
  else { closeSheet(); toast(r.text); }
}

/* ---------- קובץ יומן ---------- */
function downloadICS() {
  const blob = new Blob([E.buildICS(st, todayIso())], { type: 'text/calendar' }), a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'training-plan.ics'; document.body.appendChild(a); a.click(); a.remove();
  st.icsDirty = false; save(); toast('הקובץ ירד. פתח אותו וייבא ליומן.');
}

/* ---------- התראות באפליקציה ---------- */
async function notify(title, body, sid) {
  if (!('serviceWorker' in navigator) || !('Notification' in window) || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker.getRegistration(); if (!reg) return;
  reg.showNotification(title, { body, tag: 'run-' + sid, data: { sid }, lang: 'he', dir: 'rtl', icon: 'icon-192.png', badge: 'icon-192.png', actions: [{ action: 'done', title: '✅ בוצע' }, { action: 'later', title: '⏰ היום, אחר כך' }, { action: 'unsure', title: '🤔 לא בטוח' }] });
}
function tick() {
  if (!st.settings.notify) return;
  const t = todayIso(), now = nowHM();
  const s = st.sessions.find(x => x.date === t && x.status === 'planned' && x.kind !== 'race' || x.date === t && x.kind === 'race' && x.status === 'planned');
  if (!s) return;
  const d = E.describe(s);
  if (now >= st.settings.reminder && localStorage.getItem('run_notified') !== t + s.id) { localStorage.setItem('run_notified', t + s.id); notify('🏃 ' + d.title + (E.weighDue(st, t) && E.weighDue(st, t).today ? ' + ⚖️ שקילה' : ''), (E.weighDue(st, t) && E.weighDue(st, t).today ? 'קודם לשקול (מספר אחד אחרי הנקודה). ' : '') + d.lines.join(' · '), s.id); }
  if (s.postponed && s.postponedAt && Date.now() - s.postponedAt >= 7200000 && !s.reNotified) { s.reNotified = true; save(); notify('⏰ עדיין מחכה: ' + d.title, 'עוד לא עדכנת. מספיק היום?', s.id); }
}
function handleAct(act, sid) {
  if (!sid || !st.sessions.find(x => x.id === sid)) return;
  if (act === 'done') { tab = 'today'; render(); doneSheet(sid); }
  else if (act === 'later') { later(sid); }
  else if (act === 'unsure') { tab = 'today'; render(); reasonSheet(sid); }
}
function later(sid) { E.applyAction(st, { type: 'today', sid }); const s = st.sessions.find(x => x.id === sid); s.postponedAt = Date.now(); s.reNotified = false; save(); render(); toast('בסדר, האימון נשאר להיום. נזכיר בעוד שעתיים אם האפליקציה פתוחה.'); }

/* ---------- אירועים ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act, sid = el.dataset.sid;
  if (liveClick(a, el)) return;
  if (a === 'tab') { tab = el.dataset.v; if (tab === 'week') viewWeek = null; render(); }
  else if (a === 'done') doneSheet(sid);
  else if (a === 'savedone') saveDone(sid);
  else if (a === 'later') later(sid);
  else if (a === 'unsure') reasonSheet(sid);
  else if (a === 'reason') optionsSheet(sid, el.dataset.r);
  else if (a === 'opt') { const o = opts[+el.dataset.i]; E.applyAction(st, o.action); dirty(); closeSheet(); render(); toast('עודכן. אל תשכח לעדכן את היומן.'); }
  else if (a === 'plan') planSheet(+el.dataset.wn);
  else if (a === 'propose') propose();
  else if (a === 'applyplan') applyPlan(+el.dataset.i);
  else if (a === 'activity') activitySheet();
  else if (a === 'saveactivity') saveActivity();
  else if (a === 'useact') { E.replaceWithActivity(st, sid, window._act); dirty(); closeSheet(); render(); toast('סומן כבוצע'); }
  else if (a === 'startnow') { const t = todayIso(); st.sessions.push({ id: '0-easy1', week: 0, kind: 'easy1', date: t, level: 1, status: 'planned', seq: 0, taper: false }); dirty(); render(); toast('יאללה! בהצלחה בריצה הראשונה.'); }
  else if (a === 'editw') { const d = el.dataset.d, w = st.weights.find(x => x.date === d); sheet('<h2>עריכת שקילה מ-' + E.fmt(d) + '</h2><label for="ew">משקל בק"ג (נקודה ומספר אחד אחריה)</label><input id="ew" type="number" inputmode="decimal" step="0.1" value="' + w.kg.toFixed(1) + '"><div class="row"><button class="b coral" data-act="savew" data-d="' + d + '">שמירה</button>' + (st.weights.length > 1 ? '<button class="b alt" data-act="delw" data-d="' + d + '">מחיקה</button>' : '') + '<button class="b alt" data-act="close">ביטול</button></div>'); }
  else if (a === 'savew') { const v = E.round1(+$('#ew').value); if (!(v >= 30 && v <= 300)) return toast('משקל לא סביר'); st.weights.find(x => x.date === el.dataset.d).kg = v; save(); closeSheet(); render(); toast('עודכן: ' + v.toFixed(1)); }
  else if (a === 'delw') { if (st.weights.length > 1) { st.weights = st.weights.filter(x => x.date !== el.dataset.d); save(); closeSheet(); render(); toast('נמחק'); } }
  else if (a === 'weekgo') { viewWeek = +el.dataset.wn; closeSheet(); tab = 'week'; render(); }
  else if (a === 'allweeks') allWeeksSheet();
  else if (a === 'notifsetup') nativeSetup(true).then(ok => { if (ok) { toast('התזכורות פעילות'); render(); } });
  else if (a === 'notiftest') { const ln = LN(); if (!ln) return toast('רכיב ההתראות לא נמצא'); ln.schedule({ notifications: [{ id: 999, title: '🏃 בדיקה: אימון להיום', body: 'ככה תיראה התזכורת. נסה את הכפתורים.', schedule: { at: new Date(Date.now() + 10000), allowWhileIdle: true }, channelId: 'training', actionTypeId: 'TRAIN', extra: { sid: '' } }] }).then(() => toast('ההתראה תגיע בעוד 10 שניות. אפשר לסגור את האפליקציה.')).catch(e => toast('שגיאה: ' + (e.message || e))); }
  else if (a === 'exportshare') { const sh = window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Share; if (!sh) return toast('שיתוף לא זמין'); sh.share({ title: 'גיבוי אימונים', text: JSON.stringify(st), dialogTitle: 'גיבוי' }).catch(() => {}); }
  else if (a === 'importpaste') sheet('<h2>שחזור מגיבוי</h2><div class="mut">הדבק כאן את טקסט הגיבוי.</div><textarea id="pastebox" rows="6" style="margin-top:8px"></textarea><div class="row"><button class="b coral" data-act="doimport">שחזור</button><button class="b alt" data-act="close">ביטול</button></div>');
  else if (a === 'doimport') { try { const o = JSON.parse($('#pastebox').value); if (!o.sessions || !o.settings) throw 0; st = Object.assign(E.newState(), o); save(); closeSheet(); render(); toast('שוחזר'); } catch (x) { toast('הטקסט לא תקין'); } }
  else if (a === 'livestart') liveStart(sid);
  else if (a === 'pastopening') { const id = '0-easy1'; if (!st.sessions.some(x => x.id === id)) st.sessions.push({ id, week: 0, kind: 'easy1', date: E.CFG.firstDay, level: 1, status: 'planned', seq: 0, taper: false }); save(); doneSheet(id, 28); }
  else if (a === 'ics') downloadICS();
  else if (a === 'close') closeSheet();
  else if (a === 'detail') { e.preventDefault(); const s = st.sessions.find(x => x.id === sid), d = E.describe(s); sheet('<h2>' + esc(d.title) + '</h2><div class="mut">' + E.dayName(s.date) + ' ' + E.fmt(s.date) + '</div><ul class="l">' + d.lines.map(l => '<li>' + esc(l) + '</li>').join('') + '</ul>' + logSummary(s) + '<div class="tip">' + esc(d.tip) + '</div><div class="row">' + (s.status === 'planned' ? '<button class="b coral" style="flex-basis:100%" data-act="livestart" data-sid="' + sid + '">▶️ התחל אימון</button><button class="b alt" data-act="done" data-sid="' + sid + '">✅ בוצע</button><button class="b alt" data-act="unsure" data-sid="' + sid + '">🤔 לא בטוח</button>' : '') + '<button class="b alt" data-act="close">סגירה</button></div>'); }
  else if (a === 'addweight') { if (saveWeight($('#wkg').value)) { render(); } }
  else if (a === 'todayweight') { if (saveWeight($('#tw').value)) { render(); } }
  else if (a === 'savesettings') { st.settings.reminder = $('#rem').value || '17:00'; st.settings.weighTime = $('#wt').value || '08:00'; st.settings.weighDay = +$('#wd').value; st.settings.heightCm = +$('#ht').value || 182; st.settings.targetKg = +$('#tg').value || null; dirty(); toast('נשמר. לחץ על הורדת קובץ יומן כדי לעדכן את השעה.'); }
  else if (a === 'notif') { if (!('Notification' in window)) return toast('הדפדפן לא תומך'); Notification.requestPermission().then(p => { st.settings.notify = p === 'granted'; save(); render(); }); }
  else if (a === 'export') { const b = new Blob([JSON.stringify(st)], { type: 'application/json' }), l = document.createElement('a'); l.href = URL.createObjectURL(b); l.download = 'running-backup-' + todayIso() + '.json'; document.body.appendChild(l); l.click(); l.remove(); }
  else if (a === 'reset') { if (confirm('למחוק את כל הנתונים? אי אפשר לשחזר.')) { st = E.newState(); save(); render(); } }
});
$('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });

/* ---------- אפליקציית אנדרואיד: תזכורות מקומיות (בלי שרת ובלי יומן) ---------- */
const KINDS = ['long', 'easy1', 'easy2', 'strA', 'strB', 'race'];
function LN() { return window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.LocalNotifications; }
let schT;
function queueSchedule() { clearTimeout(schT); schT = setTimeout(scheduleNative, 600); }
function weighedThatWeek(iso) { const ws = E.weekStart(iso), we = E.addDays(ws, 6); return st.weights.some(w => w.date >= ws && w.date <= we && !w.start && w.date !== E.CFG.startWeightDate); }
async function nativeSetup(interactive) {
  const ln = LN(); if (!ln) { if (interactive) toast('רכיב ההתראות לא נמצא'); return false; }
  try {
    let p = await ln.checkPermissions();
    if (p.display !== 'granted') p = await ln.requestPermissions();
    if (p.display !== 'granted') { if (interactive) toast('ההתראות חסומות. אפשר להפעיל בהגדרות הטלפון, באפליקציות.'); return false; }
    await ln.createChannel({ id: 'training', name: 'תזכורות אימון', description: 'תזכורת יומית לאימון', importance: 4, visibility: 1, vibration: true });
    await ln.registerActionTypes({ types: [{ id: 'TRAIN', actions: [{ id: 'done', title: '✅ בוצע' }, { id: 'later', title: '⏰ היום, אחר כך' }, { id: 'unsure', title: '🤔 לא בטוח' }] }] });
    try { const ex = await ln.checkExactNotificationSetting(); if (ex.exact_alarm !== 'granted' && interactive) { toast('כדי שהתזכורת תקפוץ בדיוק בשעה, אשר "התראות ותזכורות מדויקות".'); await ln.changeExactNotificationSetting(); } } catch (e) {}
    st.settings.notify = true; save();
    await scheduleNative(); return true;
  } catch (e) { if (interactive) toast('שגיאה בהגדרת התראות: ' + (e.message || e)); return false; }
}
async function scheduleNative() {
  const ln = LN(); if (!ln || !st.settings.notify) return;
  try {
    const pend = await ln.getPending(); if (pend.notifications.length) await ln.cancel({ notifications: pend.notifications.map(n => ({ id: n.id })) });
    const now = new Date(), today = todayIso(), end = E.addDays(today, 21), list = [], wd = E.weighDay(st), live = {};
    const at = (iso, hm) => { const a = iso.split('-').map(Number), b = hm.split(':').map(Number); return new Date(a[0], a[1] - 1, a[2], b[0], b[1], 0); };
    const add = (id, when, title, body, sid) => { if (when > now) { const n = { id, title, body, schedule: { at: when, allowWhileIdle: true }, channelId: 'training', extra: { sid: sid || '' } }; if (sid) n.actionTypeId = 'TRAIN'; list.push(n); } };
    st.sessions.forEach(s => { if (s.status === 'planned') live[s.date] = s; });
    st.sessions.forEach(s => {
      if (s.status !== 'planned' || s.date < today || s.date > end) return;
      const d = E.describe(s), w = s.kind !== 'race' && E.dow(s.date) === wd && !weighedThatWeek(s.date), k = KINDS.indexOf(s.kind);
      add(100000 + s.week * 100 + k * 10, at(s.date, st.settings.reminder), (w ? '⚖️+🏃 ' : '🏃 ') + d.title, (w ? 'קודם לשקול (מספר אחד אחרי הנקודה). ' : '') + d.lines.join(' · '), s.id);
      if (s.postponed && s.postponedAt) add(900000 + s.week * 100 + k, new Date(s.postponedAt + 7200000), '⏰ עדיין מחכה: ' + d.title, 'עוד לא עדכנת. מספיק היום?', s.id);
    });
    for (let d = today; d <= end; d = E.addDays(d, 1)) {
      const wn = E.weekNo(d);
      if (E.dow(d) === wd && !live[d] && st.plannedWeeks.indexOf(wn) >= 0 && !weighedThatWeek(d)) add(200000 + wn, at(d, st.settings.reminder), '⚖️ שקילה שבועית', 'מספר אחד אחרי הנקודה, למשל 108.4', '');
      if (E.dow(d) === 5 && d < E.CFG.race && wn + 1 >= 1) add(300000 + wn + 1, at(d, st.settings.weighTime), '📅 תכנון השבוע הבא', 'פתח את האפליקציה, סכם את השבוע ותכנן את השבוע הבא (שבת עד שישי).', '');
    }
    if (list.length) await ln.schedule({ notifications: list });
  } catch (e) { console.warn(e); }
}
function nativeInit() {
  const ln = LN(); if (!ln) return;
  ln.addListener('localNotificationActionPerformed', ev => { const sid = ev.notification && ev.notification.extra && ev.notification.extra.sid, act = ev.actionId; if (act === 'tap' || !act) { tab = 'today'; render(); } else handleAct(act, sid); });
  nativeSetup(false);
}
function remindersExtra() {
  if (NATIVE) return '<div class="row"><button class="b" data-act="notifsetup">🔔 הפעלה ובדיקת הרשאות</button><button class="b alt" data-act="notiftest">התראת בדיקה בעוד 10 שניות</button></div><div class="mut" id="pendinfo"></div><div class="tip">התזכורת קופצת בשעה שקבעת גם כשהאפליקציה סגורה, עם כפתורים: בוצע, אחר כך, לא בטוח. היא מתעדכנת לבד אחרי כל שינוי בתוכנית. אם היא לא קופצת, בדוק בהגדרות הטלפון שההתראות מאושרות ושחיסכון בסוללה לא חוסם את האפליקציה.</div>';
  const permOk = 'Notification' in window && Notification.permission === 'granted';
  return '<div class="row"><button class="b" data-act="ics">⬇️ הורדת קובץ יומן</button></div><div class="tip">באתר (לא באפליקציה) התזכורת האמינה היא קובץ יומן. התקן את אפליקציית האנדרואיד כדי לקבל תזכורות בלי יומן.</div><div class="row"><button class="b alt" data-act="notif">' + (permOk ? '✅ התראות באתר פעילות' : '🔔 הפעלת התראות באתר') + '</button></div>';
}
function backupCard() {
  return '<div class="card"><h3>גיבוי</h3><div class="mut">הכול נשמר רק בטלפון הזה. מומלץ לגבות מדי פעם.</div>' + (NATIVE
    ? '<div class="row"><button class="b alt" data-act="exportshare">גיבוי (שליחה לוואטסאפ / מייל / שמירה)</button><button class="b alt" data-act="importpaste">שחזור מהדבקה</button></div></div>'
    : '<div class="row"><button class="b alt" data-act="export">גיבוי לקובץ</button><label class="b alt" style="margin:0">שחזור מקובץ<input type="file" id="imp" accept=".json" hidden></label></div></div>');
}

/* ---------- מצב אימון: שעון ספירה לאחור, שלבים, צלילים ---------- */
const LIVE_KEY = 'run_live_v1';
let live = null, liveT = null, wl = null, actx = null;
const segSec = g => g.sec == null ? 40 : g.sec;                 // סט ידני נחשב כ-40 שניות בסיכום
const mmss = ms => { const t = Math.max(0, Math.ceil(ms / 1000)), m = Math.floor(t / 60); return m + ':' + String(t % 60).padStart(2, '0'); };
const KCOL = { run: '#f5b700', walk: '#16213a', set: '#3b3f8f', rest: '#5d6882' };
const KTXT = { run: '#16213a', walk: '#eef1f7', set: '#fff', rest: '#fff' };
const KEMO = { run: '🏃', walk: '🚶', set: '💪', rest: '😮‍💨' };
function durHe(sec) {
  const m = sec / 60; if (sec < 60) return sec + ' שניות';
  if (m === 1) return 'דקה'; if (m === 2) return 'שתי דקות'; if (m === 1.5) return 'דקה וחצי'; if (m === 2.5) return 'שתי דקות וחצי';
  return Number.isInteger(m) ? m + ' דקות' : Math.round(sec / 60) + ' דקות';
}
function liveSave() { try { if (live) localStorage.setItem(LIVE_KEY, JSON.stringify(live)); else localStorage.removeItem(LIVE_KEY); } catch (e) {} }
async function lockScreen() { try { if ('wakeLock' in navigator) wl = await navigator.wakeLock.request('screen'); } catch (e) {} }
function unlockScreen() { try { if (wl) wl.release(); } catch (e) {} wl = null; }
function beep(freq, ms, delay) {
  if (!st.settings.liveSound && st.settings.liveSound !== undefined) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = actx.currentTime + (delay || 0) / 1000, o = actx.createOscillator(), g = actx.createGain();
    o.frequency.value = freq; o.type = 'sine'; g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.6, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + ms / 1000);
    o.connect(g); g.connect(actx.destination); o.start(t0); o.stop(t0 + ms / 1000 + 0.05);
  } catch (e) {}
}
function speak(text) {
  if (st.settings.liveSound === false) return;
  try { if ('speechSynthesis' in window) { speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'he-IL'; u.rate = 1; speechSynthesis.speak(u); } } catch (e) {}
}
function vibe(p) { if (st.settings.liveVibe !== false) try { navigator.vibrate && navigator.vibrate(p); } catch (e) {} }
function cueFor(g) {
  if (g.k === 'run') { beep(988, 180); beep(1319, 300, 230); vibe([250, 120, 250]); speak('ריצה. ' + (g.sec ? durHe(g.sec) : '')); }
  else if (g.k === 'walk') { beep(523, 450); vibe([500]); speak('הליכה. ' + (g.sec ? durHe(g.sec) : '')); }
  else if (g.k === 'set') { beep(784, 200); vibe([200]); speak(g.label + '. ' + g.sub.split(' · ')[0]); }
  else { beep(440, 300); vibe([200]); speak('מנוחה'); }
}
function liveStart(sid) {
  closeSheet();
  const s = st.sessions.find(x => x.id === sid), segs = E.segmentsFor(s); if (!segs.length) return toast('אין מצב אימון לאימון הזה');
  try { actx = actx || new (window.AudioContext || window.webkitAudioContext)(); actx.resume && actx.resume(); } catch (e) {}
  live = { sid, segs, idx: 0, segStart: Date.now(), pausedAt: null, done: false, startedAt: Date.now(), activeMs: 0, manualMs: 0 };
  liveSave(); lockScreen(); liveShow(); cueFor(segs[0]);
  clearInterval(liveT); liveT = setInterval(liveTick, 250);
}
function liveResume() {
  try { const r = localStorage.getItem(LIVE_KEY); if (!r) return; live = JSON.parse(r); } catch (e) { live = null; return; }
  if (!live || live.done || Date.now() - live.startedAt > 4 * 3600 * 1000 || !st.sessions.find(x => x.id === live.sid && x.status === 'planned')) { live = null; liveSave(); return; }
  lockScreen(); liveShow(); clearInterval(liveT); liveT = setInterval(liveTick, 250);
}
function liveElapsedInSeg() { return (live.pausedAt || Date.now()) - live.segStart; }
function liveAdvance(toIdx, silent) {
  const g = live.segs[live.idx];
  live.activeMs += Math.min(liveElapsedInSeg(), g.sec == null ? liveElapsedInSeg() : g.sec * 1000);
  if (toIdx >= live.segs.length) { live.done = true; live.idx = live.segs.length - 1; liveSave(); liveFinishScreen(); return; }
  live.idx = Math.max(0, toIdx); live.segStart = live.pausedAt ? live.pausedAt : Date.now(); liveSave();
  if (!silent) cueFor(live.segs[live.idx]);
}
function liveTick() {
  if (!live || live.done || live.pausedAt) { liveDraw(); return; }
  let guard = 0, moved = false;
  while (guard++ < 200) {
    const g = live.segs[live.idx];
    if (g.sec == null) break;
    const rem = g.sec * 1000 - (Date.now() - live.segStart);
    if (rem > 0) {
      const sec = Math.ceil(rem / 1000);
      if (sec <= 3 && live.lastTick !== live.idx + ':' + sec) { live.lastTick = live.idx + ':' + sec; beep(880, 90); }
      break;
    }
    const next = live.idx + 1;                                      // מעבר לשלב הבא (גם אם האפליקציה הייתה ברקע, מדלגים על כמה שלבים)
    live.activeMs += g.sec * 1000;
    if (next >= live.segs.length) { live.done = true; liveSave(); liveFinishScreen(); return; }
    live.idx = next; live.segStart += g.sec * 1000; moved = true;
  }
  if (moved) { liveSave(); cueFor(live.segs[live.idx]); }
  liveDraw();
}
function liveShow() { const el = $('#live'); el.hidden = false; document.body.style.overflow = 'hidden'; liveDraw(true); }
function liveClose() { clearInterval(liveT); liveT = null; unlockScreen(); live = null; liveSave(); const el = $('#live'); el.hidden = true; el.innerHTML = ''; document.body.style.overflow = ''; try { speechSynthesis.cancel(); } catch (e) {} }
function liveDraw(force) {
  const el = $('#live'); if (!live || el.hidden) return;
  const g = live.segs[live.idx], s = st.sessions.find(x => x.id === live.sid), d = E.describe(s);
  const el0 = liveElapsedInSeg(), rem = g.sec == null ? null : g.sec * 1000 - el0;
  const totalMs = live.segs.reduce((a, x) => a + segSec(x) * 1000, 0), doneMs = live.segs.slice(0, live.idx).reduce((a, x) => a + segSec(x) * 1000, 0) + Math.min(el0, segSec(g) * 1000);
  const next = live.segs[live.idx + 1];
  const timeTxt = g.sec == null ? mmss(el0).replace(/^/, '') : mmss(rem);
  if (force || el.dataset.idx !== String(live.idx) || el.dataset.p !== String(!!live.pausedAt)) {
    el.dataset.idx = live.idx; el.dataset.p = String(!!live.pausedAt);
    el.style.background = KCOL[g.k]; el.style.color = KTXT[g.k];
    let rows = live.segs.map((x, i) => '<div class="lr ' + (i < live.idx ? 'ld' : i === live.idx ? 'lc' : '') + '" ' + (i === live.idx ? 'id="lcur"' : '') + '><span>' + (i < live.idx ? '✓' : i === live.idx ? '●' : '○') + '</span><span class="lt">' + KEMO[x.k] + ' ' + esc(x.label) + (x.sub && x.k !== 'walk' && x.k !== 'run' ? ' <small>' + esc(x.sub.split(' · ')[0]) + '</small>' : '') + '</span><span>' + (x.sec == null ? 'סט' : mmss(x.sec * 1000)) + '</span></div>').join('');
    el.innerHTML = '<div class="lt-top"><div><b>' + esc(d.title) + '</b><div class="lm">עבר <span id="lsum"></span> מתוך ' + mmss(totalMs) + ' · נותרו <b id="lrem"></b></div></div><div class="lbtns"><button data-act="liveopt" data-o="liveSound" aria-label="קול">' + (st.settings.liveSound === false ? '🔇' : '🔊') + '</button><button data-act="liveopt" data-o="liveVibe" aria-label="רטט">' + (st.settings.liveVibe === false ? '📴' : '📳') + '</button></div></div>' +
      '<div class="lbar"><i id="lbari"></i></div>' +
      '<div class="lmain"><div class="lk">' + KEMO[g.k] + ' ' + esc(g.label) + (live.pausedAt ? ' · מושהה' : '') + '</div><div class="lbig" id="lbig"></div><div class="ls">' + esc(g.sub || '') + '</div>' +
      (g.sec == null && !live.pausedAt ? '<button class="lset" data-act="liveset">סיימתי את הסט ✓</button>' : '') +
      '<div class="ln">' + (next ? 'הבא: ' + KEMO[next.k] + ' ' + esc(next.label) + ' · ' + (next.sec == null ? 'סט' : mmss(next.sec * 1000)) : 'זה השלב האחרון') + '</div></div>' +
      '<div class="lctl"><button data-act="liveprev" aria-label="שלב קודם">⏮</button><button class="lpp" data-act="livepause" aria-label="השהיה">' + (live.pausedAt ? '▶' : '⏸') + '</button><button data-act="livenext" aria-label="שלב הבא">⏭</button></div>' +
      '<div class="llist">' + rows + '</div><div class="lend"><button data-act="liveend">סיום האימון</button></div>';
    const c = $('#lcur'); if (c) c.scrollIntoView({ block: 'center' });
  }
  const big = $('#lbig'); if (big) big.textContent = timeTxt;
  const sum = $('#lsum'); if (sum) sum.textContent = mmss(doneMs);
  const rm = $('#lrem'); if (rm) rm.textContent = mmss(totalMs - doneMs);
  const bi = $('#lbari'); if (bi) bi.style.width = Math.min(100, doneMs / totalMs * 100) + '%';
}
function liveFinishScreen() {
  clearInterval(liveT); liveT = null; unlockScreen();
  const el = $('#live'), mins = Math.max(1, Math.round(live.activeMs / 60000)); el.style.background = '#2f7d57'; el.style.color = '#fff'; el.dataset.idx = 'fin';
  beep(784, 200); beep(988, 200, 250); beep(1319, 500, 500); vibe([300, 150, 300, 150, 600]); speak('סיימת. כל הכבוד');
  el.innerHTML = '<div class="lmain" style="justify-content:center"><div class="lk">🎉 סיימת!</div><div class="lbig" style="font-size:22vw">' + mins + '</div><div class="ls">דקות אימון</div><div class="row" style="margin-top:24px;flex-direction:column"><button class="b coral" data-act="livesave">שמירה כאימון שבוצע</button><button class="b alt" style="color:#fff;border-color:#fff" data-act="liveexit">יציאה בלי לשמור</button></div></div>';
}
function liveClick(a, el) {
  if (!live) return false;
  if (a === 'livepause') { if (live.pausedAt) { live.segStart += Date.now() - live.pausedAt; live.pausedAt = null; lockScreen(); } else live.pausedAt = Date.now(); liveSave(); liveDraw(true); return true; }
  if (a === 'livenext') { liveAdvance(live.idx + 1); liveDraw(true); return true; }
  if (a === 'liveprev') { const el0 = liveElapsedInSeg(); if (el0 > 3000) { live.segStart = live.pausedAt || Date.now(); liveSave(); } else if (live.idx > 0) { live.idx--; live.segStart = live.pausedAt || Date.now(); liveSave(); } liveDraw(true); return true; }
  if (a === 'liveset') { liveAdvance(live.idx + 1); liveDraw(true); return true; }
  if (a === 'liveopt') { const o = el.dataset.o; st.settings[o] = st.settings[o] === false ? true : false; save(); liveDraw(true); return true; }
  if (a === 'liveend') { const mins = Math.max(1, Math.round((live.activeMs + liveElapsedInSeg()) / 60000)); sheet('<h2>לסיים את האימון?</h2><div class="mut">עברו ' + mins + ' דקות.</div><div class="row" style="flex-direction:column"><button class="b coral" data-act="livesaveearly">סיום ושמירה כאימון שבוצע</button><button class="b alt" data-act="close">המשך לאמן</button><button class="b alt" data-act="liveexit">יציאה בלי לשמור</button></div>'); return true; }
  if (a === 'livesave' || a === 'livesaveearly') { const sid = live.sid, mins = Math.max(1, Math.round((live.activeMs + (a === 'livesaveearly' ? liveElapsedInSeg() : 0)) / 60000)); liveClose(); closeSheet(); render(); doneSheet(sid, mins); return true; }
  if (a === 'liveexit') { liveClose(); closeSheet(); render(); return true; }
  return false;
}

/* ---------- אתחול ---------- */
maintain(); render(); liveResume();
if (!NATIVE && 'serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('message', e => handleAct(e.data.act, e.data.sid));
}
const q = new URLSearchParams(location.search);
if (q.get('act')) { handleAct(q.get('act'), q.get('sid')); history.replaceState(null, '', location.pathname); }
if (!NATIVE) { setInterval(tick, 30000); tick(); } else nativeInit();
document.addEventListener('visibilitychange', () => { if (!document.hidden && live && !live.done) { lockScreen(); liveTick(); } if (!document.hidden) { maintain(); if ($('#sheet').hidden) render(); tick(); } });
window.__app = { get st() { return st; }, render };
})();
