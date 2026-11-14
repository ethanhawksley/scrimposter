from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

@app.get("/")
def read_root():
    return {"Game Server: Running"}

@app.get("/games")
def create_game():
    raise NotImplementedError("'create_game' not implemented!")

@app.post("/games/{game_id}/turn")
async def submit_turn(
    game_id: str,
    player_id: str,
    image: str
):
    raise NotImplementedError("'submit_turn' not implemented!")

