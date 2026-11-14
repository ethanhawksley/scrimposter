// function genRoomCode(){
//     let chars = ["A","B","C","D","E","F","G","H","I","J","K","L","M","N","O","P","Q","R","S","T","U","V","W","X","Y","Z","0","1","2","3","4","5","6","7","8","9"]
//     let code = ""
//     for (let step = 0; step < 6; step++) {
//         code = code + chars[Math.floor(Math.random() * chars.length)]
//     }
//     document.getElementById("CodeGen").innerText = code
// }

// function webSocketTest() {
//     const websocket = new WebSocket("ws://localhost:3000/")
//     console.log("Websocket opened.")
//     console.log(websocket.readyState);

//     websocket.addEventListener("open", () => {
//         console.log("CONNECTED");
//     });
//     websocket.addEventListener("error", (event) => {
//         console.error("WebSocket connection error", event);
//     });

//     websocket.addEventListener("close", (event) => {
//         console.log("WebSocket closed", event.code, event.reason);
//     });
// }

// async function post_code(code, post_url){
//     const response = fetch(post_url, {
//         method: "POST",
//         headers: {"Content-Type": "text/plain"},
//         body: code
//     });
// }


// WebSocket connection
let websocket = null;
const WS_URL = "ws://localhost:3000/";

// Generate a six-character room code
function genRoomCode() {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let code = "";

    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }

    document.getElementById("CodeGen").innerText = code;
}

// Establish WebSocket connection
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

    // Receive and parse incoming messages
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

// Send data to the WebSocket server
function sendMessage(type, payload) {
    if (!websocket || websocket.readyState !== WebSocket.OPEN) {
        console.error("Cannot send: WebSocket is not connected.");
        return false;
    }

    const message = {
        type: type,
        payload: payload
    };

    websocket.send(JSON.stringify(message));

    console.log("Sent:", message);
    return true;
}

// Process incoming server messages
function handleServerMessage(data) {
    console.log("Message type:", data.type);
    console.log("Payload:", data.payload);

    switch (data.type) {

        case "ROOM_CREATED":
            console.log("Room created:", data.payload);
            break;

        case "PLAYER_JOINED":
            console.log("Player joined:", data.payload);
            break;

        case "CHAT_MESSAGE":
            console.log("Chat message:", data.payload);
            break;

        default:
            console.warn("Unknown message type:", data.type);
    }
}

// Update connection status on the webpage
function updateConnectionStatus(status) {
    const element = document.getElementById("WSStatus");

    if (element) {
        element.textContent = "WebSocket: " + status;
    }
}

// Example: send the generated room code to the server
function createRoom() {
    const code = document.getElementById("CodeGen").textContent;

    sendMessage("CREATE_ROOM", {
        roomCode: code
    });
}

// Example: request information from the server
function requestRoomData(code) {
    sendMessage("GET_ROOM", {
        roomCode: code
    });
}

