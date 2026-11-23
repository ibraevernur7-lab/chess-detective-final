'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const cases = require('../web/cases');
const e = require('../web/engine');

function coordinates(square) {
  return [square.charCodeAt(0) - 97, Number(square[1]) - 1];
}
function knightAttacks(from, target) {
  const [x, y] = coordinates(from), [tx, ty] = coordinates(target);
  return Math.abs(x - tx) * Math.abs(y - ty) === 2;
}
function whitePawnAttacks(from, target) {
  const [x, y] = coordinates(from), [tx, ty] = coordinates(target);
  return Math.abs(x - tx) === 1 && ty - y === 1;
}
function queenReaches(state, from, target) {
  const [x, y] = coordinates(from), [tx, ty] = coordinates(target);
  const dx = tx - x, dy = ty - y;
  if ((!dx && !dy) || (dx && dy && Math.abs(dx) !== Math.abs(dy))) return false;
  const steps = Math.max(Math.abs(dx), Math.abs(dy));
  for (let i = 1; i < steps; i++) {
    const cell = String.fromCharCode(97 + x + i * Math.sign(dx)) + (y + i * Math.sign(dy) + 1);
    if (e.pieceAt(state, cell)) return false;
  }
  return true;
}
function satisfiesGoal(puzzle, state, move) {
  const after = e.apply(state,move);
  if (puzzle.theme === 'mate') return e.status(after) === 'checkmate';
  if (puzzle.theme === 'capture') {
    const target = {'loose-rook':'e6', 'answer-check':'g4', 'pinned-guard':'e8'}[puzzle.id];
    return move.to === target && !e.legal(after).some(reply => reply.to === target);
  }
  if (puzzle.id === 'knight-fork') {
    return e.pieceAt(state,move.from) === 'N' && e.inCheck(after) && knightAttacks(move.to,'d8');
  }
  if (puzzle.id === 'pawn-fork') {
    return e.pieceAt(state,move.from) === 'P' && whitePawnAttacks(move.to,'d6') && whitePawnAttacks(move.to,'f6');
  }
  return e.pieceAt(state,move.from) === 'Q' && e.pieceAt(after,'b4') === 'n' && e.inCheck(after) &&
    queenReaches(after,move.to,'b4') && !e.legal(after).some(reply => reply.to === move.to);
}

test('catalog contains three levels for each theme and nine distinct original positions', () => {
  assert.equal(cases.length,9);
  assert.equal(new Set(cases.map(p=>p.fen)).size,9);
  assert.equal(new Set(cases.map(p=>p.id)).size,9);
  for (const theme of ['fork','mate','capture']) {
    assert.deepEqual(cases.filter(p=>p.theme===theme).map(p=>p.level),[1,2,3]);
  }
});
for (const puzzle of cases) {
  test('all and only legal moves fulfilling the stated goal: '+puzzle.id, () => {
    const state = e.parse(puzzle.fen);
    assert.equal(state.turn,'w');
    const valid = e.legal(state).filter(move => satisfiesGoal(puzzle,state,move)).map(e.uci).sort();
    assert.deepEqual(valid,[...puzzle.solutions].sort());
    assert.ok(valid.length > 0);
  });
}
test('the queen can be won after every legal defence to the opening knight fork', () => {
  const puzzle = cases[0];
  const start = e.parse(puzzle.fen);
  const strike = e.legal(start).find(m => e.uci(m) === puzzle.solutions[0]);
  const black = e.apply(start,strike);
  assert.ok(e.inCheck(black));
  assert.ok(e.legal(black).length > 0);
  for (const reply of e.legal(black)) {
    const next = e.apply(black,reply);
    assert.equal(e.pieceAt(next,'d8'),'q');
    const capture = e.legal(next).find(m => e.uci(m) === puzzle.followUp);
    assert.ok(capture);
    assert.equal(e.pieceAt(e.apply(next,capture),'d8'),'N');
  }
});
