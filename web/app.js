(() => {
  'use strict';
  const engine = window.ChessEngine;
  const cases = window.ChessCases;
  const learn = window.ChessLearn;
  const $ = id => document.getElementById(id);
  const names = {k:'король', q:'уәзір', r:'тура', b:'піл', n:'ат', p:'пешка'};
  const symbols = {K:'♔', Q:'♕', R:'♖', B:'♗', N:'♘', P:'♙', k:'♚', q:'♛', r:'♜', b:'♝', n:'♞', p:'♟'};
  const themes = {fork:'Қос шабуыл', mate:'Бір жүрісте мат', capture:'Фигура ұту'};
  const levels = ['','Жеңіл','Орташа','Күрделі'];
  const letters = 'abcdefgh';
  const percent = value => Math.round(value * 100) + '%';
  const pad = value => String(value).padStart(2, '0');
  const storeKey = 'chess-detective.progress.v1';
  const caseIds = new Set(cases.map(c => c.id));
  let diskWorks = true;

  function idSet(value) {
    return new Set(Array.isArray(value) ? value.filter(id => caseIds.has(id)) : []);
  }
  function loadProgress() {
    let raw = {};
    try {
      raw = JSON.parse(localStorage.getItem(storeKey) || '{}') || {};
    } catch {
      diskWorks = false;
    }
    return {
      model: learn.restore(raw.model),
      helped: idSet(raw.helped),
      completed: idSet(raw.completed),
      target: [0.55,0.7,0.85].includes(raw.target) ? raw.target : 0.7
    };
  }
  const progress = loadProgress();
  function save() {
    try {
      localStorage.setItem(storeKey, JSON.stringify({
        model: progress.model, helped: [...progress.helped],
        completed: [...progress.completed], target: progress.target
      }));
    } catch {
      diskWorks = false;
    }
  }

  let puzzle, state, moves, selected, stage, lastMove, guideSquares;
  let thinkingTimer = 0, lastAnalysis = '', logs = [], focusedSquare = 'e5';
  let pendingPromotion = [];
  const squares = new Map();
  const board = $('board');
  function text(tag, value, cls) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    node.textContent = value;
    return node;
  }
  function message(kind, title, body) {
    $('feedback').dataset.kind = kind;
    $('feedback-mark').textContent = {bad:'!', good:'✓', info:'i'}[kind];
    $('feedback-title').textContent = title;
    $('feedback-copy').textContent = body;
  }
  function nextRecommendation() {
    return learn.recommend(progress.model, cases, {excludeId: puzzle.id, target: progress.target});
  }
  function explainNext(rec) {
    if (!rec) return 'Қазір қолжетімді келесі есеп жоқ.';
    return 'Келесі ұсыныс — «' + rec.puzzle.title + '». Сәтті шешу болжамы ' +
      percent(rec.predicted) + ', таңдалған мақсат ' + percent(progress.target) +
      '. Пайдалылық ұпайы ' + Math.round(rec.utility * 100) + '/100. Оған күрделіліктің мақсатқа сәйкестігі, ' +
      'тактиканы меңгеру деңгейі, жиналған дерек және есептің бұрын орындалуы әсер етеді.';
  }
  function refreshNotebook() {
    const info = learn.stats(progress.model, puzzle.theme);
    $('skill-name').textContent = themes[puzzle.theme];
    $('skill-value').textContent = percent(info.p);
    $('skill-bar').style.width = percent(info.p);
    $('skill-caption').textContent = info.n ?
      'Алғашқы талпыныстар бойынша өз бетіңше шешкенің: ' + info.correct + ' / ' + info.n + '.' :
      'Бастапқы болжам. Алғашқы талпынысыңнан кейін жаңарады.';
    $('analysis-line').textContent = lastAnalysis ||
      'Minimax қарсыластың заңды жауаптарын қарайды. Alpha–Beta шешімді жақсарта алмайтын тармақтарды қысқартады.';
    $('bayes-line').textContent = 'Байес бағасы: (' + info.correct + ' + 1) / (' + info.n +
      ' + 2) = ' + percent(info.p) + '. Дұрыс жауап пен барлық алғашқы талпыныс саны осы тактикаға тиесілі.';
    $('next-explain').textContent = explainNext(nextRecommendation());
    $('log-count').textContent = logs.length;
    $('empty-log').hidden = logs.length > 0;
    $('log').replaceChildren();
    logs.forEach(item => {
      const li = document.createElement('li');
      li.append(text('span',item.side),text('b',item.notation));
      $('log').append(li);
    });
  }

  function squareLabel(square, piece) {
    if (!piece) return square + ', бос ұя';
    return square + ', ' + (piece === piece.toUpperCase() ? 'ақ ' : 'қара ') + names[piece.toLowerCase()];
  }
  function createBoard() {
    for (let rank = 8; rank >= 1; rank--) {
      Array.from(letters).forEach((file, col) => {
        const square = file + rank;
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.square = square;
        button.className = 'sq' + ((rank + col) % 2 ? ' dark' : '');
        if (col === 0) button.append(text('span', rank, 'coord'));
        if (rank === 1) button.append(text('span', file, 'coord file'));
        button.addEventListener('click', () => {
          focusedSquare = square;
          interact(square);
        });
        button.addEventListener('keydown', e => {
          const delta = {ArrowLeft:[-1,0], ArrowRight:[1,0], ArrowUp:[0,1], ArrowDown:[0,-1]}[e.key];
          if (!delta) return;
          e.preventDefault();
          const newFile = Math.max(0, Math.min(7, col + delta[0]));
          const newRank = Math.max(1, Math.min(8, rank + delta[1]));
          focusedSquare = letters[newFile] + newRank;
          for (const [key, b] of squares) b.tabIndex = key === focusedSquare ? 0 : -1;
          squares.get(focusedSquare).focus();
        });
        squares.set(square, button);
        board.append(button);
      });
    }
  }
  function pieceUrl(piece) {
    const path = 'assets/pieces/' + (piece.toUpperCase() === piece ? 'w' : 'b') + piece.toUpperCase() + '.png';
    return window.CHESS_INLINE?.[path] || path;
  }
  function displayPiece(button, piece) {
    if (button.dataset.piece === (piece || '')) return;
    button.querySelector('img,.glyph')?.remove();
    button.dataset.piece = piece || '';
    if (!piece) return;
    const image = new Image();
    image.alt = '';
    image.draggable = false;
    image.src = pieceUrl(piece);
    image.onerror = () => { if (image.isConnected) image.replaceWith(text('span', symbols[piece], 'glyph')); };
    button.append(image);
  }
  function draw() {
    moves = engine.legal(state);
    const destinations = new Set(selected ? moves.filter(m => m.from === selected).map(m => m.to) : []);
    for (const [square, button] of squares) {
      const piece = engine.pieceAt(state, square);
      displayPiece(button, piece);
      button.classList.toggle('has-piece', Boolean(piece));
      button.classList.toggle('selected', selected === square);
      button.classList.toggle('legal', destinations.has(square));
      button.classList.toggle('past', Boolean(lastMove && [lastMove.from,lastMove.to].includes(square)));
      button.classList.toggle('hinted', guideSquares.includes(square));
      button.setAttribute('aria-pressed', String(selected === square));
      button.setAttribute('aria-label', squareLabel(square,piece) + (destinations.has(square) ? ', заңды жүріс' : ''));
      button.tabIndex = square === focusedSquare ? 0 : -1;
    }
    const thinking = stage === 'thinking', done = stage === 'done';
    $('turn').className = 'turn' + (thinking ? ' thinking' : done ? ' complete' : '');
    $('turn').lastChild.textContent = thinking ? 'Қаралардың жүрісі' : done ? 'Іс шешілді' : 'Ақтардың жүрісі';
    $('hint').disabled = thinking || done;
    $('next').hidden = !done;
    refreshNotebook();
  }
  function notation(move, before, after) {
    const captured = engine.pieceAt(before,move.to) ||
      (engine.pieceAt(before,move.from)?.toLowerCase() === 'p' && move.from[0] !== move.to[0]);
    const result = engine.status(after);
    return move.from + (captured ? ' × ' : ' – ') + move.to +
      (move.promotion ? '=' + move.promotion.toUpperCase() : '') +
      (result === 'checkmate' ? '#' : result === 'check' ? '+' : '');
  }
  function play(move, side) {
    const before = state;
    state = engine.apply(before,move);
    logs.push({side, notation:notation(move,before,state)});
    lastMove = move;
    selected = null;
    guideSquares = [];
  }
  function complete() {
    stage = 'done';
    progress.completed.add(puzzle.id);
    save();
    $('hint-box').hidden = true;
    message('good',puzzle.followUp ? 'Іс шешілді! Уәзірді ұттың.' : 'Іс шешілді!',puzzle.success);
    draw();
  }
  function engineInfo(result, prefix) {
    return prefix + ' 2 жарты жүріс тереңдігінде қаралған позициялар: ' +
      result.nodes + '. Alpha–Beta қысқартулары: ' + result.cutoffs + '.';
  }
  function defend() {
    const result = engine.best(state, 2);
    if (!result.move) {complete();return;}
    play(result.move,'Қаралар');
    lastAnalysis = engineInfo(result, 'Minimax жауабы: ' + logs.at(-1).notation + '.');
    if (puzzle.followUp && engine.legal(state).some(m => engine.uci(m) === puzzle.followUp)) {
      stage = 'follow';
      message('info','Қара король шахтан шықты','Енді қос шабуылдың нәтижесін пайдалан. Қара уәзірді алатын жүрісті тақтада жаса.');
      draw();
    } else complete();
  }
  function wrongMove(move) {
    const after = engine.apply(state,move);
    const reply = engine.best(after,2);
    const modelLine = reply.move ? notation(reply.move,after,engine.apply(after,reply.move)) : null;
    const played = notation(move,state,after);
    lastAnalysis = engineInfo(reply, 'Талданған нұсқа: ' + played + (modelLine ? ', жауап ' + modelLine : '') + '.');
    selected = null;
    const goalText = stage === 'follow' ? 'Уәзірді алатын жүрісті ізде.' : puzzle.goal;
    message('bad','Бұл жүріс заңды. Басқа жол ізде.', played + (modelLine ? ' жүрісіне қаралардың ықтимал жауабы — ' + modelLine + '. ' : '. ') + goalText);
    draw();
  }
  function tryMove(move) {
    const code = engine.uci(move);
    const first = stage === 'start';
    // A mating goal accepts every legal checkmate, including alternative solutions.
    const correct = first ? (puzzle.solutions.includes(code) ||
      (puzzle.theme === 'mate' && engine.status(engine.apply(state,move)) === 'checkmate')) : code === puzzle.followUp;
    if (first) {
      progress.model = learn.record(progress.model, puzzle, correct && !progress.helped.has(puzzle.id));
      save();
    }
    if (!correct) {wrongMove(move);return;}
    play(move,'Ақтар');
    $('hint-box').hidden = true;
    if (!first || ['checkmate','stalemate'].includes(engine.status(state))) {complete();return;}
    stage = 'thinking';
    message('good','Тактикалық жүріс табылды','Қаралардың ең жақсы жауабы есептеліп жатыр…');
    draw();
    thinkingTimer = setTimeout(defend, 560);
  }
  function interact(square) {
    if (stage === 'thinking' || stage === 'done') return;
    if (selected === square) {
      selected = null;
      message('info','Фигураны таңда','Алдымен ақ фигураны, содан кейін баратын ұяны бас.');
      draw();
      return;
    }
    if (selected) {
      const valid = moves.filter(m => m.from === selected && m.to === square);
      if (valid.length === 1) {tryMove(valid[0]);return;}
      if (valid.length > 1) {
        pendingPromotion = valid;
        $('promotions').replaceChildren();
        valid.forEach(move => {
          const b = text('button', names[move.promotion], 'button light');
          b.type = 'button';
          b.onclick = () => { if (pendingPromotion.includes(move)) { $('promotion-dialog').close();tryMove(move); }};
          $('promotions').append(b);
        });
        $('promotion-dialog').showModal();
        return;
      }
    }
    const piece = engine.pieceAt(state,square);
    if (piece && piece === piece.toUpperCase()) {
      selected = square;
      const n = moves.filter(m => m.from === square).length;
      message('info',square + ' · Ақ ' + names[piece.toLowerCase()], n ?
        'Белгіленген ұялардың бірін бас.' : 'Бұл фигураның қазір заңды жүрісі жоқ. Басқа ақ фигураны таңда.');
    } else if (selected) message('bad','Бұл ұяға жүре алмайсың','Тақтада белгіленген ұяны бас немесе басқа ақ фигураны таңда.');
    else message('info','Алдымен ақ фигураны таңда','Содан кейін баратын ұяны бас.');
    draw();
  }
  function start(c, scroll = false) {
    clearTimeout(thinkingTimer);
    puzzle = c; state = engine.parse(c.fen); stage = 'start'; selected = null; lastMove = null;
    guideSquares = []; lastAnalysis = ''; logs = []; pendingPromotion = []; focusedSquare = 'e5';
    $('case-number').textContent = 'Іс ' + pad(cases.indexOf(c) + 1);
    $('case-theme').textContent = themes[c.theme] + ' · ' + levels[c.level];
    $('case-title').textContent = c.title;
    $('case-goal').textContent = c.goal;
    $('hint-box').hidden = true;
    $('reveal').hidden = false;
    $('reason').open = false;
    message('info','Ақтармен ойнайсың','Алдымен фигураны, содан кейін баратын ұяны бас.');
    draw();
    if (scroll) window.scrollTo({top:0,behavior:'auto'});
  }
  function showHint(reveal) {
    if (stage === 'done' || stage === 'thinking') return;
    if (stage === 'start') {
      progress.helped.add(puzzle.id);
      save();
    }
    $('hint-box').hidden = false;
    $('hint-text').textContent = stage === 'follow' ? 'Қос шабуыл жасаған ат әлі де уәзірге шабуылдап тұр.' : puzzle.hint;
    $('reveal').hidden = reveal;
    if (reveal) {
      const code = stage === 'follow' ? puzzle.followUp : puzzle.solutions[0];
      guideSquares = [code.slice(0,2),code.slice(2,4)];
      selected = code.slice(0,2);
      $('hint-text').textContent += ' Жүріс: ' + guideSquares.join(' → ') + '.';
      message('info','Жүріс тақтада белгіленді','Белгіленген баратын ұяны бас.');
      draw();
    }
  }
  $('hint').onclick = () => showHint(false);
  $('reveal').onclick = () => showHint(true);
  $('restart').onclick = () => start(puzzle);
  $('next').onclick = () => {const rec = nextRecommendation();if (rec) start(rec.puzzle,true);};
  function renderCases() {
    const list = $('case-list');
    list.replaceChildren();
    cases.filter(c => (!$('theme-filter').value || $('theme-filter').value === c.theme) &&
      (!$('level-filter').value || Number($('level-filter').value) === c.level)).forEach(c => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'case-row' + (puzzle.id === c.id ? ' current' : '');
      const detail = document.createElement('span');
      detail.append(text('strong',c.title),text('small',themes[c.theme] + ' · ' + levels[c.level]));
      b.append(text('span',pad(cases.indexOf(c)+1),'num'), detail);
      if (progress.completed.has(c.id)) {
        const mark=text('span','✓','complete-tick');
        mark.setAttribute('aria-label','Іс шешілді');
        b.append(mark);
      }
      b.onclick = () => { $('cases-dialog').close();start(c,true); };
      list.append(b);
    });
    if (!list.children.length) list.append(text('p','Осы шарттарға сай іс табылмады. Басқа тактиканы немесе деңгейді таңда.','small-note'));
  }
  for (const [key, title] of Object.entries(themes)) {
    const o = document.createElement('option');
    o.value = key; o.textContent = title;
    $('theme-filter').append(o);
  }
  $('open-cases').onclick = () => {renderCases();$('cases-dialog').showModal();};
  $('theme-filter').onchange = $('level-filter').onchange = renderCases;
  function renderProgress() {
    $('stats').replaceChildren();
    $('progress-summary').textContent = cases.length + ' істің ' + progress.completed.size +
      ' шешілді. Баға әр істегі алғашқы заңды жүріс бойынша есептеледі. Ишара қолданылған шешім өз бетіңше табылған жүріске жатпайды.';
    for (const [key,title] of Object.entries(themes)) {
      const info = learn.stats(progress.model,key);
      const part = document.createElement('div');part.className = 'stat';
      const line = document.createElement('div');line.className = 'skill-line';
      line.append(text('span',title),text('strong',percent(info.p)));
      part.append(line,text('small','Өз бетіңше: ' + info.correct + '. Есепке алынған іс: ' + info.n + '.'));
      $('stats').append(part);
    }
    $('target').value = progress.target.toString();
    $('suggestion').textContent = explainNext(nextRecommendation());
    $('storage-note').textContent = diskWorks ? 'Нәтижелер осы браузерде сақталады.' : 'Браузерде сақтау қолжетімсіз. Нәтижелер осы ашық бетте сақталады.';
  }
  $('target').onchange = () => {progress.target = Number($('target').value);save();renderProgress();refreshNotebook();};
  $('open-progress').onclick = () => {renderProgress();$('progress-dialog').showModal();};
  $('open-suggested').onclick = () => {const rec = nextRecommendation();if (rec) { $('progress-dialog').close();start(rec.puzzle,true); }};
  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.querySelector('[data-close]').onclick = () => dialog.close();
    dialog.addEventListener('click', e => {
      if (e.target !== dialog) return;
      const r = dialog.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close();
    });
  });
  createBoard();
  start(cases[0]);
})();
