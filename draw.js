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
  window.recoverPendingControls = null;
}

export function draw(state, localState) {
  renderHeaderActions();
  const errBanner = document.getElementById("game-error-banner");
  if (errBanner) {
    if (state.status_note && state.state === "draw") {
      errBanner.textContent = state.status_note;
      errBanner.classList.add("is-info");
      errBanner.hidden = false;
    } else {
      errBanner.hidden = true;
      errBanner.textContent = "";
      errBanner.classList.remove("is-info");
    }
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
          </div>
          <div class="lobby-actions" id="lobby-code-actions"></div>
          <div class="lobby-actions lobby-start-row" id="lobby-start-actions"></div>
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
    const rawCode = String(state.room_code ?? "");
    const visible = Boolean(state.code_visible);
    digitsEl.dataset.code = rawCode;
    digitsEl.textContent = visible ? rawCode : "••••••";
    digitsEl.classList.toggle("is-masked", !visible);
  }

  const codeActionsEl = document.getElementById("lobby-code-actions");
  if (codeActionsEl) {
    if (!codeActionsEl.querySelector("#copy-link")) {
      codeActionsEl.innerHTML = `
        <button type="button" id="copy-link" class="btn-ink btn-ink-secondary btn-ink-sm">Copy Link</button>
        <button type="button" id="copy-code" class="btn-ink btn-ink-secondary btn-ink-sm">Copy Code</button>
      `;
      document.getElementById("copy-link")?.addEventListener("click", async () => {
        const btn = document.getElementById("copy-link");
        const code = document.getElementById("lobby-code-digits")?.dataset.code ?? "";
        try {
          const url = new URL(window.location.href);
          url.search = "";
          url.hash = "";
          if (code) url.searchParams.set("code", code);
          await copyText(url.toString());
          if (btn) {
            btn.textContent = "Copied";
            setTimeout(() => { if (btn.isConnected) btn.textContent = "Copy Link"; }, 1400);
          }
        } catch {
          if (btn) btn.textContent = "Copy failed";
        }
      });
      document.getElementById("copy-code")?.addEventListener("click", async () => {
        const btn = document.getElementById("copy-code");
        try {
          await copyText(document.getElementById("lobby-code-digits")?.dataset.code ?? "");
          if (btn) {
            btn.textContent = "Copied";
            setTimeout(() => { if (btn.isConnected) btn.textContent = "Copy Code"; }, 1400);
          }
        } catch {
          if (btn) btn.textContent = "Copy failed";
        }
      });
    }
    let visBtn = codeActionsEl.querySelector("#toggle-code-visibility");
    if (isHost && canControlLobby) {
      if (!visBtn) {
        visBtn = document.createElement("button");
        visBtn.type = "button";
        visBtn.id = "toggle-code-visibility";
        visBtn.className = "btn-ink btn-ink-ghost btn-ink-sm";
        visBtn.addEventListener("click", () => toggleCodeVisibility());
        codeActionsEl.appendChild(visBtn);
      }
      visBtn.textContent = state.code_visible ? "Hide Code" : "Show Code";
    } else if (visBtn) {
      visBtn.remove();
    }
  }

  const startActionsEl = document.getElementById("lobby-start-actions");
  if (startActionsEl) {
    const enoughPlayers = state.players.length >= 3;
    startActionsEl.innerHTML = isHost && canControlLobby
      ? `<button type="button" id="start-game" class="btn-ink btn-ink-primary btn-full" data-lock-on-submit ${enoughPlayers ? "" : "disabled"}>${enoughPlayers ? "Start Game" : "Start Game (3+ players)"}</button>`
      : `<p class="muted-note">${state.returned_to_lobby ? "Waiting for others to return to the lobby." : `Waiting for <strong>${escapeHtml(state.host)}</strong> to start.`}</p>`;
    document.getElementById("start-game")?.addEventListener("click", (e) => {
      e.currentTarget.disabled = true;
      startGame();
    });
  }


  const headingEl = document.getElementById("lobby-players-heading");
  if (headingEl) {
    headingEl.textContent = `Players (${state.players.length})`;
  }

  const listEl = document.getElementById("lobby-player-list");
  if (listEl) {
    const crownIcon = `<svg class="host-crown" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-label="Host" title="Host"><path d="M2 17l2-10 5 4 3-7 3 7 5-4 2 10H2z"/><path d="M4 21h16"/></svg>`;
    listEl.innerHTML = state.players.map((player) => {
      const isSelf = player.name === localState.name;
      const isRoomHost = player.name === state.host;
      return `
        <li class="player-row">
          <span class="player-identity">
            <span class="ink-swatch" style="background:${escapeHtml(player.colour)}"></span>
            <span class="player-name">${escapeHtml(player.name)}</span>
            ${isSelf ? `<span class="you-label">(you)</span>` : ""}
          </span>
          ${isRoomHost ? `<span class="player-tags">${crownIcon}</span>` : ""}
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
      </div>
      <div class="game-stage" id="game-stage">
        <section class="canvas-card" id="canvas-card">
          <div class="canvas-staging" id="canvas-staging" hidden>Dealing prompts...</div>
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
    window.recoverPendingControls = () => {
      const undoBtn = document.getElementById("undo-stroke");
      const clearBtn = document.getElementById("clear-turn");
      if (undoBtn) undoBtn.disabled = (drawingController?.getUndoCount() ?? 0) === 0;
      if (clearBtn) clearBtn.disabled = (drawingController?.getInkUsed() ?? 0) === 0;
      const lobbyBtn = document.getElementById("return-lobby");
      if (lobbyBtn && lobbyBtn.textContent === "Returning...") {
        lobbyBtn.textContent = "Return to lobby";
      }
    };
  }

  const isTurn = state.state === "draw" && state.turn === localState.name;
  const isImposter = localState.role === "imposter";
  const hasVoted = state.voted_players?.includes(localState.name) ?? false;
  const hasChecked = state.guess_checked_players?.includes(localState.name) ?? false;
  const stageEl = document.getElementById("game-stage");
  if (stageEl) stageEl.dataset.phase = state.state;
  const isPromptPhase = state.state === "prompt";
  const canvasEl = document.getElementById("canvas");
  const stagingEl = document.getElementById("canvas-staging");
  if (canvasEl) canvasEl.hidden = isPromptPhase;
  if (stagingEl) stagingEl.hidden = !isPromptPhase;
  const canvasCardEl = document.getElementById("canvas-card");
  const activeDrawer = state.players.find((p) => p.name === state.turn);
  if (canvasCardEl) {
    canvasCardEl.classList.toggle("is-my-turn", isTurn);
    canvasCardEl.style.setProperty("--turn-colour", activeDrawer?.colour ?? "var(--border)");
  }

  updateTopbar(state, isTurn, isImposter);
  updateCanvasAndToolbar(state, localState, isTurn);
  updatePhaseActionCard(state, isImposter, hasVoted, hasChecked);
  updateBriefingCard(localState, isImposter);
  updatePlayersInkPanel(state, localState);
}

function updateTopbar(state, isTurn, isImposter) {
  const headingEl = document.getElementById("phase-heading");

  const heading = state.state === "prompt"
    ? "Dealing prompts"
    : state.state === "vote"
      ? "Vote for the imposter"
      : state.state === "results"
        ? "Round results"
        : state.state === "imposter_guess"
          ? (isImposter ? "You were caught" : "Imposter&rsquo;s guess")
          : state.state === "guess_check"
            ? (isImposter ? "Checking your guess" : "Check the guess")
            : isTurn
            ? "Your turn to draw"
            : `${escapeHtml(state.turn)}&rsquo;s turn`;

  if (headingEl) headingEl.innerHTML = heading;
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
  const drawer = state.players.find((p) => p.name === state.turn);
  const toolbarKey = `${state.state}:${isTurn ? localState.name : state.turn ?? ""}:${localState.colour}:${drawer?.colour ?? ""}`;
  if (toolbarKey !== lastToolbarKey) {
    lastToolbarKey = toolbarKey;
    if (isTurn) {
      const used = drawingController.getInkUsed();
      const remaining = Math.max(0, activeMax - used);
      const pct = Math.max(0, Math.min(100, (remaining * 100) / (activeMax || 1)));
      const stateClass = remaining <= 0 ? "is-empty" : pct <= 25 ? "is-low" : "";
      toolbarEl.innerHTML = `
        <div class="ink-meter-wrap">
          <div class="ink-meter-head">
            <span class="toolbar-colour"><span class="ink-swatch" style="background:${escapeHtml(localState.colour)}"></span>Ink</span>
            <span class="ink-meter-label" data-active-ink-label>${remaining <= 0 ? "Out of ink" : `${Math.floor(pct)}%`}</span>
          </div>
          <div class="ink-bar-track">
            <div class="ink-bar-fill ${stateClass}" data-active-ink-fill style="width:${pct}%"></div>
          </div>
        </div>
        <div class="canvas-actions">
          <button type="button" id="undo-stroke" class="btn-ink btn-ink-secondary btn-ink-sm" ${drawingController.getUndoCount() === 0 ? "disabled" : ""}>Undo</button>
          <button type="button" id="clear-turn" class="btn-ink btn-ink-secondary btn-ink-sm" ${used === 0 ? "disabled" : ""}>Clear</button>
          <button type="button" id="finish-drawing" class="btn-ink btn-ink-primary ${remaining <= 0 ? "is-ink-empty" : ""}" data-lock-on-submit>Finish Drawing</button>
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
      toolbarEl.innerHTML = `<span class="turn-wait-pill"><span class="ink-swatch" style="background:${escapeHtml(drawer?.colour ?? "var(--border)")}"></span>${escapeHtml(state.turn)} is drawing</span>`;
    }
  }
}

function updatePhaseActionCard(state, isImposter, hasVoted, hasChecked) {
  const card = document.getElementById("phase-action-card");
  if (!card) return;

  if (state.state === "prompt") {
    if (lastActionKey !== "prompt") {
      lastActionKey = "prompt";
      card.hidden = false;
      card.innerHTML = `<h3 class="section-title phase-card-title">Dealing prompts</h3><p class="muted-note phase-card-note">Waiting for all players...</p>`;
    }
    return;
  }

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

  if (state.state === "guess_check") {
    const key = `guess_check:${isImposter}:${state.imposter_guess ?? ""}:${state.guess_target ?? ""}`;
    if (lastActionKey !== key) {
      lastActionKey = key;
      card.hidden = false;
      if (isImposter) {
        card.innerHTML = `
          <h3 class="section-title phase-card-title">Your guess</h3>
          <div class="guess-compare guess-compare-single">
            <div class="result-spotlight-item">
              <span class="result-label">Submitted guess</span>
              <span class="result-spotlight-value">${escapeHtml(state.imposter_guess ?? "")}</span>
            </div>
          </div>
          <p class="vote-progress" id="guess-check-progress"></p>
          <p class="vote-waiting">Waiting for other players...</p>
        `;
      } else {
        card.innerHTML = `
          <h3 class="section-title phase-card-title">Did they get it?</h3>
          <div class="guess-compare">
            <div class="result-spotlight-item">
              <span class="result-label">Secret word</span>
              <span class="result-spotlight-value">${escapeHtml(state.guess_target ?? "")}</span>
            </div>
            <div class="result-spotlight-item">
              <span class="result-label">Imposter&rsquo;s guess</span>
              <span class="result-spotlight-value">${escapeHtml(state.imposter_guess ?? "")}</span>
            </div>
          </div>
          <div class="guess-check-actions">
            <button type="button" class="btn-ink btn-ink-primary guess-check-btn" data-lock-on-submit data-guess-accept="true">Correct</button>
            <button type="button" class="btn-ink btn-ink-secondary guess-check-btn" data-lock-on-submit data-guess-accept="false">Incorrect</button>
          </div>
          <p class="vote-progress" id="guess-check-progress"></p>
          <p class="vote-waiting" id="guess-check-waiting" hidden>Waiting for others...</p>
        `;
        card.querySelectorAll(".guess-check-btn").forEach((button) => {
          button.addEventListener("click", () => {
            card.querySelectorAll(".guess-check-btn").forEach((choice) => { choice.disabled = true; });
            const waitEl = document.getElementById("guess-check-waiting");
            if (waitEl) waitEl.hidden = false;
            checkGuess(button.dataset.guessAccept === "true");
          });
        });
      }
    }
    const progressEl = document.getElementById("guess-check-progress");
    if (progressEl) progressEl.textContent = `${state.guess_checks_received ?? 0} / ${state.guess_checks_total ?? 0} checked`;
    if (!isImposter) {
      card.querySelectorAll(".guess-check-btn").forEach((btn) => { btn.disabled = hasChecked; });
      const waitEl = document.getElementById("guess-check-waiting");
      if (waitEl) waitEl.hidden = !hasChecked;
    }
    return;
  }

  if (state.state === "results" && state.result) {
    const key = `results:${JSON.stringify(state.result)}`;
    if (lastActionKey !== key) {
      lastActionKey = key;
      card.hidden = false;
      const goodWon = String(state.result.outcome ?? "").toLowerCase().includes("good");
      const imposterPlayer = state.players.find((p) => p.name === state.result.imposter);
      const imposterSwatch = imposterPlayer
        ? `<span class="ink-swatch" style="background:${escapeHtml(imposterPlayer.colour)}"></span>`
        : "";
      const secondaryRows = [
        state.result.accused
          ? `<div class="result-row"><span class="result-label">Voted out</span><span class="result-value">${escapeHtml(state.result.accused)}</span></div>`
          : "",
        state.result.guess
          ? `<div class="result-row"><span class="result-label">Imposter&rsquo;s guess</span><span class="result-value">${escapeHtml(state.result.guess)} (${state.result.correct === "true" ? "Correct" : "Incorrect"})</span></div>`
          : "",
      ].join("");
      card.innerHTML = `
        <div class="result-outcome ${goodWon ? "is-win-good" : "is-win-imposter"}">${escapeHtml(state.result.outcome ?? "Round over")}</div>
        <div class="result-spotlight">
          <div class="result-spotlight-item">
            <span class="result-label">Secret word</span>
            <span class="result-spotlight-value">${escapeHtml(state.result.prompt ?? "Unknown")}</span>
          </div>
          <div class="result-spotlight-item">
            <span class="result-label">Imposter</span>
            <span class="result-spotlight-value result-imposter-name">${imposterSwatch}${escapeHtml(state.result.imposter ?? "Unknown")}</span>
          </div>
        </div>
        ${secondaryRows ? `<div class="result-list">${secondaryRows}</div>` : ""}
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
      <span class="tag-pill ${isImposter ? "is-role-imposter" : "is-role-good"}">${isImposter ? "Imposter: Clue" : "Secret word"}</span>
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
  if (!panel) return;
  panel.innerHTML = state.players.map((player) => {
    const isDrawingNow = state.state === "draw" && player.name === state.turn;
    const isSelf = player.name === localState.name;
    const playerVoted = (state.state === "vote" && (state.voted_players?.includes(player.name) ?? false))
      || (state.state === "guess_check" && (state.guess_checked_players?.includes(player.name) ?? false));
    return `
      <div class="ink-player ${isDrawingNow ? "is-active" : ""}" ${isDrawingNow ? `style="border-left-color:${escapeHtml(player.colour)}"` : ""}>
        <div class="ink-player-head">
          <span class="player-identity">
            <span class="ink-swatch" style="background:${escapeHtml(player.colour)}"></span>
            <strong class="player-name">${escapeHtml(player.name)}</strong>
            ${isSelf ? `<span class="you-label">(you)</span>` : ""}
          </span>
          ${playerVoted ? `<span class="player-tags"><span class="tag-pill is-voted">${state.state === "guess_check" ? "Checked" : "Voted"}</span></span>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const area = document.createElement("textarea");
  area.value = text;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand("copy");
  area.remove();
  if (!ok) throw new Error("Copy failed");
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
  let baseImageReady = true;
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
    const pct = Math.max(0, Math.min(100, (remaining * 100) / (maxInk || 1)));
    const activeLabel = document.querySelector("[data-active-ink-label]");
    const activeFill = document.querySelector("[data-active-ink-fill]");
    const finishBtn = document.getElementById("finish-drawing");
    if (activeLabel) activeLabel.textContent = remaining <= 0 ? "Out of ink" : `${Math.floor(pct)}%`;
    if (activeFill) {
      activeFill.style.width = `${pct}%`;
      activeFill.classList.toggle("is-empty", remaining <= 0);
      activeFill.classList.toggle("is-low", remaining > 0 && pct <= 25);
    }
    if (finishBtn) finishBtn.classList.toggle("is-ink-empty", remaining <= 0);
    onInkChange?.();
  }

  function getCanvasPoint(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    };
  }

  function strokeStep(from, to) {
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
      return false;
    }

    usedInk = nextUsed;
    return true;
  }

  function strokeSegment(from, to) {
    const dist = Math.hypot(to.x - from.x, to.y - from.y);
    const steps = Math.max(1, Math.ceil(dist / 6));
    let prev = from;
    let drewAny = false;
    for (let s = 1; s <= steps; s += 1) {
      const t = s / steps;
      const next = { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
      if (!strokeStep(prev, next)) {
        if (drewAny) {
          compositeCanvas();
        }
        updateInkMeters();
        return false;
      }
      drewAny = true;
      prev = next;
    }
    compositeCanvas();
    updateInkMeters();
    return true;
  }

  canvas.addEventListener("pointerdown", (event) => {
    if (!canDraw || !baseImageReady) return;
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
        baseImageReady = true;
        compositeCanvas();
        return;
      }
      baseImageReady = false;
      const image = new Image();
      image.onload = () => {
        if (currentImageSrc === src) {
          baseImage = image;
          baseImageReady = true;
          compositeCanvas();
        }
      };
      image.onerror = () => {
        if (currentImageSrc === src) {
          baseImageReady = true;
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
