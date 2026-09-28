/* Én til? – ren spillogik (ingen DOM, ingen netværk). Bruges af index.html (vært) og af tests i Node. */
(function (root) {
  'use strict';
  var MAX_LOG = 40, MAX_EV = 60;

  function buildDeck() {
    var d = ['n0'];
    for (var v = 1; v <= 12; v++) for (var i = 0; i < v; i++) d.push('n' + v);
    d.push('m2', 'm4', 'm6', 'm8', 'm10', 'x2');
    for (var k = 0; k < 3; k++) d.push('fr', 'f3', 'sc');
    return d;
  }
  function shuffle(a, rng) {
    rng = rng || Math.random;
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(rng() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  function isNum(c) { return c[0] === 'n'; }
  function numVal(c) { return parseInt(c.slice(1), 10); }
  function label(c) {
    if (isNum(c)) return c.slice(1);
    if (c[0] === 'm') return '+' + c.slice(1);
    return { x2: '×2', fr: 'Frys', f3: 'Træk 3', sc: '2. chance' }[c] || c;
  }
  function roundScore(p) {
    if (p.status === 'bust') return 0;
    var s = 0, i;
    for (i = 0; i < p.nums.length; i++) s += p.nums[i];
    if (p.mods.indexOf('x2') >= 0) s *= 2;
    for (i = 0; i < p.mods.length; i++) if (p.mods[i][0] === 'm') s += parseInt(p.mods[i].slice(1), 10);
    if (p.seven) s += 15;
    return s;
  }
  function roundScoreRaw(p) { return roundScore({ status: 'active', nums: p.nums, mods: p.mods, seven: false }); }
  function tableCards(p) {
    var c = p.nums.map(function (v) { return 'n' + v; }).concat(p.mods, p.acts);
    if (p.bustCard !== null && p.bustCard !== undefined) c.push('n' + p.bustCard);
    return c;
  }
  function log(S, txt, kind) {
    S.seq = (S.seq || 0) + 1;
    S.log.push({ n: S.seq, txt: txt, kind: kind || '' });
    if (S.log.length > MAX_LOG) S.log.splice(0, S.log.length - MAX_LOG);
  }
  // Hændelseslog til animationer: {id, type, p (spiller), t (mål), card, ...}. id stiger altid (evSeq), så klienter kan
  // afspille hver hændelse præcis én gang.
  function ev(S, type, data) {
    if (!S.events) S.events = [];
    S.evSeq = (S.evSeq || 0) + 1;
    var e = { id: S.evSeq, type: type }, k;
    for (k in data) if (data[k] !== undefined) e[k] = data[k];
    S.events.push(e);
    if (S.events.length > MAX_EV) S.events.splice(0, S.events.length - MAX_EV);
    return e;
  }
  function nm(S, i) { return S.players[i].name; }
  function isActive(S, i) { return S.players[i].status === 'active'; }
  function activeIdx(S) { var r = []; for (var i = 0; i < S.players.length; i++) if (isActive(S, i)) r.push(i); return r; }

  function createLobby(target) {
    return { v: 1, phase: 'lobby', target: target || 200, players: [], log: [], seq: 0, events: [], evSeq: 0 };
  }
  function addPlayer(S, id, name) {
    var p = { id: id, name: name, online: true, total: 0 };
    S.players.push(p); return p;
  }
  function resetPlayerRound(p) {
    p.nums = []; p.mods = []; p.acts = []; p.status = 'active'; p.sc = false; p.seven = false; p.bustCard = null; p.roundPts = 0;
  }
  function startGame(S, rng) {
    if (S.players.length < 2) return { ok: false, err: 'Mindst 2 spillere' };
    S.phase = 'play'; S.round = 0; S.dealer = -1; S.history = []; S.winners = []; S.tie = false;
    S.deck = shuffle(buildDeck(), rng); S.discard = [];
    S.players.forEach(function (p) { p.total = 0; resetPlayerRound(p); });
    log(S, 'Spillet starter! Mål: ' + S.target + ' point', 'info');
    startRound(S, rng);
    return { ok: true };
  }
  function startRound(S, rng) {
    var n = S.players.length;
    S.players.forEach(function (p) {
      if (p.nums) S.discard.push.apply(S.discard, tableCards(p));
      resetPlayerRound(p);
    });
    S.round++; S.dealer = (S.dealer + 1) % n; S.phase = 'play'; S.stage = 'deal'; S.turn = -1; S.pending = null; S.sevenEnd = false; S.tie = false;
    S.queue = [];
    for (var k = 1; k <= n; k++) S.queue.push({ t: 'deal', i: (S.dealer + k) % n });
    log(S, 'Runde ' + S.round + ' – ' + nm(S, S.dealer) + ' giver', 'info');
    ev(S, 'round', { round: S.round, p: S.dealer });
    process(S, rng);
  }
  function drawCard(S, rng) {
    if (!S.deck.length) {
      if (!S.discard.length) return null;
      S.deck = shuffle(S.discard, rng); S.discard = [];
      log(S, 'Bunken er tom – kastebunken blandes', 'info');
    }
    return S.deck.pop();
  }
  // Giv et kort til spiller i. frame = aktiv Træk 3 (eller null).
  function give(S, i, card, frame, verb) {
    var p = S.players[i], f3 = frame ? 1 : undefined, deal = verb === 'fik' ? 1 : undefined;
    if (isNum(card)) {
      var v = numVal(card);
      if (p.nums.indexOf(v) >= 0) {
        if (p.sc) {
          p.sc = false; p.acts.splice(p.acts.indexOf('sc'), 1);
          S.discard.push('sc', card);
          log(S, nm(S, i) + ' ' + verb + ' ' + v + ' igen – reddet af 2. chance!', 'save');
          ev(S, 'save', { p: i, card: card, f3: f3 });
        } else {
          p.status = 'bust'; p.bustCard = v;
          log(S, nm(S, i) + ' ' + verb + ' ' + v + ' igen og gik bust!', 'bust');
          ev(S, 'bust', { p: i, card: card, f3: f3, lost: roundScoreRaw(p) });
        }
      } else {
        p.nums.push(v);
        log(S, nm(S, i) + ' ' + verb + ' ' + v, '');
        ev(S, 'card', { p: i, card: card, f3: f3, deal: deal });
        if (p.nums.length >= 7) { p.seven = true; S.sevenEnd = true; log(S, nm(S, i) + ' fik 7 forskellige! +15', 'seven'); ev(S, 'seven', { p: i, pts: roundScore(p) }); }
      }
      return;
    }
    log(S, nm(S, i) + ' ' + verb + ' ' + label(card), card === 'fr' || card === 'f3' || card === 'sc' ? 'action' : '');
    ev(S, 'card', { p: i, card: card, f3: f3, deal: deal });
    if (card[0] === 'm' || card === 'x2') { p.mods.push(card); return; }
    if (card === 'sc') {
      if (!p.sc) { p.sc = true; p.acts.push('sc'); ev(S, 'sc', { p: i, t: i }); }
      else S.queue.unshift({ t: 'assign', card: 'sc', from: i });
      return;
    }
    if (frame) { frame.aside.push(card); log(S, label(card) + ' lægges til side til efter Træk 3', 'info'); return; }
    S.queue.unshift({ t: 'assign', card: card, from: i });
  }
  function candidates(S, card, from) {
    if (card === 'sc') return activeIdx(S).filter(function (i) { return i !== from && !S.players[i].sc; });
    return activeIdx(S);
  }
  function resolveAssign(S, card, from, target) {
    var tp = S.players[target], self = from === target;
    if (card === 'fr') {
      tp.status = 'frozen'; tp.acts.push('fr');
      log(S, self ? nm(S, from) + ' frøs sig selv (' + roundScore(tp) + ' point)' : nm(S, from) + ' frøs ' + tp.name + ' (' + roundScore(tp) + ' point)', 'action');
      ev(S, 'freeze', { p: from, t: target, pts: roundScore(tp) });
    } else if (card === 'f3') {
      tp.acts.push('f3');
      log(S, self ? nm(S, from) + ' tager selv Træk 3' : nm(S, from) + ' giver Træk 3 til ' + tp.name, 'action');
      ev(S, 'take3', { p: from, t: target });
      S.queue.unshift({ t: 'take3', target: target, left: 3, aside: [] });
    } else if (card === 'sc') {
      tp.sc = true; tp.acts.push('sc');
      log(S, nm(S, from) + ' giver 2. chance til ' + tp.name, 'action');
      ev(S, 'sc', { p: from, t: target });
    }
  }
  function nextTurn(S, from) {
    var n = S.players.length;
    for (var k = 1; k <= n; k++) { var i = (from + k + n) % n; if (isActive(S, i)) { S.turn = i; return true; } }
    S.turn = -1; return false;
  }
  function process(S, rng) {
    var guard = 0;
    while (S.phase === 'play' && !S.pending) {
      if (++guard > 10000) throw new Error('process loop');
      if (S.sevenEnd) return endRound(S);
      if (!S.queue.length) {
        var base = S.stage === 'deal' ? S.dealer : S.turn;
        S.stage = 'turns';
        if (!nextTurn(S, base)) return endRound(S);
        return;
      }
      var task = S.queue[0], card;
      if (task.t === 'deal' || task.t === 'draw') {
        S.queue.shift();
        if (!isActive(S, task.i)) continue;
        card = drawCard(S, rng);
        if (card === null) { log(S, 'Ikke flere kort!', 'info'); S.queue = []; return endRound(S); }
        give(S, task.i, card, null, task.t === 'deal' ? 'fik' : 'trak');
      } else if (task.t === 'assign') {
        S.queue.shift();
        var c = candidates(S, task.card, task.from);
        if (!c.length) { S.discard.push(task.card); log(S, label(task.card) + ' kasseres (ingen kan modtage den)', 'info'); }
        else if (c.length === 1) resolveAssign(S, task.card, task.from, c[0]);
        else S.pending = { card: task.card, chooser: task.from, options: c };
      } else if (task.t === 'take3') {
        if (!isActive(S, task.target)) { S.queue.shift(); S.discard.push.apply(S.discard, task.aside); continue; }
        if (task.left <= 0) {
          S.queue.shift();
          var extra = task.aside.map(function (cd) { return { t: 'assign', card: cd, from: task.target }; });
          S.queue.unshift.apply(S.queue, extra);
          continue;
        }
        task.left--;
        card = drawCard(S, rng);
        if (card === null) { log(S, 'Ikke flere kort!', 'info'); S.queue = []; return endRound(S); }
        give(S, task.target, card, task, 'trak');
      } else S.queue.shift();
    }
  }
  function endRound(S) {
    (S.queue || []).forEach(function (t) { if (t.t === 'take3') S.discard.push.apply(S.discard, t.aside); if (t.t === 'assign') S.discard.push(t.card); });
    if (S.pending) { S.discard.push(S.pending.card); S.pending = null; }
    S.queue = []; S.turn = -1; S.sevenEnd = false;
    var pts = S.players.map(function (p) { p.roundPts = roundScore(p); p.total += p.roundPts; return p.roundPts; });
    S.history.push(pts);
    log(S, 'Runde ' + S.round + ' er slut', 'info');
    ev(S, 'roundEnd', { round: S.round, pts: pts });
    var max = Math.max.apply(null, S.players.map(function (p) { return p.total; }));
    if (max >= S.target) {
      var lead = []; S.players.forEach(function (p, i) { if (p.total === max) lead.push(i); });
      if (lead.length === 1) { S.phase = 'over'; S.winners = lead; log(S, S.players[lead[0]].name + ' vinder med ' + max + ' point!', 'seven'); ev(S, 'win', { p: lead[0], pts: max }); return; }
      S.tie = true; log(S, 'Uafgjort på ' + max + ' point – der spilles en runde mere', 'info');
    }
    S.phase = 'roundEnd';
  }
  function canStop(p) { return p.status === 'active' && (p.nums.length + p.mods.length + p.acts.length) > 0; }
  // Spillerhandling. Returnerer {ok, err}
  function act(S, pid, a, rng) {
    var i = -1; S.players.forEach(function (p, k) { if (p.id === pid) i = k; });
    if (i < 0) return { ok: false, err: 'Ukendt spiller' };
    if (a.a === 'draw' || a.a === 'stop') {
      if (S.phase !== 'play' || S.stage !== 'turns' || S.pending || S.turn !== i || !isActive(S, i)) return { ok: false, err: 'Ikke din tur' };
      if (a.a === 'draw') S.queue.push({ t: 'draw', i: i });
      else {
        if (!canStop(S.players[i])) return { ok: false, err: 'Du har ingen kort endnu' };
        S.players[i].status = 'stopped';
        log(S, nm(S, i) + ' stopper med ' + roundScore(S.players[i]) + ' point', 'stop');
        ev(S, 'stop', { p: i, pts: roundScore(S.players[i]) });
      }
      process(S, rng); return { ok: true };
    }
    if (a.a === 'choose') {
      var P = S.pending;
      if (S.phase !== 'play' || !P || P.chooser !== i || P.options.indexOf(a.target) < 0) return { ok: false, err: 'Ugyldigt valg' };
      S.pending = null; resolveAssign(S, P.card, P.chooser, a.target); process(S, rng); return { ok: true };
    }
    return { ok: false, err: 'Ukendt handling' };
  }
  function nextRound(S, rng) { if (S.phase !== 'roundEnd') return { ok: false }; startRound(S, rng); return { ok: true }; }
  function backToLobby(S) {
    S.phase = 'lobby'; S.players.forEach(function (p) { p.total = 0; delete p.nums; });
    ['deck', 'discard', 'queue', 'pending', 'history', 'winners', 'turn', 'stage', 'round', 'dealer'].forEach(function (k) { delete S[k]; });
    log(S, 'Nyt spil – venter i lobbyen', 'info');
  }
  function countCards(S) {
    var n = (S.deck || []).length + (S.discard || []).length;
    S.players.forEach(function (p) { if (p.nums) n += tableCards(p).length; });
    (S.queue || []).forEach(function (t) { if (t.t === 'take3') n += t.aside.length; if (t.t === 'assign') n++; });
    if (S.pending) n++;
    return n;
  }
  // Offentlig visning til klienter: skjul bunkens rækkefølge
  function publicView(S) {
    var v = JSON.parse(JSON.stringify(S));
    v.deckCount = (S.deck || []).length; v.discardCount = (S.discard || []).length;
    delete v.deck; delete v.discard;
    return v;
  }

  var api = { buildDeck: buildDeck, shuffle: shuffle, label: label, roundScore: roundScore, tableCards: tableCards, createLobby: createLobby,
    addPlayer: addPlayer, startGame: startGame, startRound: startRound, nextRound: nextRound, act: act, process: process, endRound: endRound,
    canStop: canStop, activeIdx: activeIdx, backToLobby: backToLobby, countCards: countCards, publicView: publicView, drawCard: drawCard };
  api.eventsSince = function (S, id) { return (S.events || []).filter(function (e) { return e.id > id; }); };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.EnTil = api;
})(this);
