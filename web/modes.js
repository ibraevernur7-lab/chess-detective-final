(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  const views = {modes: byId('mode-view'), detective: byId('puzzle-view'), match: byId('arena-view')};
  let current;

  function diagram(id, fen) {
    const element = byId(id);
    const position = window.ChessEngine.parse(fen);
    for (let index = 0; index < 64; index++) {
      const coordinate = 'abcdefgh'[index % 8] + (8 - Math.floor(index / 8));
      const piece = window.ChessEngine.pieceAt(position, coordinate);
      const square = document.createElement('span');
      const dark = ((index % 8) + Math.floor(index / 8)) % 2 === 1;
      if (dark) square.className = 'mini-dark';
      if (piece) {
        const image = document.createElement('img');
        const path = 'assets/pieces/' + (piece === piece.toUpperCase() ? 'w' : 'b') + piece.toUpperCase() + '.png';
        image.src = window.CHESS_INLINE?.[path] || path;
        image.alt = '';
        square.append(image);
      }
      element.append(square);
    }
  }

  function route() {
    const key = window.location.hash.slice(1);
    const mode = Object.hasOwn(views, key) ? key : 'modes';
    if (mode === current) return;
    const returning = current !== undefined;
    if (current === 'match') window.ChessArena.leave();
    for (const [name, view] of Object.entries(views)) view.hidden = name !== mode;
    byId('open-cases').hidden = mode !== 'detective';
    byId('open-progress').hidden = mode !== 'detective';
    byId('mode-menu-link').hidden = mode === 'modes';
    document.body.dataset.mode = mode;
    current = mode;
    if (mode === 'match') window.ChessArena.open();
    if (returning) {
      const title = views[mode].querySelector('h1,h2') || views[mode];
      title.tabIndex = -1;
      title.focus({preventScroll:true});
      window.scrollTo({top:0,behavior:'auto'});
    }
  }

  diagram('mini-case', window.ChessCases[0].fen);
  diagram('mini-match', window.ChessEngine.START_FEN);
  byId('skip-content').addEventListener('click', event => {
    event.preventDefault();
    const view = views[current];
    const destination = view.querySelector('[role="group"], a, button, h1') || view;
    destination.focus();
    destination.scrollIntoView({block:'nearest'});
  });
  window.addEventListener('hashchange', route);
  route();
})();
