from fastapi import FastAPI, UploadFile, File

app = FastAPI()

@app.get("/")
def read_root():
    return {"Game Server: Running"}

# ROOMS

@app.post("/rooms")
def create_room():
    raise NotImplementedError("'create_room' not implemented!")

@app.post("/rooms/{room_code}/join")
def join_room():
    raise NotImplementedError("'join_room' not implemented!")

# GAMES

@app.get("/games")
def create_game():
    raise NotImplementedError("'create_game' not implemented!")

@app.get("/games/{game_id}/turn")
def get_turn():
    raise NotImplementedError("'get turn' not implemented!")

@app.post("/games/{game_id}/turn")
async def submit_turn(
    game_id: str,
    player_id: str,
    image: str
):
    raise NotImplementedError("'submit_turn' not implemented!")

# MISC

@app.get("/games/{game_id}/prompt")
def get_prompt(
    game_id: str,
    player_id: str
):
    raise NotImplementedError("'get_prompt' not implemented!")

