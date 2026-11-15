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
    IMPOSTER_GUESS = 5

class Player:
    def __init__(self, name, colour):
        self.name = name
        self.colour = colour

class Game:
    COLOUR_PALETTE = (
        "#e74c3c",
        "#3498db",
        "#2ecc71",
        "#f1c40f",
        "#9b59b6",
        "#e67e22",
        "#1abc9c",
        "#e84393",
        "#00cec9",
        "#6c5ce7",
        "#d35400",
        "#2d3436",
    )

    def __init__(self, name, colour):
        self.players = []
        self.host = Player(name, self._new_colour())
        self.players.append(self.host)
        self.imposter: Optional[Player] = None
        self.turn = 0
        self.possiblePrompts = ["A lighthouse"]
        self.possibleClues = ["It guides ships at night"]
        self.promptIndex = -1
        self.state = GameState.LOBBY
        self.code_visible = False
        self.votes: dict[str, int] = {}
        self.voted_players: set[str] = set()
        self.result: Optional[dict[str, str]] = None
        self.promptsGiven = 0
        self.round_submissions = 0
        self.submittedTurns: list[str] = []
        self.returned_players: set[str] = set()

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

        self.promptsGiven += 1
        if(self.promptsGiven>=len(self.players)):
            self.state = GameState.DRAW

        if self.imposter and self.imposter.name == name:
            return {
                "role": "imposter",
                "prompt": self.possibleClues[self.promptIndex],
                "title": "You are the imposter",
                "description": "Blend in while drawing. Work out the secret word before the good players find you.",
            }
        return {
            "role": "good",
            "prompt": self.possiblePrompts[self.promptIndex],
            "title": "You are a good player",
            "description": "Draw the secret word and identify the imposter.",
        }

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

    def publicSummary(self, viewer: Optional[str] = None):
        summary = self.initialSummary()
        summary["code_visible"] = self.code_visible
        viewer_returned = viewer in self.returned_players
        summary["state"] = "lobby" if viewer_returned else self.state.name.lower()
        summary["turn"] = (
            self.whoseTurn() if self.state in (GameState.DRAW, GameState.VOTE) else None
        )
        summary["latest_image"] = (
            self.submittedTurns[-1] if self.submittedTurns else None
        )
        summary["votes_received"] = len(self.voted_players)
        summary["voted_players"] = list(self.voted_players)
        summary["result"] = self.result
        summary["returned_to_lobby"] = viewer_returned
        return summary

    def toggleCodeVisibility(self, player_name):
        if player_name != self.host.name:
            raise ValueError("Only the host may change lobby code visibility")
        self.code_visible = not self.code_visible

    def guessPrompt(self, player_name, guess):
        if self.state != GameState.IMPOSTER_GUESS:
            raise ValueError("The imposter may only guess after being voted out")
        if not self.imposter or player_name != self.imposter.name:
            raise ValueError("Only the imposter may guess the prompt")
        correct = guess.strip().casefold() == self.possiblePrompts[self.promptIndex].casefold()
        self.result = {
            "outcome": "Imposter wins" if correct else "Good players win",
            "accused": self.imposter.name,
            "imposter": self.imposter.name,
            "prompt": self.possiblePrompts[self.promptIndex],
            "guess": guess,
            "correct": str(correct).lower(),
        }
        self.state = GameState.RESULTS

    def startGame(self, startedBy):
        if(startedBy != self.host.name):
            raise ValueError("Only the host may start the game")
        if self.returned_players:
            raise ValueError("All players must return to the lobby before starting a new game")
        if (self.state == GameState.LOBBY):
            self.imposter = random.choice(self.players)
            self.votes.clear()
            self.voted_players.clear()
            self.result = None
            self.round_submissions = 0
            self.promptIndex = -1
            self.promptsGiven = 0
            self.returned_players.clear()
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
        player_votes = {
            target: votes for target, votes in self.votes.items() if target != "skip"
        }
        highest_player_votes = max(player_votes.values(), default=0)
        skip_votes = self.votes.get("skip", 0)
        tied_players = sum(votes == highest_player_votes for votes in player_votes.values())
        if skip_votes >= highest_player_votes or tied_players > 1:
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
        if not self.imposter or accused != self.imposter.name:
            self.result = {
                "outcome": "Imposter wins",
                "accused": accused,
                "imposter": self.imposter.name if self.imposter else "",
                "prompt": self.possiblePrompts[self.promptIndex],
                "correct": "false",
            }
            self.state = GameState.RESULTS
            return

        self.state = GameState.IMPOSTER_GUESS
        self.votes.clear()
        self.voted_players.clear()

    def joinGame(self, name):

        for i in self.players:
            if(i.name==name):
                raise Exception("Players must have unique names and colours")

        self.players.append(Player(name, self._new_colour()))

    def _new_colour(self):
        used_colours = {player.colour for player in self.players}
        available_colours = [
            colour for colour in self.COLOUR_PALETTE if colour not in used_colours
        ]
        if available_colours:
            return random.choice(available_colours)
        return f"#{random.randint(0, 0xFFFFFF):06x}"

    def leaveGame(self, name, colour=None):
        player = next((player for player in self.players if player.name == name), None)
        if player is None:
            raise ValueError("Player is not in the lobby")
        self.players.remove(player)
        self.returned_players.discard(name)
        if not self.players:
            return
        if self.host is player:
            self.host = random.choice(self.players)
        self.turn %= len(self.players)
        if self.returned_players == {remaining.name for remaining in self.players}:
            self.returnToLobby()

    def returnPlayerToLobby(self, name):
        if name not in {player.name for player in self.players}:
            raise ValueError("Player is not in the game")
        self.returned_players.add(name)
        if self.returned_players == {player.name for player in self.players}:
            self.returnToLobby()

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

    def returnToLobby(self):
        self.state = GameState.LOBBY
        self.imposter = None
        self.promptIndex = -1
        self.promptsGiven = 0
        self.round_submissions = 0
        self.submittedTurns.clear()
        self.votes.clear()
        self.voted_players.clear()
        self.result = None
        self.turn = 0
        self.returned_players.clear()
        for player in self.players:
            player.colour = self._new_colour()