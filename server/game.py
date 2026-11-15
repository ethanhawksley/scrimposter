import random
from enum import Enum
from random import randint
from typing import Optional

class GameState(Enum):
    LOBBY = 0
    PROMPT = 1
    DRAW = 2
    VOTE = 3
    RESULTS = 4

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
        self.code_visible = False
        self.votes: dict[str, int] = {}
        self.voted_players: set[str] = set()
        self.result: Optional[dict[str, str]] = None
        self.promptsGiven = 0
        self.round_submissions = 0
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

        if(self.imposter.name == name): #type: ignore
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
        summary["code_visible"] = self.code_visible
        summary["state"] = self.state.name.lower()
        summary["turn"] = (
            self.whoseTurn() if self.state in (GameState.DRAW, GameState.VOTE) else None
        )
        summary["latest_image"] = (
            self.submittedTurns[-1] if self.submittedTurns else None
        )
        summary["votes_received"] = len(self.voted_players)
        summary["voted_players"] = list(self.voted_players)
        summary["result"] = self.result
        return summary

    def toggleCodeVisibility(self, player_name):
        if player_name != self.host.name:
            raise ValueError("Only the host may change lobby code visibility")
        self.code_visible = not self.code_visible

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
            self.votes.clear()
            self.voted_players.clear()
            self.result = None
            self.round_submissions = 0
            self.state = GameState.PROMPT
        else:
            raise ValueError("startGame may only be called in the lobby")

    def nextTurn(self):
        self.turn = (self.turn+1)%len(self.players)

    def voteFor(self, voter, name):
        if(self.state != GameState.VOTE):
            raise ValueError("Players may only vote during the voting round.")
        if not any(player.name == voter for player in self.players):
            raise ValueError("Only players in the game may vote")
        if voter in self.voted_players:
            raise ValueError("Each player may only vote once")
        if name != "skip" and not any(player.name == name for player in self.players):
            raise ValueError("Vote target is not in the game")

        self.votes[name] = self.votes.get(name, 0) + 1
        self.voted_players.add(voter)
        if len(self.voted_players) == len(self.players):
            self.resolveVotes()

    def resolveVotes(self):
        highest_player_votes = max(
            (votes for target, votes in self.votes.items() if target != "skip"),
            default=0,
        )
        skip_votes = self.votes.get("skip", 0)
        if skip_votes >= highest_player_votes:
            self.state = GameState.DRAW
            self.turn = 0
            self.round_submissions = 0
            self.votes.clear()
            self.voted_players.clear()
            self.result = None
            return

        accused = max(
            (target for target in self.votes if target != "skip"),
            key=self.votes.__getitem__,
        )
        self.state = GameState.RESULTS
        self.result = {
            "accused": accused,
            "imposter": self.imposter.name if self.imposter else "",
            "correct": str(accused == self.imposter.name).lower(),
        }

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
        self.round_submissions += 1
        if self.round_submissions >= len(self.players):
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