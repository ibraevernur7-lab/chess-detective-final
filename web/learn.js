/* Beta–Bernoulli skill model and multi-attribute utility for selecting a puzzle.
   In a prior with one success and one failure, P(success) starts at 1/2. */
(function (root) {
  'use strict';
  const themes = Object.freeze(['fork', 'mate', 'capture']);
  function empty() { return {version: 1, attempts: {}}; }

  function validId(id) {
    return typeof id === 'string' && /^[a-z][a-z0-9-]{0,79}$/.test(id) &&
      !Object.hasOwn(Object.prototype, id);
  }

  function restore(value) {
    const result = empty();
    if (!value || value.version !== 1 || !value.attempts || typeof value.attempts !== 'object' ||
        Array.isArray(value.attempts)) return result;
    for (const [id, entry] of Object.entries(value.attempts)) {
      if (validId(id) && entry && themes.includes(entry.theme) && typeof entry.correct === 'boolean') {
        result.attempts[id] = {theme: entry.theme, correct: entry.correct};
      }
    }
    return result;
  }

  function record(profile, puzzle, correct) {
    if (!puzzle || !validId(puzzle.id) || !themes.includes(puzzle.theme) || typeof correct !== 'boolean') {
      throw new TypeError('Есеп пен алғашқы жауаптың мәнін тексер.');
    }
    const next = restore(profile);
    if (!Object.hasOwn(next.attempts, puzzle.id)) {
      next.attempts[puzzle.id] = {theme: puzzle.theme, correct};
    }
    return next;
  }

  function stats(profile, theme) {
    if (!themes.includes(theme)) throw new TypeError('Белгісіз тақырып.');
    const samples = Object.values(restore(profile).attempts).filter(entry => entry.theme === theme);
    const correct = samples.filter(entry => entry.correct).length;
    const n = samples.length;
    return {n, correct, wrong: n - correct, p: (correct + 1) / (n + 2)};
  }

  function recommend(profile, cases, options = {}) {
    const target = options.target === undefined ? 0.70 : options.target;
    if (!Number.isFinite(target) || target < 0 || target > 1) throw new RangeError('Мақсат 0 мен 1 арасында болуы керек.');
    const clean = restore(profile);
    const byTheme = Object.fromEntries(themes.map(theme => [theme, stats(clean, theme)]));
    let best = null;
    for (const puzzle of cases) {
      if (puzzle.id === options.excludeId) continue;
      const info = byTheme[puzzle.theme];
      if (!info || ![1,2,3].includes(puzzle.level)) throw new TypeError('Есеп параметрлері жарамсыз.');
      const adjustment = (2 - puzzle.level) * 0.15;
      const predicted = Math.min(0.95, Math.max(0.05, info.p + adjustment));
      const fit = 1 - Math.abs(predicted - target);
      const need = 1 - info.p;
      const uncertainty = 2 / (info.n + 2);
      const freshness = Object.hasOwn(clean.attempts, puzzle.id) ? 0 : 1;
      const utility = 0.50 * fit + 0.20 * need + 0.10 * uncertainty + 0.20 * freshness;
      if (!best || utility > best.utility + 1e-12) {
        best = {puzzle, predicted, fit, need, uncertainty, freshness, utility};
      }
    }
    return best;
  }

  const api = {themes, empty, restore, record, stats, recommend};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChessLearn = api;
})(globalThis);
