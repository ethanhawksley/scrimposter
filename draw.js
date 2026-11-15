export function draw(state, localState, roomCode, userID) {
  closeActiveGameModal();
  const isLobby = state.state === 'lobby';
  const isTurn = !isLobby && state.turn === localState.name;
  const isHost = state.host === localState.name;
  const canControlLobby = isLobby && !state.returned_to_lobby;
  const isImposter = localState.role === 'imposter';
  const hasVoted = state.voted_players?.includes(localState.name) ?? false;
  const heading = isLobby
    ? 'Lobby'
    : state.state === 'prompt'
      ? 'Game starting'
      : state.state === 'vote'
        ? 'Vote for the imposter'
        : state.state === 'results'
          ? 'Round results'
            : state.state === 'imposter_guess'
              ? 'The imposter must guess'
      : isTurn
        ? 'Your turn'
        : `${state.turn}'s turn`;
  const codeControls = isHost && canControlLobby
    ? `<button id="toggle-code-visibility">${state.code_visible ? 'Hide' : 'Show'} Lobby Code</button>`
    : '';
  const visibleCode = state.code_visible
    ? `<p>Lobby code: <strong>${state.room_code}</strong></p>`
    : '';
  const voteChoices = state.players
    .map(player => `<button class="btn btn-primary vote-choice" data-vote-target="${escapeHtml(player.name)}">${escapeHtml(player.name)}</button>`)
    .join('');

  const html = `
<h2>${heading}</h2>
${visibleCode}
${codeControls}
<p>Players</p>
<ol>${state.players.map(player => `<li style='color:${player.colour};${player.name === state.turn && 'text-decoration:underline;'}'>${player.name}${player.name === state.host ? ' (host)' : ''}</li>`).join('')}</ol>
${isHost && canControlLobby ? '<button id="start-game">Start Game</button>' : ''}
${state.returned_to_lobby ? '<p>Waiting for the other players to return to the lobby...</p>' : ''}
${isLobby ? '' : `
<div class="drawing-area">
  <canvas id="canvas" width="400" height="400"></canvas>
  <aside class="ink-panel">
    ${state.players.map(player => `
      <div class="ink-player">
        <strong style="color:${escapeHtml(player.colour)}">${escapeHtml(player.name)}</strong>
        <div class="progress" aria-label="${escapeHtml(player.name)} ink remaining">
          <div class="progress-bar ink-progress" data-ink-player="${escapeHtml(player.name)}"
               role="progressbar" style="width:${inkPercent(player)}%">
          </div>
        </div>
        <small>${player.ink_remaining} / ${player.max_ink} pixels</small>
      </div>`).join('')}
  </aside>
</div>`}
${state.state === 'vote' ? `
<div class="modal fade game-modal" id="game-modal" tabindex="-1" role="dialog" aria-labelledby="vote-title">
  <div class="modal-dialog modal-dialog-centered" role="document"><div class="modal-content">
    <div class="modal-header"><h3 class="modal-title" id="vote-title">Who is the imposter?</h3></div>
    <div class="modal-body">
      <p>Choose one player. A tie counts as a skip.</p>
      <div class="vote-grid">${voteChoices}</div>
      <button class="btn btn-default vote-choice vote-skip" data-vote-target="skip">Skip and draw again</button>
      ${hasVoted ? '<p class="vote-waiting">Vote submitted. Waiting for the other players...</p>' : ''}
    </div>
  </div></div>
</div>` : ''}
${state.state === 'imposter_guess' && isImposter ? `
<div class="modal fade game-modal" id="game-modal" tabindex="-1" role="dialog">
  <div class="modal-dialog modal-dialog-centered" role="document"><div class="modal-content">
    <div class="modal-header"><h3 class="modal-title">Guess the secret word</h3></div>
    <div class="modal-body"><input class="form-control" id="prompt-guess" type="text" autocomplete="off"></div>
    <div class="modal-footer"><button class="btn btn-primary" id="submit-guess">Submit guess</button></div>
  </div></div>
</div>` : ''}
${state.state === 'imposter_guess' && !isImposter ? `
<div class="modal fade game-modal" id="game-modal" tabindex="-1" role="dialog">
  <div class="modal-dialog modal-dialog-centered" role="document"><div class="modal-content">
    <div class="modal-header"><h3 class="modal-title">The imposter is guessing</h3></div>
    <div class="modal-body"><p>Wait while the imposter tries to identify the secret word.</p></div>
  </div></div>
</div>` : ''}
${state.state === 'results' && state.result ? `
<div class="modal fade game-modal" id="game-modal" tabindex="-1" role="dialog">
  <div class="modal-dialog modal-dialog-centered" role="document"><div class="modal-content">
    <div class="modal-header"><h3 class="modal-title">${escapeHtml(state.result.outcome ?? 'Game over')}</h3></div>
    <div class="modal-body">
      <p>The prompt was <strong>${escapeHtml(state.result.prompt ?? 'Unknown')}</strong>.</p>
      <p>The imposter was <strong>${escapeHtml(state.result.imposter ?? 'Unknown')}</strong>.</p>
    </div>
    <div class="modal-footer">
      <button class="btn btn-primary" id="return-lobby">Return to lobby</button>
      <button class="btn btn-default" id="return-menu">Main menu</button>
    </div>
  </div></div>
</div>` : ''}
${isTurn ? '<button id="finish-drawing">Finish Drawing</button>' : ''}
  `;

  document.getElementById('app').innerHTML = html;

  const modal = document.getElementById('game-modal');
  if (modal && window.jQuery) {
    window.jQuery(modal).modal({ backdrop: 'static', keyboard: false });
  }

  function closeActiveGameModal() {
    const activeModal = document.querySelector('#app .game-modal');
    if (activeModal && window.jQuery) {
      window.jQuery(activeModal).modal('hide');
    }
    document.querySelectorAll('.modal-backdrop').forEach(backdrop => backdrop.remove());
    document.body.classList.remove('modal-open');
    document.body.style.removeProperty('padding-right');
  }

  if (isHost && canControlLobby) {
    document.getElementById('toggle-code-visibility').addEventListener('click', () => {
      document.getElementById('toggle-code-visibility').disabled = true;
      toggleCodeVisibility();
    });
  }

  if (isHost && canControlLobby) {
    document.getElementById('start-game').addEventListener('click', () => {
      document.getElementById('start-game').disabled = true;
      startGame();
    });
  }

  if (isLobby) {
    return;
  }

  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');
  const inkLayer = document.createElement('canvas');
  inkLayer.width = canvas.width;
  inkLayer.height = canvas.height;
  const inkCtx = inkLayer.getContext('2d');

  if (state.latest_image) {
    const image = new Image();
    image.onload = () => ctx.drawImage(image, 0, 0);
    image.src = state.latest_image;
  }

  if (isTurn) {
    enableDrawing(state, localState, canvas, ctx, inkCtx);
    window.currentInkUsed = () => countInkPixels(inkLayer);
    document.getElementById('finish-drawing').addEventListener('click', () => {
      document.getElementById('finish-drawing').disabled = true;
      const pngUrl = canvas.toDataURL('image/png');
      submitTurn(pngUrl);
    });
  } else {
    window.currentInkUsed = () => 0;
  }

  if (state.state === 'vote') {
    document.querySelectorAll('.vote-choice').forEach(button => {
      button.disabled = hasVoted;
      button.addEventListener('click', () => {
        document.querySelectorAll('.vote-choice').forEach(choice => {
          choice.disabled = true;
        });
        vote(button.dataset.voteTarget);
      });
    });
  }

  if (state.state === 'imposter_guess' && isImposter) {
    document.getElementById('submit-guess').addEventListener('click', () => {
      const guess = document.getElementById('prompt-guess').value.trim();
      if (!guess) return;
      document.getElementById('submit-guess').disabled = true;
      guessPrompt(guess);
    });
  }

  if (state.state === 'results') {
    document.getElementById('return-lobby').addEventListener('click', returnToLobby);
    document.getElementById('return-menu').addEventListener('click', returnToMainMenu);
  }
}

function inkPercent(player) {
  const maxInk = player.max_ink || 1;
  return Math.max(0, Math.min(100, (player.ink_remaining / maxInk) * 100));
}

function countInkPixels(canvas) {
  const alpha = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let pixels = 0;
  for (let index = 3; index < alpha.length; index += 4) {
    if (alpha[index] > 0) pixels += 1;
  }
  return pixels;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, character => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  }[character]));
}

function enableDrawing(state, localState, canvas, ctx, inkCtx) {
  ctx.strokeStyle = localState.colour;
  inkCtx.strokeStyle = localState.colour;
  ctx.lineJoin = 'round';
  inkCtx.lineJoin = 'round';
  ctx.lineWidth = 5;
  inkCtx.lineWidth = 5;
  const maxInk = state.players.find(player => player.name === localState.name)?.max_ink ?? 2000;

  const clickX = [];
  const clickY = [];
  const clickDrag = [];
  let paint;

  function addClick(x, y, dragging) {
    clickX.push(x);
    clickY.push(y);
    clickDrag.push(dragging);
  }

  function redraw() {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

    for (let i = 0; i < clickX.length; i += 1) {
      if (!clickDrag[i] && i === 0) {
        ctx.beginPath();
        ctx.moveTo(clickX[i], clickY[i]);
        ctx.stroke();
      } else if (!clickDrag[i] && i > 0) {
        ctx.closePath();

        ctx.beginPath();
        ctx.moveTo(clickX[i], clickY[i]);
        ctx.stroke();
      } else {
        ctx.lineTo(clickX[i], clickY[i]);
        ctx.stroke();
      }
    }
  }

  function drawNew() {
    const i = clickX.length - 1;
    const visibleBefore = ctx.getImageData(0, 0, ctx.canvas.width, ctx.canvas.height);
    const before = inkCtx.getImageData(0, 0, inkCtx.canvas.width, inkCtx.canvas.height);
    if (!clickDrag[i]) {
      if (clickX.length === 0) {
        ctx.beginPath();
        ctx.moveTo(clickX[i], clickY[i]);
        ctx.stroke();
        inkCtx.beginPath();
        inkCtx.moveTo(clickX[i], clickY[i]);
        inkCtx.stroke();
      } else {
        ctx.closePath();
        ctx.beginPath();
        ctx.moveTo(clickX[i], clickY[i]);
        ctx.stroke();
        inkCtx.closePath();
        inkCtx.beginPath();
        inkCtx.moveTo(clickX[i], clickY[i]);
        inkCtx.stroke();
      }
    } else {
      ctx.lineTo(clickX[i], clickY[i]);
      ctx.stroke();
      inkCtx.lineTo(clickX[i], clickY[i]);
      inkCtx.stroke();
    }
    if (countInkPixels(inkCtx.canvas) > maxInk) {
      inkCtx.putImageData(before, 0, 0);
      clickX.pop();
      clickY.pop();
      clickDrag.pop();
      ctx.putImageData(visibleBefore, 0, 0);
      return;
    }
    updateInkBar(countInkPixels(inkCtx.canvas), maxInk);
  }

  function updateInkBar(used, max) {
    const remaining = Math.max(0, max - used);
    const bar = document.querySelector(`[data-ink-player="${CSS.escape(localState.name)}"]`);
    const label = bar?.parentElement?.nextElementSibling;
    if (bar) bar.style.width = `${(remaining / max) * 100}%`;
    if (label) label.textContent = `${remaining} / ${max} pixels`;
  }

  function mouseDownEventHandler(e) {
    paint = true;
    const x = e.pageX - canvas.offsetLeft;
    const y = e.pageY - canvas.offsetTop;
    if (paint) {
      addClick(x, y, false);
      drawNew();
    }
  }

  function touchstartEventHandler(e) {
    paint = true;
    if (paint) {
      addClick(e.touches[0].pageX - canvas.offsetLeft, e.touches[0].pageY - canvas.offsetTop, false);
      drawNew();
    }
  }

  function mouseUpEventHandler(e) {
    ctx.closePath();
    paint = false;
  }

  function mouseMoveEventHandler(e) {
    const x = e.pageX - canvas.offsetLeft;
    const y = e.pageY - canvas.offsetTop;
    if (paint) {
      addClick(x, y, true);
      drawNew();
    }
  }

  function touchMoveEventHandler(e) {
    if (paint) {
      addClick(e.touches[0].pageX - canvas.offsetLeft, e.touches[0].pageY - canvas.offsetTop, true);
      drawNew();
    }
  }

  function setUpHandler(isMouseandNotTouch, detectEvent) {
    removeRaceHandlers();
    if (isMouseandNotTouch) {
      canvas.addEventListener('mouseup', mouseUpEventHandler);
      canvas.addEventListener('mousemove', mouseMoveEventHandler);
      canvas.addEventListener('mousedown', mouseDownEventHandler);
      mouseDownEventHandler(detectEvent);
    } else {
      canvas.addEventListener('touchstart', touchstartEventHandler);
      canvas.addEventListener('touchmove', touchMoveEventHandler);
      canvas.addEventListener('touchend', mouseUpEventHandler);
      touchstartEventHandler(detectEvent);
    }
  }

  function mouseWins(e) {
    setUpHandler(true, e);
  }

  function touchWins(e) {
    setUpHandler(false, e);
  }

  function removeRaceHandlers() {
    canvas.removeEventListener('mousedown', mouseWins);
    canvas.removeEventListener('touchstart', touchWins);
  }

  canvas.addEventListener('mousedown', mouseWins);
  canvas.addEventListener('touchstart', touchWins);
}