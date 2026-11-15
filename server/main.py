import asyncio
from collections import defaultdict
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from game import Game
from random import randint

app = FastAPI()
active_lobbies: dict[str, Game] = {}
connections: dict[str, dict[str, set[WebSocket]]] = defaultdict(lambda: defaultdict(set))
room_locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)
room_sequences: dict[str, int] = defaultdict(int)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict this when deploying
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

@app.get("/")
def read_root():
    return {"Game Server": "Running"}

# ROOMS

@app.post("/rooms")
def create_room(
    player_id: str,
    colour: int
):
    room_code = generate_lobby_code()
    active_lobbies[room_code] = Game(player_id, colour)
    return {"lobby_code": room_code, "message": "Lobby created"}

@app.post("/rooms/{room_code}/join")
def join_room(
    room_code: str,
    player_id: str,
):
    if not validate_room_code(room_code):
        return {"message": "Invalid room code", "success": "False"}
    try:
        active_lobbies[room_code].joinGame(player_id) 
        return {"message": f"Joined room {room_code}", "success": "True"}
    except KeyError:
        return {"message": f"{room_code} is not a valid room", "success": "False"}
    except:
        return {"message": "Name already in lobby", "success": "False"}

# GAMES

@app.post("/games")
def start_game(
    room_code: str,
    player_id: str
):
    active_lobbies[room_code].startGame(player_id)
    return {"message": "Game started"}

@app.get("/games/{room_code}/turn")
def get_turn(
    room_code: str
):
    try:
        return {"turn": active_lobbies[room_code].whoseTurn(), "message": f"Turn gathered"}
    except:
        return {"turn": "-1", "message": "Turn not available outside of a game"}

@app.post("/games/{room_code}/turn")
async def submit_turn(
    room_code: str,
    player_id: str,
    image: str
):
    game = active_lobbies[room_code]
    game.submitTurn(player_id, image)
    return {"message": "Turn submitted"}

@app.get("/games/{room_code}/info")
def get_game_info(
    room_code: str
):
    raise NotImplementedError("'get_game_info' no implemented")

# MISC

@app.get("/games/{room_code}/prompt")
def get_prompt(
    room_code: str,
    player_id: str
):
    return {"prompt": active_lobbies[room_code].givePrompt(player_id)}

@app.post("/games/{room_code}/vote")
def vote(
    room_code: str,
    target_id: str
):
    active_lobbies[room_code].voteFor(target_id)
    return {"message": f"Voted for {target_id}"}


@app.websocket("/ws/{room_code}")
async def game_socket(websocket: WebSocket, room_code: str, player_id: str):
    await websocket.accept()
    game = active_lobbies.get(room_code)
    if game is None:
        await send_error(websocket, "invalid_room", "Room does not exist")
        await websocket.close(code=1008)
        return

    connections[room_code][player_id].add(websocket)
    await send_event(websocket, "connection_ready", {"room_code": room_code})
    await send_snapshot(websocket, game, player_id, room_code)

    try:
        while True:
            message = await websocket.receive_json()
            await handle_command(room_code, player_id, websocket, message)
    except WebSocketDisconnect:
        should_broadcast = False
        async with room_locks[room_code]:
            connections[room_code][player_id].discard(websocket)
            if not connections[room_code][player_id]:
                del connections[room_code][player_id]
                if player_id in {player.name for player in game.players}:
                    game.leaveGame(player_id)
                    should_broadcast = True
            if not connections[room_code]:
                del connections[room_code]
            if not game.players:
                active_lobbies.pop(room_code, None)
            elif should_broadcast:
                await broadcast_snapshot(room_code, game)


async def handle_command(
    room_code: str, player_id: str, websocket: WebSocket, message: Any
):
    if not isinstance(message, dict) or not isinstance(message.get("type"), str):
        await send_error(websocket, "invalid_message", "Expected a message type")
        return

    game = active_lobbies.get(room_code)
    if game is None:
        await send_error(websocket, "invalid_room", "Room does not exist")
        return

    command = message["type"]
    payload = message.get("payload") or {}
    if not isinstance(payload, dict):
        await send_error(websocket, "invalid_message", "Payload must be an object")
        return

    async with room_locks[room_code]:
        try:
            if command == "join_room":
                game.joinGame(player_id)
            elif command == "toggle_code_visibility":
                game.toggleCodeVisibility(player_id)
            elif command == "start_game":
                game.startGame(player_id)
            elif command == "request_prompt":
                prompt = game.givePrompt(player_id)
                await send_event(websocket, "prompt", prompt)
            elif command == "submit_turn":
                image = payload.get("image")
                if not isinstance(image, str) or not image.startswith("data:image/"):
                    raise ValueError("image must be a data URL")
                if len(image) > 2_000_000:
                    raise ValueError("image is too large")
                game.submitTurn(player_id, image)
            elif command == "vote":
                target = payload.get("target")
                if not isinstance(target, str):
                    raise ValueError("target must be a player name")
                game.voteFor(player_id, target)
            elif command == "guess_prompt":
                guess = payload.get("guess")
                if not isinstance(guess, str) or not guess.strip():
                    raise ValueError("guess must not be empty")
                game.guessPrompt(player_id, guess)
            elif command == "return_lobby":
                game.returnPlayerToLobby(player_id)
            elif command == "leave_game":
                game.leaveGame(player_id)
            else:
                await send_error(websocket, "unknown_command", command)
                return
        except (AttributeError, KeyError, ValueError) as error:
            await send_error(websocket, "command_rejected", str(error))
            return

        await broadcast_snapshot(room_code, game)
        if command == "leave_game":
            if not game.players:
                active_lobbies.pop(room_code, None)
            await send_event(websocket, "leave_complete", {})


async def send_snapshot(
    websocket: WebSocket, game: Game, player_id: str, room_code: str
):
    summary = game.publicSummary(player_id)
    summary["room_code"] = room_code
    await send_event(websocket, "state", {
        "player_id": player_id,
        "sequence": 0,
        "game": summary,
    })


async def broadcast_snapshot(room_code: str, game: Game):
    room_sequences[room_code] += 1
    recipients = [
        socket
        for player_sockets in connections[room_code].values()
        for socket in player_sockets
    ]
    for player_id, player_sockets in connections[room_code].items():
        summary = game.publicSummary(player_id)
        summary["room_code"] = room_code
        for socket in player_sockets:
            await send_event(socket, "state", {
                "player_id": player_id,
                "sequence": room_sequences[room_code],
                "game": summary,
            })


async def send_event(websocket: WebSocket, event_type: str, payload: dict):
    await websocket.send_json({"type": event_type, "payload": payload})


async def send_error(websocket: WebSocket, code: str, message: str):
    await send_event(websocket, "error", {"code": code, "message": message})

# Utilities

def generate_lobby_code() -> str:
    while True:
        out = ""
        for i in range(6): out += str(randint(0,9))
        if out not in active_lobbies.keys():
            return out

def validate_room_code(room_code: str) -> bool:
    if len(room_code) != 6 or not room_code.isnumeric() or room_code not in active_lobbies.keys():
        return False
    return True

if __name__ == "__main__":
    for i in range(10): print(generate_lobby_code())