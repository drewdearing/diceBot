require('dotenv').config()

const Discord = require('discord.js')
const admin = require('firebase-admin')

const client = new Discord.Client()
var serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://dicebot-ddd3b.firebaseio.com"
})

const db = admin.firestore()
const FieldValue = admin.firestore.FieldValue;
const Timestamp = admin.firestore.Timestamp;

const diceNames = {
    1: "one",
    2: "two",
    3: "three",
    4: "four",
    5: "five",
    6: "six"
}

client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`)
})

function getRandomInt(min, max) {
  min = Math.ceil(min)
  max = Math.floor(max)
  return Math.floor(Math.random() * (max - min)) + min
}

function rollDice(numDice) {
    let dice = []
    for (var i = 0; i < numDice; i++) {
        dice.push(getRandomInt(1, 6))
    }
    return dice
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function lobby_change_handler(change) {
    if (change.type === 'modified') {
        let lobby = change.doc.ref
        let lobbyData = change.doc.data()
        let lobbyCount = lobbyData['count']
        let lobbyStarted = lobbyData['started']
        await update_lobby_message(lobby)
        
        if(lobbyCount >= 2 && !lobbyStarted) {
            await set_global_message(lobby, "Waiting for next game to start...")
        }

        if(lobbyCount <= 1) {
            await reset_lobby(lobby)
            await set_global_message(lobby, "Waiting for other players...")
            await update_lobby_message(lobby)
        }
        
        if(lobbyCount <= 0) {
            lobby.delete()
        }
    }
}

async function reset_lobby(lobby) {
    await lobby.update({
        started: false,
        turn: null,
        lastTurn: null,
        lastBet: null,
        challenged: false,
        dice: null
    })
    let players = lobby.collection('players')
    let playerDocs = await players.get()
    for (var i = 0; i < playerDocs.docs.length; i++) {
        let playerDoc = playerDocs.docs[i]
        await playerDoc.ref.update({dice: null})
    }
}

async function get_lobby_channel(lobbyData) {
    if(lobbyData['channel_type'] === 'dm') {
        let user = await client.fetchUser(lobbyData['author'])
        let channel = await user.createDM()
        return channel
    }
    else {
        let channel = await client.channels.get(lobbyData['channel'])
        return channel
    }
}

async function update_lobby_message(lobby) {
    let lobbyDoc = await lobby.get()
    if(lobbyDoc.exists) {
        let lobbyData = lobbyDoc.data()
        let lobbyCount = lobbyData['count']
        let lobbychannel = await get_lobby_channel(lobbyData)
        let lobbyMsg = await lobbychannel.fetchMessage(lobbyData['message'])
        if(lobbyCount > 0) {
            let players = lobby.collection('players').orderBy('joined')
            players.get().then(playerDocs => {
                let usernames = playerDocs.docs.map((player, index) => {
                    let playerData = player.data()
                    let status = playerData['dice'] == null ? "Waiting":"Playing"
                    let points = playerData['score']
                    return (index + 1) + ". " + playerData['username'] + " | " + status + " | " + points + " points"
                })
                lobbyMsg.edit('```css\n[DICE LOBBY]\n\n' + usernames.join('\n') + '\n\n[Invite Code] ' + lobby.id + '\n```')
            })
        }
        else {
            lobbyMsg.edit('```css\n[DICE LOBBY REMOVED]\n```')
        }
    }
}

async function remove_player_message(lobbyPlayer) {
    let user = await client.fetchUser(lobbyPlayer.id)
    let channel = await user.createDM()
    let playerDoc = await lobbyPlayer.get()
    if(playerDoc.exists) {
        let playerData = playerDoc.data()
        let message = await channel.fetchMessage(playerData['message'])
        await message.edit('```css\nyou have been removed from this lobby\n```')
    }
}

async function set_global_message(lobby, statement) {
    let players = lobby.collection('players')
    players.get().then(playerDocs => {
        playerDocs.forEach(async player => {
            let playerData = player.data()
            let user = await client.fetchUser(player.id)
            let channel = await user.createDM()
            let message = await channel.fetchMessage(playerData['message'])
            message.edit('```css\n' + statement + '\n```')
        })
    })
}

async function start_lobby(lobby) {
    await lobby.update({started: true})
    let playersDB = lobby.collection('players').orderBy('joined')
    let playerDocs = await playersDB.get()
    let dice = rollDice(playerDocs.docs.length * 5)
    await lobby.update({dice, turn: playerDocs.docs[0].id})
    for (var i = 0; i < playerDocs.docs.length; i++) {
        let playerDoc = playerDocs.docs[i]
        await playerDoc.ref.update({dice: dice.splice(0, 5)})
    }
    await update_lobby_message(lobby)
    await set_game_state(lobby)
}

async function set_game_state(lobby) {
    let lobbyDoc = await lobby.get()
    let lobbyData = lobbyDoc.data()
    let lobbyChannel = await get_lobby_channel(lobbyData)
    let lobbyDice = lobbyData['dice']
    let totalDice = lobbyDice == null ? 0:lobbyDice.length
    let currentTurn = lobbyData['turn']
    let lastTurn = lobbyData['lastTurn']
    let lastBet = lobbyData['lastBet']
    let challenged = lobbyData['challenged']
    let playersDB = lobby.collection('players').orderBy('joined')
    let playerDocs = await playersDB.get()
    let playerDict = {}
    playerDocs.docs.forEach(playerDoc => {
        if(playerDoc.data()['dice'] != null) {
            playerDict[playerDoc.id] = playerDoc.data()
        }
    })
    let currentUsername = playerDict[currentTurn]["username"]
    let lastUsername = lastTurn != null ? playerDict[lastTurn]["username"]:""
    var status = ""
    if(challenged) {
        let totalFace = lobbyDice.filter(face => face === lastBet[1]).length
        status = currentUsername + " challenged " + lastUsername + "'s " + lastBet[0] + " [" + lastBet[1] + "]s"
        status = status + "\nThere were " + totalFace + " [" + lastBet[1] + "]s total."
        if(totalFace < lastBet[0]) {
            status = status + "\n" + currentUsername + " wins!"
        }
        else {
            status = status + "\n" + lastUsername + " wins!"
        }
    }
    else{
        if(lastTurn != null) {
            status = lastUsername + " raised " + lastBet[0] + " [" + lastBet[1] + "]s"
        }
        status = status + "\nThere are " + totalDice + " dice total.\nIt's " + currentUsername + "'s turn."
    }
    for(var id in playerDict) {
        let user = await client.fetchUser(id)
        let channel = await user.createDM()
        let playerData = playerDict[id]
        let playerDice = playerData['dice'].map(die => ":" + diceNames[die] + ":")
        let message = await channel.fetchMessage(playerData['message'])
        await message.edit(playerDice.join(' ') + "\n```css\n" + status + "\n```")
    }
    await lobbyChannel.send("```css\n" + status + "\n```")
}

async function getNextTurn(lobby, currentTurn) {
    let playersDB = lobby.collection('players').orderBy('joined')
    let playerDocs = await playersDB.get()
    let turnOrder = []
    playerDocs.docs.forEach(playerDoc => {
        if(playerDoc.data()['dice'] != null) {
            turnOrder.push(playerDoc.id)
        }
    })
    let currentIndex = turnOrder.indexOf(currentTurn)
    let nextIndex = currentIndex + 1 == turnOrder.length ? 0:currentIndex + 1
    return turnOrder[nextIndex]
}

async function dice_challenge_command(msg, verbose = true) {
    let player = db.collection('players').doc(msg.author.id)
    let playerDoc = await player.get()
    if(playerDoc.exists) {
        let playerData = playerDoc.data()
        let lobby_id = playerData['lobby']
        if(lobby_id != null) {
            let lobby = db.collection('lobbies').doc(lobby_id)
            let lobbyDoc = await lobby.get()
            if(lobbyDoc.exists) {
                let lobbyData = lobbyDoc.data()
                let currentTurn = lobbyData['turn']
                let lastBet = lobbyData['lastBet']
                let lastTurn = lobbyData['lastTurn']
                let lobbyDice = lobbyData['dice']
                if(msg.author.id === currentTurn) {
                    let totalFace = lobbyDice.filter(face => face === lastBet[1]).length
                    if(totalFace < lastBet[0]) {
                        await lobby.collection('players').doc(currentTurn).update({score: FieldValue.increment(1)})
                    }
                    else {
                        await lobby.collection('players').doc(lastTurn).update({score: FieldValue.increment(1)})
                    }
                    await lobby.update({challenged: true})
                    await set_game_state(lobby)
                    await delay(5000)
                    await reset_lobby(lobby)
                }
                else if(verbose) await msg.reply('it is not your turn')
                return
            }
        }
    }
    if(verbose) await msg.reply('you are not in a lobby')
}

async function dice_raise_command(msg, message_parts, verbose = true) {
    let params = message_parts.slice(2, message_parts.length)
    let player = db.collection('players').doc(msg.author.id)
    let playerDoc = await player.get()
    if(playerDoc.exists) {
        let playerData = playerDoc.data()
        let lobby_id = playerData['lobby']
        if(lobby_id != null) {
            let lobby = db.collection('lobbies').doc(lobby_id)
            let lobbyDoc = await lobby.get()
            if(lobbyDoc.exists) {
                let lobbyData = lobbyDoc.data()
                let currentTurn = lobbyData['turn']
                let lastBet = lobbyData['lastBet']
                let lobbyDice = lobbyData['dice']
                if(msg.author.id === currentTurn) {
                    if(params.length == 2) {
                        let count = parseInt(params[0].replace(/\D/g,''), 10)
                        let face = parseInt(params[1].replace(/\D/g,''), 10)
                        let bothNumbers = !isNaN(face) && !isNaN(count)
                        let validDieFace = face >= 1 && face <= 6
                        let validCount = count > 0 && count <= lobbyDice.length
                        let validRaise = lastBet == null || count > lastBet[0] || face > lastBet[1]
                        if(bothNumbers && validDieFace && validCount && validRaise) {
                            let nextTurn = await getNextTurn(lobby, currentTurn)
                            await lobby.update({
                                lastTurn: msg.author.id,
                                lastBet: [count, face],
                                challenged: false,
                                turn: nextTurn
                            })
                            await set_game_state(lobby)
                        }
                        else if(verbose) await msg.reply('invalid raise')
                    }
                    else if(verbose) await msg.reply('this command requires two parameters')
                }
                else if(verbose) await msg.reply('it is not your turn')
                return
            }
        }
    }
    if(verbose) await msg.reply('you are not in a lobby')
}

async function dice_start_command(msg, verbose = true) {
    let player = db.collection('players').doc(msg.author.id)
    let playerDoc = await player.get()
    if(playerDoc.exists) {
        let playerData = playerDoc.data()
        let lobby_id = playerData['lobby']
        if(lobby_id != null) {
            let lobby = db.collection('lobbies').doc(lobby_id)
            let lobbyDoc = await lobby.get()
            if(lobbyDoc.exists) {
                let lobbyData = lobbyDoc.data()
                let lobbyCount = lobbyData['count']
                let lobbyStarted = lobbyData['started']
                if(lobbyCount >= 2) {
                    if(!lobbyStarted) {
                        await start_lobby(lobby)
                    }
                    else if(verbose) await msg.reply('game already started')
                }
                else if(verbose) await msg.reply('not enough players in lobby to play')
                return
            }
        }
    }
    if(verbose) await msg.reply('you are not in a lobby')
}

async function dice_leave_command(msg, verbose = true) {
    let player = db.collection('players').doc(msg.author.id)
    let playerDoc = await player.get()
    if(playerDoc.exists) {
        let playerData = playerDoc.data()
        let lobby_id = playerData['lobby']
        if(lobby_id != null) {
            let lobby = db.collection('lobbies').doc(lobby_id)
            let lobbyDoc = await lobby.get()
            let lobbyData = lobbyDoc.data()
            let currentTurn = lobbyData['turn']
            let lobbyPlayer = lobby.collection('players').doc(msg.author.id)
            if(currentTurn != null && currentTurn === msg.author.id) {
                let nextTurn = await getNextTurn(lobby, currentTurn)
                await lobby.update({turn: nextTurn})
                await set_game_state(lobby)
            }
            await remove_player_message(lobbyPlayer)
            await lobbyPlayer.delete()
            await lobby.update({count: FieldValue.increment(-1)})
            await player.set({lobby: null})
            if(verbose) await msg.reply('you have been removed from `' + lobby.id + '`')
            return
        }
    }
    if(verbose) await msg.reply('you are not in a lobby')
}

async function ensure_lobby_id(msg, lobby_id) {
    if(lobby_id == null || lobby_id.length == 0) {
        let channel = db.collection('channels').doc(msg.channel.id)
        let channelDoc = await channel.get()
        if(channelDoc.exists) {
            let channelData = channelDoc.data()
            let channel_lobby = channelData['lobby']
            if(channel_lobby != null) {
                let lobby = db.collection('lobbies').doc(channel_lobby)
                let lobbyDoc = await lobby.get()
                if(lobbyDoc.exists) {
                    return channel_lobby
                }
                else {
                    await channel.update({lobby: null})
                }
            }
        }
        return null
    }
    return lobby_id
}

async function dice_join_command(msg, lobby_id, verbose = true) {
    lobby_id = await ensure_lobby_id(msg, lobby_id)
    if(lobby_id != null) {
        let player = db.collection('players').doc(msg.author.id)
        let lobby = db.collection('lobbies').doc(lobby_id)
        let lobbyDoc = await lobby.get()
        if(lobbyDoc.exists) {
            let lobbyPlayer = lobby.collection('players').doc(msg.author.id)
            let lobbyPlayerDoc = await lobbyPlayer.get()
            if(!lobbyPlayerDoc.exists) {
                await dice_leave_command(msg, false)
                let userMsg = await msg.author.send('```css\nLoading Lobby...\n```')
                await lobby.collection('players').doc(msg.author.id).set({
                    dice: null,
                    score: 0,
                    username: msg.author.username,
                    joined: Timestamp.now(),
                    message: userMsg.id
                })
                await player.set({lobby: lobby.id})
                await userMsg.edit('```css\nWaiting for next game to start...\n```')
                await lobby.update({count: FieldValue.increment(1)})
            }
            else if(verbose) msg.reply('you are already in this lobby')
        }
        else if(verbose) msg.reply("couldn't join `" + lobby_id + "` because it doesn't exist")
    }
    else if(verbose) msg.reply("please provide a valid invite code")
}

async function dice_create_command(msg, message_parts) {
    let lobby = db.collection('lobbies').doc()
    let channel = db.collection('channels').doc(msg.channel.id)
    let lobbyMsg = await msg.channel.send('creating lobby...')
    await lobby.set({
        count: 0,
        channel: msg.channel.id,
        channel_type: msg.channel.type,
        author: msg.author.id,
        message: lobbyMsg.id,
        started: false,
        turn: null,
        lastTurn: null,
        lastBet: null,
        challenged: false,
        dice: null
    })
    await channel.set({lobby: lobby.id})
    await dice_join_command(msg, lobby.id, false)
}

function dice_command(msg, message_parts) {
    if(message_parts.length > 1){
        if(message_parts[1] === 'create'){
            dice_create_command(msg, message_parts)
        }
        else if(message_parts[1] === 'join'){
            let lobby_id = message_parts.slice(2, message_parts.length).join(' ')
            dice_join_command(msg, lobby_id)
        }
        else if(message_parts[1] === 'leave'){
            dice_leave_command(msg)
        }
        else if(message_parts[1] === 'start'){
            dice_start_command(msg)
        }
        else if(message_parts[1] === 'raise'){
            dice_raise_command(msg, message_parts)
        }
        else if(message_parts[1] === 'challenge'){
            dice_challenge_command(msg)
        }
    }
}

client.on('message', msg => {
    let message_parts = msg.content.split(" ")
    if (message_parts[0] === '!dice') {
        dice_command(msg, message_parts)
    }
})

db.collection('lobbies').onSnapshot(querySnapshot => {
    querySnapshot.docChanges().forEach(change => {
        lobby_change_handler(change)
    })
})

client.login(process.env.BOT_TOKEN)
