let websocket = null;
const WS_URL = "ws://localhost:3000/";
let url = "127.0.0.1:8000"

function webSocketTest() {
    if (websocket && websocket.readyState === WebSocket.OPEN) {
        console.log("Already connected.");
        return;
    }

    if (websocket && websocket.readyState === WebSocket.CONNECTING) {
        console.log("Connection already in progress.");
        return;
    }

    websocket = new WebSocket(WS_URL);

    websocket.addEventListener("open", () => {
        console.log("CONNECTED");
        updateConnectionStatus("Connected");
    });

    websocket.addEventListener("message", (event) => {
        console.log("Received:", event.data);
        try {
            const data = JSON.parse(event.data);
            handleServerMessage(data);
        } catch (error) {
            console.error("Invalid JSON received:", error);
        }
    });

    websocket.addEventListener("error", (event) => {
        console.error("WebSocket error:", event);
        updateConnectionStatus("Error");
    });

    websocket.addEventListener("close", (event) => {
        console.log("WebSocket closed:", event.code, event.reason);
        updateConnectionStatus("Disconnected");
    });
}

async function createRoom(userID, colour_in){
    let response = await fetch(url + '/rooms', {
        method: "POST",
        playerId: userID,
        colour: colour_in
    })
    console.log("Room" + response["lobby_code"] + "Created")
}
 
async function joinRoom(room_code_in, userID, colour_in){
    let response = await fetch(url + '/rooms/' + room_code_in + '/join', {
        method: "POST",
        room_code: room_code_in,
        playerId: userID,
        colour: colour_in
    })
}

async function startGame(room_code_in, userID){
    let response = await fetch(url + '/games', {
        method: "POST",
        room_code: room_code_in,
        playerId: userID,
    })
}

async function get_turn(room_code_in){
    let response = await fetch(url + '/games/', {
        method: "POST",
        room_code: room_code_in,
    })
}

async function get_game_info(room_code_in){
    let response = await fetch(url + '/games/' + room_code_in + '/info', {
        method: "POST",
        room_code: room_code_in
    })
}

async function get_prompt(room_code_in, userID){
    let response = await fetch(url + '/games/' + room_code_in + '/prompt', {
        method: 'POST',
        room_code: room_code_in,
        playerId: userID
    })
}

async function vote(room_code_in, userID){
    let response = await fetch(url + '/games/' + room_code_in + '/prompt', {
        method: 'POST',
        room_code: room_code_in,
        targetId: userID
    })
}

