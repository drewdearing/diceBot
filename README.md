# diceBot

A discord bot that allows users to play Liar's Dice

## Getting Started

First you will need to [add diceBot to your server](https://discordapp.com/oauth2/authorize?client_id=648964403508805642&scope=bot&permissions=75840).

Once you are in a channel with diceBot, you can use `!dice create` to create a new
lobby.

Others can join the lobby by using `!dice join` in the same channel that the lobby was created.
Alternatively you can use `!dice join [invite code]` to join a lobby from a different channel.

Once everyone is in the lobby, use `!dice start` to start a new round of Liar's Dice.

When it is your turn, use `!dice raise n y` to bet that the dice face y appears x times.

Alternatively, you can challenge the previous bet by using `!dice challenge`.
The round will end, and the winner will recieve a point.

Use `!dice start` to start a new round, or `!dice leave` to leave the lobby.

## Built With

* [discord.js](https://discord.js.org) - Used to talk easily with discord
* [firebase](https://firebase.google.com/) - Used to store user data

## Authors

* **Drew Dearing** - *developer* - [drewdearing](https://github.com/drewdearing)
