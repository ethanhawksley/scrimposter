export function draw(state, localState) {
  const isTurn = state.turn === localState.name;

  const html = `
<h2>${isTurn ? 'Your turn' : state.turn + '\'s turn'}</h2>
<canvas id="canvas" width="400" height="400"></canvas>
${isTurn && '<button id="finish-drawing">Finish Drawing</button>'}
  `;

  document.getElementById('app').innerHTML = html;

  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');

  ctx.drawImage(state.image, 0, 0);

  if (isTurn) {
    enableDrawing(state, localState, canvas, ctx);
    document.getElementById('finish-drawing').addEventListener('click', () => {
      const pngUrl = canvas.toDataURL('image/png')
      console.log(pngUrl);

      document.dispatchEvent(
        new CustomEvent('drawer-finished'),
      );
    })
  }
}

function enableDrawing(state, localState, canvas, ctx) {
  ctx.strokeStyle = localState.colour;
  ctx.lineJoin = "round";
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
