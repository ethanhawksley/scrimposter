let websocket = null;
let currentRoom = null;
let currentPlayer = null;
let stateListener = null;
let latestSequence = -1;

function connectToRoom(roomCode, playerId, onState, onEvent) {
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

    websocket.addEventListener("message", (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "state" && stateListener) {
            const sequence = message.payload.sequence ?? 0;
            if (sequence >= latestSequence) {
                latestSequence = sequence;
                stateListener(message.payload.game);
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

window.connectToRoom = connectToRoom;
window.sendCommand = sendCommand;
window.joinRoom = joinRoom;
window.startGame = startGame;
window.requestPrompt = requestPrompt;
window.submitTurn = submitTurn;
window.vote = vote;
