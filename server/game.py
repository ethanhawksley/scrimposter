import random
from enum import Enum
from random import randint

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
    imposter = Player()
    players = [imposter]
    turn = 0
    possiblePrompts = ["semi-colon"] #fill in later
    possibleClues = ["punctuation"] #we love parallel lists wooo
    promptIndex = -1
    state = GameState.LOBBY
    votes = {}

    def __init__(self, player):
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

        if(player == self.imposter):
            return self.possibleClues[self.promptIndex]
        return self.possiblePrompts[self.promptIndex] #wooo

    def guessPrompt(self, guess):
        if(self.state == GameState.VOTE):
            return guess == self.possiblePrompts[self.promptIndex]
        else:
            raise Exception("Impostor may not guess the prompt until after the vote has finished")

    def startGame(self):
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