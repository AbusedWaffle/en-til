// Rangliste mod Firebase. Kun denne telefons players/{uid} skrives.
// Identitet til gemning er et kodeord (e-mail/adgangskode skjult for spilleren). Tomt kodeord: intet login, ingen skrivning.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp, collection, getDocs } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const mock = window.__FLIPX_MOCK || null;
const G = window.EnTil;
let db = null;
let auth = null;
let ticket = 0;
let legacyUid = '';

function rowOf(id, data) {
  const x = data || {};
  return { id: id, name: String(x.name || '').trim(), games: x.games | 0, wins: x.wins | 0 };
}

function readKode() {
  try {
    const v = localStorage.getItem('f7o-kodeord');
    if (v === null) return '';
    const p = JSON.parse(v);
    return G.normalizeKodeord(typeof p === 'string' ? p : '');
  } catch (e) { return ''; }
}

function writeKode(kode) {
  try {
    if (!kode) localStorage.removeItem('f7o-kodeord');
    else localStorage.setItem('f7o-kodeord', JSON.stringify(kode));
  } catch (e) {}
}

function kodeFailMessage(e) {
  const code = (e && e.code) || '';
  try { console.warn('FlipX kodeord:', code || 'fejl'); } catch (err) {}
  if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found' || code === 'auth/invalid-login-credentials') {
    return 'Kodeordet blev ikke godkendt. Tallene gemmes ikke denne gang.';
  }
  return 'Kodeord kan ikke bruges lige nu, så tallene gemmes ikke. Du kan stadig spille.';
}

function noteFail(e) {
  const msg = kodeFailMessage(e);
  if (window.onFlipKodeFail) window.onFlipKodeFail(msg);
  else window.__flipKodeFail = msg;
}

// Reglerne tillader kun at games/wins stiger med højst 1 pr. skrivning, også ved oprettelse.
// Et hop fra en gammel anonym række kan derfor ikke skrives. Vi kopierer ikke og sletter ikke den gamle række.
async function maybeCopyLegacy() {
  // legacyUid er den gamle anonyme række, hvis telefonen havde en. Den bliver stående.
  if (!legacyUid || legacyUid === window.flipUid) return false;
  return false;
}

async function signWithKode(kode) {
  const my = ticket;
  const email = await G.kodeordEmail(kode);
  if (my !== ticket) return '';
  if (auth.currentUser && !auth.currentUser.isAnonymous && auth.currentUser.email === email) {
    window.flipUid = auth.currentUser.uid;
    try { localStorage.setItem('f7o-uid', JSON.stringify(window.flipUid)); } catch (e) {}
    return window.flipUid;
  }
  if (auth.currentUser) {
    try { await signOut(auth); } catch (e) {}
  }
  if (my !== ticket) return '';
  let cred;
  let created = false;
  try {
    cred = await createUserWithEmailAndPassword(auth, email, kode);
    created = true;
  } catch (e) {
    if (!e || e.code !== 'auth/email-already-in-use') throw e;
    if (my !== ticket) return '';
    cred = await signInWithEmailAndPassword(auth, email, kode);
  }
  if (my !== ticket) return '';
  window.flipUid = cred.user.uid;
  try { localStorage.setItem('f7o-uid', JSON.stringify(window.flipUid)); } catch (e) {}
  if (created) {
    try { await maybeCopyLegacy(); } catch (e) {}
  }
  return window.flipUid;
}

const ready = (async () => {
  if (mock) {
    const uid = mock.uid == null ? 'mock-uid' : String(mock.uid);
    window.flipUid = uid;
    if (uid) { try { localStorage.setItem('f7o-uid', JSON.stringify(uid)); } catch (e) {} }
    return uid;
  }
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);
  try { await setPersistence(auth, browserLocalPersistence); } catch (e) {}
  try {
    if (auth.currentUser && auth.currentUser.isAnonymous) {
      legacyUid = auth.currentUser.uid;
      try { localStorage.setItem('f7o-legacy-uid', JSON.stringify(legacyUid)); } catch (e) {}
      await signOut(auth);
    } else {
      try {
        const saved = localStorage.getItem('f7o-legacy-uid');
        if (saved) legacyUid = JSON.parse(saved) || '';
      } catch (e) {}
    }
  } catch (e) {}
  const my = ticket;
  const kode = readKode();
  if (!kode) {
    window.flipUid = '';
    return '';
  }
  try {
    const uid = await signWithKode(kode);
    if (my !== ticket) return window.flipUid || '';
    return uid || '';
  } catch (e) {
    if (my === ticket) window.flipUid = '';
    noteFail(e);
    return '';
  }
})();

async function applyKodeord(raw) {
  const problem = G.kodeordProblem(raw);
  if (problem) return { ok: false, short: true, msg: problem };
  const kode = G.normalizeKodeord(raw);
  if (mock) {
    if (!kode) {
      window.flipUid = '';
      try { localStorage.removeItem('f7o-uid'); } catch (e) {}
      writeKode('');
      return { ok: true, saved: false };
    }
    writeKode(kode);
    const uid = mock.uid == null ? 'mock-uid' : String(mock.uid);
    window.flipUid = uid;
    if (uid) {
      try { localStorage.setItem('f7o-uid', JSON.stringify(uid)); } catch (e) {}
      if (window.onFlipUid) window.onFlipUid(uid);
    }
    return { ok: true, saved: !!uid };
  }
  const my = ++ticket;
  if (!kode) {
    writeKode('');
    window.flipUid = '';
    try { await ready; } catch (e) {}
    if (my !== ticket) return { ok: true, saved: false };
    if (auth && auth.currentUser) { try { await signOut(auth); } catch (e) {} }
    window.flipUid = '';
    try { localStorage.removeItem('f7o-uid'); } catch (e) {}
    return { ok: true, saved: false };
  }
  writeKode(kode);
  try { await ready; } catch (e) {}
  if (my !== ticket) return { ok: true, saved: false };
  if (!auth) return { ok: true, saved: false, msg: 'Kodeord kan ikke bruges lige nu, så tallene gemmes ikke. Du kan stadig spille.' };
  try {
    const uid = await signWithKode(kode);
    if (my !== ticket) return { ok: true, saved: false };
    if (uid && window.onFlipUid) window.onFlipUid(uid);
    return uid ? { ok: true, saved: true } : { ok: true, saved: false, msg: 'Kodeord kan ikke bruges lige nu, så tallene gemmes ikke. Du kan stadig spille.' };
  } catch (e) {
    if (my === ticket) window.flipUid = '';
    return { ok: true, saved: false, msg: kodeFailMessage(e) };
  }
}

async function loadBoard() {
  await ready;
  if (mock) return (mock.players || []).map(p => rowOf(p.id, p));
  if (!db) throw new Error('ingen database');
  const snap = await getDocs(collection(db, 'players'));
  const rows = [];
  snap.forEach(d => rows.push(rowOf(d.id, d.data())));
  return rows;
}

async function loadPlayers(uids) {
  await ready;
  const out = {};
  const list = (uids || []).filter(Boolean);
  if (mock) {
    list.forEach(u => {
      const p = (mock.players || []).find(x => x.id === u);
      if (p) out[u] = { name: p.name, games: p.games | 0, wins: p.wins | 0 };
    });
    return out;
  }
  if (!db) throw new Error('ingen database');
  await Promise.all(list.map(async u => {
    const snap = await getDoc(doc(db, 'players', u));
    if (snap.exists()) {
      const r = rowOf(u, snap.data());
      out[u] = { name: r.name, games: r.games, wins: r.wins };
    }
  }));
  return out;
}

async function record(uid, name, won) {
  await ready;
  if (!uid || uid !== window.flipUid) throw new Error('kan kun skrive egen række');
  if (!mock && (!auth || !auth.currentUser || auth.currentUser.uid !== uid)) throw new Error('kan kun skrive egen række');
  const prev = mock
    ? ((mock.players || []).find(p => p.id === uid) || { games: 0, wins: 0, name: '' })
    : await (async () => {
      const snap = await getDoc(doc(db, 'players', uid));
      return snap.exists() ? snap.data() : { games: 0, wins: 0, name: '' };
    })();
  const next = window.EnTil.nextCareer(prev, !!won, name);
  if (!next.name) throw new Error('tomt navn');
  if (mock) {
    mock.writes = mock.writes || [];
    mock.writes.push({ uid: uid, name: next.name, games: next.games, wins: next.wins, won: !!won });
    let row = (mock.players || []).find(p => p.id === uid);
    if (!row) { row = { id: uid }; mock.players.push(row); }
    row.name = next.name; row.games = next.games; row.wins = next.wins;
    return { name: next.name, games: next.games, wins: next.wins };
  }
  await setDoc(doc(db, 'players', uid), {
    name: next.name,
    games: next.games,
    wins: next.wins,
    updatedAt: serverTimestamp()
  });
  return { name: next.name, games: next.games, wins: next.wins };
}

window.FlipLive = { ready: ready, loadBoard: loadBoard, loadPlayers: loadPlayers, record: record, applyKodeord: applyKodeord };
ready.then(uid => {
  if (uid) { if (window.onFlipUid) window.onFlipUid(uid); }
  else if (window.onFlipNoProfile) window.onFlipNoProfile();
}).catch(e => {
  try { console.warn('FlipX rangliste:', e && e.code ? e.code : 'init'); } catch (err) {}
  if (window.onFlipBoardFail) window.onFlipBoardFail();
});
