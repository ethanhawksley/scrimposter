let websocket = null;
let currentRoom = null;
let currentPlayer = null;
let stateListener = null;
let latestSequence = -1;
let leavingGame = false;
let leaveTimer = null;
const NICKNAME_STORAGE_KEY = "scrimposter.nickname";

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

if (typeof document !== "undefined") {
    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", restoreSavedNickname);
    } else {
        restoreSavedNickname();
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

function getBackendLocation() {
    const isFile = window.location.protocol === "file:";
    const hostname = isFile ? "127.0.0.1" : window.location.hostname;
    const developmentHost = isFile || ["0.0.0.0", "127.0.0.1", "localhost", ""].includes(hostname);
    const resolvedHost = developmentHost
        ? `${hostname === "0.0.0.0" || hostname === "" ? "127.0.0.1" : hostname}:8000`
        : window.location.host;
    const httpBase = developmentHost ? `http://${resolvedHost}` : window.location.origin;
    const wsProtocol = !isFile && window.location.protocol === "https:" ? "wss:" : "ws:";
    return { httpBase, wsBase: `${wsProtocol}//${resolvedHost}` };
}

function connectToRoom(roomCode, playerId, onState, onEvent, joinOnConnect = false) {
    currentRoom = roomCode;
    currentPlayer = playerId;
    stateListener = onState;
    latestSequence = -1;

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

function toggleCodeVisibility() {
    sendCommand("toggle_code_visibility");
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
    if (createBtn) {
        createBtn.disabled = true;
    }
    setConnectionStatus("Creating room...", true);
    try {
        const { httpBase } = getBackendLocation();
        const params = new URLSearchParams({ player_id: name, colour: "1" });
        const response = await fetch(`${httpBase}/rooms?${params}`, {
            method: "POST",
        });
        const data = await response.json();
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
window.returnToLobby = returnToLobby;
window.returnToMainMenu = returnToMainMenu;
window.finishLeavingGame = finishLeavingGame;
window.isLeavingGame = () => leavingGame;
window.getCurrentPlayer = () => currentPlayer;
