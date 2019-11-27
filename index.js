require('dotenv').config()

const Discord = require('discord.js')
const admin = require('firebase-admin')
const request = require('request')
const cheerio = require('cheerio')

const client = new Discord.Client()
var serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://dicebot-ddd3b.firebaseio.com"
})

const db = admin.firestore()
var FieldValue = admin.firestore.FieldValue;

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

async function update_lobby_message(lobby) {
    let lobbyDoc = await lobby.get()
    if(lobbyDoc.exists) {
        let lobbyData = lobbyDoc.data()
        let lobbyCount = lobbyData['count']
        let lobbychannel = await client.channels.get(lobbyData['channel'])
        let lobbyMsg = await lobbychannel.fetchMessage(lobbyData['message'])
        if(lobbyCount > 0) {
            let players = lobby.collection('players')
            players.get().then(playerDocs => {
                let usernames = playerDocs.docs.map((player, index) => {
                    let playerData = player.data()
                    return (index + 1) + ". " + playerData['username']
                })
                lobbyMsg.edit('```css\n[DICE LOBBY]\n\n' + usernames.join('\n') + '\n\n[Invite Code] ' + lobby.id + '\n```')
            })
        }
        else {
            lobbyMsg.edit('```css\n[DICE LOBBY REMOVED]\n```')
        }
    }
}

async function dice_leave_command(msg, verbose = true) {
    let player = db.collection('players').doc(msg.author.id)
    let playerDoc = await player.get()
    if(playerDoc.exists) {
        let playerData = playerDoc.data()
        let lobby_id = playerData['lobby']
        if(lobby_id != null) {
            let lobby = db.collection('lobbies').doc(lobby_id)
            await lobby.collection('players').doc(msg.author.id).delete()
            await lobby.update({count: FieldValue.increment(-1)})
            await update_lobby_message(lobby)
            let lobbyDoc = await lobby.get()
            let lobbyData = lobbyDoc.data()
            let count = lobbyData['count']
            if(count <= 0) {
                await lobby.delete()
            }
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
                let userDice = rollDice(5)
                let userDiceNames = userDice.map(die => diceNames[die])
                let userDiceEmojis = userDiceNames.map(die => ":" + die + ":")
                await dice_leave_command(msg, false)
                await lobby.collection('players').doc(msg.author.id).set({ dice: userDice, score: 0, username: msg.author.username })
                await player.set({lobby: lobby.id})
                await lobby.update({count: FieldValue.increment(1)})
                await update_lobby_message(lobby)
                await msg.author.send(userDiceEmojis.join(' ') + "\n\nWaiting for more players...")
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
    await lobby.set({count: 0, channel: msg.channel.id, message: lobbyMsg.id})
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
    }
}

client.on('message', msg => {
    let message_parts = msg.content.split(" ")
    if (message_parts[0] === '!dice') {
        dice_command(msg, message_parts)
    }
})

client.login(process.env.BOT_TOKEN)
