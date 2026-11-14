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
    code = generate_lobby_code()
    active_lobbies[code] = Game(Player(player_id, colour)) # check constructor
    return {"lobby_code": code, "message": "Lobby created"}

@app.post("/rooms/{room_code}/join")
def join_room(
    room_code: str,
    player_id: str,
    colour: int
):
    active_lobbies[room_code].joinGame(Player(player_id, colour))  
    return {"message": "Joined room {room_code}"}  

# GAMES

@app.post("/games")
def start_game(
    room_code: str,
    player_id: str
):
    active_lobbies[room_code].startGame(player_id) # Probably ask 
    return {"message": "Game started"}

@app.get("/games/{room_code}/turn")
def get_turn(
    room_code: str
):
    return {"turn": active_lobbies[room_code].whoseTurn()}

@app.post("/games/{room_code}/turn")
async def submit_turn(
    room_code: str,
    player_id: str,
    image: str
):
    game = active_lobbies[room_code]
    if game.whoseTurn == player_id:
        game.submitTurn(image)
        return {"message": "Turn submitted"}
    return {"message": "Turn not submitted"}

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
    return {"message": "Voted for {target_id}"}

# Utilities

def generate_lobby_code() -> str:
    out = ""
    for i in range(6): out += str(randint(0,9))
    return out


if __name__ == "__main__":
    for i in range(10): print(generate_lobby_code())