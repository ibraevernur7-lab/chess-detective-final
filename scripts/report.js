'use strict';

const { spawnSync } = require('node:child_process');
const { readdirSync, writeFileSync } = require('node:fs');
const path = require('node:path');
const engine = require('../web/engine.js');
const cases = require('../web/cases.js');
const root = path.resolve(__dirname, '..');
const suite = readdirSync(path.join(root, 'tests')).filter(f => f.endsWith('.test.js')).sort();
const run = spawnSync(process.execPath, ['--test','--test-reporter=tap',...suite.map(f=>path.join('tests',f))], {cwd:root,encoding:'utf8'});
if (run.status !== 0) {
  process.stderr.write(run.stdout + run.stderr);
  process.exit(run.status || 1);
}
const counts = {};
for (const key of ['tests', 'pass', 'fail', 'skipped']) {
  const match = run.stdout.match(new RegExp('^# ' + key + ' (\\d+)', 'm'));
  if (!match) throw new Error('Missing test count: ' + key);
  counts[key] = Number(match[1]);
}
const opening = engine.parse(cases[0].fen);
const whiteMove = engine.legal(opening).find(move => engine.uci(move) === 'e5f7');
const position = engine.apply(opening, whiteMove);
const enabled = engine.best(position, 2);
const plain = engine.best(position, 2, {prune:false});
const result = {
  command: 'npm test', counts, suite, cases: cases.length,
  benchmark: {
    fen: engine.fen(position), depth: 2, chosenReply: engine.uci(enabled.move),
    alphaBeta: {score:enabled.score, nodes:enabled.nodes, cutoffs:enabled.cutoffs},
    minimax: {score:plain.score, nodes:plain.nodes, cutoffs:plain.cutoffs}
  }
};
writeFileSync(path.join(root,'tests','results.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result,null,2));
