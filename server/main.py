from fastapi import FastAPI
from game import Player, Game
from random import randint

app = FastAPI()
active_lobbies: dict[str, Game] = {}

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
    if game.whoseTurn() == player_id:
        game.submitTurn(image)
        return {"message": "Turn submitted"}
    return {"message": "Turn not submitted"}

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