// Rangliste mod Firebase. Kun denne telefons players/{uid} skrives.
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, signInAnonymously, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, doc, getDoc, setDoc, serverTimestamp, collection, getDocs } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';

const mock = window.__FLIPX_MOCK || null;
let db = null;

function rowOf(id, data) {
  const x = data || {};
  return { id: id, name: String(x.name || '').trim(), games: x.games | 0, wins: x.wins | 0 };
}

const ready = (async () => {
  if (mock) {
    const uid = String(mock.uid || 'mock-uid');
    window.flipUid = uid;
    try { localStorage.setItem('f7o-uid', JSON.stringify(uid)); } catch (e) {}
    return uid;
  }
  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  db = getFirestore(app);
  await setPersistence(auth, browserLocalPersistence);
  if (!auth.currentUser) await signInAnonymously(auth);
  const uid = auth.currentUser.uid;
  window.flipUid = uid;
  try { localStorage.setItem('f7o-uid', JSON.stringify(uid)); } catch (e) {}
  return uid;
})();

async function loadBoard() {
  await ready;
  if (mock) return (mock.players || []).map(p => rowOf(p.id, p));
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
  if (uid !== window.flipUid) throw new Error('kan kun skrive egen række');
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

window.FlipLive = { ready: ready, loadBoard: loadBoard, loadPlayers: loadPlayers, record: record };
ready.then(uid => { if (window.onFlipUid) window.onFlipUid(uid); })
  .catch(e => { console.warn('FlipX rangliste:', e && e.message ? e.message : e); if (window.onFlipBoardFail) window.onFlipBoardFail(); });
