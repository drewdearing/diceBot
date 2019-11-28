# diceBot

A discord bot that allows users to play Liar's Dice

Liar’s dice is a bluffing game about stating the number of dice with a specific face. Each player secretly rolls 5 dice, and then betting begins. Players place bets on how many dice of a certain face are up amongst the total pool of dice, even though they can only see 5 of them. On a player’s turn, he or she can choose to raise the current bid or challenge it (if they think it’s false).  

When raising a bid, players must either raise the face value or the number of dice, or both. For example, if the current bid is 4 x [3]s you can raise the bid to 5 x [3]s or 2 x [4]s. As long as either the die count or face value is raised, the other can be lowered.   

Players win points through challenges. If the bid was true, the player who placed the bid receives a point. If it was false, then the challenger receives a point.

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
