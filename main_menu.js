let websocket = null;
let currentRoom = null;
let currentPlayer = null;
let stateListener = null;
let latestSequence = -1;

function connectToRoom(roomCode, playerId, onState, onEvent, joinOnConnect = false) {
    currentRoom = roomCode;
    currentPlayer = playerId;
    stateListener = onState;
    latestSequence = -1;

    if (websocket) {
        websocket.close();
    }

    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    const developmentHost = ["0.0.0.0", "127.0.0.1", "localhost"]
        .includes(window.location.hostname);
    const host = developmentHost
        ? `${window.location.hostname === "0.0.0.0" ? "127.0.0.1" : window.location.hostname}:8000`
        : window.location.host;
    websocket = new WebSocket(
        `${protocol}//${host}/ws/${encodeURIComponent(roomCode)}?player_id=${encodeURIComponent(playerId)}`
    );

    websocket.addEventListener("open", () => {
        if (joinOnConnect) {
            joinRoom();
        }
    });

    websocket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
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

    websocket.addEventListener("error", (event) => {
        console.error("WebSocket error:", event);
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

function requestPrompt() {
    sendCommand("request_prompt");
}

function submitTurn(image) {
    sendCommand("submit_turn", { image });
}

function vote(target) {
    sendCommand("vote", { target });
}

function CodeEnter() {
    const code = document.getElementById('codeText').value.trim();
    const name = document.getElementById('nameText').value.trim();
    connectToRoom(code, name, window.renderGameState, window.handleGameEvent, true);
}

async function createRoom(name) {
    const params = new URLSearchParams({ player_id: name, colour: "1" });
    const response = await fetch(`http://127.0.0.1:8000/rooms?${params}`, {
        method: "POST",
    })
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
}

window.connectToRoom = connectToRoom;
window.sendCommand = sendCommand;
window.joinRoom = joinRoom;
window.startGame = startGame;
window.requestPrompt = requestPrompt;
window.submitTurn = submitTurn;
window.vote = vote;
