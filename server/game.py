import random
from enum import Enum
from random import randint
from typing import Optional
from constants import PROMPTS

class GameState(Enum):
    LOBBY = 0
    PROMPT = 1
    DRAW = 2
    VOTE = 3
    RESULTS = 4
    IMPOSTER_GUESS = 5
    GUESS_CHECK = 6

class Player:
    def __init__(self, name, colour, max_ink):
        self.name = name
        self.colour = colour
        self.ink_remaining = max_ink

class Game:
    MAX_INK = 2000
    MIN_PLAYERS = 3
    COLOUR_PALETTE = (
        "#e74c3c",
        "#3498db",
        "#2ecc71",
        "#c99700",
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
        clean_name = name.strip()
        if not clean_name:
            raise ValueError("Enter a valid nickname")
        self.players = []
        self.host = Player(clean_name, self._new_colour(), self.MAX_INK)
        self.players.append(self.host)
        self.imposter: Optional[Player] = None
        self.turn = 0
        self.possiblePrompts = [prompt for prompt, _ in PROMPTS]
        self.possibleClues = [clue for _, clue in PROMPTS]
        self.promptIndex = -1
        self.used_prompt_indices: set[int] = set()
        self.state = GameState.LOBBY
        self.code_visible = False
        self.votes: dict[str, int] = {}
        self.voted_players: set[str] = set()
        self.result: Optional[dict[str, str]] = None
        self.imposter_guess: Optional[str] = None
        self.guess_votes: dict[str, bool] = {}
        self.prompted_players: set[str] = set()
        self.round_submitted_players: set[str] = set()
        self.submittedTurns: list[str] = []
        self.returned_players: set[str] = set()
        self.status_note: Optional[str] = None

    def whoseTurn(self):
        if(self.state != GameState.LOBBY):
            return self.players[self.turn].name
        raise Exception("whoseTurn may not be called while in the lobby")

    def givePrompt(self, name):
        if self.state == GameState.LOBBY:
            raise ValueError("givePrompt may not be called while in the lobby")
        if not any(player.name == name for player in self.players):
            raise ValueError("Only players in the game may request a prompt")
        if self.promptIndex == -1:
            available = [
                i for i in range(len(self.possiblePrompts)) if i not in self.used_prompt_indices
            ]
            if not available:
                self.used_prompt_indices.clear()
                available = list(range(len(self.possiblePrompts)))
            self.promptIndex = random.choice(available)
            self.used_prompt_indices.add(self.promptIndex)

        if self.state == GameState.PROMPT:
            self.prompted_players.add(name)
            if self.prompted_players >= {player.name for player in self.players}:
                self.state = GameState.DRAW

        if self.imposter and self.imposter.name == name:
            return {
                "role": "imposter",
                "prompt": self.possibleClues[self.promptIndex],
                "title": "You are the imposter",
                "description": "Blend in while drawing. Work out the secret word before the civillians find you.",
            }
        return {
            "role": "good",
            "prompt": self.possiblePrompts[self.promptIndex],
            "title": "You are a civillian",
            "description": "Draw the secret word and identify the imposter.",
        }

    def initialSummary(self):
        return {
            "host": self.host.name,
            "players": [
                {
                    "name": player.name,
                    "colour": player.colour,
                    "ink_remaining": player.ink_remaining,
                    "max_ink": self.MAX_INK,
                }
                for player in self.players
            ],
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
        summary["status_note"] = self.status_note
        is_imposter_viewer = bool(self.imposter and viewer == self.imposter.name)
        judges_total = sum(
            1 for p in self.players if not self.imposter or p.name != self.imposter.name
        )
        summary["imposter_guess"] = (
            self.imposter_guess if self.state == GameState.GUESS_CHECK else None
        )
        summary["guess_target"] = (
            self.possiblePrompts[self.promptIndex]
            if self.state == GameState.GUESS_CHECK
            and self.promptIndex != -1
            and viewer is not None
            and not is_imposter_viewer
            else None
        )
        summary["guess_checks_received"] = (
            len(self.guess_votes) if self.state == GameState.GUESS_CHECK else 0
        )
        summary["guess_checks_total"] = (
            judges_total if self.state == GameState.GUESS_CHECK else 0
        )
        summary["guess_checked_players"] = (
            list(self.guess_votes.keys()) if self.state == GameState.GUESS_CHECK else []
        )
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
        clean_guess = guess.strip()
        if not clean_guess:
            raise ValueError("Guess must not be empty")
        self.imposter_guess = clean_guess
        self.guess_votes.clear()
        self.status_note = None
        self.state = GameState.GUESS_CHECK

    def checkGuess(self, voter: str, accepted: bool):
        if self.state != GameState.GUESS_CHECK:
            raise ValueError("Players may only check the guess after the imposter guesses")
        if not any(player.name == voter for player in self.players):
            raise ValueError("Only players in the game may vote")
        if self.imposter and voter == self.imposter.name:
            raise ValueError("The imposter may not judge their own guess")
        if voter in self.guess_votes:
            raise ValueError("Each player may only vote once")
        if not isinstance(accepted, bool):
            raise ValueError("accepted must be a boolean")

        self.guess_votes[voter] = accepted
        judges = {
            player.name
            for player in self.players
            if not self.imposter or player.name != self.imposter.name
        }
        if len(self.guess_votes) >= len(judges):
            self.resolveGuessCheck()

    def resolveGuessCheck(self):
        yes_votes = sum(1 for accepted in self.guess_votes.values() if accepted)
        no_votes = sum(1 for accepted in self.guess_votes.values() if not accepted)
        correct = yes_votes >= no_votes
        self.result = {
            "outcome": "Imposter wins" if correct else "Good players win",
            "accused": self.imposter.name if self.imposter else "",
            "imposter": self.imposter.name if self.imposter else "",
            "prompt": self.possiblePrompts[self.promptIndex],
            "guess": self.imposter_guess or "",
            "correct": str(correct).lower(),
        }
        self.status_note = None
        self.state = GameState.RESULTS

    def startGame(self, startedBy):
        if startedBy != self.host.name:
            raise ValueError("Only the host may start the game")
        if len(self.players) < self.MIN_PLAYERS:
            raise ValueError(f"At least {self.MIN_PLAYERS} players are required to start")
        if self.returned_players:
            raise ValueError("All players must return to the lobby before starting a new game")
        if self.state == GameState.LOBBY:
            self.imposter = random.choice(self.players)
            self.votes.clear()
            self.voted_players.clear()
            self.result = None
            self.imposter_guess = None
            self.guess_votes.clear()
            self.round_submitted_players.clear()
            self.submittedTurns.clear()
            self.promptIndex = -1
            self.prompted_players.clear()
            self.returned_players.clear()
            self.status_note = None
            self.resetInk()
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
            self.round_submitted_players.clear()
            self.votes.clear()
            self.voted_players.clear()
            self.result = None
            self.status_note = (
                "Vote skipped. Draw again."
                if skip_votes >= highest_player_votes
                else "Vote tied. Draw again."
            )
            self.resetInk()
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

        self.status_note = None
        self.state = GameState.IMPOSTER_GUESS
        self.votes.clear()
        self.voted_players.clear()

    def joinGame(self, name):
        clean_name = name.strip()
        if not clean_name:
            raise ValueError("Enter a valid nickname")
        if self.state not in (GameState.LOBBY, GameState.RESULTS):
            raise ValueError("Cannot join a game already in progress")

        for player in self.players:
            if player.name.casefold() == clean_name.casefold():
                raise ValueError("That name is already taken")

        self.players.append(Player(clean_name, self._new_colour(), self.MAX_INK))
        if self.state == GameState.RESULTS:
            self.returned_players.add(clean_name)

    def resetInk(self):
        for player in self.players:
            player.ink_remaining = self.MAX_INK

    def _new_colour(self):
        used_colours = {player.colour for player in self.players}
        available_colours = [
            colour for colour in self.COLOUR_PALETTE if colour not in used_colours
        ]
        if available_colours:
            return random.choice(available_colours)
        return f"#{random.randint(0, 0xFFFFFF):06x}"

    def leaveGame(self, name, colour=None):
        idx = next((i for i, p in enumerate(self.players) if p.name == name), None)
        if idx is None:
            raise ValueError("Player is not in the lobby")
        player = self.players.pop(idx)
        self.returned_players.discard(name)
        self.prompted_players.discard(name)
        self.round_submitted_players.discard(name)
        self.voted_players.discard(name)
        self.votes.pop(name, None)
        self.guess_votes.pop(name, None)
        if not self.players:
            return
        if self.host is player:
            self.host = random.choice(self.players)
        if self.state in (GameState.PROMPT, GameState.DRAW, GameState.VOTE, GameState.IMPOSTER_GUESS, GameState.GUESS_CHECK):
            if self.imposter is player or len(self.players) < self.MIN_PLAYERS:
                self.status_note = None
                self.result = {
                    "outcome": "Round ended",
                    "imposter": self.imposter.name if self.imposter else "",
                    "prompt": self.possiblePrompts[self.promptIndex] if self.promptIndex != -1 else "",
                    "correct": "false",
                }
                self.state = GameState.RESULTS
                return
        if self.state == GameState.PROMPT:
            if self.prompted_players >= {p.name for p in self.players}:
                self.state = GameState.DRAW
        elif self.state == GameState.DRAW:
            if idx < self.turn:
                self.turn -= 1
            self.turn %= len(self.players)
            if self.round_submitted_players >= {p.name for p in self.players}:
                self.state = GameState.VOTE
        elif self.state == GameState.VOTE:
            if len(self.voted_players) >= len(self.players):
                self.resolveVotes()
        elif self.state == GameState.GUESS_CHECK:
            judges = {p.name for p in self.players if not self.imposter or p.name != self.imposter.name}
            if len(self.guess_votes) >= len(judges):
                self.resolveGuessCheck()
        if self.returned_players == {remaining.name for remaining in self.players}:
            self.returnToLobby()

    def returnPlayerToLobby(self, name):
        if name not in {player.name for player in self.players}:
            raise ValueError("Player is not in the game")
        self.returned_players.add(name)
        if self.returned_players == {player.name for player in self.players}:
            self.returnToLobby()

    def submitTurn(self, player_id: str, imageString: str, ink_used: int):
        if self.state != GameState.DRAW or player_id != self.whoseTurn():
            raise ValueError("Only the current player may submit a drawing")
        if not isinstance(ink_used, int) or ink_used < 0:
            raise ValueError("ink_used must be a non-negative integer")
        if ink_used > self.MAX_INK:
            raise ValueError("drawing exceeded the ink limit")
        player = next(player for player in self.players if player.name == player_id)
        player.ink_remaining = self.MAX_INK - ink_used
        self.status_note = None
        self.submittedTurns.append(imageString)
        self.round_submitted_players.add(player_id)
        if self.round_submitted_players >= {p.name for p in self.players}:
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


    def returnToLobby(self):
        self.state = GameState.LOBBY
        self.imposter = None
        self.promptIndex = -1
        self.prompted_players.clear()
        self.round_submitted_players.clear()
        self.submittedTurns.clear()
        self.votes.clear()
        self.voted_players.clear()
        self.result = None
        self.imposter_guess = None
        self.guess_votes.clear()
        self.status_note = None
        self.turn = 0
        self.returned_players.clear()
        self.resetInk()
        for player in self.players:
            player.colour = self._new_colour()