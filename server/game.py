import random
from enum import Enum
from random import randint
from typing_extensions import Optional

class GameState(Enum):
    LOBBY = 0
    PROMPT = 1
    DRAW = 2
    VOTE = 3

class Player:
    name = ""
    colour = 0

    def __init__(self, name, colour):
        self.name = name
        self.colour = colour

class Game:
    imposter: Optional[Player] = None
    host: Optional[Player] = imposter
    players: list[Player] = []
    turn: int = 0
    possiblePrompts: list[str] = ["semi-colon"] #fill in later
    possibleClues: list[str] = ["punctuation"] #we love parallel lists wooo
    promptIndex: int = -1
    state: GameState = GameState.LOBBY
    votes: dict = {}
    promptsGiven: int = 0
    submittedTurns: list = []

    def __init__(self, player):
        self.host = player
        self.players = [player]

    def whoseTurn(self):
        if(self.state != GameState.LOBBY):
            return self.players[self.turn].name
        raise Exception("whoseTurn may not be called while in the lobby")

    def givePrompt(self, player):
        if(self.state != GameState.PROMPT):
            raise Exception("givePrompt may not be called outside of PROMPT round")
        if(self.promptIndex == -1):
           self.promptIndex = randint(0, len(self.possiblePrompts)-1)

        self.promptsGiven+=1
        if(self.promptsGiven>=len(self.players)):
            self.state = GameState.DRAW

        if(player == self.imposter):
            return self.possibleClues[self.promptIndex]
        return self.possiblePrompts[self.promptIndex] #wooo

    def guessPrompt(self, guess):
        if(self.state == GameState.VOTE):
            return guess == self.possiblePrompts[self.promptIndex]
        else:
            raise Exception("Impostor may not guess the prompt until after the vote has finished")

    def startGame(self, startedBy):
        if(startedBy != self.host):
            raise Exception("Player "+startedBy+" does not have permission to start the game")
        if (self.state == GameState.LOBBY):
            self.imposter = random.choice(self.players)
            self.state = GameState.PROMPT
        else:
            raise Exception("startGame method can only be called in the lobby")

    def nextTurn(self):
        self.turn = (self.turn+1)%len(self.players)

    def voteFor(self, player):
        if(self.state != GameState.VOTE):
            raise Exception("Players may only vote during the voting round.")

        if(player in self.votes):
            self.votes[player] = 0
        self.votes[player] = self.votes[player]+1

    def joinGame(self, player):
        self.players.append(player)

    def leaveGame(self, player):
        self.players.remove(player)
        if(self.host==player):
            self.host = random.choice(self.players)

    def submitTurn(self, imageString):
        self.submittedTurns.append(imageString)