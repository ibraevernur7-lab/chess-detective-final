'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'),
  path = require('node:path'),
  vm = require('node:vm');
const E = require('../web/engine.js');

const demo = '3q3k/8/8/4N3/8/8/P7/6K1 w - - 0 1';
const kiwi = 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1';
const moves = (s) => E.legal(s).map(E.uci);

function perft(state, depth) {
  const candidates = E.legal(state);
  if (depth === 1) return candidates.length;
  return candidates.reduce((total, move) => total + perft(E.apply(state, move), depth - 1), 0);
}

test('Initial position round trips and has canonical perft 20 / 400 / 8902', () => {
  const state = E.parse(E.START_FEN);
  assert.equal(E.fen(state), E.START_FEN);
  assert.deepEqual(
    [1, 2, 3].map((d) => perft(state, d)),
    [20, 400, 8902]
  );
});
test('Kiwipete castling and pin reference position yields 48 and 2039 legal sequences', () => {
  const state = E.parse(kiwi);
  assert.equal(perft(state, 1), 48);
  assert.equal(perft(state, 2), 2039);
});
test('Position reader rejects absent kings, illegal checks, bad castling or en-passant metadata', () => {
  for (const value of [
    null,
    '',
    '8/8/8/8/8/8/8/8 w - - 0 1',
    '7k/8/8/8/8/8/8/6K1 w K - 0 1',
    '7k/8/8/8/8/8/8/6KR w - - 0 1',
    '7k/8/8/8/8/8/8/6K1 w - a6 0 1',
    '7k/8/8/8/8/8/8/6K1 x - - 0 1'
  ]) {
    assert.throws(() => E.parse(value));
  }
  assert.throws(() => E.pieceAt(E.parse(demo), 'i9'));
});
test('Move application and search leave the starting board and clocks intact', () => {
  const start = E.parse(E.START_FEN),
    next = E.apply(start, 'e2e4');
  E.best(next, 2);
  assert.equal(E.fen(start), E.START_FEN);
  assert.equal(E.fen(next), 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
  assert.throws(() => E.apply(start, 'e2e5'));
});
test('In a fork, a real king reply leaves the queen available for capture', () => {
  const start = E.parse(demo),
    fork = E.apply(start, { from: 'e5', to: 'f7' });
  assert.equal(E.status(fork), 'check');
  assert.deepEqual(new Set(moves(fork)), new Set(['h8h7', 'h8g7', 'h8g8']));
  for (const reply of E.legal(fork)) {
    const after = E.apply(E.apply(fork, reply), 'f7d8');
    assert.equal(E.pieceAt(after, 'd8'), 'N');
    assert.equal(after.board.includes('q'), false);
  }
});
test('Alpha-beta cuts branches without changing the minimax value or best move', () => {
  const fork = E.apply(E.parse(demo), 'e5f7');
  const cut = E.best(fork, 2),
    full = E.best(fork, 2, { prune: false });
  assert.deepEqual(cut.move, full.move);
  assert.equal(cut.score, full.score);
  assert.ok(cut.nodes < full.nodes && cut.cutoffs > 0);
  assert.equal(full.cutoffs, 0);
  assert.equal(E.uci(cut.move), 'h8h7');
});
test('Pruning matches plain minimax on multiple positions and search depths', () => {
  const positions = [
    E.parse(E.START_FEN),
    E.parse(demo),
    E.apply(E.parse(demo), 'e5f7'),
    E.parse('7k/5Q2/6K1/8/8/8/P7/8 w - - 0 1')
  ];
  for (const state of positions)
    for (const depth of [1, 2]) {
      const cut = E.best(state, depth),
        full = E.best(state, depth, { prune: false });
      assert.deepEqual(cut.move, full.move);
      assert.equal(cut.score, full.score);
      assert.ok(cut.nodes <= full.nodes);
      assert.deepEqual(cut, E.best(state, depth));
    }
});
test('A pinned rook can move along its pin but cannot uncover its own king', () => {
  const state = E.parse('4r1k1/8/8/8/8/8/4R3/4K3 w - - 0 1');
  assert.ok(moves(state).includes('e2e8'));
  assert.equal(moves(state).includes('e2d2'), false);
});
test('Castling relocates the rook, clears rights, and may not cross an attacked square', () => {
  const state = E.parse('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  assert.ok(moves(state).includes('e1g1') && moves(state).includes('e1c1'));
  const castled = E.apply(state, 'e1g1');
  assert.deepEqual(
    ['f1', 'g1', 'h1'].map((s) => E.pieceAt(castled, s)),
    ['R', 'K', null]
  );
  assert.equal(castled.rights, 'kq');
  const attack = E.parse('4k3/8/8/8/2b5/8/8/4K2R w K - 0 1');
  assert.equal(moves(attack).includes('e1g1'), false);
});
test('Movement and capture of original rooks each remove the correct castling rights', () => {
  const state = E.parse('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  assert.equal(E.apply(state, 'a1a8').rights, 'Kk');
});
test('En passant removes the passing pawn, expires and respects discovered check', () => {
  const s = E.parse('6k1/8/8/3pP3/8/8/8/4K3 w - d6 0 9');
  const taken = E.apply(s, 'e5d6');
  assert.equal(E.pieceAt(taken, 'd5'), null);
  assert.equal(E.pieceAt(taken, 'd6'), 'P');
  assert.equal(taken.ep, -1);
  assert.equal(E.apply(s, 'e1d1').ep, -1);
  const pinned = E.parse('4r1k1/8/8/3pP3/8/8/8/4K3 w - d6 0 9');
  assert.equal(moves(pinned).includes('e5d6'), false);
});
test('Pawn promotion requires an explicit choice among Q, R, B, N', () => {
  const s = E.parse('k7/6P1/8/8/8/8/8/2K5 w - - 0 1');
  assert.deepEqual(
    moves(s)
      .filter((m) => m.startsWith('g7g8'))
      .sort(),
    ['g7g8b', 'g7g8n', 'g7g8q', 'g7g8r']
  );
  assert.throws(() => E.apply(s, 'g7g8'));
  assert.equal(E.pieceAt(E.apply(s, 'g7g8n'), 'g8'), 'N');
});
test('Checkmate and stalemate are terminal and get different search scores', () => {
  const m = E.parse('7k/6Q1/5K2/8/8/8/8/8 b - - 0 1');
  const s = E.parse('7k/5K2/6Q1/8/8/8/8/8 b - - 0 1');
  assert.equal(E.status(m), 'checkmate');
  assert.equal(E.status(s), 'stalemate');
  assert.equal(E.best(m, 2).move, null);
  assert.ok(E.best(m, 2).score > 90000);
  assert.equal(E.best(s, 2).score, 0);
});
test('Depth-one search distinguishes mate in one from ordinary material gain', () => {
  const s = E.parse('7k/5Q2/6K1/8/8/8/P7/8 w - - 0 1');
  const result = E.best(s, 1);
  assert.equal(E.status(E.apply(s, result.move)), 'checkmate');
  assert.ok(result.score > 90000);
});
test('Black may mate and minimization picks that reply at the horizon', () => {
  const s = E.parse('8/p7/8/8/8/6k1/5q2/7K b - - 0 1');
  const result = E.best(s, 1);
  assert.equal(E.status(E.apply(s, result.move)), 'checkmate');
  assert.ok(result.score < -90000);
  for (const bad of [0, 7, 1.5]) assert.throws(() => E.best(s, bad));
});
test('Classic browser script exposes the same engine without module or network access', () => {
  const sandbox = {};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../web/engine.js'), 'utf8'), sandbox);
  const e = sandbox.ChessEngine;
  assert.equal(e.legal(e.parse(e.START_FEN)).length, 20);
});
