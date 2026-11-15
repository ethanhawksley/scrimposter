export function draw(state, localState, roomCode, userID) {
  const isLobby = state.state === 'lobby';
  const isTurn = !isLobby && state.turn === localState.name;
  const isHost = state.host === localState.name;
  const hasVoted = state.voted_players?.includes(localState.name) ?? false;
  const heading = isLobby
    ? 'Lobby'
    : state.state === 'prompt'
      ? 'Game starting'
      : state.state === 'vote'
        ? 'Vote for the imposter'
        : state.state === 'results'
          ? 'Round results'
      : isTurn
        ? 'Your turn'
        : `${state.turn}'s turn`;
  const codeControls = isHost
    ? `<button id="toggle-code-visibility">${state.code_visible ? 'Hide' : 'Show'} Lobby Code</button>`
    : '';
  const visibleCode = state.code_visible
    ? `<p>Lobby code: <strong>${state.room_code}</strong></p>`
    : '';
  const voteChoices = state.players
    .map(player => `<button class="vote-choice" data-vote-target="${escapeHtml(player.name)}">${escapeHtml(player.name)}</button>`)
    .join('');

  const html = `
<h2>${heading}</h2>
${visibleCode}
${codeControls}
<p>Players</p>
<ol>${state.players.map(player => `<li style='color:${player.colour};${player.name === state.turn && 'text-decoration:underline;'}'>${player.name}${player.name === state.host ? ' (host)' : ''}</li>`).join('')}</ol>
${isHost && isLobby ? '<button id="start-game">Start Game</button>' : ''}
${isLobby ? '' : '<canvas id="canvas" width="400" height="400"></canvas>'}
${state.state === 'vote' ? `
<div class="vote-backdrop">
  <section class="vote-modal" role="dialog" aria-labelledby="vote-title">
    <h3 id="vote-title">Who is the imposter?</h3>
    <div class="vote-grid">${voteChoices}</div>
    <button class="vote-choice vote-skip" data-vote-target="skip">Skip and draw again</button>
    ${hasVoted ? '<p>Vote submitted. Waiting for the other players...</p>' : ''}
  </section>
</div>` : ''}
${state.state === 'results' && state.result ? `<p>${state.result.accused} was accused. Imposter: ${state.result.imposter}.</p>` : ''}
${isTurn ? '<button id="finish-drawing">Finish Drawing</button>' : ''}
  `;

  document.getElementById('app').innerHTML = html;

  if (isHost) {
    document.getElementById('toggle-code-visibility').addEventListener('click', () => {
      document.getElementById('toggle-code-visibility').disabled = true;
      toggleCodeVisibility();
    });
  }

  if (isHost && isLobby) {
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

  if (state.latest_image) {
    const image = new Image();
    image.onload = () => ctx.drawImage(image, 0, 0);
    image.src = state.latest_image;
  }

  if (isTurn) {
    enableDrawing(state, localState, canvas, ctx);
    document.getElementById('finish-drawing').addEventListener('click', () => {
      document.getElementById('finish-drawing').disabled = true;
      const pngUrl = canvas.toDataURL('image/png');
      submitTurn(pngUrl);
    });
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

function enableDrawing(state, localState, canvas, ctx) {
  ctx.strokeStyle = localState.colour;
  ctx.lineJoin = 'round';
  ctx.lineWidth = 5;

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
    if (!clickDrag[i]) {
      if (clickX.length === 0) {
        ctx.beginPath();
        ctx.moveTo(clickX[i], clickY[i]);
        ctx.stroke();
      } else {
        ctx.closePath();

        ctx.beginPath();
        ctx.moveTo(clickX[i], clickY[i]);
        ctx.stroke();
      }
    } else {
      ctx.lineTo(clickX[i], clickY[i]);
      ctx.stroke();
    }
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