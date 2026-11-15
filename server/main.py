import asyncio
import sys
from collections import defaultdict
from pathlib import Path
from random import randint
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse

SERVER_DIR = Path(__file__).resolve().parent
ROOT_DIR = SERVER_DIR.parent
if str(SERVER_DIR) not in sys.path:
    sys.path.insert(0, str(SERVER_DIR))
from game import Game, GameState

FRONTEND_FILES = {
    "index.html": "text/html; charset=utf-8",
    "style.css": "text/css; charset=utf-8",
    "draw.js": "application/javascript; charset=utf-8",
    "main_menu.js": "application/javascript; charset=utf-8",
}
DISCONNECT_GRACE_SECONDS = 12

app = FastAPI()
active_lobbies: dict[str, Game] = {}
connections: dict[str, dict[str, set[WebSocket]]] = defaultdict(lambda: defaultdict(set))
room_locks: dict[str, asyncio.Lock] = defaultdict(asyncio.Lock)
room_sequences: dict[str, int] = defaultdict(int)
pending_leaves: dict[tuple[str, str], asyncio.Task] = {}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Restrict this when deploying
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

@app.get("/")
def read_root():
    index_path = ROOT_DIR / "index.html"
    if index_path.is_file():
        return FileResponse(index_path, media_type="text/html; charset=utf-8")
    return {"Game Server": "Running"}

@app.get("/health")
def health_check():
    return {"Game Server": "Running"}

# ROOMS

@app.post("/rooms")
def create_room(
    player_id: str,
    colour: int = 1,
    code_visible: bool = True,
):
    room_code = generate_lobby_code()
    try:
        active_lobbies[room_code] = Game(player_id, colour, code_visible=code_visible)
    except ValueError as error:
        return JSONResponse({"message": str(error)}, status_code=400)
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
    except Exception as error:
        return {"message": str(error), "success": "False"}

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
    image: str,
    ink_used: int = 0,
):
    game = active_lobbies[room_code]
    game.submitTurn(player_id, image, ink_used)
    return {"message": "Turn submitted"}

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
    player_id: str,
    target_id: str
):
    active_lobbies[room_code].voteFor(player_id, target_id)
    return {"message": f"Voted for {target_id}"}


@app.websocket("/ws/{room_code}")
async def game_socket(websocket: WebSocket, room_code: str, player_id: str):
    await websocket.accept()
    game = active_lobbies.get(room_code)
    if game is None:
        await send_error(websocket, "invalid_room", "Room does not exist")
        await websocket.close(code=1008)
        return

    clean_id = player_id.strip()
    if not clean_id or len(clean_id) > 24:
        await send_error(websocket, "invalid_name", "Enter a valid nickname")
        await websocket.close(code=1008)
        return

    joined = False
    async with room_locks[room_code]:
        active_same_name = any(
            pid.casefold() == clean_id.casefold() and sockets
            for pid, sockets in connections.get(room_code, {}).items()
        )
        if active_same_name:
            await send_error(websocket, "name_taken", "That name is already taken")
            await websocket.close(code=1008)
            return

        existing_player = next(
            (p for p in game.players if p.name.casefold() == clean_id.casefold()),
            None,
        )
        if existing_player is not None:
            if existing_player.name != clean_id:
                await send_error(websocket, "name_taken", "That name is already taken")
                await websocket.close(code=1008)
                return
            pending = pending_leaves.pop((room_code, clean_id), None)
            if pending:
                pending.cancel()
            connections[room_code][clean_id].add(websocket)
            joined = True
            await send_event(websocket, "connection_ready", {"room_code": room_code})
            await send_snapshot(websocket, game, clean_id, room_code)
        else:
            if game.state not in (GameState.LOBBY, GameState.RESULTS):
                await send_error(websocket, "game_in_progress", "Cannot join a game already in progress")
                await websocket.close(code=1008)
                return
            await send_event(websocket, "connection_ready", {"room_code": room_code})

    try:
        while True:
            message = await websocket.receive_json()
            result = await handle_command(room_code, clean_id, websocket, message, joined)
            if result is None:
                return
            joined = result
    except WebSocketDisconnect:
        pass
    except Exception:
        try:
            await websocket.close(code=1011)
        except Exception:
            pass
    finally:
        async with room_locks[room_code]:
            if clean_id in connections.get(room_code, {}):
                connections[room_code][clean_id].discard(websocket)
                still_connected = bool(connections[room_code][clean_id])
                if not still_connected:
                    del connections[room_code][clean_id]
            else:
                still_connected = False
            if room_code in connections and not connections[room_code]:
                del connections[room_code]
            if (
                joined
                and not still_connected
                and active_lobbies.get(room_code) is game
                and clean_id in {player.name for player in game.players}
            ):
                if game.state in (GameState.LOBBY, GameState.RESULTS):
                    game.leaveGame(clean_id)
                    if not game.players:
                        active_lobbies.pop(room_code, None)
                    else:
                        await broadcast_snapshot(room_code, game)
                else:
                    key = (room_code, clean_id)
                    old = pending_leaves.pop(key, None)
                    if old:
                        old.cancel()
                    pending_leaves[key] = asyncio.create_task(
                        delayed_leave(room_code, clean_id, game)
                    )


async def handle_command(
    room_code: str, player_id: str, websocket: WebSocket, message: Any, joined: bool = True
):
    if not isinstance(message, dict) or not isinstance(message.get("type"), str):
        await send_error(websocket, "invalid_message", "Expected a message type")
        return joined

    game = active_lobbies.get(room_code)
    if game is None:
        await send_error(websocket, "invalid_room", "Room does not exist")
        return joined

    command = message["type"]
    payload = message.get("payload") or {}
    if not isinstance(payload, dict):
        await send_error(websocket, "invalid_message", "Payload must be an object")
        return joined

    async with room_locks[room_code]:
        try:
            if command == "join_room":
                if joined and player_id in {p.name for p in game.players}:
                    await send_snapshot(websocket, game, player_id, room_code)
                    return True
                game.joinGame(player_id)
                connections[room_code][player_id].add(websocket)
                joined = True
            elif not joined:
                raise ValueError("You must join the room first")
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
                ink_used = payload.get("ink_used")
                game.submitTurn(player_id, image, ink_used)
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
            elif command == "check_guess":
                accepted = payload.get("accepted")
                if not isinstance(accepted, bool):
                    raise ValueError("accepted must be a boolean")
                game.checkGuess(player_id, accepted)
            elif command == "return_lobby":
                game.returnPlayerToLobby(player_id)
            elif command == "kick_player":
                target = payload.get("target")
                if not isinstance(target, str):
                    raise ValueError("target must be a player name")
                game.kickPlayer(player_id, target)
                pending = pending_leaves.pop((room_code, target), None)
                if pending:
                    pending.cancel()
            elif command == "leave_game":
                pending = pending_leaves.pop((room_code, player_id), None)
                if pending:
                    pending.cancel()
                game.leaveGame(player_id)
            else:
                await send_error(websocket, "unknown_command", command)
                return joined
        except (AttributeError, KeyError, ValueError) as error:
            await send_error(websocket, "command_rejected", str(error))
            if not joined and command == "join_room":
                await websocket.close(code=1008)
                return None
            return joined

        kicked_sockets = (
            connections.get(room_code, {}).pop(payload.get("target"), set())
            if command == "kick_player"
            else set()
        )
        await broadcast_snapshot(room_code, game)
        for kicked_socket in list(kicked_sockets):
            try:
                await send_event(kicked_socket, "kicked", {"message": "You were removed from the room by the host."})
                await kicked_socket.close(code=1008)
            except Exception:
                pass
        if command == "leave_game":
            if not game.players:
                active_lobbies.pop(room_code, None)
            await send_event(websocket, "leave_complete", {})
        return joined


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


async def delayed_leave(room_code: str, player_id: str, target_game: Game):
    try:
        await asyncio.sleep(DISCONNECT_GRACE_SECONDS)
        async with room_locks[room_code]:
            pending_leaves.pop((room_code, player_id), None)
            game = active_lobbies.get(room_code)
            if game is not target_game:
                return
            if connections.get(room_code, {}).get(player_id):
                return
            if player_id in {player.name for player in game.players}:
                game.leaveGame(player_id)
            if not game.players:
                active_lobbies.pop(room_code, None)
            else:
                await broadcast_snapshot(room_code, game)
    except asyncio.CancelledError:
        return


async def broadcast_snapshot(room_code: str, game: Game):
    room_sequences[room_code] += 1
    seq = room_sequences[room_code]
    for player_id, player_sockets in list(connections.get(room_code, {}).items()):
        summary = game.publicSummary(player_id)
        summary["room_code"] = room_code
        for socket in list(player_sockets):
            try:
                await send_event(socket, "state", {
                    "player_id": player_id,
                    "sequence": seq,
                    "game": summary,
                })
            except Exception:
                player_sockets.discard(socket)


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

@app.get("/{asset_name}")
def serve_frontend_asset(asset_name: str):
    media_type = FRONTEND_FILES.get(asset_name)
    if not media_type:
        return JSONResponse({"detail": "Not found"}, status_code=404)
    asset_path = ROOT_DIR / asset_name
    if not asset_path.is_file():
        return JSONResponse({"detail": "Not found"}, status_code=404)
    return FileResponse(asset_path, media_type=media_type)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)