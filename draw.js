let viewMode = null;
let isPromptPeeked = false;
let lastRenderedImageSrc = null;
let wasMyTurn = false;
let lastToolbarKey = null;
let lastActionKey = null;
let lastBriefingKey = null;
let drawingController = null;

export function resetView() {
  viewMode = null;
  isPromptPeeked = false;
  lastRenderedImageSrc = null;
  wasMyTurn = false;
  lastToolbarKey = null;
  lastActionKey = null;
  lastBriefingKey = null;
  drawingController = null;
  window.currentInkUsed = () => 0;
}

export function draw(state, localState) {
  renderHeaderActions();
  const errBanner = document.getElementById("game-error-banner");
  if (errBanner) {
    errBanner.hidden = true;
    errBanner.textContent = "";
  }

  if (state.state === "lobby") {
    isPromptPeeked = false;
    lastRenderedImageSrc = null;
    wasMyTurn = false;
    lastToolbarKey = null;
    lastActionKey = null;
    lastBriefingKey = null;
    drawingController = null;
    window.currentInkUsed = () => 0;
    renderLobbyView(state, localState);
    return;
  }

  renderGameView(state, localState);
}

function renderHeaderActions() {
  const container = document.getElementById("header-actions");
  if (!container || container.querySelector("#header-leave-btn")) {
    return;
  }
  container.innerHTML = `<button type="button" id="header-leave-btn" class="btn-ink btn-ink-ghost btn-ink-sm">Leave room</button>`;
  document.getElementById("header-leave-btn")?.addEventListener("click", returnToMainMenu);
}

function renderLobbyView(state, localState) {
  const app = document.getElementById("app");
  if (viewMode !== "lobby") {
    viewMode = "lobby";
    app.innerHTML = `
      <div id="game-error-banner" class="status-banner" role="alert" hidden></div>
      <div class="lobby-grid">
        <section class="card-paper">
          <h2 class="section-title">Room lobby</h2>
          <div class="code-box">
            <div class="code-digits" id="lobby-code-digits"></div>
            <p class="code-caption" id="lobby-code-caption"></p>
          </div>
          <div class="lobby-actions" id="lobby-code-actions"></div>
          <div class="lobby-actions lobby-start-row" id="lobby-start-actions"></div>
          <p class="muted-note" id="lobby-hint-note" hidden></p>
        </section>
        <section class="card-paper">
          <h2 class="section-title" id="lobby-players-heading">Players</h2>
          <ol class="player-list" id="lobby-player-list"></ol>
        </section>
      </div>
    `;
  }

  const isHost = state.host === localState.name;
  const canControlLobby = !state.returned_to_lobby;

  const digitsEl = document.getElementById("lobby-code-digits");
  if (digitsEl) {
    digitsEl.textContent = state.code_visible ? String(state.room_code ?? "") : "••••••";
  }

  const captionEl = document.getElementById("lobby-code-caption");
  if (captionEl) {
    captionEl.hidden = state.code_visible;
    captionEl.textContent = state.code_visible ? "" : "Code hidden";
  }

  const codeActionsEl = document.getElementById("lobby-code-actions");
  if (codeActionsEl) {
    codeActionsEl.innerHTML = `
      ${state.code_visible ? `<button type="button" id="copy-code" class="btn-ink btn-ink-secondary btn-ink-sm">Copy Code</button>` : ""}
      ${isHost && canControlLobby ? `<button type="button" id="toggle-code-visibility" class="btn-ink btn-ink-secondary btn-ink-sm" data-lock-on-submit>${state.code_visible ? "Hide" : "Show"} Code</button>` : ""}
    `;
    if (state.code_visible) {
      document.getElementById("copy-code")?.addEventListener("click", async () => {
        const btn = document.getElementById("copy-code");
        try {
          await navigator.clipboard?.writeText(String(state.room_code ?? ""));
          if (btn) {
            btn.textContent = "Copied";
            setTimeout(() => { if (btn.isConnected) btn.textContent = "Copy Code"; }, 1400);
          }
        } catch {
          if (btn) btn.textContent = "Copy failed";
        }
      });
    }
    if (isHost && canControlLobby) {
      document.getElementById("toggle-code-visibility")?.addEventListener("click", (e) => {
        e.currentTarget.disabled = true;
        toggleCodeVisibility();
      });
    }
  }

  const startActionsEl = document.getElementById("lobby-start-actions");
  if (startActionsEl) {
    startActionsEl.innerHTML = isHost && canControlLobby
      ? `<button type="button" id="start-game" class="btn-ink btn-ink-primary btn-full" data-lock-on-submit>Start Game</button>`
      : `<p class="muted-note">${state.returned_to_lobby ? "Waiting for others to return to the lobby." : `Waiting for <strong>${escapeHtml(state.host)}</strong> to start.`}</p>`;
    document.getElementById("start-game")?.addEventListener("click", (e) => {
      e.currentTarget.disabled = true;
      startGame();
    });
  }

  const hintEl = document.getElementById("lobby-hint-note");
  if (hintEl) {
    const showHint = isHost && canControlLobby && state.players.length < 3;
    hintEl.hidden = !showHint;
    hintEl.textContent = showHint ? "3+ players recommended." : "";
  }

  const headingEl = document.getElementById("lobby-players-heading");
  if (headingEl) {
    headingEl.textContent = `Players (${state.players.length})`;
  }

  const listEl = document.getElementById("lobby-player-list");
  if (listEl) {
    listEl.innerHTML = state.players.map((player) => {
      const isSelf = player.name === localState.name;
      const isRoomHost = player.name === state.host;
      return `
        <li class="player-row">
          <span class="player-identity">
            <span class="ink-swatch" style="background:${escapeHtml(player.colour)}"></span>
            <span class="player-name">${escapeHtml(player.name)}</span>
          </span>
          <span class="player-tags">
            ${isSelf ? `<span class="tag-pill">You</span>` : ""}
            ${isRoomHost ? `<span class="tag-pill">Host</span>` : ""}
          </span>
        </li>
      `;
    }).join("");
  }
}

function renderGameView(state, localState) {
  const app = document.getElementById("app");
  if (viewMode !== "game") {
    viewMode = "game";
    lastRenderedImageSrc = null;
    wasMyTurn = false;
    lastToolbarKey = null;
    lastActionKey = null;
    lastBriefingKey = null;
    app.innerHTML = `
      <div id="game-error-banner" class="status-banner" role="alert" hidden></div>
      <div class="game-topbar">
        <h2 class="phase-heading" id="phase-heading"></h2>
        <div class="phase-steps" id="phase-steps" aria-label="Round progress"></div>
      </div>
      <div class="game-stage">
        <section class="canvas-card">
          <canvas id="canvas" width="400" height="400"></canvas>
          <div class="canvas-toolbar" id="canvas-toolbar"></div>
        </section>
        <aside class="game-sidebar">
          <section class="phase-card" id="phase-action-card" hidden></section>
          <section class="briefing-card" id="briefing-card" hidden></section>
          <section class="players-card">
            <h3 class="section-title players-title" id="players-card-title">Players</h3>
            <div class="ink-panel" id="ink-panel"></div>
          </section>
        </aside>
      </div>
    `;
    const canvas = document.getElementById("canvas");
    drawingController = createCanvasController(canvas, () => {
      const undoBtn = document.getElementById("undo-stroke");
      const clearBtn = document.getElementById("clear-turn");
      const used = drawingController?.getInkUsed() ?? 0;
      const canUndo = (drawingController?.getUndoCount() ?? 0) > 0;
      if (undoBtn) undoBtn.disabled = !canUndo;
      if (clearBtn) clearBtn.disabled = used === 0;
    });
    window.currentInkUsed = () => drawingController?.getInkUsed() ?? 0;
  }

  const isTurn = state.state === "draw" && state.turn === localState.name;
  const isImposter = localState.role === "imposter";
  const hasVoted = state.voted_players?.includes(localState.name) ?? false;

  updateTopbar(state, isTurn, isImposter);
  updateCanvasAndToolbar(state, localState, isTurn);
  updatePhaseActionCard(state, isImposter, hasVoted);
  updateBriefingCard(localState, isImposter);
  updatePlayersInkPanel(state, localState);
}

function updateTopbar(state, isTurn, isImposter) {
  const headingEl = document.getElementById("phase-heading");
  const stepsEl = document.getElementById("phase-steps");

  const heading = state.state === "prompt"
    ? "Dealing prompts"
    : state.state === "vote"
      ? "Vote for the imposter"
      : state.state === "results"
        ? "Round results"
        : state.state === "imposter_guess"
          ? (isImposter ? "You were caught" : "Imposter&rsquo;s guess")
          : isTurn
            ? "Your turn to draw"
            : `${escapeHtml(state.turn)}&rsquo;s turn`;

  if (headingEl) headingEl.innerHTML = heading;

  const includeGuess = state.state === "imposter_guess" || Boolean(state.result?.guess);
  const phaseList = [
    { key: "prompt", label: "Briefing" },
    { key: "draw", label: "Draw" },
    { key: "vote", label: "Vote" },
    ...(includeGuess ? [{ key: "imposter_guess", label: "Guess" }] : []),
    { key: "results", label: "Results" },
  ];
  const currentIdx = phaseList.findIndex((step) => step.key === state.state);
  if (stepsEl) {
    stepsEl.innerHTML = phaseList.map((step, idx) => {
      const cls = idx === currentIdx ? "is-current" : idx < currentIdx ? "is-done" : "";
      return `<span class="phase-step ${cls}">${step.label}</span>`;
    }).join("");
  }
}

function updateCanvasAndToolbar(state, localState, isTurn) {
  const activePlayer = state.players.find((p) => p.name === localState.name);
  const activeMax = activePlayer?.max_ink ?? 2000;
  const imageChanged = (state.latest_image ?? null) !== lastRenderedImageSrc;

  if (imageChanged) {
    lastRenderedImageSrc = state.latest_image ?? null;
    drawingController.setBaseImage(lastRenderedImageSrc);
  }

  if (isTurn !== wasMyTurn || (isTurn && imageChanged)) {
    drawingController.resetForNewTurn();
  }
  wasMyTurn = isTurn;
  drawingController.setTurnState(isTurn, localState.name, localState.colour, activeMax);

  const toolbarEl = document.getElementById("canvas-toolbar");
  if (!toolbarEl) return;
  if (state.state !== "draw") {
    toolbarEl.hidden = true;
    if (lastToolbarKey !== "hidden") {
      lastToolbarKey = "hidden";
      toolbarEl.replaceChildren();
    }
    return;
  }
  toolbarEl.hidden = false;
  const toolbarKey = `${state.state}:${isTurn ? localState.name : state.turn ?? ""}:${localState.colour}`;
  if (toolbarKey !== lastToolbarKey) {
    lastToolbarKey = toolbarKey;
    if (isTurn) {
      const used = drawingController.getInkUsed();
      const remaining = Math.max(0, activeMax - used);
      const pct = Math.max(0, Math.min(100, (remaining / (activeMax || 1)) * 100));
      const stateClass = remaining <= 0 ? "is-empty" : pct <= 25 ? "is-low" : "";
      toolbarEl.innerHTML = `
        <div class="ink-meter-wrap">
          <div class="ink-meter-head">
            <span class="toolbar-colour"><span class="ink-swatch" style="background:${escapeHtml(localState.colour)}"></span>Ink</span>
            <span class="ink-meter-label" data-active-ink-label>${remaining <= 0 ? "Out of ink" : `${remaining} / ${activeMax} px`}</span>
          </div>
          <div class="ink-bar-track">
            <div class="ink-bar-fill ${stateClass}" data-active-ink-fill style="width:${pct}%"></div>
          </div>
        </div>
        <div class="canvas-actions">
          <button type="button" id="undo-stroke" class="btn-ink btn-ink-secondary btn-ink-sm" ${drawingController.getUndoCount() === 0 ? "disabled" : ""}>Undo</button>
          <button type="button" id="clear-turn" class="btn-ink btn-ink-secondary btn-ink-sm" ${used === 0 ? "disabled" : ""}>Clear</button>
          <button type="button" id="finish-drawing" class="btn-ink btn-ink-primary" data-lock-on-submit>Finish Drawing</button>
        </div>
      `;
      document.getElementById("undo-stroke")?.addEventListener("click", () => drawingController.undo());
      document.getElementById("clear-turn")?.addEventListener("click", () => drawingController.clearTurn());
      document.getElementById("finish-drawing")?.addEventListener("click", (e) => {
        e.currentTarget.disabled = true;
        const undoBtn = document.getElementById("undo-stroke");
        const clearBtn = document.getElementById("clear-turn");
        if (undoBtn) undoBtn.disabled = true;
        if (clearBtn) clearBtn.disabled = true;
        submitTurn(drawingController.exportPng());
      });
    } else {
      toolbarEl.innerHTML = `<span class="muted-note toolbar-wait">Waiting for ${escapeHtml(state.turn)}</span>`;
    }
  }
}

function updatePhaseActionCard(state, isImposter, hasVoted) {
  const card = document.getElementById("phase-action-card");
  if (!card) return;

  if (state.state === "vote") {
    const key = `vote:${state.players.map((p) => p.name).join(",")}`;
    if (lastActionKey !== key) {
      lastActionKey = key;
      const voteChoices = state.players.map((player) => `
        <button type="button" class="btn-ink btn-ink-secondary vote-choice" data-lock-on-submit data-vote-target="${escapeHtml(player.name)}">
          <span class="ink-swatch" style="background:${escapeHtml(player.colour)}"></span>
          <span class="vote-name">${escapeHtml(player.name)}</span>
        </button>
      `).join("");
      card.hidden = false;
      card.innerHTML = `
        <h3 class="section-title phase-card-title">Vote</h3>
        <p class="muted-note phase-card-note">Tie or majority skip starts another round.</p>
        <div class="vote-grid">${voteChoices}</div>
        <button type="button" class="btn-ink btn-ink-ghost vote-choice vote-skip" data-lock-on-submit data-vote-target="skip">Skip</button>
        <p class="vote-progress" id="vote-progress-text"></p>
        <p class="vote-waiting" id="vote-waiting" hidden>Waiting for others...</p>
      `;
      card.querySelectorAll(".vote-choice").forEach((button) => {
        button.addEventListener("click", () => {
          card.querySelectorAll(".vote-choice").forEach((choice) => { choice.disabled = true; });
          const waitEl = document.getElementById("vote-waiting");
          if (waitEl) waitEl.hidden = false;
          vote(button.dataset.voteTarget);
        });
      });
    }
    const progressEl = document.getElementById("vote-progress-text");
    if (progressEl) progressEl.textContent = `${state.votes_received ?? 0} / ${state.players.length} voted`;
    card.querySelectorAll(".vote-choice").forEach((btn) => { btn.disabled = hasVoted; });
    const waitEl = document.getElementById("vote-waiting");
    if (waitEl) waitEl.hidden = !hasVoted;
    return;
  }

  if (state.state === "imposter_guess") {
    const key = `imposter_guess:${isImposter}`;
    if (lastActionKey !== key) {
      lastActionKey = key;
      card.hidden = false;
      if (isImposter) {
        card.innerHTML = `
          <h3 class="section-title phase-card-title">Guess the secret word</h3>
          <div class="guess-row">
            <input class="input-ink" id="prompt-guess" type="text" autocomplete="off" placeholder="Your guess..." />
            <button type="button" class="btn-ink btn-ink-primary" id="submit-guess" data-lock-on-submit>Submit</button>
          </div>
          <p id="guess-error" class="status-banner" role="alert" hidden></p>
        `;
        const guessInput = document.getElementById("prompt-guess");
        const submitBtn = document.getElementById("submit-guess");
        const errorEl = document.getElementById("guess-error");
        const submitCurrentGuess = () => {
          const guess = guessInput?.value.trim() ?? "";
          if (!guess) {
            if (errorEl) {
              errorEl.textContent = "Enter a word before submitting.";
              errorEl.hidden = false;
            }
            guessInput?.focus();
            return;
          }
          if (errorEl) {
            errorEl.textContent = "";
            errorEl.hidden = true;
          }
          if (submitBtn) submitBtn.disabled = true;
          guessPrompt(guess);
        };
        submitBtn?.addEventListener("click", submitCurrentGuess);
        guessInput?.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submitCurrentGuess();
          }
        });
        setTimeout(() => guessInput?.focus(), 40);
      } else {
        card.innerHTML = `
          <h3 class="section-title phase-card-title">Imposter&rsquo;s guess</h3>
          <p class="muted-note phase-card-note">Waiting for their guess...</p>
        `;
      }
    }
    return;
  }

  if (state.state === "results" && state.result) {
    const key = `results:${JSON.stringify(state.result)}`;
    if (lastActionKey !== key) {
      lastActionKey = key;
      card.hidden = false;
      const goodWon = String(state.result.outcome ?? "").toLowerCase().includes("good");
      const accusedRow = state.result.accused
        ? `<div class="result-row"><span class="result-label">Voted out</span><span class="result-value">${escapeHtml(state.result.accused)}</span></div>`
        : "";
      const guessRow = state.result.guess
        ? `<div class="result-row"><span class="result-label">Imposter&rsquo;s guess</span><span class="result-value">${escapeHtml(state.result.guess)} (${state.result.correct === "true" ? "Correct" : "Incorrect"})</span></div>`
        : "";
      card.innerHTML = `
        <div class="result-outcome ${goodWon ? "is-win-good" : "is-win-imposter"}">${escapeHtml(state.result.outcome ?? "Round over")}</div>
        <div class="result-list">
          <div class="result-row"><span class="result-label">Secret word</span><span class="result-value">${escapeHtml(state.result.prompt ?? "Unknown")}</span></div>
          <div class="result-row"><span class="result-label">Imposter</span><span class="result-value">${escapeHtml(state.result.imposter ?? "Unknown")}</span></div>
          ${accusedRow}
          ${guessRow}
        </div>
        <div class="result-actions">
          <button type="button" class="btn-ink btn-ink-secondary" id="return-menu">Leave room</button>
          <button type="button" class="btn-ink btn-ink-primary" id="return-lobby" data-lock-on-submit>Return to lobby</button>
        </div>
      `;
      document.getElementById("return-lobby")?.addEventListener("click", (e) => {
        e.currentTarget.disabled = true;
        e.currentTarget.textContent = "Returning...";
        returnToLobby();
      });
      document.getElementById("return-menu")?.addEventListener("click", returnToMainMenu);
    }
    return;
  }

  lastActionKey = "";
  card.hidden = true;
  card.replaceChildren();
}

function updateBriefingCard(localState, isImposter) {
  const card = document.getElementById("briefing-card");
  if (!card) return;
  if (!localState.promptData) {
    lastBriefingKey = null;
    card.hidden = true;
    return;
  }
  const key = `${localState.role}:${localState.promptData.prompt ?? ""}:${isPromptPeeked}`;
  if (key === lastBriefingKey) return;
  lastBriefingKey = key;
  card.hidden = false;
  card.innerHTML = `
    <div class="briefing-head">
      <span class="briefing-title">Your prompt</span>
      <button type="button" id="toggle-prompt-peek" class="btn-ink btn-ink-ghost btn-ink-sm">${isPromptPeeked ? "Hide" : "Reveal"}</button>
    </div>
    <div id="briefing-secret" class="briefing-secret" ${isPromptPeeked ? "" : "hidden"}>
      <span class="tag-pill ${isImposter ? "is-role-imposter" : "is-role-good"}">${isImposter ? "Imposter &middot; Clue" : "Secret word"}</span>
      <p class="briefing-prompt">${escapeHtml(localState.promptData.prompt ?? "")}</p>
    </div>
  `;
  document.getElementById("toggle-prompt-peek")?.addEventListener("click", () => {
    isPromptPeeked = !isPromptPeeked;
    updateBriefingCard(localState, isImposter);
  });
}

function updatePlayersInkPanel(state, localState) {
  const panel = document.getElementById("ink-panel");
  const titleEl = document.getElementById("players-card-title");
  if (!panel) return;
  const showInk = state.state !== "draw" && state.state !== "prompt";
  if (titleEl) {
    titleEl.textContent = showInk ? "Players & ink" : "Players";
  }
  panel.innerHTML = state.players.map((player) => {
    const isDrawingNow = state.state === "draw" && player.name === state.turn;
    const isSelf = player.name === localState.name;
    const isRoomHost = player.name === state.host;
    const playerVoted = state.state === "vote" && (state.voted_players?.includes(player.name) ?? false);
    const remaining = player.ink_remaining;
    const pct = Math.max(0, Math.min(100, (remaining / (player.max_ink || 1)) * 100));
    return `
      <div class="ink-player ${isDrawingNow ? "is-active" : ""}">
        <div class="ink-player-head">
          <span class="player-identity">
            <span class="ink-swatch" style="background:${escapeHtml(player.colour)}"></span>
            <strong class="player-name">${escapeHtml(player.name)}</strong>
          </span>
          <span class="player-tags">
            ${isDrawingNow ? `<span class="tag-pill is-turn">Drawing</span>` : ""}
            ${playerVoted ? `<span class="tag-pill is-voted">Voted</span>` : ""}
            ${isSelf ? `<span class="tag-pill">You</span>` : ""}
            ${isRoomHost ? `<span class="tag-pill">Host</span>` : ""}
          </span>
        </div>
        ${showInk ? `
          <div class="ink-bar-track ink-bar-sm" aria-label="${escapeHtml(player.name)} ink remaining">
            <div class="ink-bar-fill" data-ink-player="${escapeHtml(player.name)}" style="width:${pct}%;background-color:${escapeHtml(player.colour)}"></div>
          </div>
          <small class="ink-px" data-ink-label="${escapeHtml(player.name)}">${remaining} / ${player.max_ink} px</small>
        ` : ""}
      </div>
    `;
  }).join("");
}

export function escapeHtml(value) {
  const element = document.createElement("div");
  element.textContent = String(value ?? "");
  return element.innerHTML.replace(/"/g, "&quot;").replace(new RegExp(String.fromCharCode(39), "g"), "&#039;");
}

function createCanvasController(canvas, onInkChange) {
  const ctx = canvas.getContext("2d");
  const inkLayer = document.createElement("canvas");
  inkLayer.width = canvas.width;
  inkLayer.height = canvas.height;
  const inkCtx = inkLayer.getContext("2d", { willReadFrequently: true });
  inkCtx.lineJoin = "round";
  inkCtx.lineCap = "round";
  inkCtx.lineWidth = 5;

  let canDraw = false;
  let localName = "";
  let maxInk = 2000;
  let usedInk = 0;
  let activeStrokeStartUsed = 0;
  let undoStack = [];
  let baseImage = null;
  let currentImageSrc = null;
  let painting = false;
  let lastPoint = null;

  function compositeCanvas() {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (baseImage) {
      ctx.drawImage(baseImage, 0, 0);
    }
    ctx.drawImage(inkLayer, 0, 0);
  }

  function updateInkMeters() {
    const remaining = Math.max(0, maxInk - usedInk);
    const pct = Math.max(0, Math.min(100, (remaining / (maxInk || 1)) * 100));
    if (localName) {
      const bar = document.querySelector(`[data-ink-player="${CSS.escape(localName)}"]`);
      const label = document.querySelector(`[data-ink-label="${CSS.escape(localName)}"]`);
      if (bar) bar.style.width = `${pct}%`;
      if (label) label.textContent = `${remaining} / ${maxInk} px`;
    }
    const activeLabel = document.querySelector("[data-active-ink-label]");
    const activeFill = document.querySelector("[data-active-ink-fill]");
    if (activeLabel) activeLabel.textContent = remaining <= 0 ? "Out of ink" : `${remaining} / ${maxInk} px`;
    if (activeFill) {
      activeFill.style.width = `${pct}%`;
      activeFill.classList.toggle("is-empty", remaining <= 0);
      activeFill.classList.toggle("is-low", remaining > 0 && pct <= 25);
    }
    onInkChange?.();
  }

  function getCanvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function strokeSegment(from, to) {
    const pad = 7;
    const x0 = Math.max(0, Math.floor(Math.min(from.x, to.x) - pad));
    const y0 = Math.max(0, Math.floor(Math.min(from.y, to.y) - pad));
    const x1 = Math.min(inkLayer.width, Math.ceil(Math.max(from.x, to.x) + pad));
    const y1 = Math.min(inkLayer.height, Math.ceil(Math.max(from.y, to.y) + pad));
    const rw = x1 - x0;
    const rh = y1 - y0;
    if (rw <= 0 || rh <= 0) return true;

    const before = inkCtx.getImageData(x0, y0, rw, rh);
    let beforePx = 0;
    for (let i = 3; i < before.data.length; i += 4) {
      if (before.data[i] > 0) beforePx += 1;
    }

    inkCtx.beginPath();
    inkCtx.moveTo(from.x, from.y);
    inkCtx.lineTo(to.x, to.y);
    inkCtx.stroke();

    const after = inkCtx.getImageData(x0, y0, rw, rh);
    let afterPx = 0;
    for (let i = 3; i < after.data.length; i += 4) {
      if (after.data[i] > 0) afterPx += 1;
    }

    const nextUsed = usedInk + (afterPx - beforePx);
    if (nextUsed > maxInk) {
      inkCtx.putImageData(before, x0, y0);
      painting = false;
      updateInkMeters();
      return false;
    }

    usedInk = nextUsed;
    compositeCanvas();
    updateInkMeters();
    return true;
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (!canDraw) return;
    if (event.button !== undefined && event.button !== 0 && event.pointerType === "mouse") return;
    event.preventDefault();
    canvas.setPointerCapture?.(event.pointerId);
    if (undoStack.length >= 25) undoStack.shift();
    undoStack.push({ data: inkCtx.getImageData(0, 0, inkLayer.width, inkLayer.height), used: usedInk });
    activeStrokeStartUsed = usedInk;
    painting = true;
    lastPoint = getCanvasPoint(event);
    strokeSegment(lastPoint, { x: lastPoint.x + 0.01, y: lastPoint.y });
  });

  canvas.addEventListener("pointermove", (event) => {
    if (!painting || !lastPoint) return;
    event.preventDefault();
    const nextPoint = getCanvasPoint(event);
    if (strokeSegment(lastPoint, nextPoint)) {
      lastPoint = nextPoint;
    }
  });

  const stopPainting = (event) => {
    if (!painting) return;
    painting = false;
    lastPoint = null;
    if (usedInk === activeStrokeStartUsed && undoStack.length > 0) {
      undoStack.pop();
    }
    onInkChange?.();
    try {
      canvas.releasePointerCapture?.(event.pointerId);
    } catch {}
  };

  canvas.addEventListener("pointerup", stopPainting);
  canvas.addEventListener("pointercancel", stopPainting);
  compositeCanvas();

  return {
    setTurnState(isTurn, name, colour, inkLimit) {
      canDraw = isTurn;
      localName = name;
      maxInk = inkLimit;
      inkCtx.strokeStyle = colour;
      canvas.classList.toggle("is-drawable", isTurn);
      if (!isTurn) painting = false;
    },
    setBaseImage(src) {
      currentImageSrc = src ?? null;
      if (!src) {
        baseImage = null;
        compositeCanvas();
        return;
      }
      const image = new Image();
      image.onload = () => {
        if (currentImageSrc === src) {
          baseImage = image;
          compositeCanvas();
        }
      };
      image.src = src;
    },
    resetForNewTurn() {
      inkCtx.clearRect(0, 0, inkLayer.width, inkLayer.height);
      usedInk = 0;
      undoStack = [];
      painting = false;
      lastPoint = null;
      compositeCanvas();
      updateInkMeters();
    },
    clearTurn() {
      if (usedInk === 0) return;
      if (undoStack.length >= 25) undoStack.shift();
      undoStack.push({ data: inkCtx.getImageData(0, 0, inkLayer.width, inkLayer.height), used: usedInk });
      inkCtx.clearRect(0, 0, inkLayer.width, inkLayer.height);
      usedInk = 0;
      compositeCanvas();
      updateInkMeters();
    },
    undo() {
      const snap = undoStack.pop();
      if (!snap) return;
      inkCtx.putImageData(snap.data, 0, 0);
      usedInk = snap.used;
      compositeCanvas();
      updateInkMeters();
    },
    exportPng() {
      compositeCanvas();
      return canvas.toDataURL("image/png");
    },
    getInkUsed: () => usedInk,
    getUndoCount: () => undoStack.length,
  };
}
