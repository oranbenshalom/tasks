// שכבת אחסון אחת לכל האפליקציה.
// אם יש פרטי Firebase: התחברות + Firestore (עם מטמון מקומי לעבודה בלי אינטרנט).
// אם אין: שמירה ב-localStorage במכשיר בלבד.
import { firebaseConfig } from './firebase-config.js';

const LOCAL_KEY = 'todo-app-v1';
const DEFAULT_CATS = ['קניות', 'בית', 'אנשים', 'לחקור', 'תיקונים', 'כללי'];
const FB = 'https://www.gstatic.com/firebasejs/11.0.2/';

function loadLocal() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {}
  return { tasks: [], cats: DEFAULT_CATS.slice() };
}

function saveLocal(s) {
  try { localStorage.setItem(LOCAL_KEY, JSON.stringify(s)); } catch (e) {}
}

// ---------- מצב מקומי ----------
function localStore(onData, onAuth) {
  const s = loadLocal();
  const emit = () => { saveLocal(s); onData({ tasks: s.tasks.slice(), cats: s.cats.slice() }); };
  onAuth({ mode: 'local' });
  emit();
  return {
    mode: 'local',
    putTask(t) {
      const i = s.tasks.findIndex(x => x.id === t.id);
      if (i >= 0) s.tasks[i] = { ...t }; else s.tasks.push({ ...t });
      emit();
    },
    putTasks(list) { list.forEach(t => this.putTask(t)); },
    removeTasks(ids) { s.tasks = s.tasks.filter(t => !ids.includes(t.id)); emit(); },
    saveCats(cats) { s.cats = cats.slice(); emit(); }
  };
}

// ---------- מצב ענן (Firebase) ----------
async function cloudStore(onData, onAuth) {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(FB + 'firebase-app.js'),
    import(FB + 'firebase-auth.js'),
    import(FB + 'firebase-firestore.js')
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  const db = F.initializeFirestore(app, {
    localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() })
  });

  let uid = null, unsubTasks = null, unsubUser = null;
  let signingUp = false;   // בזמן הרשמה Firebase מחבר אוטומטית. מתעלמים מזה ומנתקים
  let tasks = [], cats = DEFAULT_CATS.slice();
  const emit = () => onData({ tasks: tasks.slice(), cats: cats.slice() });
  const taskRef = id => F.doc(db, 'users', uid, 'tasks', id);

  // העברה חד-פעמית של משימות ששמרת במכשיר לפני החיבור לענן
  async function migrateLocal() {
    const local = loadLocal();
    if (!local.tasks.length) return;
    const b = F.writeBatch(db);
    local.tasks.forEach(t => b.set(taskRef(t.id), t));
    b.set(F.doc(db, 'users', uid), { cats: local.cats }, { merge: true });
    await b.commit();
    try {
      localStorage.setItem(LOCAL_KEY + '-migrated', JSON.stringify(local));
      localStorage.removeItem(LOCAL_KEY);
    } catch (e) {}
  }

  A.onAuthStateChanged(auth, async user => {
    if (signingUp && user) return;
    if (unsubTasks) unsubTasks();
    if (unsubUser) unsubUser();
    unsubTasks = unsubUser = null;
    tasks = []; cats = DEFAULT_CATS.slice();
    uid = user ? user.uid : null;
    onAuth({ mode: 'cloud', user });
    if (!user) return;

    await migrateLocal().catch(() => {});
    unsubUser = F.onSnapshot(F.doc(db, 'users', uid), snap => {
      const d = snap.data();
      if (d && Array.isArray(d.cats) && d.cats.length) cats = d.cats;
      emit();
    });
    unsubTasks = F.onSnapshot(F.collection(db, 'users', uid, 'tasks'), snap => {
      tasks = snap.docs.map(d => d.data());
      emit();
    });
  });

  return {
    mode: 'cloud',
    putTask(t) { F.setDoc(taskRef(t.id), t); },
    putTasks(list) {
      const b = F.writeBatch(db);
      list.forEach(t => b.set(taskRef(t.id), t));
      b.commit();
    },
    removeTasks(ids) {
      const b = F.writeBatch(db);
      ids.forEach(id => b.delete(taskRef(id)));
      b.commit();
    },
    saveCats(c) { F.setDoc(F.doc(db, 'users', uid), { cats: c }, { merge: true }); },
    signIn: (e, p) => A.signInWithEmailAndPassword(auth, e, p),
    // יוצר חשבון ומנתק מיד, כדי שהכניסה תהיה תמיד דרך מסך הכניסה
    async signUp(e, p) {
      signingUp = true;
      try {
        await A.createUserWithEmailAndPassword(auth, e, p);
        await A.signOut(auth);
      } finally {
        signingUp = false;
      }
    },
    resetPassword: e => A.sendPasswordResetEmail(auth, e),
    signOut: () => A.signOut(auth)
  };
}

export function startStore(onData, onAuth) {
  return firebaseConfig ? cloudStore(onData, onAuth) : Promise.resolve(localStore(onData, onAuth));
}
