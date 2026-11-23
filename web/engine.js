/* Orthodox chess moves and depth-limited minimax for the tactics board. */
(function (root) {
  'use strict';
  const files = 'abcdefgh';
  const knight = [33, 31, 18, 14, -14, -18, -31, -33];
  const diagonal = [17, 15, -15, -17];
  const straight = [16, 1, -16, -1];
  const compass = straight.concat(diagonal);
  const material = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
  const mate = 100000;
  const start = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const opposite = (side) => (side === 'w' ? 'b' : 'w');
  const sideOf = (p) => (p === p.toUpperCase() ? 'w' : 'b');
  const withColor = (kind, side) => (side === 'w' ? kind.toUpperCase() : kind);
  const onBoard = (sq) => (sq & 0x88) === 0 && sq >= 0 && sq < 128;
  const name = (sq) => files[sq & 7] + ((sq >> 4) + 1);
  function index(square) {
    if (typeof square !== 'string' || !/^[a-h][1-8]$/.test(square))
      throw new Error('Тақта ұясы дұрыс көрсетілмеген.');
    return (Number(square[1]) - 1) * 16 + files.indexOf(square[0]);
  }
  function pieceAt(state, square) {
    return state.board[index(square)] || null;
  }
  function parse(fenText) {
    if (typeof fenText !== 'string') throw new Error('Позиция мәтінін тексер.');
    const fields = fenText.trim().split(/\s+/);
    if (fields.length !== 4 && fields.length !== 6) throw new Error('FEN пішімін тексер.');
    const [placement, turn, rights, ep, half = '0', full = '1'] = fields;
    if (
      !/^[wb]$/.test(turn) ||
      !/^(?:-|K?Q?k?q?)$/.test(rights) ||
      !/^(?:-|[a-h][36])$/.test(ep) ||
      !/^\d+$/.test(half) ||
      !/^[1-9]\d*$/.test(full) ||
      !Number.isSafeInteger(Number(half)) ||
      !Number.isSafeInteger(Number(full))
    )
      throw new Error('FEN деректері жарамсыз.');
    const rows = placement.split('/'),
      board = Array(128).fill(null),
      kings = { w: -1, b: -1 };
    if (rows.length !== 8) throw new Error('Тақтада сегіз қатар болуы керек.');
    for (let r = 0; r < 8; r++) {
      let f = 0;
      for (const c of rows[r]) {
        if (/[1-8]/.test(c)) {
          f += Number(c);
          continue;
        }
        if (!/^[prnbqkPRNBQK]$/.test(c) || f >= 8) throw new Error('Фигура қате көрсетілген.');
        const sq = (7 - r) * 16 + f++;
        if (c.toLowerCase() === 'p' && (r === 0 || r === 7))
          throw new Error('Пешка шеткі қатарда қала алмайды.');
        if (c.toLowerCase() === 'k') {
          if (kings[sideOf(c)] !== -1) throw new Error('Әр жақта бір патша болуы керек.');
          kings[sideOf(c)] = sq;
        }
        board[sq] = c;
      }
      if (f !== 8) throw new Error('Әр қатарда сегіз ұя болуы керек.');
    }
    if (kings.w < 0 || kings.b < 0) throw new Error('Екі патша да тақтада болуы керек.');
    const state = {
      board,
      turn,
      rights: rights === '-' ? '' : rights,
      ep: ep === '-' ? -1 : index(ep),
      half: Number(half),
      full: Number(full),
      kings
    };
    for (const mark of state.rights) {
      const white = mark === mark.toUpperCase(),
        home = white ? 0 : 112;
      const rook = home + (mark.toLowerCase() === 'k' ? 7 : 0);
      if (board[home + 4] !== (white ? 'K' : 'k') || board[rook] !== (white ? 'R' : 'r'))
        throw new Error('Рокировка құқығы позицияға сәйкес келмейді.');
    }
    if (state.ep !== -1) {
      const step = turn === 'w' ? 16 : -16;
      if (
        state.ep >> 4 !== (turn === 'w' ? 5 : 2) ||
        board[state.ep] ||
        board[state.ep - step] !== withColor('p', opposite(turn)) ||
        board[state.ep + step]
      )
        throw new Error('Жолай алу ұясы позицияға сәйкес келмейді.');
    }
    if (attacked(state, kings[opposite(turn)], turn))
      throw new Error('Кезегі өткен жақтың патшасы шахта қалған.');
    return state;
  }
  function fen(state) {
    const rows = [];
    for (let r = 7; r >= 0; r--) {
      let row = '',
        empty = 0;
      for (let f = 0; f < 8; f++) {
        const p = state.board[r * 16 + f];
        if (!p) {
          empty++;
          continue;
        }
        if (empty) {
          row += empty;
          empty = 0;
        }
        row += p;
      }
      rows.push(row + (empty || ''));
    }
    return [
      rows.join('/'),
      state.turn,
      state.rights || '-',
      state.ep === -1 ? '-' : name(state.ep),
      state.half,
      state.full
    ].join(' ');
  }
  function attacked(state, sq, by) {
    const b = state.board,
      step = by === 'w' ? 16 : -16;
    const pawn = withColor('p', by),
      horse = withColor('n', by),
      king = withColor('k', by);
    for (const flank of [-1, 1]) {
      const at = sq - step + flank;
      if (onBoard(at) && b[at] === pawn) return true;
    }
    for (const d of knight) if (onBoard(sq + d) && b[sq + d] === horse) return true;
    for (const d of compass) {
      for (let at = sq + d; onBoard(at); at += d) {
        const pc = b[at];
        if (!pc) continue;
        if (sideOf(pc) === by) {
          if (pc === king && at === sq + d) return true;
          const kind = pc.toLowerCase();
          if (kind === 'q' || (straight.includes(d) ? kind === 'r' : kind === 'b')) return true;
        }
        break;
      }
    }
    return false;
  }
  function inCheck(state) {
    return attacked(state, state.kings[state.turn], opposite(state.turn));
  }
  function pawnMoves(state, from, moves) {
    const b = state.board,
      white = state.turn === 'w',
      step = white ? 16 : -16,
      next = from + step;
    const push = (to) => {
      if (to >> 4 === (white ? 7 : 0))
        for (const promotion of ['q', 'r', 'b', 'n']) moves.push({ from, to, promotion });
      else moves.push({ from, to });
    };
    if (!b[next]) {
      push(next);
      if (from >> 4 === (white ? 1 : 6) && !b[next + step]) moves.push({ from, to: next + step });
    }
    for (const d of [-1, 1]) {
      const to = next + d;
      if (!onBoard(to)) continue;
      const target = b[to];
      if ((target && sideOf(target) !== state.turn && target.toLowerCase() !== 'k') || to === state.ep)
        push(to);
    }
  }
  function castleMoves(state, from, moves) {
    const side = state.turn,
      home = side === 'w' ? 0 : 112,
      enemy = opposite(side);
    if (from !== home + 4 || attacked(state, from, enemy)) return;
    for (const direction of [1, -1]) {
      const mark = withColor(direction === 1 ? 'k' : 'q', side);
      if (!state.rights.includes(mark)) continue;
      const through = from + direction,
        to = through + direction;
      if (state.board[through] || state.board[to] || (direction === -1 && state.board[home + 1]))
        continue;
      if (!attacked(state, through, enemy) && !attacked(state, to, enemy)) moves.push({ from, to });
    }
  }
  function pseudo(state) {
    const moves = [],
      b = state.board;
    for (let from = 0; from < 120; from++) {
      if (!onBoard(from) || !b[from] || sideOf(b[from]) !== state.turn) continue;
      const kind = b[from].toLowerCase();
      if (kind === 'p') {
        pawnMoves(state, from, moves);
        continue;
      }
      const directions =
        kind === 'n' ? knight : kind === 'b' ? diagonal : kind === 'r' ? straight : compass;
      const slides = kind === 'r' || kind === 'b' || kind === 'q';
      for (const d of directions) {
        for (let to = from + d; onBoard(to); to += d) {
          const target = b[to];
          if (!target || (sideOf(target) !== state.turn && target.toLowerCase() !== 'k'))
            moves.push({ from, to });
          if (target || !slides) break;
        }
      }
      if (kind === 'k' && state.rights) castleMoves(state, from, moves);
    }
    return moves;
  }
  const rookRights = { 0: 'Q', 7: 'K', 112: 'q', 119: 'k' };
  function make(state, move) {
    const { from, to, promotion } = move,
      board = state.board.slice(),
      side = state.turn;
    const piece = board[from],
      kind = piece.toLowerCase(),
      captured = board[to];
    let rights = state.rights;
    const kings = { ...state.kings },
      step = side === 'w' ? 16 : -16;
    board[from] = null;
    if (kind === 'p' && to === state.ep && !captured) board[to - step] = null;
    if (kind === 'k') {
      kings[side] = to;
      rights = side === 'w' ? rights.replace(/[KQ]/g, '') : rights.replace(/[kq]/g, '');
      if (Math.abs(to - from) === 2) {
        const rook = from + (to > from ? 3 : -4);
        board[(from + to) / 2] = board[rook];
        board[rook] = null;
      }
    }
    if (kind === 'r' && rookRights[from]) rights = rights.replace(rookRights[from], '');
    if (captured && captured.toLowerCase() === 'r' && rookRights[to])
      rights = rights.replace(rookRights[to], '');
    board[to] = promotion ? withColor(promotion, side) : piece;
    return {
      board,
      kings,
      turn: opposite(side),
      rights,
      ep: kind === 'p' && Math.abs(to - from) === 32 ? from + step : -1,
      half: kind === 'p' || captured ? 0 : state.half + 1,
      full: state.full + (side === 'b' ? 1 : 0)
    };
  }
  function successors(state) {
    const children = [];
    for (const move of pseudo(state)) {
      const child = make(state, move);
      if (!attacked(child, child.kings[state.turn], child.turn)) children.push({ move, child });
    }
    return children;
  }
  function publicMove({ from, to, promotion }) {
    const move = { from: name(from), to: name(to) };
    if (promotion) move.promotion = promotion;
    return move;
  }
  function legal(state) {
    return successors(state).map((entry) => publicMove(entry.move));
  }
  function continuations(state) {
    return successors(state).map(({ move, child }) => ({ move: publicMove(move), state: child }));
  }
  function hasLegalMove(state) {
    for (const move of pseudo(state)) {
      const child = make(state, move);
      if (!attacked(child, child.kings[state.turn], child.turn)) return true;
    }
    return false;
  }
  function uci(move) {
    return move ? move.from + move.to + (move.promotion || '') : null;
  }
  function apply(state, move) {
    const target = typeof move === 'string' ? move : uci(move);
    const found = successors(state).find(({ move: m }) => uci(publicMove(m)) === target);
    if (!found) throw new Error('Бұл жүріс осы позицияда рұқсат етілмейді.');
    return found.child;
  }
  function status(state) {
    const check = inCheck(state);
    return hasLegalMove(state) ? (check ? 'check' : 'playing') : check ? 'checkmate' : 'stalemate';
  }
  function evaluate(state) {
    let score = 0;
    for (let sq = 0; sq < 120; sq++) {
      const p = state.board[sq];
      if (!p) continue;
      const kind = p.toLowerCase();
      const centrality = 7 - (Math.abs((sq & 7) - 3.5) + Math.abs((sq >> 4) - 3.5));
      const forward = sideOf(p) === 'w' ? sq >> 4 : 7 - (sq >> 4);
      const bonus = kind === 'p' ? forward * 4 : kind === 'n' || kind === 'b' ? centrality * 3 : 0;
      score += (sideOf(p) === 'w' ? 1 : -1) * (material[kind] + bonus);
    }
    return score;
  }
  function movePriority(state, { move }) {
    const captured = state.board[move.to],
      attacker = state.board[move.from].toLowerCase();
    const gain = captured
      ? material[captured.toLowerCase()]
      : attacker === 'p' && move.to === state.ep
        ? 100
        : 0;
    return (
      (move.promotion ? material[move.promotion] * 16 : 0) + (gain ? gain * 16 - material[attacker] : 0)
    );
  }
  function best(state, depth = 2, options = {}) {
    if (!Number.isInteger(depth) || depth < 1 || depth > 4)
      throw new RangeError('Іздеу тереңдігі 1–4 аралығында болуы керек.');
    const pruning = options.prune !== false;
    let nodes = 0,
      cutoffs = 0,
      chosen = null;
    function search(node, remaining, alpha, beta) {
      nodes++;
      if (!remaining) {
        const check = inCheck(node);
        // A tactical leaf may already be checkmate or stalemate. Locate one legal move before static evaluation.
        if (hasLegalMove(node)) return evaluate(node);
        return check ? (node.turn === 'w' ? -1 : 1) * (mate - depth) : 0;
      }
      const list = successors(node),
        white = node.turn === 'w';
      if (!list.length) return inCheck(node) ? (white ? -1 : 1) * (mate - (depth - remaining)) : 0;
      list.sort((a, b) => movePriority(node, b) - movePriority(node, a));
      let value = white ? -Infinity : Infinity;
      for (const { move, child } of list) {
        const proposal = search(child, remaining - 1, alpha, beta);
        if (white ? proposal > value : proposal < value) {
          value = proposal;
          if (remaining === depth) chosen = move;
        }
        if (pruning) {
          if (white) alpha = Math.max(alpha, value);
          else beta = Math.min(beta, value);
          if (alpha >= beta) {
            cutoffs++;
            break;
          }
        }
      }
      return value;
    }
    const score = search(state, depth, -Infinity, Infinity);
    return { move: chosen ? publicMove(chosen) : null, score, nodes, cutoffs };
  }
  const api = {
    parse,
    fen,
    pieceAt,
    legal,
    continuations,
    apply,
    inCheck,
    status,
    best,
    uci,
    evaluate,
    START_FEN: start
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChessEngine = api;
})(globalThis);
