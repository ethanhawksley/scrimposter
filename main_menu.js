let websocket = null;
let currentRoom = null;
let currentPlayer = null;
let stateListener = null;
let latestSequence = -1;
let leavingGame = false;
let leaveTimer = null;
let lastCodeVisible = null;
const NICKNAME_STORAGE_KEY = "scrimposter.nickname";
const CODE_VISIBILITY_STORAGE_KEY = "scrimposter.codeVisible";

function loadCodeVisibilityPreference() {
    try {
        return localStorage.getItem(CODE_VISIBILITY_STORAGE_KEY) !== "false";
    } catch {
        return true;
    }
}

function saveCodeVisibilityPreference(visible) {
    try {
        localStorage.setItem(CODE_VISIBILITY_STORAGE_KEY, visible ? "true" : "false");
    } catch {}
}

function loadSavedNickname() {
    try {
        return localStorage.getItem(NICKNAME_STORAGE_KEY) || "";
    } catch {
        return "";
    }
}

function saveNickname(name) {
    try {
        if (name) {
            localStorage.setItem(NICKNAME_STORAGE_KEY, name);
        }
    } catch {}
}

function restoreSavedNickname() {
    const nameEl = document.getElementById("nameText");
    if (nameEl && !nameEl.value) {
        const saved = loadSavedNickname();
        if (saved) {
            nameEl.value = saved.slice(0, 24);
        }
    }
}

function applyInviteCodeFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const rawCode = (params.get("code") ?? "").trim();
    if (!/^\d{6}$/.test(rawCode)) {
        return;
    }
    const codeEl = document.getElementById("codeText");
    if (codeEl) {
        codeEl.value = rawCode;
    }
    const nameEl = document.getElementById("nameText");
    if (nameEl && !nameEl.value) {
        nameEl.focus();
    } else {
        document.getElementById("joinRoomBtn")?.focus();
    }
}

function clearInviteParamFromUrl() {
    const url = new URL(window.location.href);
    if (url.searchParams.has("code")) {
        url.searchParams.delete("code");
        window.history.replaceState({}, "", url.toString());
    }
}

function initMenuInputs() {
    restoreSavedNickname();
    applyInviteCodeFromUrl();
}

if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", initMenuInputs);
    } else {
        initMenuInputs();
    }
}

function setConnectionStatus(message, isInfo = false) {
    const statusEl = document.getElementById("connectionStatus");
    if (!statusEl) {
        return;
    }
    statusEl.classList.toggle("is-info", Boolean(isInfo));
    statusEl.textContent = message || "";
}

const REMOTE_BACKEND_HOST = "scrimposter-fastapi.hawksley.dev";

function getBackendLocation() {
    const isFile = window.location.protocol === "file:";
    const hostname = isFile ? "127.0.0.1" : window.location.hostname;
    const isLocalHost = isFile
        || ["0.0.0.0", "127.0.0.1", "localhost", ""].includes(hostname)
        || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname)
        || hostname.endsWith(".local");
    if (isLocalHost) {
        const port = window.location.port;
        const devHost = hostname === "0.0.0.0" || hostname === "" ? "127.0.0.1" : hostname;
        const resolvedHost = port === "8000" ? window.location.host : `${devHost}:8000`;
        const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const httpProtocol = window.location.protocol === "https:" ? "https:" : "http:";
        return { httpBase: `${httpProtocol}//${resolvedHost}`, wsBase: `${wsProtocol}//${resolvedHost}` };
    }
    if (hostname === REMOTE_BACKEND_HOST) {
        const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        return { httpBase: window.location.origin, wsBase: `${wsProtocol}//${window.location.host}` };
    }
    return {
        httpBase: `https://${REMOTE_BACKEND_HOST}`,
        wsBase: `wss://${REMOTE_BACKEND_HOST}`,
    };
}

function connectToRoom(roomCode, playerId, onState, onEvent, joinOnConnect = false) {
    currentRoom = roomCode;
    currentPlayer = playerId;
    stateListener = onState;
    latestSequence = -1;
    lastCodeVisible = null;

    if (websocket) {
        websocket.__replaced = true;
        websocket.close();
    }

    const { wsBase } = getBackendLocation();
    const socket = new WebSocket(
        `${wsBase}/ws/${encodeURIComponent(roomCode)}?player_id=${encodeURIComponent(playerId)}`
    );
    websocket = socket;

    socket.addEventListener("open", () => {
        if (joinOnConnect) {
            joinRoom();
        }
    });

    socket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (leavingGame && message.type === "state") {
            return;
        }
        if (message.type === "state" && stateListener) {
            const sequence = message.payload.sequence ?? 0;
            if (sequence >= latestSequence) {
                latestSequence = sequence;
                if (typeof message.payload.game?.code_visible === "boolean") {
                    lastCodeVisible = message.payload.game.code_visible;
                }
                stateListener(message.payload.game, sequence);
            }
        } else if (onEvent) {
            onEvent(message);
        } else if (message.type === "error") {
            console.error(`${message.payload.code}: ${message.payload.message}`);
        }
    });

    socket.addEventListener("error", (event) => {
        console.error("WebSocket error:", event);
    });

    socket.addEventListener("close", () => {
        if (socket.__replaced || leavingGame) {
            return;
        }
        const menuEl = document.getElementById("menu");
        const statusEl = document.getElementById("connectionStatus");
        if (menuEl && menuEl.hidden) {
            showMainMenu();
            setConnectionStatus("Connection to the room was lost.");
        } else if (statusEl && (!statusEl.textContent || statusEl.classList.contains("is-info"))) {
            setConnectionStatus("Could not connect to that room.");
        }
    });
}

function sendCommand(type, payload = {}) {
    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
        throw new Error("The game connection is not open");
    }
    websocket.send(JSON.stringify({ type, payload }));
}

function joinRoom() {
    sendCommand("join_room");
}

function startGame() {
    sendCommand("start_game");
}

function toggleCodeVisibility(nextVisible) {
    const targetVisible = typeof nextVisible === "boolean" ? nextVisible : !(lastCodeVisible ?? loadCodeVisibilityPreference());
    sendCommand("toggle_code_visibility");
    saveCodeVisibilityPreference(targetVisible);
}

function requestPrompt() {
    sendCommand("request_prompt");
}

function submitTurn(image) {
    sendCommand("submit_turn", { image, ink_used: window.currentInkUsed?.() ?? 0 });
}

function vote(target) {
    sendCommand("vote", { target });
}

function guessPrompt(guess) {
    sendCommand("guess_prompt", { guess });
}

function checkGuess(accepted) {
    sendCommand("check_guess", { accepted: Boolean(accepted) });
}

function returnToLobby() {
    sendCommand("return_lobby");
}

function returnToMainMenu() {
    if (leavingGame) {
        return;
    }
    leavingGame = true;
    showMainMenu();
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        sendCommand("leave_game");
        leaveTimer = setTimeout(finishLeavingGame, 1200);
    } else {
        finishLeavingGame();
    }
}

function showMainMenu() {
    const dlg = document.getElementById("role-dialog");
    if (dlg?.open) {
        dlg.close();
    }
    window.resetGameView?.();
    document.getElementById("app")?.replaceChildren();
    document.getElementById("header-actions")?.replaceChildren();
    const menuEl = document.getElementById("menu");
    if (menuEl) {
        menuEl.hidden = false;
    }
}

function finishLeavingGame() {
    if (leaveTimer) {
        clearTimeout(leaveTimer);
        leaveTimer = null;
    }
    if (websocket && websocket.readyState !== WebSocket.CLOSED) {
        websocket.__replaced = true;
        websocket.close();
    }
    websocket = null;
    currentRoom = null;
    currentPlayer = null;
    lastCodeVisible = null;
    leavingGame = false;
}

function CodeEnter() {
    const codeEl = document.getElementById("codeText");
    const nameEl = document.getElementById("nameText");
    const code = codeEl.value.trim();
    const name = nameEl.value.trim();
    if (!name) {
        setConnectionStatus("Enter a nickname first.");
        nameEl.focus();
        return;
    }
    if (!/^\d{6}$/.test(code)) {
        setConnectionStatus("Enter a 6-digit room code.");
        codeEl.focus();
        return;
    }
    nameEl.value = name;
    saveNickname(name);
    setConnectionStatus("Joining room...", true);
    connectToRoom(code, name, window.renderGameState, window.handleGameEvent, true);
}

async function createRoom(rawName) {
    const nameEl = document.getElementById("nameText");
    const createBtn = document.getElementById("createRoomBtn");
    const name = String(rawName ?? "").trim();
    if (!name) {
        setConnectionStatus("Enter a nickname first.");
        nameEl?.focus();
        return null;
    }
    if (nameEl) {
        nameEl.value = name;
    }
    saveNickname(name);
    clearInviteParamFromUrl();
    if (createBtn) {
        createBtn.disabled = true;
    }
    setConnectionStatus("Creating room...", true);
    try {
        const { httpBase } = getBackendLocation();
        const params = new URLSearchParams({ player_id: name, colour: "1", code_visible: String(loadCodeVisibilityPreference()) });
        const response = await fetch(`${httpBase}/rooms?${params}`, {
            method: "POST",
        });
        const raw = await response.text();
        let data = {};
        try {
            data = raw ? JSON.parse(raw) : {};
        } catch {
            throw new Error(`Invalid response from server (${response.status})`);
        }
        if (!response.ok) {
            throw new Error(data.message ?? `Unable to create lobby (${response.status})`);
        }
        if (typeof data.lobby_code !== "string" || data.lobby_code.length === 0) {
            throw new Error("Lobby creation response did not contain a lobby code");
        }
        document.getElementById("codeText").value = data.lobby_code;
        connectToRoom(
            data.lobby_code,
            name,
            window.renderGameState,
            window.handleGameEvent,
        );
        return data.lobby_code;
    } catch (error) {
        setConnectionStatus(error?.message || "Unable to reach the game server.");
        return null;
    } finally {
        if (createBtn) {
            createBtn.disabled = false;
        }
    }
}

window.connectToRoom = connectToRoom;
window.sendCommand = sendCommand;
window.joinRoom = joinRoom;
window.startGame = startGame;
window.toggleCodeVisibility = toggleCodeVisibility;
window.requestPrompt = requestPrompt;
window.submitTurn = submitTurn;
window.vote = vote;
window.guessPrompt = guessPrompt;
window.checkGuess = checkGuess;
window.returnToLobby = returnToLobby;
window.returnToMainMenu = returnToMainMenu;
window.finishLeavingGame = finishLeavingGame;
window.isLeavingGame = () => leavingGame;
window.clearInviteParamFromUrl = clearInviteParamFromUrl;
window.getCurrentPlayer = () => currentPlayer;
