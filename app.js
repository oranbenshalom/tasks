import { startStore } from './storage.js';

const $ = id => document.getElementById(id);
let state = { tasks: [], cats: [] };
let store = null;
let view = 'today';
let filterCat = null;      // הקטגוריה שנבחרה: מסננת את הרשימה וקובעת את הקטגוריה של משימה חדשה
let addToday = false;
let toastTimer;

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const newCat = () => filterCat || 'כללי';

function toast(msg, undo) {
  const t = $('toast');
  t.innerHTML = '';
  t.append(msg);
  if (undo) {
    const b = document.createElement('button');
    b.textContent = 'ביטול';
    b.onclick = () => { undo(); t.hidden = true; };
    t.append(b);
  }
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 4000);
}

function chip(label, active, onClick) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'chip' + (active ? ' active' : '');
  b.textContent = label;
  b.onclick = onClick;
  return b;
}

function renderChips() {
  const f = $('cats');
  f.innerHTML = '';
  f.append(chip('הכול', filterCat === null, () => { filterCat = null; render(); }));
  state.cats.forEach(c => f.append(chip(c, filterCat === c, () => {
    filterCat = filterCat === c ? null : c; render();
  })));
  $('addInput').placeholder = 'מה צריך לזכור? (' + newCat() + ')';

  const sel = $('importCat');
  sel.innerHTML = '';
  state.cats.forEach(c => {
    const o = document.createElement('option');
    o.value = c; o.textContent = c;
    if (c === newCat()) o.selected = true;
    sel.append(o);
  });
}

const update = (t, patch) => store.putTask({ ...t, ...patch });

function taskEl(t) {
  const row = document.createElement('div');
  row.className = 'task' + (t.done ? ' done' : '');

  const cb = document.createElement('input');
  cb.type = 'checkbox';
  cb.checked = t.done;
  cb.setAttribute('aria-label', 'סימון בוצע');
  cb.onchange = () => update(t, { done: cb.checked, doneAt: cb.checked ? Date.now() : null });

  const body = document.createElement('div');
  body.className = 'body';
  const txt = document.createElement('div');
  txt.className = 'txt';
  txt.textContent = t.text;
  txt.onclick = () => {
    const v = prompt('עריכת משימה', t.text);
    if (v !== null && v.trim()) update(t, { text: v.trim() });
  };
  const meta = document.createElement('div');
  meta.className = 'meta';
  meta.textContent = t.cat;
  body.append(txt, meta);

  const star = document.createElement('button');
  star.className = 'icon-btn star' + (t.today ? ' on' : '');
  star.textContent = t.today ? '★' : '☆';
  star.setAttribute('aria-label', 'להיום');
  star.onclick = () => update(t, { today: !t.today });

  const del = document.createElement('button');
  del.className = 'icon-btn del';
  del.textContent = '✕';
  del.setAttribute('aria-label', 'מחיקה');
  del.onclick = () => {
    store.removeTasks([t.id]);
    toast('המשימה נמחקה', () => store.putTask(t));
  };

  row.append(cb, body, star, del);
  return row;
}

function render() {
  renderChips();
  document.querySelectorAll('.tab').forEach(b =>
    b.classList.toggle('active', b.dataset.view === view));

  const sorted = state.tasks.slice().sort((a, b) => (b.created || 0) - (a.created || 0));
  const open = sorted.filter(t => !t.done);
  const done = sorted.filter(t => t.done);
  $('todayCount').textContent = open.filter(t => t.today).length || '';
  $('allCount').textContent = open.length || '';

  let shown = open;
  if (view === 'today') shown = shown.filter(t => t.today);
  if (filterCat) shown = shown.filter(t => t.cat === filterCat);

  const list = $('list');
  list.innerHTML = '';
  if (!shown.length) {
    const e = document.createElement('div');
    e.className = 'empty';
    e.textContent = view === 'today'
      ? 'אין משימות להיום. סמן ★ על משימה כדי להביא אותה לכאן.'
      : 'אין משימות. כתוב משהו למעלה.';
    list.append(e);
  }
  shown.forEach(t => list.append(taskEl(t)));

  const doneShown = filterCat ? done.filter(t => t.cat === filterCat) : done;
  $('doneBox').hidden = !doneShown.length;
  $('doneCount').textContent = '(' + doneShown.length + ')';
  const dl = $('doneList');
  dl.innerHTML = '';
  doneShown.sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0))
    .forEach(t => dl.append(taskEl(t)));
}

function makeTask(text, cat, today, created = Date.now()) {
  return { id: uid(), text: text.trim(), cat, today: !!today, done: false, created, doneAt: null };
}

// ---------- הוספה ----------
$('addForm').addEventListener('submit', e => {
  e.preventDefault();
  const inp = $('addInput');
  if (!inp.value.trim()) return;
  store.putTask(makeTask(inp.value, newCat(), addToday));
  if (view === 'today' && !addToday) toast('נוספה. תמצא אותה תחת "הכול"');
  inp.value = '';
  setAddToday(false);
  inp.focus();
});

function setAddToday(on) {
  addToday = on;
  const b = $('todayToggle');
  b.textContent = on ? '★' : '☆';
  b.classList.toggle('on', on);
  b.setAttribute('aria-pressed', String(on));
}
$('todayToggle').onclick = () => { setAddToday(!addToday); $('addInput').focus(); };

document.querySelectorAll('.tab').forEach(b =>
  b.onclick = () => { view = b.dataset.view; render(); });

// ---------- תפריט ----------
const menu = $('menuDlg'), imp = $('importDlg');
$('menuBtn').onclick = () => menu.showModal();
document.querySelectorAll('dialog .close').forEach(b =>
  b.onclick = () => b.closest('dialog').close());
[menu, imp].forEach(d => d.addEventListener('click', e => {
  if (e.target === d) d.close();
}));

$('importBtn').onclick = () => { menu.close(); imp.showModal(); };

// ניקוי הודעת וואטסאפ: [12:34, 1/2/2025] שם: טקסט   או   1/2/25, 12:34 - שם: טקסט
const D = '\\d{1,2}[./]\\d{1,2}[./]\\d{2,4}';
const T = '\\d{1,2}:\\d{2}(?::\\d{2})?\\s?(?:AM|PM|am|pm)?';
const WA = new RegExp('^\\u200e?\\[?(?:' + D + ',?\\s+' + T + '|' + T + ',?\\s+' + D + ')\\]?\\s*(?:-\\s*)?[^:]{1,40}:\\s*');
$('importGo').onclick = () => {
  const lines = $('importText').value.split(/\r?\n/)
    .map(l => l.replace(WA, '').trim())
    .filter(l => l && !/^\u200e?(<מדיה|<Media)/.test(l));
  const cat = $('importCat').value;
  const now = Date.now();
  // השורה הראשונה בהדבקה תופיע ראשונה ברשימה
  store.putTasks(lines.map((l, i) => makeTask(l, cat, false, now - i)));
  $('importText').value = '';
  imp.close();
  toast('יובאו ' + lines.length + ' משימות');
};

$('exportBtn').onclick = () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'tasks-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  menu.close();
};

$('addCatBtn').onclick = () => {
  menu.close();
  const n = (prompt('שם הקטגוריה החדשה') || '').trim();
  if (n && !state.cats.includes(n)) store.saveCats([...state.cats, n]);
};

$('clearDoneBtn').onclick = () => {
  menu.close();
  const ids = state.tasks.filter(t => t.done).map(t => t.id);
  if (!ids.length) return toast('אין משימות שבוצעו');
  if (!confirm('למחוק ' + ids.length + ' משימות שבוצעו?')) return;
  store.removeTasks(ids);
};

$('signOutBtn').onclick = () => { menu.close(); store.signOut(); };

// ---------- התחברות ----------
const authErr = code => ({
  'auth/invalid-credential': 'אימייל או סיסמה שגויים',
  'auth/invalid-email': 'כתובת אימייל לא תקינה',
  'auth/email-already-in-use': 'כבר יש חשבון עם האימייל הזה. נסה "כניסה"',
  'auth/weak-password': 'הסיסמה חייבת להכיל לפחות 6 תווים',
  'auth/too-many-requests': 'יותר מדי ניסיונות. נסה שוב בעוד כמה דקות',
  'auth/network-request-failed': 'אין חיבור לאינטרנט',
  'auth/operation-not-allowed': 'כניסה באימייל לא הופעלה ב-Firebase',
  'auth/admin-restricted-operation': 'יצירת חשבונות חדשים סגורה'
}[code] || 'שגיאה: ' + code);

// שני מצבים: 'in' = כניסה, 'up' = יצירת חשבון
function setAuthMode(mode) {
  const f = $('authForm');
  f.dataset.mode = mode;
  const up = mode === 'up';
  $('authTitle').textContent = up ? 'יצירת חשבון' : 'כניסה';
  $('authSubmit').textContent = up ? 'יצירת חשבון' : 'כניסה';
  $('modeBtn').textContent = up ? 'כבר יש לך חשבון? כניסה' : 'פעם ראשונה? יצירת חשבון';
  // כדי שהאייפון יציע ליצור/לשמור סיסמה בהרשמה, ולמלא אותה אוטומטית בכניסה
  $('authPass').autocomplete = up ? 'new-password' : 'current-password';
  $('authPass2').required = up;
  $('authPass2').value = '';
  $('authMsg').textContent = '';
  $('authMsg').className = '';
  $('authEmail').focus();
}
$('modeBtn').onclick = () => setAuthMode($('authForm').dataset.mode === 'up' ? 'in' : 'up');

// הרשמות חסומות ב-Firebase (משתמש יחיד). כדי לפתוח: true כאן + "Enable create" ב-Firebase
const ALLOW_SIGNUP = false;
$('modeBtn').hidden = !ALLOW_SIGNUP;

function authNote(text, ok) {
  $('authMsg').textContent = text;
  $('authMsg').className = ok ? 'ok' : '';
}

$('authForm').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('authEmail').value.trim(), pw = $('authPass').value;
  const up = $('authForm').dataset.mode === 'up';
  if (up && pw !== $('authPass2').value) return authNote('הסיסמאות לא זהות');
  if (up && pw.length < 6) return authNote('הסיסמה חייבת להכיל לפחות 6 תווים');
  authNote('');
  $('authSubmit').disabled = true;
  try {
    if (up) {
      await store.signUp(email, pw);
      setAuthMode('in');
      $('authEmail').value = email;
      $('authPass').value = '';
      $('authPass').focus();
      authNote('החשבון נוצר בהצלחה. עכשיו היכנס עם הסיסמה שבחרת', true);
    } else {
      await store.signIn(email, pw);
    }
  } catch (err) {
    authNote(authErr(err.code));
  } finally {
    $('authSubmit').disabled = false;
  }
});

$('resetBtn').onclick = async () => {
  const email = $('authEmail').value.trim();
  if (!email) return authNote('כתוב את האימייל שלך קודם');
  try {
    await store.resetPassword(email);
    authNote('נשלח אליך מייל לאיפוס סיסמה', true);
  } catch (err) {
    authNote(authErr(err.code));
  }
};

// עין: הסיסמה גלויה רק כל עוד לוחצים עליה
document.querySelectorAll('.eye').forEach(b => {
  const inp = $(b.dataset.for);
  const show = e => { e.preventDefault(); inp.type = 'text'; b.classList.add('on'); };
  const hide = () => { inp.type = 'password'; b.classList.remove('on'); };
  b.addEventListener('pointerdown', show);
  ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach(ev => b.addEventListener(ev, hide));
  b.addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') show(e); });
  b.addEventListener('keyup', hide);
  b.addEventListener('contextmenu', e => e.preventDefault());
});

function showScreen(name) {
  $('loading').hidden = name !== 'loading';
  $('authScreen').hidden = name !== 'auth';
  $('appScreen').hidden = name !== 'app';
}

showScreen('loading');
startStore(
  data => { state = data; render(); },
  info => {
    $('signOutBtn').hidden = info.mode !== 'cloud';
    $('syncNote').textContent = info.mode === 'cloud'
      ? 'מסונכרן: ' + (info.user ? info.user.email : '')
      : 'נשמר במכשיר הזה בלבד';
    showScreen(info.mode === 'local' || info.user ? 'app' : 'auth');
  }
).then(s => { store = s; })
 .catch(() => {
   showScreen('auth');
   $('authMsg').textContent = 'לא הצלחתי להתחבר לשרת. בדוק את החיבור לאינטרנט ורענן.';
 });
