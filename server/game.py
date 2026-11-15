import random
from enum import Enum
from random import randint
from typing import Optional

class GameState(Enum):
    LOBBY = 0
    PROMPT = 1
    DRAW = 2
    VOTE = 3

class Player:
    def __init__(self, name, colour):
        self.name = name
        self.colour = colour

class Game:
    def __init__(self, name, colour):
        self.host = Player(name, colour)
        self.players = [self.host]
        self.imposter: Optional[Player] = None
        self.turn = 0
        self.possiblePrompts = ["semi-colon"]
        self.possibleClues = ["punctuation"]
        self.promptIndex = -1
        self.state = GameState.LOBBY
        self.votes: dict[str, int] = {}
        self.promptsGiven = 0
        self.submittedTurns: list[str] = []

    def whoseTurn(self):
        if(self.state != GameState.LOBBY):
            return self.players[self.turn].name
        raise Exception("whoseTurn may not be called while in the lobby")

    def givePrompt(self, name):

        if(self.state != GameState.PROMPT):
            raise ValueError("givePrompt may not be called outside of PROMPT round")
        if not any(player.name == name for player in self.players):
            raise ValueError("Only players in the game may request a prompt")
        if(self.promptIndex == -1):
           self.promptIndex = randint(0, len(self.possiblePrompts)-1)

        self.promptsGiven+=1
        if(self.promptsGiven>=len(self.players)):
            self.state = GameState.DRAW

        if(self.imposter.name == name):
            return self.possibleClues[self.promptIndex]
        return self.possiblePrompts[self.promptIndex] #wooo

    def initialSummary(self):
        return {
            "host": self.host.name,
            "players": [
                {"name": player.name, "colour": player.colour}
                for player in self.players
            ],
        }

    def laterSummaries(self):
        return {
            "turn": self.whoseTurn(),
            "latest_image": self.submittedTurns[-1] if self.submittedTurns else None,
        }

    def publicSummary(self):
        summary = self.initialSummary()
        summary["state"] = self.state.name.lower()
        summary["turn"] = (
            self.whoseTurn() if self.state in (GameState.DRAW, GameState.VOTE) else None
        )
        summary["latest_image"] = (
            self.submittedTurns[-1] if self.submittedTurns else None
        )
        return summary

    def guessPrompt(self, guess):
        if(self.state == GameState.VOTE):
            self.state = GameState.LOBBY
            return guess == self.possiblePrompts[self.promptIndex]
        else:
            raise ValueError("Impostor may not guess the prompt until after the vote has finished")

    def startGame(self, startedBy):
        if(startedBy != self.host.name):
            raise ValueError("Only the host may start the game")
        if (self.state == GameState.LOBBY):
            self.imposter = random.choice(self.players)
            self.state = GameState.PROMPT
        else:
            raise ValueError("startGame may only be called in the lobby")

    def nextTurn(self):
        self.turn = (self.turn+1)%len(self.players)

    def voteFor(self, name):
        if(self.state != GameState.VOTE):
            raise ValueError("Players may only vote during the voting round.")

        if not (name in self.votes):
            self.votes[name] = 0
        self.votes[name] += 1

    def joinGame(self, name):

        for i in self.players:
            if(i.name==name):
                raise Exception("Players must have unique names and colours")

        self.players.append(Player(name, -1))

    def leaveGame(self, name, colour):
        if(self.state != GameState.LOBBY):
            raise Exception("May not leave while the game is ongoing")
        player = next((player for player in self.players if player.name == name), None)
        if player is None:
            raise ValueError("Player is not in the lobby")
        self.players.remove(player)
        if not self.players:
            raise ValueError("The host cannot leave an empty lobby")
        if(self.host is player):
            self.host = random.choice(self.players)

    def submitTurn(self, player_id: str, imageString: str):
        if self.state != GameState.DRAW or player_id != self.whoseTurn():
            raise ValueError("Only the current player may submit a drawing")
        self.submittedTurns.append(imageString)
        if len(self.submittedTurns) >= len(self.players):
            self.state = GameState.VOTE
        else:
            self.nextTurn()

    def chooseColour(self, playerName, chosenColour):

        player = None
        for i in self.players:
            if(i.name == playerName):
                player = i
            elif(i.colour == chosenColour):
                raise Exception("May not choose the same colour as another player")

        if player is None:
            raise ValueError("Player is not in the lobby")
        player.colour = chosenColour


    def voteWinner(self):
        if(self.state != GameState.VOTE):
            raise Exception("voteWinner may not be called outside of voting")

        winner = ("skip",-1)

        for i, j in self.votes.items():
            if j>winner[1]:
                winner = (i,j)

        return winner[0]