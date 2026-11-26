/* מנוע התוכנית: כל הכללים כאן, בלי תלות בממשק. אין AI ואין שרת: הכול כללים קבועים. */
(function (root) {
'use strict';
const DAY = 864e5;
const CFG = { firstDay: '2026-11-25', start: '2026-11-28', race: '2027-03-19', lastWeek: 16, startWeight: 111, startWeightDate: '2026-11-25', heightCm: 182 };
const DAYNAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

/* ---------- תאריכים (UTC, כדי שלא יהיו קפיצות שעון קיץ) ---------- */
function pd(s) { const p = s.split('-'); return Date.UTC(+p[0], +p[1] - 1, +p[2]); }
function iso(t) { return new Date(t).toISOString().slice(0, 10); }
function addDays(s, n) { return iso(pd(s) + n * DAY); }
function dow(s) { return new Date(pd(s)).getUTCDay(); }           // 0=ראשון ... 5=שישי, 6=שבת
function diff(a, b) { return Math.round((pd(b) - pd(a)) / DAY); }
function weekStart(s) { return addDays(s, -((dow(s) - 6 + 7) % 7)); } // שבוע מתחיל בשבת ונגמר בשישי
function weekNo(s) { return Math.floor(diff(CFG.start, weekStart(s)) / 7) + 1; }
function weekDatesVisible(n) { return weekDates(n).filter(d => n !== 0 || d >= CFG.firstDay); }
function weekStartOf(n) { return addDays(CFG.start, (n - 1) * 7); }
function weekDates(n) { const ws = weekStartOf(n); return [0, 1, 2, 3, 4, 5, 6].map(i => addDays(ws, i)); }
function dayName(s) { return DAYNAMES[dow(s)]; }
function fmt(s) { const p = s.split('-'); return +p[2] + '.' + +p[1]; }

/* ---------- טבלת השלבים ---------- */
// run/walk בדקות, reps חזרות; cont = ריצה רצופה בדקות
const LEVELS = [null,
  { easy: { run: 1, walk: 2, reps: 6 }, long: { run: 1, walk: 2, reps: 7 } },
  { easy: { run: 1.5, walk: 2, reps: 5 }, long: { run: 1.5, walk: 2, reps: 6 } },
  { easy: { run: 2, walk: 2, reps: 5 }, long: { run: 2, walk: 2, reps: 6 } },
  { light: 1, easy: { run: 2, walk: 2, reps: 4 }, long: { run: 2, walk: 2, reps: 4 } },
  { easy: { run: 3, walk: 2, reps: 4 }, long: { run: 3, walk: 2, reps: 5 } },
  { easy: { run: 4, walk: 1.5, reps: 3 }, long: { run: 4, walk: 1.5, reps: 5 } },
  { easy: { run: 5, walk: 1, reps: 3 }, long: { run: 5, walk: 1, reps: 4 } },
  { light: 1, easy: { run: 4, walk: 1, reps: 3 }, long: { run: 5, walk: 1, reps: 3 } },
  { easy: { run: 5, walk: 1, reps: 3 }, long: { run: 8, walk: 1, reps: 3 } },
  { easy: { run: 8, walk: 1, reps: 2 }, long: { run: 10, walk: 1, reps: 3 } },
  { easy: { run: 10, walk: 1, reps: 2 }, long: { run: 15, walk: 1, reps: 2 } },
  { light: 1, easy: { cont: 10 }, long: { cont: 18 } },
  { easy: { cont: 15 }, long: { cont: 24 } },
  { easy: { cont: 15 }, long: { cont: 30 } },
  { easy: { cont: 18 }, long: { cont: 35 } },
  { taper: 1, easy: { cont: 20 }, easy2: { cont: 10 }, long: { cont: 35 } }
];

const PUSH = ['על הקיר', 'על שולחן או משטח גבוה', 'על כיסא או ספה', 'על מדרגות', 'על הברכיים', 'מהרצפה'];
const pushStep = lv => lv <= 2 ? 0 : lv <= 4 ? 1 : lv <= 7 ? 2 : lv <= 10 ? 3 : lv <= 13 ? 4 : 5;
const STR = {
  strA: [   // שישי: פלג גוף עליון ובטן
    ['שכיבות סמיכה', ['2×8', '3×8', '3×10'], 'push'],
    ['כפיפות בטן', ['2×10', '3×15', '3×20']],
    ['פלאנק', ['2×20 שניות', '3×30 שניות', '3×45 שניות']],
    ['גשר ישבן', ['2×12', '3×15', '3×15']]
  ],
  strB: [   // שלישי: רגליים
    ['סקוואט (3 שניות בירידה)', ['2×10', '3×12', '3×12, אפשר תרמיל עם בקבוקי מים']],
    ['עליית מדרגה', ['2×8 לכל רגל', '3×10 לכל רגל', '3×12 לכל רגל, מדרגה גבוהה']],
    ['גשר ישבן', ['2×12', '3×12 על רגל אחת, לכל צד', '3×12 על רגל אחת, לכל צד']],
    ['הרמות עקבים (על מדרגה)', ['2×12', '3×15', '3×12 על רגל אחת']],
    ['הטיית גוף קדימה עם גב ישר (RDL)', ['2×10', '2×8 על רגל אחת, לכל צד', '3×8 על רגל אחת, לכל צד']]
  ]
};
const tierOf = lv => lv <= 4 ? 0 : lv <= 10 ? 1 : 2;

const isRun = k => k === 'long' || k === 'easy1' || k === 'easy2';
const isStr = k => k === 'strA' || k === 'strB';
const KIND_LABEL = { long: 'ריצה ארוכה', easy1: 'ריצה קלה', easy2: 'ריצה קלה', strA: 'אימון כוח A', strB: 'אימון כוח B', race: 'המרוץ' };

function weekKinds(wn) { return wn >= 16 ? ['easy1', 'strA', 'easy2', 'strB'] : ['long', 'easy1', 'strA', 'easy2', 'strB']; }

/* ---------- תיאור אימון ---------- */
function halve(w) { return w.cont ? { cont: Math.max(5, Math.round(w.cont / 2)) } : { run: w.run, walk: w.walk, reps: Math.max(2, Math.ceil(w.reps / 2)) }; }
function workoutFor(s) {
  const lv = LEVELS[Math.min(16, Math.max(1, s.level))];
  let w;
  if (s.kind === 'long') w = lv.long;
  else if (s.kind === 'easy2') w = lv.easy2 || (s.taper && !lv.taper ? halve(lv.easy) : lv.easy);
  else w = lv.easy;
  return s.lightened ? halve(w) : w;
}
function runMinutes(w) { return Math.round(10 + (w.cont ? w.cont : w.reps * (w.run + w.walk))); }
function fmtMin(x) { return x === 1.5 ? 'דקה וחצי' : x === 1 ? 'דקה' : x === 2 ? 'שתי דקות' : x + ' דקות'; }

function describe(s) {
  if (s.kind === 'race') return { title: 'המרוץ: 5 ק"מ בירושלים', minutes: 45, lines: ['התחל לאט, אפילו יותר לאט ממה שנראה לך.', 'מותר ללכת בעליות ובתחנות המים. המטרה היא לסיים בכיף.', 'שתה מים, אל תנסה שום דבר חדש ביום המרוץ.'], tip: 'אתה לא צריך לרוץ מהר. אתה צריך להגיע לקו הסיום עם חיוך.' };
  const label = KIND_LABEL[s.kind] + (s.lightened ? ' (גרסה קלה)' : '');
  if (isRun(s.kind)) {
    const w = workoutFor(s);
    const lines = ['חימום: 5 דקות הליכה מהירה'];
    if (w.cont) lines.push('ריצה קלה רצופה: ' + w.cont + ' דקות');
    else lines.push('ריצה קלה ' + fmtMin(w.run) + ', ואז הליכה ' + fmtMin(w.walk) + '. חוזר ' + w.reps + ' פעמים');
    lines.push('קירור: 5 דקות הליכה');
    return { title: label, minutes: runMinutes(w), lines,
      tip: 'בעלייה תלך, בשטוח ובירידה מתונה רוץ בקלילות. המאמץ הנכון: אתה מצליח לדבר במשפטים (4 עד 5 מתוך 10). הליכה בירידה חדה, כדי לשמור על הברכיים. אחרי ההליכה המהירה: שתי דקות של נדנודי רגליים, סיבובי קרסוליים וחמישה סקוואטים, בלי מתיחות סטטיות.'
        + (s.kind === 'long' && s.level >= 12 ? ' מדוד את המרחק עם הטלפון ורשום אותו בשדה ק"מ.' : '')
        + (s.taper ? ' זו ריצת התאמה: עדיף מוקדם בבוקר, בשעה של המרוץ, עם הנעליים והבגדים של המרוץ.' : '') };
  }
  const t = tierOf(s.level);
  return { title: label, minutes: 30, lines: STR[s.kind].map(e => (e[2] === 'push' ? e[0] + ' ' + PUSH[pushStep(s.level)] : e[0]) + ': ' + e[1][t]),
    tip: 'מנוחה של דקה בין סטים. מפסיקים כשנשארו עוד 2 עד 3 חזרות בלי כשל. טכניקה נקייה חשובה יותר ממספר החזרות. אם יש כאב חד, עוצרים.' };
}

/* ---------- שלבי האימון למצב אימון (שעון ספירה) ---------- */
function segmentsFor(s) {
  if (s.kind === 'race') return [];
  if (isRun(s.kind)) {
    const w = workoutFor(s), segs = [{ k: 'walk', sec: 300, label: 'חימום: הליכה מהירה', tag: 'warm' }];
    if (w.cont) segs.push({ k: 'run', sec: Math.round(w.cont * 60), label: 'ריצה קלה', sub: w.cont + ' דקות רצוף' });
    else for (let i = 1; i <= w.reps; i++) {
      segs.push({ k: 'run', sec: Math.round(w.run * 60), label: 'ריצה קלה', sub: 'חזרה ' + i + ' מתוך ' + w.reps });
      if (i < w.reps) segs.push({ k: 'walk', sec: Math.round(w.walk * 60), label: 'הליכה', sub: 'חזרה ' + i + ' מתוך ' + w.reps });
    }
    segs.push({ k: 'walk', sec: 300 + (w.cont ? 0 : Math.round(w.walk * 60)), label: 'קירור: הליכה', tag: 'cool' });   // ההליכה האחרונה מתמזגת עם הקירור
    return segs;
  }
  const t = tierOf(s.level), segs = [{ k: 'walk', sec: 180, label: 'חימום: הליכה במקום ותנועות רגליים', tag: 'warm' }];
  STR[s.kind].forEach((e, ei, arr) => {
    const m = /^(\d+)×(.*)$/.exec(e[1][t]), sets = m ? +m[1] : 1, detail = m ? m[2].trim() : e[1][t], timed = /^(\d+) שניות/.exec(detail);
    for (let i = 1; i <= sets; i++) {
      segs.push({ k: 'set', sec: timed ? +timed[1] : null, label: e[2] === 'push' ? e[0] + ' ' + PUSH[pushStep(s.level)] : e[0], sub: 'סט ' + i + ' מתוך ' + sets + ' · ' + detail });
      const last = i === sets && ei === arr.length - 1;
      if (!last) segs.push({ k: 'rest', sec: i < sets ? 45 : 60, label: 'מנוחה', sub: i < sets ? 'הסט הבא: ' + e[0] : 'התרגיל הבא: ' + arr[ei + 1][0] });
    }
  });
  return segs;
}

/* ---------- מצב התחלתי ---------- */
function newState() {
  return {
    v: 2,
    settings: { reminder: '17:00', weighTime: '10:00', weighDay: 2, heightCm: CFG.heightCm, targetKg: null, notify: false },
    level: 1, sessions: [{ id: 'race', week: 16, kind: 'race', date: CFG.race, level: 16, status: 'planned', seq: 0 }],
    activities: [], weights: [{ date: '2026-11-18', kg: 113.6, start: true }, { date: CFG.startWeightDate, kg: CFG.startWeight }], reviews: [], painLog: [], plannedWeeks: []
  };
}

/* ---------- שיבוץ שבוע ---------- */
const PREF = { long: 6, easy1: 1, easy2: 4, strA: 5, strB: 2 };
function blocked(date, kind) {
  if (date >= CFG.race) return true;
  if (date === addDays(CFG.race, -1)) return true;                  // היום שלפני המרוץ: מנוחה
  if (isStr(kind) && date === addDays(CFG.race, -2)) return true;  // בלי כוח יומיים לפני
  if (isRun(kind) && dow(date) === 5) return true;                  // שישי בלי ריצה
  return false;
}
function scoreAssign(items) {
  let sc = 0;
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    if (PREF[a.kind] === dow(a.date)) sc += 5;
    if (a.kind === 'long' && dow(a.date) === 6) sc += 12;
    if (a.kind === 'strA' && dow(a.date) === 5) sc += 8;
    for (let j = i + 1; j < items.length; j++) {
      const b = items[j], d = Math.abs(diff(a.date, b.date));
      if (d === 1) {
        if (isRun(a.kind) && isRun(b.kind)) sc -= 100;
        if (isStr(a.kind) && isStr(b.kind)) sc -= 30;
        const L = a.kind === 'long' ? a : b.kind === 'long' ? b : null, S = L && (isStr(a.kind) ? a : isStr(b.kind) ? b : null);
        if (L && S) sc += (S.date < L.date) ? -6 : -3;
      }
    }
  }
  return sc;
}
// מחזיר עד 3 הצעות שונות, מהטובה לפחות טובה. dayOf(kind) = הימים הפנויים לאותו סוג אימון
function proposals(kinds, dayOf, fixed) {
  const all = [], used = {}, pick = [];
  (function rec(i) {
    if (i === kinds.length) {
      const items = kinds.map((k, n) => ({ kind: k, date: pick[n] })).concat(fixed);
      const runsOnly = items.filter(x => isRun(x.kind));
      if (runsOnly.some(a => runsOnly.some(b => a !== b && Math.abs(diff(a.date, b.date)) === 1))) return; // שתי ריצות ברצף אסורות
      all.push({ sc: scoreAssign(items), items: kinds.map((k, n) => ({ kind: k, date: pick[n] })) });
      return;
    }
    const days = dayOf(kinds[i]);
    for (let j = 0; j < days.length; j++) {
      const d = days[j];
      if (used[d] || blocked(d, kinds[i])) continue;
      used[d] = true; pick[i] = d; rec(i + 1); used[d] = false;
    }
  })(0);
  all.sort((a, b) => b.sc - a.sc);
  const out = [], seen = {};
  for (const p of all) {
    const key = p.items.map(x => x.kind + x.date).join('|');
    if (seen[key]) continue; seen[key] = 1; out.push(p);
    if (out.length === 3) break;
  }
  return out;
}
// הצעות לשבוע: לא משנה את המצב. availRun = ימים פנויים לריצה, availStr = ימים פנויים לכוח (אם לא ניתנו: אותם ימים)
function proposeWeek(st, wn, availRun, availStr) {
  if (!availStr) availStr = availRun;
  const done = st.sessions.filter(s => s.week === wn && s.status === 'done');
  const doneKinds = done.map(s => s.kind);
  const wanted = weekKinds(wn).filter(k => doneKinds.indexOf(k) < 0);
  const fixed = done.map(s => ({ kind: s.kind, date: s.date }));
  const free = list => list.filter(d => !fixed.some(f => f.date === d));
  const runDays = free(availRun), strDays = free(availStr), dayOf = k => isRun(k) ? runDays : strDays;
  const kinds = wanted.filter(k => dayOf(k).some(d => !blocked(d, k)));   // סוגים שיש להם לפחות יום אחד מתאים
  const maxDays = Object.keys(runDays.concat(strDays).reduce((o, d) => (o[d] = 1, o), {})).length;
  let chosen = [];   // בוחרים לפי סדר עדיפות: כל סוג נכנס אם עדיין אפשר לשבץ אותו
  kinds.forEach(k => { if (chosen.length < maxDays && proposals(chosen.concat(k), dayOf, fixed).length) chosen = chosen.concat(k); });
  if (!chosen.length) return { options: [], dropped: wanted };
  return { options: proposals(chosen, dayOf, fixed), dropped: wanted.filter(w => chosen.indexOf(w) < 0) };
}
// מחיל הצעה על המצב
function applyWeek(st, wn, option, dropped) {
  const taper = wn >= 16;
  const byId = {}; st.sessions.forEach(s => { byId[s.id] = s; });
  const chosen = {}; option.items.forEach(it => { chosen[wn + '-' + it.kind] = it; });
  st.sessions.forEach(s => {
    if (s.week === wn && s.status === 'planned' && !chosen[s.id]) { s.status = 'skipped'; s.dropped = true; s.seq = (s.seq || 0) + 1; }
  });
  option.items.forEach(it => {
    const id = wn + '-' + it.kind, old = byId[id];
    if (old) { old.date = it.date; old.level = st.level; old.status = 'planned'; old.dropped = false; old.postponed = false; old.taper = taper; old.seq = (old.seq || 0) + 1; }
    else st.sessions.push({ id, week: wn, kind: it.kind, date: it.date, level: st.level, status: 'planned', seq: 0, taper });
  });
  if (st.plannedWeeks.indexOf(wn) < 0) st.plannedWeeks.push(wn);
}

/* ---------- סיכום שבוע והחלטה על שלב ---------- */
function weekStats(st, wn) {
  const ss = st.sessions.filter(s => s.week === wn && s.kind !== 'race');
  const runs = ss.filter(s => isRun(s.kind) && !s.dropped);
  const strs = ss.filter(s => isStr(s.kind) && !s.dropped);
  const cr = s => s.status === 'done' ? (s.log && s.log.substitute === 'walk' ? 0.5 : 1) : 0;
  const ws = weekStartOf(wn), we = addDays(ws, 6);
  const rpes = runs.filter(s => s.status === 'done' && s.log && !s.log.substitute && s.log.rpe).map(s => s.log.rpe);
  return {
    runPlanned: runs.length, runCredit: runs.reduce((a, s) => a + cr(s), 0),
    strPlanned: strs.length, strCredit: strs.reduce((a, s) => a + cr(s), 0),
    longDone: runs.filter(s => s.kind === 'long').every(s => cr(s) >= 1),
    avgRpe: rpes.length ? rpes.reduce((a, b) => a + b, 0) / rpes.length : null,
    pain: st.painLog.some(p => p >= ws && p <= we),
    maxSoreness: Math.max.apply(null, [0].concat(ss.filter(x => x.status === 'done' && x.log && x.log.soreness != null).map(x => x.log.soreness))),
    minutes: ss.filter(s => s.status === 'done' && s.log).reduce((a, s) => a + (s.log.minutes || 0), 0)
  };
}
function reviewWeek(st, wn) {
  const x = weekStats(st, wn), from = st.level;
  let to = from, why;
  const ratio = x.runPlanned ? x.runCredit / x.runPlanned : 1;
  const allRuns = x.runCredit >= x.runPlanned || (x.runPlanned >= 3 && x.runCredit >= x.runPlanned - 1 && x.longDone);
  const easyEnough = x.avgRpe === null || x.avgRpe <= 6, notSore = x.maxSoreness <= 3;
  if (x.pain) { to = Math.max(1, from - 1); why = 'היה כאב, אז חוזרים צעד אחורה ונחים 3 עד 5 ימים לפני שחוזרים. אם הכאב נמשך יותר משבוע, כדאי להיבדק אצל רופא.'; }
  else if (x.runPlanned && ratio < 0.34) { to = Math.max(1, from - 1); why = 'השבוע יצא חלש, וזה בסדר. חוזרים צעד אחורה כדי שהחזרה תהיה קלה.'; }
  else if (allRuns && x.longDone && easyEnough && notSore) { to = Math.min(16, from + 1, wn + 2); why = to > from ? 'שבוע טוב: כל הריצות בוצעו, המאמץ היה סביר ואין כאבי שרירים. עולים שלב.' : 'שבוע טוב. נשארים בשלב הנוכחי, כי אתה כבר מקדים את התוכנית.'; }
  else if (!easyEnough) { why = 'האימונים הרגישו קשים מדי (מעל 6 מתוך 10). חוזרים על אותו שלב, כדי שהגוף יתרגל.'; }
  else if (!notSore) { why = 'היו כאבי שרירים חזקים (מעל 3 מתוך 10). חוזרים על אותו שלב, ואם הם חוזרים, מחליפים ריצה אחת בהליכה מהירה או באופניים.'; }
  else { why = 'חלק מהריצות לא בוצעו, לכן חוזרים על אותו שלב ולא קופצים קדימה.'; }
  return { from, to, why, stats: x, week: wn };
}
function closeWeek(st, wn, today) { // סוגר שבוע: אימונים שעברו ולא בוצעו נחשבים לא בוצעו, ושלב חדש. אימון של היום (שישי) נשאר פתוח
  if (st.reviews.some(r => r.week === wn)) return st.reviews.find(r => r.week === wn);
  st.sessions.forEach(s => { if (s.week === wn && s.status === 'planned' && (!today || s.date < today)) { s.status = 'skipped'; s.seq = (s.seq || 0) + 1; } });
  const r = reviewWeek(st, wn);
  st.level = r.to; st.reviews.push({ week: wn, from: r.from, to: r.to, why: r.why });
  return r;
}
function behindBy(st, wn) { return Math.max(0, wn - st.level); }

// הצעת האפליקציה לשבוע שעוד לא תוכנן (לא נשמרת): כל הימים פנויים
function previewWeek(level, wn) {
  if (wn > CFG.lastWeek) return [];
  const r = proposeWeek({ sessions: [] }, wn, weekDates(wn));
  return r.options.length ? r.options[0].items.map(it => ({ id: wn + '-' + it.kind, week: wn, kind: it.kind, date: it.date, level, status: 'preview', taper: wn >= CFG.lastWeek })) : [];
}

/* ---------- אימון שבוצע / החמצה ---------- */
function markDone(st, sid, log) { const s = st.sessions.find(x => x.id === sid); s.status = 'done'; s.postponed = false; s.log = log; s.seq = (s.seq || 0) + 1; if (log.pain) st.painLog.push(log.date); return s; }
function missedSessions(st, today) { return st.sessions.filter(s => s.status === 'planned' && s.date < today && s.kind !== 'race' && weekNo(s.date) >= weekNo(today)); }
function runCountLeft(st, wn, exceptId) { return st.sessions.filter(s => s.week === wn && isRun(s.kind) && !s.dropped && s.id !== exceptId && (s.status === 'planned' || s.status === 'done')).length; }

function candidateDates(st, s, today, reason) {
  const wn = s.week, we = addDays(weekStartOf(wn), 6);
  let from = today;
  if (reason === 'rain' || reason === 'tired' || reason === 'busy' || reason === 'nomood') from = addDays(today, 1);
  if (from < weekStartOf(wn)) from = weekStartOf(wn);
  const occ = {}; st.sessions.forEach(o => { if (o.id !== s.id && (o.status === 'planned' || o.status === 'done')) occ[o.date] = o; });
  const out = [];
  for (let d = from; d <= we; d = addDays(d, 1)) {
    if (occ[d] || blocked(d, s.kind)) continue;
    let pen = 0;
    const n1 = occ[addDays(d, -1)], n2 = occ[addDays(d, 1)];
    if (isRun(s.kind) && ((n1 && isRun(n1.kind)) || (n2 && isRun(n2.kind)))) continue;
    if (s.kind === 'long' && ((n1 && isStr(n1.kind)) || (n2 && isStr(n2.kind)))) pen += 1;
    if (isStr(s.kind) && ((n1 && isStr(n1.kind)) || (n2 && isStr(n2.kind)))) pen += 2;
    if (isStr(s.kind) && n2 && n2.kind === 'long') pen += 3;
    out.push({ d, pen });
  }
  out.sort((a, b) => a.pen - b.pen || (a.d < b.d ? -1 : 1));
  return out.slice(0, 2).sort((a, b) => a.d < b.d ? -1 : 1).map(x => x.d);
}

// הצעות להתאמה כשמפספסים אימון
function suggest(st, sid, reason, today) {
  const s = st.sessions.find(x => x.id === sid), opts = [];
  const run = isRun(s.kind);
  if (reason === 'pain') {
    return { advice: 'כאב הוא סיבה לעצור. נחים 2 עד 3 ימים, הליכה קלה מותרת. אם הכאב חד, מתמשך או מלווה בנפיחות, כדאי להיבדק. אחרי זה האפליקציה תוריד שלב כדי לחזור בקלות.',
      options: [{ label: 'לוותר על האימון הזה ולנוח', hint: 'נרשם כאב, והשבוע יסוכם בהתאם', action: { type: 'skip', sid, pain: true, date: today } }] };
  }
  if (reason === 'tired' || reason === 'nomood') {
    if (run && !s.lightened) opts.push({ label: 'לעשות היום גרסה קלה (חצי מהאימון)', hint: 'עדיף חצי אימון מאשר כלום, וזה נחשב בהתקדמות', action: { type: 'lighten', sid, date: s.date < today ? today : s.date } });
  }
  const cands = candidateDates(st, s, today, reason);
  cands.forEach(d => opts.push({ label: 'להזיז ל' + (d === addDays(today, 1) ? 'מחר' : 'יום ' + dayName(d)) + ' (' + fmt(d) + ')', hint: 'האימון נשאר באותו שבוע', action: { type: 'move', sid, to: d } }));
  if (run && (s.kind === 'long' || reason === 'rain')) opts.push({ label: 'להחליף בהליכה מהירה של 45 דקות', hint: 'נחשב חצי אימון בהתקדמות', action: { type: 'convert', sid } });
  const left = runCountLeft(st, s.week, s.id);
  let hint;
  if (run) hint = left >= 2 ? 'אפשר, ועדיין נשארות השבוע ' + left + ' ריצות' : 'זה משאיר השבוע רק ' + left + ' ריצה, אז כנראה לא תתקדם שלב';
  else hint = 'אימון כוח אחד פחות השבוע לא פוגע בהתקדמות. עדיף לשמור על הריצות';
  opts.push({ label: 'לוותר על האימון הזה השבוע', hint, action: { type: 'skip', sid } });
  const advice = reason === 'rain' ? 'גשם חזק או רצפה חלקה הם סיבה טובה לא לרוץ. הליכה בגשם קל מצוינת.' : reason === 'busy' ? 'ערב עמוס קורה. נסדר אותו לימים הפנויים.' : '';
  return { advice, options: opts };
}
function applyAction(st, a) {
  const s = st.sessions.find(x => x.id === a.sid);
  s.seq = (s.seq || 0) + 1; s.postponed = false;
  if (a.type === 'move') s.date = a.to;
  else if (a.type === 'skip') { s.status = 'skipped'; if (a.pain) st.painLog.push(a.date); }
  else if (a.type === 'lighten') { s.lightened = true; s.date = a.date; }
  else if (a.type === 'convert') { s.status = 'done'; s.log = { date: s.date, minutes: 45, rpe: 3, substitute: 'walk' }; }
  else if (a.type === 'today') { s.postponed = true; }
}

/* ---------- ספורט אחר (טניס, כדורסל...) ---------- */
function activityImpact(st, act) {
  st.activities.push(act);
  const out = { text: '', replaced: null };
  const counts = act.minutes >= 30 && act.rpe >= 4 && act.rpe <= 7;
  if (counts) {
    const wn = weekNo(act.date);
    const cand = st.sessions.filter(s => s.week === wn && (s.kind === 'easy1' || s.kind === 'easy2') && s.status === 'planned' && Math.abs(diff(s.date, act.date)) <= 1)
      .sort((a, b) => Math.abs(diff(a.date, act.date)) - Math.abs(diff(b.date, act.date)))[0];
    if (cand) { out.replaced = cand.id; out.text = 'המשחק נחשב כריצה קלה של ' + dayName(cand.date) + '. אפשר לסמן אותה כבוצעה.'; }
    else out.text = 'כל הכבוד על הפעילות. אין ריצה קלה פתוחה להחליף, אז זה בונוס.';
  } else if (act.rpe >= 8 || act.minutes >= 90) out.text = 'פעילות מאומצת. בריצה הקרובה תן לגוף להתאושש: אפשר לבחור בגרסה קלה אם הרגליים כבדות.';
  else out.text = 'נרשם. זו תנועה טובה, אבל היא לא מחליפה ריצה.';
  return out;
}
function replaceWithActivity(st, sid, act) {
  const s = st.sessions.find(x => x.id === sid);
  s.status = 'done'; s.seq = (s.seq || 0) + 1; s.log = { date: act.date, minutes: act.minutes, rpe: act.rpe, substitute: 'activity' };
}

/* ---------- משקל ---------- */
function weighDay(st) { return st.settings.weighDay == null ? 2 : +st.settings.weighDay; }
function round1(v) { return Math.round(v * 10) / 10; }
// האם צריך שקילה היום: אין שקילה בשבוע הנוכחי, ויום השקילה של השבוע הגיע
function weighDue(st, today) {
  const wn = weekNo(today), ds = [0, 1, 2, 3, 4, 5, 6].map(i => addDays(addDays(CFG.start, (wn - 1) * 7), i));
  const wdate = ds.find(d => dow(d) === weighDay(st));
  if (wn < 1 || today < wdate) return null;
  const ws = ds[0], we = ds[6];
  if (st.weights.some(w => w.date >= ws && w.date <= we && w.date !== CFG.startWeightDate)) return null;
  return { date: wdate, today: today === wdate };
}
function bmi(kg, cm) { return kg / Math.pow(cm / 100, 2); }
function weightList(st) { return st.weights.slice().sort((a, b) => a.date < b.date ? -1 : 1); }
function weightSummary(st) {
  const w = weightList(st), first = w[0], last = w[w.length - 1];
  const out = { first, last, change: last.kg - first.kg, bmi: bmi(last.kg, st.settings.heightCm), trend: null };
  if (w.length >= 4) { const a = w.slice(-3).reduce((s, x) => s + x.kg, 0) / 3, b = w.slice(-6, -3).reduce((s, x) => s + x.kg, 0) / Math.max(1, w.slice(-6, -3).length); out.trend = a - b; }
  return out;
}
function bmiLabel(b) { return b < 18.5 ? 'מתחת למשקל תקין' : b < 25 ? 'טווח תקין' : b < 30 ? 'עודף משקל' : 'השמנה'; }
function weightMessage(st) {
  const x = weightSummary(st);
  if (st.weights.length < 2) return 'שקילה ראשונה נרשמה. שוקלים פעם בשבוע, באותו יום ובאותה שעה.';
  const d = x.last.kg - st.weights[st.weights.length - 2].kg;
  if (x.trend !== null && x.trend > 0.3) return 'המגמה של השבועות האחרונים עולה קצת. משקל מתנדנד מיום ליום, ולכן מסתכלים על כמה שבועות ברצף. שווה לספר על זה לתזונאי.';
  if (d < -0.1) return 'ירידה של ' + Math.abs(d).toFixed(1) + ' ק"ג מהשקילה הקודמת. המשך כך, והאימונים ישמרו לך על השריר.';
  return 'המשקל יציב. זה קורה גם כשהגוף משתפר. ההתמדה באימונים חשובה יותר מהמספר בשבוע בודד.';
}

/* ---------- עידוד וספירה ---------- */
function streak(st, today) { // שבועות רצופים (אחרונים) עם לפחות 2 ריצות שבוצעו
  let n = 0;
  for (let w = weekNo(today) - 1; w >= 1; w--) { const x = weekStats(st, w); if (x.runCredit >= 2) n++; else break; }
  return n;
}
function totals(st) { const done = st.sessions.filter(s => s.status === 'done'); return { runs: done.filter(s => isRun(s.kind)).length, strength: done.filter(s => isStr(s.kind)).length, minutes: done.reduce((a, s) => a + ((s.log && s.log.minutes) || 0), 0), km: done.reduce((a, s) => a + ((s.log && s.log.km) || 0), 0) }; }
function cheer(st, today) {
  const t = totals(st), n = t.runs + t.strength, days = diff(today, CFG.race);
  if (n === 0) return days > 0 ? 'עוד ' + days + ' ימים למרוץ. הצעד הראשון הוא הקשה, וכבר החלטת.' : '';
  const msgs = ['כבר ' + n + ' אימונים מאחוריך. כל אחד מהם נשאר בגוף.', 'ההתמדה בונה אותך יותר מכל אימון בודד.', 'לוחם קרבי יודע לעשות את זה: צעד אחרי צעד.', 'עוד ' + days + ' ימים למרוץ, ואתה בדרך.', 'אימון קצר שבוצע שווה יותר מאימון מושלם שלא קרה.'];
  return msgs[(pd(today) / DAY | 0) % msgs.length];
}

/* ---------- קובץ יומן (.ics): תזכורת אמינה בטלפון ---------- */
function icsEscape(t) { return String(t).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'); }
function icsTime(date, hhmm) { return date.replace(/-/g, '') + 'T' + hhmm.replace(':', '') + '00'; }
function addMin(hhmm, m) { const p = hhmm.split(':'), t = +p[0] * 60 + +p[1] + m; return String(Math.floor(t / 60) % 24).padStart(2, '0') + ':' + String(t % 60).padStart(2, '0'); }
function buildICS(st, today) {
  const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//running-plan//HE', 'CALSCALE:GREGORIAN'];
  const stamp = today.replace(/-/g, '') + 'T000000Z';
  function ev(uid, seq, date, time, title, desc, cancelled) {
    L.push('BEGIN:VEVENT', 'UID:' + uid + '@running-plan', 'SEQUENCE:' + seq, 'DTSTAMP:' + stamp,
      'DTSTART:' + icsTime(date, time), 'DTEND:' + icsTime(date, addMin(time, 30)), 'SUMMARY:' + icsEscape(title), 'DESCRIPTION:' + icsEscape(desc));
    if (cancelled) L.push('STATUS:CANCELLED');
    else L.push('BEGIN:VALARM', 'TRIGGER:PT0M', 'ACTION:DISPLAY', 'DESCRIPTION:' + icsEscape(title), 'END:VALARM');
    L.push('END:VEVENT');
  }
  const wd = weighDay(st), WTXT = '⚖️ שקילה לפני האימון: בבוקר, אחרי שירותים ולפני אכילה. מספר אחד אחרי הנקודה.';
  const live = {}; st.sessions.forEach(s => { if (s.status === 'planned') live[s.date] = s; });
  st.sessions.forEach(s => {
    if (s.date < addDays(today, -7) || s.status === 'done') return;
    const d = describe(s), cancelled = s.status === 'skipped', w = !cancelled && dow(s.date) === wd && s.kind !== 'race';
    ev(s.id, s.seq || 0, s.date, st.settings.reminder, (w ? '⚖️+🏃 ' : '🏃 ') + d.title + ' (' + d.minutes + ' דק׳)' + (w ? ' + שקילה' : ''), (w ? WTXT + '\n' : '') + d.lines.join('\n') + '\n' + d.tip, cancelled);
  });
  for (let d = today; d < CFG.race; d = addDays(d, 1)) {   // יום שקילה בלי אימון באותו יום: תזכורת נפרדת
    if (dow(d) === wd && !live[d] && st.plannedWeeks.indexOf(weekNo(d)) >= 0) ev('weigh-' + d, 0, d, st.settings.reminder, '⚖️ שקילה שבועית', WTXT, false);
  }
  for (let n = 1; n <= CFG.lastWeek; n++) {   // בכל שישי מתכננים את השבוע שמתחיל מחר (שבת)
    const d = addDays(weekStartOf(n), -1); if (d < today) continue;
    ev('plan-' + d, 0, d, st.settings.weighTime, '📅 תכנון השבוע הבא', 'לפתוח את האפליקציה, לסכם את השבוע ולתכנן את השבוע הבא (שבת עד שישי).', false);
  }
  L.push('END:VCALENDAR');
  return L.join('\r\n');
}

root.Engine = { CFG, DAYNAMES, LEVELS, KIND_LABEL, pd, iso, addDays, dow, diff, weekStart, weekNo, weekStartOf, weekDates, weekDatesVisible, dayName, fmt, isRun, isStr,
  describe, workoutFor, previewWeek, segmentsFor, newState, proposeWeek, applyWeek, weekStats, reviewWeek, closeWeek, behindBy, markDone, missedSessions, suggest, applyAction,
  activityImpact, replaceWithActivity, bmi, bmiLabel, weighDay, weighDue, round1, weightList, weightSummary, weightMessage, streak, totals, cheer, buildICS, blocked, runCountLeft };
})(typeof window !== 'undefined' ? window : globalThis);
