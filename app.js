/* הממשק. הנתונים נשמרים רק בטלפון (localStorage). אין שרת ואין AI. */
(function () {
'use strict';
const E = window.Engine, KEY = 'run_state_v1';
let st = load(), tab = 'today', opts = [];

function load() {
  try {
    const r = localStorage.getItem(KEY);
    if (r) {
      const o = Object.assign(E.newState(), JSON.parse(r));
      if (!o.weights.some(w => w.start)) o.weights.push({ date: '2026-11-18', kg: 113.6, start: true });   // משקל התחלה לפני הירידה
      o.weights.forEach(w => { if (w.date === E.CFG.startWeightDate && w.kg === 109) w.kg = 111; });       // תיקון: 109 היה טעות
      return o;
    }
  } catch (e) {}
  return E.newState();
}
function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { toast('השמירה נכשלה: האחסון מלא או חסום'); } }
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
function curWeek() { const t = todayIso(); return t < E.CFG.start ? 1 : E.weekNo(t); }
function maintain() {
  const t = todayIso(), cw = E.weekNo(t);
  for (let w = 1; w < cw && w <= E.CFG.lastWeek; w++) {
    if (st.reviews.some(r => r.week === w)) continue;
    if (st.plannedWeeks.indexOf(w) >= 0) E.closeWeek(st, w);
    else st.reviews.push({ week: w, from: st.level, to: st.level, why: 'השבוע לא תוכנן' });
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
function sessionCard(s, big) {
  const d = E.describe(s), tg = s.status === 'done' ? '<span class="tag ok">בוצע</span>' : s.status === 'skipped' ? '<span class="tag">לא בוצע</span>' : s.postponed ? '<span class="tag warn">נדחה לעוד היום</span>' : '';
  let h = '<div class="card"><h2>' + esc(d.title) + tg + '</h2><div class="mut">' + E.dayName(s.date) + ' ' + E.fmt(s.date) + ' · כ-' + d.minutes + ' דקות · שלב ' + s.level + '</div>';
  if (big || s.status === 'planned') h += '<ul class="l">' + d.lines.map(l => '<li>' + esc(l) + '</li>').join('') + '</ul><div class="tip">' + esc(d.tip) + '</div>';
  if (s.status === 'planned') h += '<div class="row"><button class="b coral" data-act="done" data-sid="' + s.id + '">✅ בוצע</button><button class="b alt" data-act="later" data-sid="' + s.id + '">⏰ היום, אחר כך</button><button class="b alt" data-act="unsure" data-sid="' + s.id + '">🤔 לא בטוח</button></div>';
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
  if (st.plannedWeeks.indexOf(wn) < 0 && wn <= E.CFG.lastWeek) {
    const early = t < E.CFG.start;
    h += '<div class="card banner"><h2>' + (early ? 'מתחילים ביום שישי ' + E.fmt(E.CFG.start) : 'שבוע חדש: ' + wn + ' מתוך 16') + '</h2><p>' + (early ? 'אפשר כבר עכשיו לתכנן את השבוע הראשון.' : 'עוד לא תכננו את השבוע. נסכם את הקודם ונסדר את הימים.') + '</p><div class="row"><button class="b coral" data-act="plan" data-wn="' + wn + '">לתכנון השבוע</button></div></div>';
  }
  if (st.icsDirty) h += '<div class="card"><h3>היומן לא מעודכן</h3><div class="mut">התוכנית השתנתה. כדי שהתזכורת תקפוץ ביומן בשעה הנכונה, הורד קובץ יומן ופתח אותו.</div><div class="row"><button class="b alt" data-act="ics">עדכון היומן</button></div></div>';
  const wd = E.weighDue(st, t);
  if (wd) h += '<div class="card banner"><h2>⚖️ ' + (wd.today ? 'יום שקילה' : 'עוד לא נשקלת השבוע') + '</h2><div class="mut">לפני האימון, בבוקר, אחרי שירותים ולפני אכילה. מספר אחד אחרי הנקודה, למשל 108.4</div><input id="tw" type="number" inputmode="decimal" step="0.1" min="30" max="300" placeholder="' + E.weightList(st).slice(-1)[0].kg.toFixed(1) + '" style="margin-top:8px"><div class="row"><button class="b coral" data-act="todayweight">שמירת משקל</button></div></div>';
  if (t < E.CFG.start && !st.sessions.some(x => x.week === 0)) h += '<div class="card banner"><h2>רוצה להתחיל כבר היום?</h2><p>ריצה קלה ראשונה, כ-31 דקות: חימום, דקה ריצה ושתי דקות הליכה (7 פעמים), וקירור. אחרי זה נחים עד שישי, ושבוע 1 מתחיל כרגיל.</p><div class="row"><button class="b coral" data-act="startnow">🏃 מתחילים היום</button></div></div>';
  const today = st.sessions.filter(s => s.date === t);
  if (t === E.CFG.race) h += sessionCard(today.find(s => s.kind === 'race'), true);
  else if (today.length) h += today.map(s => sessionCard(s, true)).join('');
  else {
    const next = st.sessions.filter(s => s.status === 'planned' && s.date > t && s.kind !== 'race').sort((a, b) => a.date < b.date ? -1 : 1)[0];
    h += '<div class="card"><h2>היום מנוחה</h2><p>מנוחה היא חלק מהאימון, כאן הגוף נבנה. הליכה קלה מותרת.</p>' + (next ? '<div class="mut">האימון הבא: ' + esc(E.describe(next).title) + ', יום ' + E.dayName(next.date) + ' ' + E.fmt(next.date) + '</div>' : '') + '</div>';
  }
  const c = E.cheer(st, t); if (c) h += '<div class="card good">' + esc(c) + '</div>';
  h += '<div class="mut" style="text-align:center">שלב ' + st.level + ' מתוך 16 · התוכנית אינה תחליף לייעוץ רפואי</div>';
  $('#main').innerHTML = h;
}

/* ---------- שבוע ---------- */
let viewWeek = null;
function weekRows(wn) {   // שורות לשבוע: מה שנשמר, או הצעת האפליקציה / תחזית
  const planned = st.plannedWeeks.indexOf(wn) >= 0, real = st.sessions.filter(s => s.week === wn && s.kind !== 'race' && !s.dropped);
  if (planned || real.length) return { list: real, kind: 'real' };
  const cw = curWeek(), lvl = wn <= cw ? st.level : Math.min(16, st.level + (wn - cw));
  return { list: E.previewWeek(lvl, wn), kind: wn === cw ? 'proposal' : 'forecast', level: lvl };
}
function vWeek() {
  $('#title').textContent = 'השבוע'; const t = todayIso(), cw = curWeek(), wn = Math.min(16, Math.max(1, viewWeek || cw));
  const r = weekRows(wn), race = st.sessions.find(s => s.kind === 'race');
  let h = '<div class="card"><div class="row" style="margin:0 0 8px;align-items:center"><button class="b alt sm" data-act="weekgo" data-wn="' + (wn - 1) + '" ' + (wn <= 1 ? 'disabled' : '') + ' aria-label="השבוע הקודם">›</button><div style="flex:3;text-align:center"><h2 style="margin:0">שבוע ' + wn + ' מתוך 16</h2><div class="mut">' + E.fmt(E.weekStartOf(wn)) + ' עד ' + E.fmt(E.addDays(E.weekStartOf(wn), 6)) + (wn === cw ? ' · השבוע הנוכחי' : '') + '</div></div><button class="b alt sm" data-act="weekgo" data-wn="' + (wn + 1) + '" ' + (wn >= 16 ? 'disabled' : '') + ' aria-label="השבוע הבא">‹</button></div>';
  if (r.kind === 'proposal') h += '<div class="tip">זו הצעה של האפליקציה, עוד לא אושרה. אם כל הימים פנויים, זה הסידור. כדי לבחור ימים אחרים או לאשר, לחץ על "תכנון השבוע".</div>';
  if (r.kind === 'forecast') h += '<div class="tip">תחזית בלבד (שלב ' + r.level + '), בהנחה שהכול מתקדם כמתוכנן. היא תתעדכן לפי הביצוע בפועל.</div>';
  E.weekDates(wn).forEach(d => {
    const ss = r.list.filter(s => s.date === d);
    if (wn === 16 && d === E.CFG.race) ss.push(race);
    h += '<div class="wk' + (d === t ? ' today' : '') + '"><div class="d">' + E.dayName(d) + '<small>' + E.fmt(d) + '</small></div><div class="t">';
    if (!ss.length) h += '<span class="mut">מנוחה</span>';
    ss.forEach(s => {
      const x = E.describe(s);
      if (s.status === 'preview') h += '<details><summary>' + esc(x.title) + ' <span class="mut">' + x.minutes + ' דק׳</span></summary><ul class="l">' + x.lines.map(l => '<li>' + esc(l) + '</li>').join('') + '</ul></details>';
      else h += '<div class="st-' + s.status + '"><a href="#" data-act="detail" data-sid="' + s.id + '" style="color:inherit">' + esc(x.title) + '</a> <span class="mut">' + x.minutes + ' דק׳</span>' + (s.status === 'done' ? ' ✓' : '') + '</div>';
    });
    h += '</div></div>';
  });
  h += '<div class="row">' + (wn === cw ? '<button class="b coral" data-act="plan" data-wn="' + wn + '">' + (r.kind === 'real' ? 'תכנון מחדש של השבוע' : 'תכנון השבוע') + '</button>' : '') + '<button class="b alt" data-act="allweeks">כל השבועות</button>' + (wn !== cw ? '<button class="b alt" data-act="weekgo" data-wn="' + cw + '">לשבוע הנוכחי</button>' : '') + '</div></div>';
  h += '<div class="card"><h3>רשמת משחק או פעילות אחרת?</h3><div class="mut">טניס, כדורסל וכדומה. אפשר שזה יחליף ריצה קלה.</div><div class="row"><button class="b alt" data-act="activity">רישום פעילות</button><button class="b alt" data-act="ics">עדכון יומן (לא חובה)</button></div></div>';
  $('#main').innerHTML = h;
}
function allWeeksSheet() {
  const cw = curWeek(); let h = '<h2>כל השבועות</h2><div class="mut">שבוע מתחיל בשישי. המרוץ: שישי 19.3.</div>';
  for (let w = 1; w <= 16; w++) {
    const r = weekRows(w), lvl = r.kind === 'real' ? (r.list[0] ? r.list[0].level : st.level) : r.level, long = r.list.find(s => s.kind === 'long') || r.list.find(s => s.kind === 'easy1');
    const x = E.weekStats(st, w), status = r.kind === 'real' ? (w < cw ? 'בוצע ' + x.runCredit + ' מתוך ' + x.runPlanned + ' ריצות' : 'מתוכנן') : (r.kind === 'proposal' ? 'הצעה' : 'תחזית');
    h += '<div class="card" data-act="weekgo" data-wn="' + w + '" style="cursor:pointer;' + (w === cw ? 'border-color:var(--coral)' : '') + '"><h3>שבוע ' + w + ' · ' + E.fmt(E.weekStartOf(w)) + ' <span class="tag' + (w === cw ? ' coral' : '') + '">' + status + '</span></h3><div class="mut">שלב ' + lvl + (long ? ' · ' + (long.kind === 'long' ? 'ארוכה' : 'קלה') + ': ' + E.describe(long).lines[1] : '') + '</div></div>';
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
    const W = 320, H = 140, ks = w.map(p => p.kg), lo = Math.min.apply(null, ks.concat(g.targetKg || 999)) - 1, hi = Math.max.apply(null, ks) + 1;
    const t0 = E.pd(w[0].date), t1 = Math.max(E.pd(w[w.length - 1].date), t0 + 864e5 * 7);
    const px = p => 10 + (E.pd(p.date) - t0) / (t1 - t0) * (W - 20), py = k => 10 + (hi - k) / (hi - lo) * (H - 20);
    let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img"><polyline fill="none" stroke="#16213a" stroke-width="2" points="' + w.map(p => px(p) + ',' + py(p.kg)).join(' ') + '"/>' + w.map(p => '<circle cx="' + px(p) + '" cy="' + py(p.kg) + '" r="4" fill="#f5b700"/>').join('');
    if (g.targetKg) s += '<line x1="0" x2="' + W + '" y1="' + py(g.targetKg) + '" y2="' + py(g.targetKg) + '" stroke="#2f7d57" stroke-dasharray="4 4"/>';
    h += '<div class="card"><h3>מגמה</h3>' + s + '</svg></div>';
  }
  h += '<div class="card"><h3>היסטוריה</h3>' + w.slice().reverse().map(p => '<div class="wk" data-act="editw" data-d="' + p.date + '" style="cursor:pointer"><div class="d">' + (p.start ? 'התחלה' : E.fmt(p.date)) + '</div><div class="t">' + p.kg.toFixed(1) + ' ק"ג · BMI ' + E.bmi(p.kg, g.heightCm).toFixed(1) + ' <span class="mut">· עריכה</span></div></div>').join('') + '</div>';
  $('#main').innerHTML = h;
}

/* ---------- עוד ---------- */
function vMore() {
  $('#title').textContent = 'עוד'; const g = st.settings;
  const permOk = 'Notification' in window && Notification.permission === 'granted';
  $('#main').innerHTML =
    '<div class="card"><h3>תזכורות</h3><label for="rem">שעת תזכורת יומית</label><input id="rem" type="time" value="' + g.reminder + '"><label for="wd">יום שקילה שבועי (התזכורת באה יחד עם האימון)</label><select id="wd">' + [0,1,2,3,4,5,6].map(i => '<option value="' + i + '"' + (E.weighDay(st) === i ? ' selected' : '') + '>' + E.DAYNAMES[i] + '</option>').join('') + '</select><label for="wt">שעת תזכורת לתכנון בשישי</label><input id="wt" type="time" value="' + g.weighTime + '">' +
    '<div class="row"><button class="b" data-act="ics">⬇️ הורדת קובץ יומן (התזכורת האמינה)</button></div>' +
    '<div class="tip">פתח את הקובץ שירד, ובחר לייבא ליומן Google. התזכורת תקפוץ בשעה שקבעת גם כשהאפליקציה סגורה. אחרי כל שינוי בתוכנית, לחץ שוב כדי לעדכן. אם אחרי העדכון תראה אימון כפול ביומן, מחק את הישן ידנית.</div>' +
    '<div class="row"><button class="b alt" data-act="notif">' + (permOk ? '✅ התראות באפליקציה פעילות' : '🔔 הפעלת התראות באפליקציה') + '</button></div><div class="mut">התראה עם כפתורים (בוצע / אחר כך / לא בטוח) מופיעה רק כשהאפליקציה נפתחה בטלפון אחרי שעת התזכורת. היא לא תחליף ליומן.</div></div>' +
    '<div class="card"><h3>פרטים</h3><label for="ht">גובה בס"מ</label><input id="ht" type="number" inputmode="numeric" value="' + g.heightCm + '"><label for="tg">משקל יעד בק"ג (אפשר להשאיר ריק)</label><input id="tg" type="number" inputmode="decimal" step="0.5" value="' + (g.targetKg || '') + '"><div class="row"><button class="b coral" data-act="savesettings">שמירה</button></div></div>' +
    '<div class="card"><h3>גיבוי</h3><div class="mut">הכול נשמר רק בטלפון הזה. מומלץ לגבות מדי פעם.</div><div class="row"><button class="b alt" data-act="export">גיבוי לקובץ</button><label class="b alt" style="margin:0">שחזור מקובץ<input type="file" id="imp" accept=".json" hidden></label></div></div>' +
    '<div class="card"><h3>בטיחות</h3><div class="mut">התוכנית כללית ואינה תחליף לייעוץ רפואי. כאב בחזה, סחרור, קוצר נשימה חריג או כאב חד במפרק הם סיבה לעצור ולפנות לרופא. בגשם ובחושך: נעליים עם אחיזה ובגדים בולטים.</div><div class="row"><button class="b alt sm" data-act="reset">איפוס כל הנתונים</button></div></div>';
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
function doneSheet(sid) {
  const s = st.sessions.find(x => x.id === sid), d = E.describe(s), run = E.isRun(s.kind);
  sheet('<h2>' + esc(d.title) + ' – איך היה?</h2><label for="f-min">כמה דקות בפועל?</label><input id="f-min" type="number" inputmode="numeric" value="' + d.minutes + '">' +
    (run ? '<label for="f-km">מרחק בק"מ (אם ידוע, אפשר לדלג)</label><input id="f-km" type="number" inputmode="decimal" step="0.1">' : '') +
    '<label for="f-rpe">כמה קשה זה היה? <span id="f-rpe-t">5 – ' + RPE[5] + '</span></label><input id="f-rpe" type="range" min="1" max="10" value="5"><label><input type="checkbox" id="f-pain"> היה כאב חד או כאב שמטריד</label>' +
    '<div class="row"><button class="b coral" data-act="savedone" data-sid="' + sid + '">שמירה</button><button class="b alt" data-act="close">ביטול</button></div>');
  $('#f-rpe').oninput = e => { $('#f-rpe-t').textContent = e.target.value + ' – ' + RPE[e.target.value]; };
}
function saveDone(sid) {
  const s = st.sessions.find(x => x.id === sid), pain = $('#f-pain').checked, rpe = +$('#f-rpe').value;
  const log = { date: s.date < todayIso() ? s.date : todayIso(), minutes: +$('#f-min').value || 0, rpe, pain };
  const km = $('#f-km') && +$('#f-km').value; if (km) log.km = km;
  E.markDone(st, sid, log); dirty(); closeSheet(); render();
  toast(pain ? 'נרשם. כאב הוא סימן לנוח: אם הוא נמשך, כדאי להיבדק.' : rpe >= 9 ? 'כל הכבוד, אבל זה היה מאמץ גבוה. בפעם הבאה לאט יותר.' : E.cheer(st, todayIso()) || 'כל הכבוד!');
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
  if (wn > 1 && st.plannedWeeks.indexOf(wn - 1) >= 0 && !st.reviews.some(r => r.week === wn - 1)) E.closeWeek(st, wn - 1);
  const rv = st.reviews.find(r => r.week === wn - 1), t = todayIso(), dates = E.weekDates(wn);
  let h = '<h2>תכנון שבוע ' + wn + '</h2>';
  if (rv && wn > 1) { const x = E.weekStats(st, wn - 1); h += '<div class="card"><h3>סיכום שבוע ' + (wn - 1) + '</h3><div>ריצות: ' + x.runCredit + ' מתוך ' + x.runPlanned + ' · כוח: ' + x.strCredit + ' מתוך ' + x.strPlanned + (x.avgRpe ? ' · מאמץ ממוצע ' + x.avgRpe.toFixed(1) : '') + '</div><div class="mut">' + esc(rv.why) + (rv.to !== rv.from ? ' (שלב ' + rv.from + ' ← ' + rv.to + ')' : ' (נשארים בשלב ' + rv.to + ')') + '</div></div>'; }
  h += '<div class="card"><h3>באילו ימים אתה פנוי?</h3><div class="mut">סמן את הימים שאפשר לאמן בהם. האפליקציה תשבץ ותציע.</div><div class="days">' + dates.map(d => { const past = d < t; return '<label class="' + (past ? '' : 'on') + '" data-day="' + d + '"><input type="checkbox" value="' + d + '" ' + (past ? 'disabled' : 'checked') + '>' + E.dayName(d) + '<br><small>' + E.fmt(d) + '</small></label>'; }).join('') + '</div></div>';
  h += '<div id="props"></div><div class="row"><button class="b coral" data-act="propose">הצע לי תוכנית</button><button class="b alt" data-act="close">סגירה</button></div>';
  sheet(h);
  document.querySelectorAll('#sheet .days label').forEach(l => l.onclick = e => { e.preventDefault(); const i = l.querySelector('input'); if (i.disabled) return; i.checked = !i.checked; l.classList.toggle('on', i.checked); });
}
function propose() {
  const avail = Array.from(document.querySelectorAll('#sheet .days input:checked')).map(i => i.value);
  const r = E.proposeWeek(st, plan.wn, avail); plan.props = r;
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
  else if (a === 'ics') downloadICS();
  else if (a === 'close') closeSheet();
  else if (a === 'detail') { e.preventDefault(); const s = st.sessions.find(x => x.id === sid), d = E.describe(s); sheet('<h2>' + esc(d.title) + '</h2><div class="mut">' + E.dayName(s.date) + ' ' + E.fmt(s.date) + '</div><ul class="l">' + d.lines.map(l => '<li>' + esc(l) + '</li>').join('') + '</ul><div class="tip">' + esc(d.tip) + '</div><div class="row">' + (s.status === 'planned' ? '<button class="b coral" data-act="done" data-sid="' + sid + '">✅ בוצע</button><button class="b alt" data-act="unsure" data-sid="' + sid + '">🤔 לא בטוח</button>' : '') + '<button class="b alt" data-act="close">סגירה</button></div>'); }
  else if (a === 'addweight') { if (saveWeight($('#wkg').value)) { render(); } }
  else if (a === 'todayweight') { if (saveWeight($('#tw').value)) { render(); } }
  else if (a === 'savesettings') { st.settings.reminder = $('#rem').value || '17:00'; st.settings.weighTime = $('#wt').value || '08:00'; st.settings.weighDay = +$('#wd').value; st.settings.heightCm = +$('#ht').value || 182; st.settings.targetKg = +$('#tg').value || null; dirty(); toast('נשמר. לחץ על הורדת קובץ יומן כדי לעדכן את השעה.'); }
  else if (a === 'notif') { if (!('Notification' in window)) return toast('הדפדפן לא תומך'); Notification.requestPermission().then(p => { st.settings.notify = p === 'granted'; save(); render(); }); }
  else if (a === 'export') { const b = new Blob([JSON.stringify(st)], { type: 'application/json' }), l = document.createElement('a'); l.href = URL.createObjectURL(b); l.download = 'running-backup-' + todayIso() + '.json'; document.body.appendChild(l); l.click(); l.remove(); }
  else if (a === 'reset') { if (confirm('למחוק את כל הנתונים? אי אפשר לשחזר.')) { st = E.newState(); save(); render(); } }
});
$('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); });

/* ---------- אתחול ---------- */
maintain(); render();
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('message', e => handleAct(e.data.act, e.data.sid));
}
const q = new URLSearchParams(location.search);
if (q.get('act')) { handleAct(q.get('act'), q.get('sid')); history.replaceState(null, '', location.pathname); }
setInterval(tick, 30000); tick();
document.addEventListener('visibilitychange', () => { if (!document.hidden) { maintain(); if ($('#sheet').hidden) render(); tick(); } });
window.__app = { get st() { return st; }, render };
})();
