from random import randint


class Player:
    name = ""
    colour = 0

class Game:
    imposter = Player()
    players = [imposter]
    turn = 0
    possiblePrompts = ["semi-colon"] #fill in later
    possibleClues = ["punctuation"] #we love parallel lists wooo
    promptIndex = -1

    def __init__(self, players, imposter):
        self.players = players
        self.imposter = imposter
        if(not (imposter in players)):
            raise ValueError("The Impostor must be one of the players")

    def whoseTurn(self):
        return self.players[self.turn].name

    def givePrompt(self, player):
        if(self.promptIndex == -1):
           promptIndex = randint(0, len(self.possiblePrompts)-1)

        if(player == self.imposter):
            return self.possibleClues[self.promptIndex]
        return self.possiblePrompts[self.promptIndex] #wooo

    def guessPrompt(self, guess):
        if(guess == self.possiblePrompts[self.promptIndex]):
            return True
        return False