
const WebSocket = require("ws");

const server = new WebSocket.Server({
    port: 3000
});

server.on("connection", (socket) => {

    console.log("Client connected.");

    socket.on("message", (message) => {

        try {
            const data = JSON.parse(message.toString());

            console.log("Received:", data);

            switch (data.type) {

                case "CREATE_ROOM":

                    const roomCode = data.payload.roomCode;

                    socket.send(JSON.stringify({
                        type: "ROOM_CREATED",
                        payload: {
                            roomCode: roomCode,
                            success: true
                        }
                    }));

                    break;

                case "GET_ROOM":

                    socket.send(JSON.stringify({
                        type: "ROOM_DATA",
                        payload: {
                            roomCode: data.payload.roomCode,
                            players: []
                        }
                    }));

                    break;

            }

        } catch (error) {
            console.error("Invalid message:", error);
        }
    });

    socket.on("close", () => {
        console.log("Client disconnected.");
    });

});

console.log("WebSocket server running on port 3000.");
