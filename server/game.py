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
    colour = -1
    roomCode = ""

    def __init__(self, name, colour):
        self.name = name

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

    def __init__(self, name, colour):
        self.host = Player(name, colour)
        self.players = [self.host]

    def whoseTurn(self):
        if(self.state != GameState.LOBBY):
            return self.players[self.turn].name
        raise Exception("whoseTurn may not be called while in the lobby")

    def givePrompt(self, name):

        if(self.state != GameState.PROMPT):
            raise Exception("givePrompt may not be called outside of PROMPT round")
        if(self.promptIndex == -1):
           self.promptIndex = randint(0, len(self.possiblePrompts)-1)

        self.promptsGiven+=1
        if(self.promptsGiven>=len(self.players)):
            self.state = GameState.DRAW

        if(self.imposter.name == name):
            return self.possibleClues[self.promptIndex]
        return self.possiblePrompts[self.promptIndex] #wooo

    def initialSummary(self):
        playerTuples = []

        for i in self.players:
            playerTuples.append((i.name,i.colour))

        return {"host":(self.host.name, self.host.colour), "players":playerTuples}

    def laterSummaries(self):
        whoseTurn = self.whoseTurn()
        return {"whose turn":(whoseTurn.name, whoseTurn.colour), "latest image":self.submittedTurns[-1]}

    def guessPrompt(self, guess):
        if(self.state == GameState.VOTE):
            self.state = GameState.LOBBY
            return guess == self.possiblePrompts[self.promptIndex]
        else:
            raise Exception("Impostor may not guess the prompt until after the vote has finished")

    def startGame(self, startedBy):
        if(startedBy != self.host.name):
            raise Exception("Player with colour"+startedBy+" does not have permission to start the game")
        if (self.state == GameState.LOBBY):
            self.imposter = random.choice(self.players)
            self.state = GameState.PROMPT
        else:
            raise Exception("startGame method can only be called in the lobby")

    def nextTurn(self):
        self.turn = (self.turn+1)%len(self.players)

    def voteFor(self, name):
        if(self.state != GameState.VOTE):
            raise Exception("Players may only vote during the voting round.")

        if not (name in self.votes):
            self.votes[name] = 0
        self.votes[name] = self.votes[name] + 1

    def joinGame(self, name, colour):
        self.players.append(Player(name, colour))

    def leaveGame(self, name, colour):
        if(self.state != GameState.LOBBY):
            raise Exception("May not leave while the game is ongoing")
        player = Player(name, colour)
        self.players.remove(player)
        if(self.host==player):
            self.host = random.choice(self.players)

    def submitTurn(self, imageString):
        self.submittedTurns.append(imageString)

    def chooseColour(self, playerName, chosenColour):

        for i in self.players:
            if(i.name == playerName):
                player = i
            elif(i.colour == chosenColour):
                raise Exception("May not choose the same colour as another player")

        player.colour = chosenColour

