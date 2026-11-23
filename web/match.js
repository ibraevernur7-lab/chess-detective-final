/* Rules and short, reproducible move reviews for a human (White) against Black. */
(function (root) {
  'use strict';
  const E = typeof module === 'object' && module.exports ? require('./engine.js') : root.ChessEngine;
  const MATE = 100000;

  // A nominal en-passant square changes repetition only if a legal capture exists.
  function positionKey(state) {
    const parts = E.fen(state).split(' ').slice(0, 4);
    if (parts[3] !== '-') {
      const target = parts[3];
      const canCapture = E.legal(state).some(move =>
        move.to === target && move.from[0] !== target[0] &&
        E.pieceAt(state, move.from).toLowerCase() === 'p');
      if (!canCapture) parts[3] = '-';
    }
    return parts.join(' ');
  }

  function deadMaterial(state) {
    let knights = 0;
    let bishops = 0;
    let bishopColor = -1;
    for (let i = 0; i < state.board.length; i++) {
      const piece = state.board[i];
      if (!piece || piece.toLowerCase() === 'k') continue;
      if (piece.toLowerCase() === 'n') { knights++; continue; }
      if (piece.toLowerCase() !== 'b') return false;
      const color = ((i >> 4) + (i & 7)) % 2;
      if (bishopColor !== -1 && bishopColor !== color) return false;
      bishopColor = color;
      bishops++;
    }
    return knights === 0 || (bishops === 0 && knights === 1);
  }

  // The trainer automatically accepts a draw on the third occurrence or 100 quiet plies.
  function adjudicate(state, status, repeated) {
    if (status === 'checkmate') return {reason: 'checkmate', winner: state.turn === 'w' ? 'b' : 'w'};
    if (status === 'stalemate') return {reason: 'stalemate', winner: null};
    if (deadMaterial(state)) return {reason: 'material', winner: null};
    if (state.half >= 100) return {reason: 'fifty', winner: null};
    if (repeated) return {reason: 'repetition', winner: null};
    return null;
  }

  function create(fen = E.START_FEN) {
    const state = E.parse(fen);
    const counts = new Map([[positionKey(state), 1]]);
    return {state, counts, history: [], result: adjudicate(state, E.status(state), false)};
  }

  function push(game, move) {
    if (game.result) throw new Error('Партия аяқталды.');
    const state = E.apply(game.state, move);
    const key = positionKey(state);
    const counts = new Map(game.counts);
    const count = (counts.get(key) || 0) + 1;
    counts.set(key, count);
    const record = {
      side: game.state.turn,
      number: game.state.full,
      move: typeof move === 'string' ? move : E.uci(move),
      before: E.fen(game.state),
      after: E.fen(state)
    };
    if (game.state.turn === 'w') {
      record.drawKeys = [];
      for (const [position, seen] of game.counts) if (seen >= 2) record.drawKeys.push(position);
    }
    return {state, counts, history: game.history.concat(record),
      result: adjudicate(state, E.status(state), count >= 3)};
  }

  function resign(game) {
    if (game.result) throw new Error('Партия аяқталды.');
    return {...game, result: {reason: 'resign', winner: 'b'}};
  }

  function ai(game, depth = 2) {
    if (game.result || game.state.turn !== 'b') return null;
    if (!Number.isInteger(depth) || depth < 1 || depth > 3) throw new RangeError('Тереңдік 1–3 болуы керек.');
    return E.uci(E.best(game.state, depth).move);
  }

  function terminalScore(result, plies) {
    if (!result.winner) return 0;
    return (result.winner === 'w' ? 1 : -1) * (MATE - plies);
  }
  function repeatedAt(state, drawKeys) {
    return drawKeys.size > 0 && drawKeys.has(positionKey(state));
  }

  // Compare EVERY legal White option at precisely the same horizon: White, then Black.
  function scoreLine(child, drawKeys) {
    const replies = E.continuations(child);
    const status = replies.length ? 'playing' : (E.inCheck(child) ? 'checkmate' : 'stalemate');
    const end = adjudicate(child, status, repeatedAt(child, drawKeys));
    if (end) return {score: terminalScore(end, 1), reply: null};
    let score = Infinity;
    let reply = null;
    for (const item of replies) {
      const result = adjudicate(item.state, E.status(item.state), repeatedAt(item.state, drawKeys));
      const value = result ? terminalScore(result, 2) : E.evaluate(item.state);
      if (value < score) {
        score = value;
        reply = E.uci(item.move);
      }
    }
    return {score, reply};
  }

  const pieceNames = {p:'пешканы', n:'атты', b:'пілді', r:'тураны', q:'уәзірді'};
  function notation(move) {
    return move.slice(0, 2) + ' → ' + move.slice(2, 4) + (move[4] ? '=' + move[4].toUpperCase() : '');
  }
  function describe(review, playedState) {
    if (review.severity === 'good') return 'Екі жарты жүрістік талдауда бұл жүрістен елеулі шығын табылмады.';
    if (review.mateSwing && review.bestScore > 90000)
      return notation(review.best) + ' жүрісімен бірден мат қоюға болатын еді.';
    if (review.mateSwing && review.playedScore < -90000)
      return 'Осы жүрістен кейін қаралар ' + notation(review.reply) + ' жүрісімен мат қоя алады.';
    let detail = 'Осы позицияда ' + notation(review.best) + ' жүрісінің бағасы жоғары.';
    if (review.reply) {
      const target = E.pieceAt(playedState, review.reply.slice(2, 4));
      if (target && pieceNames[target.toLowerCase()]) {
        detail += ' Сенің жүрісіңнен кейін қаралар ' + notation(review.reply) + ' жүрісімен ' +
          pieceNames[target.toLowerCase()] + ' ала алады.';
      } else {
        detail += ' Сенің жүрісіңе есептелген жауап — ' + notation(review.reply) + '.';
      }
    }
    return detail;
  }

  function analyze(entry) {
    if (!entry || entry.side !== 'w') throw new Error('Талдау үшін ақтардың жүрісін таңда.');
    const before = E.parse(entry.before);
    const drawKeys = new Set(entry.drawKeys || []);
    const options = E.continuations(before);
    let best = null;
    let played = null;
    for (const {move, state} of options) {
      const line = {move: E.uci(move), state, ...scoreLine(state, drawKeys)};
      if (line.move === entry.move) played = line;
      if (!best || line.score > best.score) best = line;
    }
    if (!played) throw new Error('Журналдағы жүріс позицияға сәйкес келмейді.');
    if (played.score === best.score) best = played;
    const loss = best.score - played.score;
    const mateSwing = loss > 0 && (best.score >= MATE - 2 || played.score <= -MATE + 2);
    const severity = mateSwing || loss >= 250 ? 'blunder' : loss >= 100 ? 'mistake' :
      loss >= 50 ? 'inaccuracy' : 'good';
    const review = {
      number: entry.number, played: played.move, best: best.move, loss, mateSwing, severity,
      bestScore: best.score, playedScore: played.score, depth: 2,
      before: entry.before, after: E.fen(played.state), bestAfter: E.fen(best.state),
      reply: played.reply, bestReply: best.reply
    };
    review.detail = describe(review, played.state);
    return review;
  }

  const api = {create, push, ai, resign, analyze, positionKey};
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChessMatch = api;
})(globalThis);
