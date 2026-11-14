export function draw(state, localState) {
  const isTurn = state.turn === localState.name;

  const html = `
<h2>${isTurn ? 'Your turn' : state.turn + '\'s turn'}</h2>
<canvas id="canvas" width="400" height="400"></canvas>
  `;

  document.getElementById('app').innerHTML = html;

  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');

  ctx.drawImage(state.image, 0, 0);

}