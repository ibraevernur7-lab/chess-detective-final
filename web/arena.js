/* Full-game view. Only the match engine owns chess outcomes and evaluations. */
(function (root) {
  'use strict';
  const engine = root.ChessEngine;
  const match = root.ChessMatch;
  const files = 'abcdefgh';
  const names = {p:'пешка', n:'ат', b:'піл', r:'тура', q:'уәзір', k:'король'};
  const grades = {good:'Жақсы жүріс', inaccuracy:'Дәлсіздік', mistake:'Қате', blunder:'Өрескел қате'};
  const phases = {before:'Жүріске дейін', after:'Менің жүрісім', bestAfter:'AI ұсынған жүріс'};
  const storageKey = 'chess-detective.match.v1';
  const squareButtons = new Map();
  let game, active = false, loaded = false, depth = 2, aiTimer, reviewTimer;
  let legal = [], selected = '', focusSquare = 'e2', promotedMoves = [];
  let review = [], reviewIndex = -1, phase = 'after';
  let logLength = -1, saveFailed = false;
  const $ = id => document.getElementById('arena-' + id);
  const view = () => document.getElementById('arena-view');

  const template = `
    <div class="intro arena-intro"><div class="intro-copy"><div class="case-meta">Толық партия</div><h1 tabindex="-1" id="arena-title">AI-ға қарсы ойна</h1><p>Ақтармен ойна. Партия біткенде, өз жүрісің мен AI ұсынған нұсқаны тақтада салыстыр.</p></div><div class="intro-art" aria-hidden="true"></div></div>
    <div class="game-layout arena-layout">
      <section class="board-area" aria-label="Партия тақтасы">
        <div class="board-top"><h2 id="arena-board-title">Шахмат тақтасы</h2><span class="turn" id="arena-turn"><i aria-hidden="true"></i><span></span></span></div>
        <div class="board-frame"><div class="board" id="arena-board" tabindex="-1" role="group" aria-label="Толық партияның шахмат тақтасы"></div></div>
        <div id="arena-status" class="feedback" role="status" aria-live="polite"><span class="feedback-mark" aria-hidden="true">i</span><div><strong id="arena-status-title"></strong><p id="arena-status-copy"></p></div></div>
        <div id="arena-promotion" class="arena-choice" hidden><h3>Пешканы қай фигураға алмастырасың?</h3><div id="arena-promotion-buttons" class="arena-controls"></div></div>
        <div id="arena-replay" class="arena-choice" hidden><label for="arena-review-select">Талдайтын ақ жүріс</label><select id="arena-review-select"></select><div id="arena-phases" class="arena-controls" role="group" aria-label="Тақтадағы жүрісті салыстыру"></div></div>
      </section>
      <aside class="notebook arena-notebook" aria-label="Партия мәліметі">
        <div class="notebook-top"><div class="notebook-mark" aria-hidden="true"><i></i><i></i><i></i></div><h2 id="arena-notes-title">Партия журналы</h2></div>
        <div class="notebook-content">
          <section id="arena-settings"><label for="arena-level">Қарсыластың деңгейі</label><select id="arena-level"><option value="1">Жеңіл · 1 жарты жүріс</option><option value="2" selected>Орташа · 2 жарты жүріс</option></select></section>
          <section id="arena-report" hidden><h3>Ақтардың жүрістерін талдау</h3><p class="arena-note" id="arena-review-summary" role="status"></p><div id="arena-report-body" hidden><strong id="arena-grade"></strong><dl class="arena-comparison"><div><dt>Сен ойнадың</dt><dd id="arena-your-move"></dd></div><div><dt>AI ұсынады</dt><dd id="arena-best-move"></dd></div></dl><p class="arena-note" id="arena-explain"></p></div><p id="arena-method" class="arena-method" hidden>Талдау ақтың жүрісі мен қараның жауабын қарайды. Позиция бағасындағы 100 ұпай шамамен бір пешкаға тең.</p></section>
          <section><div class="section-heading"><h3>Жүрістер</h3><span class="number-chip" id="arena-count">0</span></div><p class="empty-log" id="arena-empty">Алғашқы жүрісің осында жазылады.</p><div id="arena-log-box" class="arena-log-box" hidden><table class="arena-log"><thead><tr><th scope="col">№</th><th scope="col">Ақтар</th><th scope="col">Қаралар</th></tr></thead><tbody id="arena-log"></tbody></table></div></section>
          <div class="arena-match-actions"><button id="arena-resign" class="text-btn" type="button">Берілу</button><button id="arena-new" class="button accent" type="button" hidden>Жаңа партия</button><p id="arena-storage" class="arena-note" hidden>Бұл браузерде партия тек осы терезе ашық тұрғанда сақталады.</p></div>
          <div id="arena-confirm" class="arena-confirm" hidden><strong>Берілесің бе?</strong><p>Партия қаралардың жеңісімен аяқталады. Жүрістеріңді содан кейін талдай аласың.</p><div class="arena-controls"><button type="button" class="button light" id="arena-cancel">Ойынды жалғастыру</button><button type="button" class="arena-resign-confirm" id="arena-confirm-resign">Иә, берілемін</button></div></div>
        </div>
      </aside>
    </div>`;

  function element(tag, value, cls) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (value !== undefined) node.textContent = value;
    return node;
  }
  function pieceURL(piece) {
    const color = piece === piece.toUpperCase() ? 'w' : 'b';
    const path = 'assets/pieces/' + color + piece.toUpperCase() + '.png';
    return root.CHESS_INLINE?.[path] || path;
  }
  function pieceLabel(piece) {
    return piece ? (piece === piece.toUpperCase() ? 'ақ ' : 'қара ') + names[piece.toLowerCase()] : 'бос ұя';
  }
  function notation(uci) {
    if (!uci) return '—';
    const suffix = uci[4] ? ' = ' + names[uci[4]] : '';
    return uci.slice(0, 2) + '–' + uci.slice(2, 4) + suffix;
  }
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
      if (!saved || !Array.isArray(saved.moves) || saved.version !== 1) return match.create();
      let restored = match.create();
      for (const move of saved.moves) restored = match.push(restored, move);
      depth = saved.depth === 1 ? 1 : 2;
      return saved.resigned && !restored.result ? match.resign(restored) : restored;
    } catch { return match.create(); }
  }
  function persist() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({version:1, depth,
        moves:game.history.map(entry => entry.move), resigned:game.result?.reason === 'resign'}));
      saveFailed = false;
    } catch { saveFailed = true; }
    $('storage').hidden = !saveFailed;
  }
  function buildBoard() {
    const board = $('board');
    for (let rank = 8; rank >= 1; rank--) {
      for (let col = 0; col < files.length; col++) {
        const file = files[col], square = file + rank;
        const button = element('button', undefined, 'sq' + ((rank + col) % 2 ? ' dark' : ''));
        button.type = 'button'; button.dataset.square = square;
        if (col === 0) button.append(element('span', rank, 'coord'));
        if (rank === 1) button.append(element('span', file, 'coord file'));
        button.addEventListener('click', () => { focusSquare = square; tap(square); });
        button.addEventListener('keydown', event => {
          const delta = {ArrowLeft:[-1,0], ArrowRight:[1,0], ArrowUp:[0,1], ArrowDown:[0,-1]}[event.key];
          if (!delta) return;
          event.preventDefault();
          const next = files[Math.min(7, Math.max(0, col + delta[0]))] + Math.min(8, Math.max(1, rank + delta[1]));
          button.tabIndex = -1; focusSquare = next;
          squareButtons.get(next).tabIndex = 0; squareButtons.get(next).focus();
        });
        squareButtons.set(square,button); board.append(button);
      }
    }
  }
  function drawBoard() {
    const row = review[reviewIndex];
    const state = game.result && row ? engine.parse(row[phase]) : game.state;
    const move = game.result && row ? (phase === 'bestAfter' ? row.best : phase === 'after' ? row.played : '') : game.history.at(-1)?.move;
    const targets = new Set(selected ? legal.filter(m => m.from === selected).map(m => m.to) : []);
    const check = engine.inCheck(state) ? (state.turn === 'b' ? 'k' : 'K') : null;
    for (const [square,button] of squareButtons) {
      const piece = engine.pieceAt(state,square);
      if ((button.dataset.piece || '') !== (piece || '')) {
        button.querySelector('img')?.remove(); button.dataset.piece = piece || '';
        if (piece) {
          const image = element('img'); image.alt = ''; image.draggable = false; image.src = pieceURL(piece); button.append(image);
        }
      }
      button.classList.toggle('has-piece',Boolean(piece));
      button.classList.toggle('selected',selected === square);
      button.classList.toggle('legal',targets.has(square));
      button.classList.toggle('past',Boolean(move && (move.slice(0,2) === square || move.slice(2,4) === square)));
      button.classList.toggle('arena-check',Boolean(piece && piece === check));
      button.setAttribute('aria-pressed',String(square === selected));
      button.setAttribute('aria-label',square + ', ' + pieceLabel(piece) + (targets.has(square) ? ', заңды жүріс' : ''));
      button.tabIndex = square === focusSquare ? 0 : -1;
    }
  }
  function setStatus(title, copy) {
    $('status-title').textContent = title; $('status-copy').textContent = copy;
  }
  function outcome() {
    const result = game.result;
    if (result.reason === 'resign') return 'Сен берілдің. Қаралар жеңді.';
    if (result.reason === 'checkmate') return result.winner === 'w' ? 'Мат! Сен жеңдің.' : 'Мат. Қаралар жеңді.';
    return {stalemate:'Пат. Партия тең аяқталды.', material:'Матқа жеткілікті фигура қалмады. Тең ойын.',
      repetition:'Бір позиция үш рет қайталанды. Тең ойын.', fifty:'Пешка жүрмей, фигура алынбай 50 жүріс өтті. Тең ойын.'}[result.reason] || 'Партия тең аяқталды.';
  }
  function logMoves() {
    const total = game.history.length;
    if (logLength === total) return;
    logLength = total;
    $('count').textContent = total; $('empty').hidden = total > 0; $('log-box').hidden = !total;
    $('log').replaceChildren();
    for (let i = 0; i < total; i += 2) {
      const row = element('tr');
      row.append(element('th',game.history[i].number),element('td',notation(game.history[i].move)),element('td',notation(game.history[i+1]?.move)));
      $('log').append(row);
    }
    $('log-box').scrollTop = $('log-box').scrollHeight;
  }
  function render() {
    legal = game.result || game.state.turn !== 'w' ? [] : engine.legal(game.state);
    const over = Boolean(game.result), black = game.state.turn === 'b';
    $('turn').className = 'turn' + (over ? ' complete' : black ? ' thinking' : '');
    $('turn').lastElementChild.textContent = over ? 'Партия аяқталды' : black ? 'AI ойлануда' : 'Ақтардың жүрісі';
    $('board-title').textContent = over && reviewIndex >= 0 ? 'Партияны талдау' : 'Шахмат тақтасы';
    $('settings').hidden = over; $('resign').hidden = over; $('new').hidden = !over;
    $('report').hidden = !over; $('notes-title').textContent = over ? 'Партия қорытындысы' : 'Партия журналы';
    $('promotion').hidden = !promotedMoves.length; $('level').value = String(depth);
    if (over) setStatus(outcome(),reviewIndex >= 0 ? 'Төменнен жүрісті таңдап, екі нұсқаны салыстыр.' : 'Партияның соңғы позициясы.');
    else if (black) setStatus('Қаралардың жүрісі','AI заңды жүрістерді салыстырып жатыр.');
    else if (engine.inCheck(game.state)) setStatus('Корольге шах берілді','Корольді қорғау үшін заңды жүріс таңда.');
    else if (selected) setStatus(pieceLabel(engine.pieceAt(game.state,selected)) + ' · ' + selected,'Белгіленген ұялардың бірін таңда.');
    else setStatus('Сен ақтармен ойнайсың',game.history.length ? 'Фигураңды, содан кейін баратын ұяны түрт.' : 'Бастау үшін ақ пешканы немесе атты түрт.');
    drawBoard(); logMoves();
  }
  function clearChoice() { selected = ''; promotedMoves = []; $('promotion').hidden = true; }
  function scheduleBlack() {
    clearTimeout(aiTimer);
    if (!active || game.result || game.state.turn !== 'b') return;
    aiTimer = setTimeout(() => {
      if (!active || game.result || game.state.turn !== 'b') return;
      const move = match.ai(game,depth);
      if (move) play(move);
    },180);
  }
  function play(code) {
    game = match.push(game, code);
    clearChoice(); $('confirm').hidden = true; persist(); render();
    if (game.result) startReview(); else scheduleBlack();
  }
  function offerPromotion(candidates) {
    promotedMoves = candidates; $('promotion').hidden = false;
    $('promotion-buttons').replaceChildren();
    for (const move of candidates) {
      const button = element('button',names[move.promotion], 'button light'); button.type = 'button';
      button.addEventListener('click',() => play(engine.uci(move))); $('promotion-buttons').append(button);
    }
    setStatus('Пешка соңғы қатарға жетеді','Тақтаның астынан жаңа фигураны таңда.');
    $('promotion-buttons').firstElementChild?.focus();
  }
  function tap(square) {
    if (game.result || game.state.turn !== 'w') return;
    const candidates = legal.filter(m => m.from === selected && m.to === square);
    if (candidates.length === 1) { play(engine.uci(candidates[0])); return; }
    if (candidates.length > 1) { offerPromotion(candidates); return; }
    const piece = engine.pieceAt(game.state,square);
    if (piece && piece === piece.toUpperCase()) {
      selected = selected === square ? '' : square; promotedMoves = []; render();
      if (selected && !legal.some(m => m.from === square)) setStatus('Бұл фигура әзірге жүре алмайды','Басқа ақ фигураны таңда.');
    } else {
      const hadSelection = Boolean(selected); clearChoice(); render();
      if (hadSelection) setStatus('Бұл жүріске рұқсат жоқ','Ақ фигураны қайта таңдап, белгіленген ұяға жүр.');
    }
  }
  function renderReview() {
    const row = review[reviewIndex];
    $('report-body').hidden = !row; $('replay').hidden = !row; $('method').hidden = !row;
    if (!row) return;
    $('review-select').value = String(reviewIndex);
    $('grade').textContent = grades[row.severity]; $('grade').dataset.grade = row.severity;
    $('your-move').textContent = notation(row.played); $('best-move').textContent = notation(row.best);
    const margin = row.mateSwing || row.loss === 0 ? '' : ' Бағалар айырмасы — ' + row.loss + ' ұпай.';
    $('explain').textContent = row.detail + margin;
    for (const button of $('phases').children) button.setAttribute('aria-pressed',String(button.dataset.phase === phase));
    $('board').setAttribute('aria-label',row.number + '-жүріс. ' + phases[phase] + '.');
    render();
  }
  function selectRow(index) {
    if (!review[index]) return;
    reviewIndex = index; phase = 'after'; renderReview();
  }
  function startReview() {
    clearTimeout(reviewTimer);
    if (!active || !game.result) return;
    const whiteMoves = game.history.filter(entry => entry.side === 'w');
    if (!whiteMoves.length) {
      $('review-summary').textContent = 'Ақтар жүріс жасамады. Жаңа партияда жүріс жасағаннан кейін оны талдай аласың.';
      return;
    }
    const complete = () => {
      const issues = review.filter(row => row.severity !== 'good').length;
      $('review-summary').textContent = 'Талданған ақ жүріс: ' + review.length + '. ' + (issues ? 'Талдауға тұрарлық жүріс: ' + issues + '.' : 'Осы тереңдікте елеулі қате табылмады.');
      $('review-select').replaceChildren();
      review.forEach((row,i) => {
        const opt = element('option',row.number + '. ' + notation(row.played) + ' · ' + grades[row.severity]);
        opt.value = String(i); $('review-select').append(opt);
      });
      if (reviewIndex < 0) {
        const worst = review.reduce((best,current,i) => current.loss > review[best].loss ? i : best,0);
        selectRow(worst);
      } else renderReview();
    };
    const step = () => {
      if (!active) return;
      if (review.length === whiteMoves.length) { complete(); return; }
      review.push(match.analyze(whiteMoves[review.length]));
      $('review-summary').textContent = 'Жүрістер талдануда · ' + review.length + ' / ' + whiteMoves.length;
      reviewTimer = setTimeout(step,0);
    };
    if (review.length === whiteMoves.length) complete();
    else { $('review-summary').textContent = 'Ақтардың жүрістері талдануда…'; reviewTimer = setTimeout(step,0); }
  }
  function restart() {
    clearTimeout(aiTimer); clearTimeout(reviewTimer);
    game = match.create(); clearChoice(); review = []; reviewIndex = -1; phase = 'after'; focusSquare = 'e2';
    logLength = -1; $('confirm').hidden = true; $('replay').hidden = true; $('report-body').hidden = true; $('method').hidden = true;
    $('board').setAttribute('aria-label','Толық партияның шахмат тақтасы');
    persist(); render(); $('title').focus({preventScroll:true});
  }
  function mount() {
    view().innerHTML = template; buildBoard(); game = load();
    for (const [key,label] of Object.entries(phases)) {
      const button = element('button',label,'arena-phase'); button.type = 'button'; button.dataset.phase = key;
      button.addEventListener('click',() => { phase = key; renderReview(); }); $('phases').append(button);
    }
    $('review-select').addEventListener('change',() => selectRow(Number($('review-select').value)));
    $('level').addEventListener('change',() => { depth = Number($('level').value) === 1 ? 1 : 2; persist(); });
    $('resign').addEventListener('click',() => { $('confirm').hidden = false; $('cancel').focus(); });
    $('cancel').addEventListener('click',() => { $('confirm').hidden = true; $('resign').focus(); });
    $('confirm-resign').addEventListener('click',() => {
      if (game.result) return;
      clearTimeout(aiTimer); clearChoice(); game = match.resign(game); $('confirm').hidden = true;
      persist(); render(); startReview(); $('new').focus({preventScroll:true});
    });
    $('new').addEventListener('click',restart);
    loaded = true;
  }
  function open() {
    if (!loaded) mount();
    active = true; view().hidden = false; render();
    if (game.result) startReview(); else scheduleBlack();
  }
  function leave() {
    active = false; clearTimeout(aiTimer); clearTimeout(reviewTimer);
    if (loaded) { clearChoice(); $('confirm').hidden = true; view().hidden = true; }
  }
  root.ChessArena = {open,leave};
})(window);
