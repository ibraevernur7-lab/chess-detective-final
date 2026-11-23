'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const cases = require('../web/cases');
const model = require('../web/learn');

test('Beta prior and one correct or wrong first answer produce analytic posteriors', () => {
  const clean = model.empty();
  assert.equal(model.stats(clean,'fork').p,1/2);
  assert.equal(model.stats(model.record(clean,cases[0],true),'fork').p,2/3);
  assert.equal(model.stats(model.record(clean,cases[0],false),'fork').p,1/3);
  assert.deepEqual(clean,model.empty());
});
test('all 64 first-answer histories across fork and mate topics preserve independent posteriors', () => {
  for (let mask=0; mask<64; mask++) {
    let profile=model.empty();
    const correct = {fork:0,mate:0};
    for (let i=0;i<6;i++) {
      const right=Boolean(mask & (1<<i));
      profile=model.record(profile,cases[i],right);
      if (right) correct[cases[i].theme]++;
    }
    for (const theme of ['fork','mate']) {
      const result=model.stats(profile,theme);
      assert.equal(result.n,3);
      assert.equal(result.p,(correct[theme]+1)/5);
    }
    assert.equal(model.stats(profile,'capture').p,1/2);
  }
});
test('retrying or reloading never overwrites the first recorded answer', () => {
  const first=model.record(model.empty(),cases[0],false);
  const reread=model.restore(JSON.parse(JSON.stringify(first)));
  assert.deepEqual(model.record(reread,cases[0],true),first);
  assert.deepEqual(model.stats(first,'fork'),{n:1,correct:0,wrong:1,p:1/3});
});
test('invalid or unsafe saved entries do not enter the learner profile', () => {
  for (const input of [null, [], 'other', {version:2,attempts:{}}, {version:1,attempts:null}]) {
    assert.deepEqual(model.restore(input),model.empty());
  }
  const profile=model.restore(JSON.parse('{"version":1,"attempts":{"__proto__":{"theme":"fork","correct":true},"bad":{"theme":"fork","correct":"yes"},"a":{"theme":"other","correct":true},"valid":{"theme":"mate","correct":true}}}'));
  assert.deepEqual(Object.keys(profile.attempts),['valid']);
  assert.throws(()=>model.record(model.empty(),cases[0],1));
});
test('transparent recommendation formula, stable tie break and exclusion', () => {
  const clean=model.empty();
  const result=model.recommend(clean,cases);
  assert.equal(result.puzzle.id,cases[0].id);
  assert.equal(result.predicted,0.65);
  assert.ok(Math.abs(result.utility-0.875)<1e-9);
  assert.equal(model.recommend(clean,cases,{excludeId:cases[0].id}).puzzle.id,'back-rank');
  assert.equal(model.recommend(clean,[cases[0]],{excludeId:cases[0].id}),null);
});
test('changing target produces different levels on the very same learner profile', () => {
  const clean=model.empty();
  const subset=cases.slice(0,3);
  assert.equal(model.recommend(clean,subset,{target:0.35}).puzzle.level,3);
  assert.equal(model.recommend(clean,subset,{target:0.50}).puzzle.level,2);
  assert.equal(model.recommend(clean,subset,{target:0.85}).puzzle.level,1);
});
test('posterior, novelty, and evidence change the next recommended investigation', () => {
  const clean=model.empty();
  const trained=model.record(clean,cases[0],true);
  const within=model.recommend(trained,cases.slice(0,3));
  assert.equal(within.puzzle.id,'pawn-fork');
  assert.equal(within.predicted,2/3);
  assert.equal(within.freshness,1);
  assert.equal(within.uncertainty,2/3);
  const opening=model.recommend(trained,[cases[0]]);
  assert.equal(opening.freshness,0);
  assert.notEqual(model.recommend(clean,cases).puzzle.id,model.recommend(trained,cases).puzzle.id);
});
test('invalid recommendation target or theme is reported', () => {
  for (const target of [NaN,-0.1,1.1,'0.7']) assert.throws(()=>model.recommend(model.empty(),cases,{target}));
  assert.throws(()=>model.stats(model.empty(),'typo'));
});
