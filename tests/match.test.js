'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const E = require('../web/engine.js');
const M = require('../web/match.js');

function play(start, moves) {
  return moves.reduce((game, move) => M.push(game, move), start);
}

test('Full match starts with 32 pieces, 20 moves, White to play; a move preserves prior snapshots', () => {
  const start = M.create();
  assert.equal(start.state.board.filter(Boolean).length, 32);
  assert.equal(E.legal(start.state).length, 20);
  assert.equal(start.result, null);
  assert.equal(M.ai(start), null);
  assert.throws(() => M.push(start, 'e2e5'));
  const next = M.push(start, 'e2e4');
  assert.equal(start.history.length, 0);
  assert.equal(start.counts.size, 1);
  assert.equal(next.state.turn, 'b');
  assert.equal(next.history[0].before, E.START_FEN);
  assert.equal(next.history[0].after, E.fen(next.state));
  assert.equal(next.history[0].number, 1);
  const reply = M.ai(next, 2);
  assert.ok(E.legal(next.state).map(E.uci).includes(reply));
  assert.throws(() => M.ai(next, 0));
});

test('Actual live demo: the bishop is lost; review shows the legal 340-cp improvement', () => {
  let game = M.push(M.create(), 'e2e4');
  assert.equal(M.ai(game), 'b8c6');
  game = play(game, ['b8c6', 'f1a6']);
  assert.equal(M.ai(game), 'b7a6');
  game = M.resign(M.push(game, 'b7a6'));
  assert.deepEqual(game.result, {reason:'resign', winner:'b'});
  const quiet = M.analyze(game.history[0]);
  assert.deepEqual([quiet.severity, quiet.loss], ['good', 1]);
  const review = M.analyze(game.history[2]);
  assert.deepEqual([review.played, review.best, review.reply], ['f1a6','b1c3','b7a6']);
  assert.deepEqual([review.depth, review.loss, review.bestScore, review.playedScore], [2,340,-1,-341]);
  assert.equal(review.severity, 'blunder');
  assert.equal(review.mateSwing, false);
  assert.match(review.detail, /пілді/);
  assert.equal(E.fen(E.apply(E.parse(review.before), review.best)), review.bestAfter);
  assert.equal(E.fen(E.apply(E.parse(review.before), review.played)), review.after);
  assert.equal(E.fen(E.apply(E.parse(review.after), review.reply)), E.fen(game.state));
});

test('Fool’s mate ends play and the review identifies a mate that could have been avoided', () => {
  const game = play(M.create(), ['f2f3','e7e5','g2g4','d8h4']);
  assert.deepEqual(game.result, {reason:'checkmate', winner:'b'});
  assert.equal(M.ai(game), null);
  assert.throws(() => M.push(game, 'e2e4'));
  assert.throws(() => M.resign(game));
  const record = M.analyze(game.history[2]);
  assert.equal(record.mateSwing, true);
  assert.equal(record.reply, 'd8h4');
  assert.equal(record.severity, 'blunder');
  assert.match(record.detail, /мат/);
});

test('White can win by checkmate, which takes priority over the quiet-move limit', () => {
  const initial = M.create('6k1/5ppp/8/8/8/8/8/4R1K1 w - - 99 1');
  const final = M.push(initial, 'e1e8');
  assert.deepEqual(final.result, {reason:'checkmate', winner:'w'});
  const record = M.analyze(final.history[0]);
  assert.equal(record.loss, 0);
  assert.equal(record.best, 'e1e8');
  assert.equal(record.reply, null);
});

test('The third occurrence draws automatically; clocks and uncapturable EP do not distinguish positions', () => {
  const shuffle = ['g1f3','g8f6','f3g1','f6g8'];
  const once = play(M.create(), shuffle);
  assert.equal(once.result, null);
  const twice = play(once, shuffle);
  assert.deepEqual(twice.result, {reason:'repetition', winner:null});
  const ep = E.fen(E.apply(E.parse(E.START_FEN), 'e2e4'));
  assert.equal(M.positionKey(E.parse(ep)), M.positionKey(E.parse(ep.replace(' e3 ', ' - '))));
});

test('Repetition keys distinguish legal en passant and castling, but ignore pinned en passant', () => {
  const ep = '6k1/8/8/3pP3/8/8/8/4K3 w - d6 0 9';
  const pinned = '4r1k1/8/8/3pP3/8/8/8/4K3 w - d6 0 9';
  const castle = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
  assert.notEqual(M.positionKey(E.parse(ep)), M.positionKey(E.parse(ep.replace(' d6 ', ' - '))));
  assert.equal(M.positionKey(E.parse(pinned)), M.positionKey(E.parse(pinned.replace(' d6 ', ' - '))));
  assert.notEqual(M.positionKey(E.parse(castle)), M.positionKey(E.parse(castle.replace(' KQkq ', ' - '))));
});

test('Hundred quiet halfmoves draw; a pawn move resets the clock', () => {
  const initial = M.create('7k/8/8/8/8/8/P7/1R4K1 w - - 99 50');
  assert.deepEqual(M.push(initial, 'b1b2').result, {reason:'fifty', winner:null});
  const pawnMove = M.push(initial, 'a2a3');
  assert.equal(pawnMove.result, null);
  assert.equal(pawnMove.state.half, 0);
});

test('Basic dead-material draws are separated from stalemate and still playable material', () => {
  for (const fen of ['7k/8/8/8/8/8/8/6K1 w - - 0 1','7k/8/8/8/8/8/N7/6K1 w - - 0 1',
    '7k/8/8/8/8/8/B7/6K1 w - - 0 1', '5k2/2b5/8/8/8/8/8/B5K1 w - - 0 1']) {
    assert.deepEqual(M.create(fen).result, {reason:'material', winner:null});
  }
  for (const fen of ['7k/8/8/8/8/8/N7/N5K1 w - - 0 1','7k/8/8/8/8/8/B7/N5K1 w - - 0 1',
    '5k2/8/8/8/8/8/8/BB4K1 w - - 0 1']) assert.equal(M.create(fen).result, null);
  assert.deepEqual(M.create('7k/5K2/6Q1/8/8/8/8/8 b - - 0 1').result, {reason:'stalemate',winner:null});
});

test('Underpromotion, en passant and castling change real game boards and history', () => {
  const promo = M.create('k7/6P1/8/8/8/8/8/2K5 w - - 0 1');
  assert.throws(() => M.push(promo, 'g7g8'));
  for (const p of ['q','r','b','n']) {
    const next = M.push(promo, 'g7g8'+p);
    assert.equal(E.pieceAt(next.state, 'g8'), p.toUpperCase());
    assert.equal(next.history[0].move, 'g7g8'+p);
  }
  const ep = play(M.create(), ['e2e4','a7a6','e4e5','d7d5','e5d6']);
  assert.equal(E.pieceAt(ep.state, 'd5'), null);
  assert.equal(E.pieceAt(ep.state, 'd6'), 'P');
  const castle = play(M.create(), ['e2e4','e7e5','g1f3','b8c6','f1c4','g8f6','e1g1']);
  assert.equal(E.pieceAt(castle.state, 'f1'), 'R');
  assert.equal(E.pieceAt(castle.state, 'g1'), 'K');
});

test('Equal mates are not penalized; resignation adds no fictitious move; replay restores positions', () => {
  const position = M.create('7k/5Q2/6K1/8/8/8/P7/8 w - - 0 1');
  for (const move of E.legal(position.state)) {
    const game = M.push(position, move);
    if (game.result?.reason !== 'checkmate') continue;
    const review = M.analyze(game.history[0]);
    assert.equal(review.best, review.played);
    assert.equal(review.loss, 0);
    assert.equal(review.severity, 'good');
  }
  const moves = ['g1f3','g8f6','f3g1','f6g8'];
  const game = play(M.create(), moves);
  const restored = play(M.create(), JSON.parse(JSON.stringify(game.history.map(h=>h.move))));
  assert.equal(E.fen(restored.state), E.fen(game.state));
  const done = M.resign(restored);
  assert.equal(done.history.length, moves.length);
  assert.equal(game.result, null);
  assert.throws(() => M.analyze(done.history[1]));
});
