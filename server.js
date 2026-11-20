require("dotenv").config();
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { aiClue, aiDiscussion, aiVote } = require("./solo-ai");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.get("/api/config", (req, res) => {
  res.json({
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseKey: process.env.SUPABASE_PUBLISHABLE_KEY
  });
});

app.use(express.static("public"));

const rooms = {};

async function translateSoloText(text, language) {
 if(language !== "hi") return text;
 try {
  const url="https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=hi&dt=t&q="+encodeURIComponent(text);
  const response=await fetch(url);
  if(!response.ok) return text;
  const data=await response.json();
  return data[0].map(part=>part[0]).join("");
 } catch(e) { return text; }
}

const words = [
  { category: "SPORTS", word: "GOLF" },
  { category: "SPORTS", word: "CRICKET" },
  { category: "SPORTS", word: "FOOTBALL" },
  { category: "SPORTS", word: "TENNIS" },
  { category: "SPORTS", word: "BOXING" },
  { category: "FOOD", word: "RICE" },
  { category: "FOOD", word: "PIZZA" },
  { category: "FOOD", word: "BURGER" },
  { category: "FOOD", word: "BREAD" },
  { category: "FOOD", word: "NOODLES" },
  { category: "ANIMALS", word: "LION" },
  { category: "ANIMALS", word: "TIGER" },
  { category: "ANIMALS", word: "ELEPHANT" },
  { category: "ANIMALS", word: "MONKEY" },
  { category: "ANIMALS", word: "DOLPHIN" },
  { category: "FRUITS", word: "PEAR" },
  { category: "FRUITS", word: "MANGO" },
  { category: "FRUITS", word: "APPLE" },
  { category: "FRUITS", word: "BANANA" },
  { category: "FRUITS", word: "GRAPES" },
  { category: "PLACES", word: "PARK" },
  { category: "PLACES", word: "SCHOOL" },
  { category: "PLACES", word: "HOSPITAL" },
  { category: "PLACES", word: "AIRPORT" },
  { category: "PLACES", word: "BEACH" },
  { category: "OBJECTS", word: "LAMP" },
  { category: "OBJECTS", word: "MIRROR" },
  { category: "OBJECTS", word: "CAMERA" },
  { category: "OBJECTS", word: "CLOCK" },
  { category: "OBJECTS", word: "UMBRELLA" },
  { category: "VEHICLES", word: "BIKE" },
  { category: "VEHICLES", word: "CAR" },
  { category: "VEHICLES", word: "TRAIN" },
  { category: "VEHICLES", word: "AIRPLANE" },
  { category: "VEHICLES", word: "BICYCLE" },
  { category: "NATURE", word: "MOUNTAIN" },
  { category: "NATURE", word: "RIVER" },
  { category: "NATURE", word: "FOREST" },
  { category: "NATURE", word: "DESERT" },
  { category: "NATURE", word: "OCEAN" },
  { category: "PROFESSIONS", word: "DOCTOR" },
  { category: "PROFESSIONS", word: "TEACHER" },
  { category: "PROFESSIONS", word: "POLICE" },
  { category: "PROFESSIONS", word: "FARMER" },
  { category: "PROFESSIONS", word: "CHEF" },
  { category: "TECHNOLOGY", word: "PHONE" },
  { category: "TECHNOLOGY", word: "LAPTOP" },
  { category: "TECHNOLOGY", word: "ROBOT" },
  { category: "TECHNOLOGY", word: "KEYBOARD" },
  { category: "TECHNOLOGY", word: "TELEVISION" },
  { category: "HOUSEHOLD", word: "PILLOW" },
  { category: "HOUSEHOLD", word: "SOFA" },
  { category: "HOUSEHOLD", word: "REFRIGERATOR" },
  { category: "HOUSEHOLD", word: "BUCKET" },
  { category: "HOUSEHOLD", word: "FAN" },
  { category: "WEATHER", word: "RAIN" },
  { category: "WEATHER", word: "THUNDER" },
  { category: "WEATHER", word: "RAINBOW" },
  { category: "WEATHER", word: "SNOW" },
  { category: "WEATHER", word: "WIND" },
  { category: "MUSIC", word: "GUITAR" },
  { category: "MUSIC", word: "PIANO" },
  { category: "MUSIC", word: "DRUM" },
  { category: "MUSIC", word: "FLUTE" },
  { category: "MUSIC", word: "MICROPHONE" }
];

function findRoom(id) {
  return Object.keys(rooms).find(code =>
    rooms[code].players.some(p => p.id === id)
  );
}


function clearVoteTimer(room){
 if(room?.voteTimer){clearTimeout(room.voteTimer);room.voteTimer=null;}
}
function startVoteTimer(code){
 const room=rooms[code];if(!room)return;
 clearVoteTimer(room);
 room.voteTimer=setTimeout(()=>{
  if(!rooms[code]||room.phase!=="voting")return;
  room.players.filter(p=>!p.eliminated&&!room.votes[p.id]).forEach(p=>{
   io.to(code).emit("voteAbstainUpdate",{voter:p.username});
  });
  if(room.mode==="solo")finishShadowVoting(code,true);
  else finishOnlineVoting(code);
 },35000);
}
function finishOnlineVoting(code) {
 const room=rooms[code];
 if(!room||room.mode==="solo"||room.phase!=="voting")return;
 clearVoteTimer(room);

 const counts={};
 Object.values(room.votes).forEach(id=>{
  const p=room.players.find(x=>x.id===id&&!x.eliminated);
  if(p)counts[p.username]=(counts[p.username]||0)+1;
 });

 const highest=Math.max(0,...Object.values(counts));
 const leaders=Object.keys(counts).filter(name=>counts[name]===highest);

 if(highest===0||leaders.length!==1){
  io.to(code).emit("onlineVoteResult",{
   tie:highest>0,
   noVotes:highest===0,
   votes:counts
  });
  startOnlineRound(code);
  return;
 }

 const eliminated=room.players.find(p=>p.username===leaders[0]&&!p.eliminated);
 if(!eliminated){startOnlineRound(code);return;}

 eliminated.eliminated=true;
 const caught=eliminated.id===room.shadow;
 const active=room.players.filter(p=>!p.eliminated);

 if(caught){
  room.phase="finished";
  io.to(code).emit("gameResult",{
   spy:eliminated.username,
   spyWord:room.spyWord,
   detectiveWord:room.detectiveWord,
   word:room.spyWord,
   votes:counts,
   eliminated:eliminated.username,
   caught:true,
   tie:false,
   winner:"DETECTIVES"
  });
  return;
 }

 io.to(code).emit("playerEliminated",{
  username:eliminated.username,
  players:room.players.map(p=>({
   id:p.id,username:p.username,
   eliminated:!!p.eliminated,
   offline:!!p.offline
  }))
 });

 if(active.length<=2){
  const spy=room.players.find(p=>p.id===room.shadow);
  room.phase="finished";
  io.to(code).emit("gameResult",{
   spy:spy?.username||"Unknown",
   spyWord:room.spyWord,
   detectiveWord:room.detectiveWord,
   word:room.spyWord,
   votes:counts,
   eliminated:eliminated.username,
   caught:false,
   tie:false,
   winner:"SPY"
  });
  return;
 }

 startOnlineRound(code);
}
function clearClueTimer(room){
 if(room?.clueTimer){clearTimeout(room.clueTimer);room.clueTimer=null;}
}

function shufflePlayers(players){
 const list=[...players];
 for(let i=list.length-1;i>0;i--){
  const j=Math.floor(Math.random()*(i+1));
  [list[i],list[j]]=[list[j],list[i]];
 }
 return list;
}

function beginOnlineVoting(code){
 const room=rooms[code];
 if(!room||room.mode==="solo"||room.phase!=="clues")return;
 clearClueTimer(room);
 room.phase="voting";
 room.currentTurnPlayerId=null;
 room.votes={};
 const active=room.players.filter(p=>!p.eliminated);
 io.to(code).emit("votingStarted",active.map(p=>p.username));
 startVoteTimer(code);
}

function emitOnlineTurn(code){
 const room=rooms[code];
 if(!room||room.mode==="solo"||room.phase!=="clues")return;
 clearClueTimer(room);

 if(room.clueIndex>=room.turnOrder.length){
  beginOnlineVoting(code);
  return;
 }

 const playerId=room.turnOrder[room.clueIndex];
 const player=room.players.find(p=>p.id===playerId&&!p.eliminated);
 if(!player){
  room.clueIndex++;
  emitOnlineTurn(code);
  return;
 }

 room.currentTurnPlayerId=player.id;
 const token=room.clueTurnToken=(room.clueTurnToken||0)+1;

 io.to(code).emit("clueTurn",{
  username:player.username,
  playerId:player.id,
  index:room.clueIndex+1,
  total:room.turnOrder.length,
  duration:45,
  round:room.round,
  voiceOnly:true,
  offline:!!player.offline
 });

 room.clueTimer=setTimeout(()=>{
  if(!rooms[code]||room.phase!=="clues"||room.clueTurnToken!==token)return;
  io.to(code).emit("voiceTurnEnded",{playerId:player.id});
  room.clueIndex++;
  emitOnlineTurn(code);
 },45000);
}

function startOnlineRound(code){
 const room=rooms[code];
 if(!room||room.mode==="solo"||room.phase==="finished")return;
 clearClueTimer(room);
 clearVoteTimer(room);

 const active=room.players.filter(p=>!p.eliminated);
 if(active.length<=2){
  const spy=room.players.find(p=>p.id===room.shadow);
  room.phase="finished";
  io.to(code).emit("gameResult",{
   spy:spy?.username||"Unknown",
   spyWord:room.spyWord,
   detectiveWord:room.detectiveWord,
   word:room.spyWord,
   votes:{},eliminated:null,caught:false,tie:false,winner:"SPY"
  });
  return;
 }

 room.round=(room.round||0)+1;
 room.phase="clues";
 room.clues={};
 room.votes={};
 room.clueIndex=0;
 room.turnOrder=shufflePlayers(active).map(p=>p.id);
 room.currentTurnPlayerId=null;

 io.to(code).emit("onlineNewRound",{
  round:room.round,
  players:room.players.map(p=>({
   id:p.id,username:p.username,
   eliminated:!!p.eliminated,
   offline:!!p.offline
  }))
 });
 emitOnlineTurn(code);
}

function emitClueTurn(code,player,index,total){
 const room=rooms[code];
 if(!room||room.phase!=="clues"||!player)return;

 if(room.mode!=="solo"){
  emitOnlineTurn(code);
  return;
 }

 clearClueTimer(room);
 room.clueTurnToken=(room.clueTurnToken||0)+1;
 const token=room.clueTurnToken;
 io.to(code).emit("clueTurn",{
  username:player.username,index,total,duration:40
 });

 room.clueTimer=setTimeout(()=>{
  if(!rooms[code]||room.phase!=="clues"||room.clueTurnToken!==token)return;
  const active=room.players.filter(p=>!p.eliminated);
  if(active[room.clueIndex]?.id!==player.id)return;
  if(!room.clues[player.id]){
   room.clues[player.id]={username:player.username,clue:"No hint (time up)"};
   io.to(code).emit("cluesUpdate",Object.values(room.clues));
  }
  room.clueIndex++;
  advanceSoloClues(code);
 },40000);
}
function sendPlayers(code) {
  if (rooms[code]) {
    io.to(code).emit("playerUpdate", rooms[code].players);
  }
}

function resetRoom(code) {
  const room = rooms[code];
  if (!room) return;

  clearClueTimer(room);
  clearVoteTimer(room);
  room.phase = "lobby";
  room.round = 1;
  room.players.forEach(p => p.eliminated = false);
  room.word = null;
  room.category = null;
  room.shadow = null;
  room.clues = {};
  room.clueIndex = 0;
  room.votes = {};

  io.to(code).emit("gameReset", {
    players: room.players,
    host: room.host
  });

  sendPlayers(code);
}

function finishShadowVoting(code,force=false) {
 const room=rooms[code];
 if(!room||room.mode!=="solo"||room.phase!=="voting")return;
 const active=room.players.filter(p=>!p.eliminated);
 const spy=room.players.find(p=>p.id===room.shadow);
 if(!spy)return;
 if(!force&&Object.keys(room.votes).length<active.length)return;
 if(!Object.keys(room.votes).length){clearVoteTimer(room);if(active.length===2){room.phase="finished";io.to(code).emit("gameResult",{spy:spy.username,word:room.word,votes:{},eliminated:null,caught:false,tie:false,winner:"SHADOW"});return;}room.round=(room.round||1)+1;room.phase="clues";room.clues={};room.votes={};room.clueIndex=0;io.to(code).emit("soloNewRound",{round:room.round,players:room.players.map(p=>({id:p.id,username:p.username,isAI:!!p.isAI,avatar:p.avatar||"",personality:p.personality||"",eliminated:!!p.eliminated}))});advanceSoloClues(code);return;}
 clearVoteTimer(room);

 const counts={};
 Object.values(room.votes).forEach(id=>{
  const p=room.players.find(x=>x.id===id);
  if(p)counts[p.username]=(counts[p.username]||0)+1;
 });
 const detectives=active.filter(p=>p.id!==room.shadow);
 const spyVotes=counts[spy.username]||0;
 const maxVotes=Math.max(0,...detectives.map(p=>counts[p.username]||0));

 if(!detectives.length){
  room.phase="finished";
  io.to(code).emit("gameResult",{spy:spy.username,word:room.word,votes:counts,eliminated:null,caught:false,tie:false,winner:"SHADOW"});
  return;
 }
 if(active.length===2){
  room.phase="finished";
  io.to(code).emit("gameResult",{spy:spy.username,word:room.word,votes:counts,eliminated:null,caught:false,tie:false,winner:"SHADOW"});
  return;
 }
 if(spyVotes>maxVotes){
  room.phase="finished";
  io.to(code).emit("gameResult",{spy:spy.username,word:room.word,votes:counts,eliminated:spy.username,caught:true,tie:false,winner:"INSIDERS"});
  return;
 }

 const leaders=detectives.filter(p=>(counts[p.username]||0)===maxVotes);
 if(maxVotes>0&&leaders.length){
  const out=leaders[Math.floor(Math.random()*leaders.length)];
  out.eliminated=true;
  io.to(code).emit("playerEliminated",{username:out.username,players:room.players.map(p=>({id:p.id,username:p.username,isAI:!!p.isAI,avatar:p.avatar||"",personality:p.personality||"",eliminated:!!p.eliminated}))});
 }
 if(room.players.filter(p=>!p.eliminated).length<=2){
  room.phase="finished";
  io.to(code).emit("gameResult",{spy:spy.username,word:room.word,votes:counts,eliminated:leaders[0]?.username||null,caught:false,tie:false,winner:"SHADOW"});
  return;
 }
 room.round=(room.round||1)+1;
 room.phase="clues";
 room.clues={};
 room.votes={};
 room.clueIndex=0;
 io.to(code).emit("soloNewRound",{round:room.round,players:room.players.map(p=>({id:p.id,username:p.username,isAI:!!p.isAI,avatar:p.avatar||"",personality:p.personality||"",eliminated:!!p.eliminated}))});
 advanceSoloClues(code);
}

function advanceSoloClues(code) {
 const room=rooms[code];
 if(!room||room.phase!=="clues")return;
 const active=room.players.filter(p=>!p.eliminated);
 if(room.clueIndex>=active.length){
  clearClueTimer(room);
  room.phase="discussion";
  io.to(code).emit("cluesComplete");
  active.filter(p=>p.isAI).forEach((bot,i)=>setTimeout(()=>{
   if(room.phase==="discussion")translateSoloText(aiDiscussion(room,bot),room.language).then(message=>{if(room.phase==="discussion")io.to(code).emit("aiDiscussionMessage",{username:bot.username,message});});
  },2500+i*5000));
  if(room.mode==="solo"){
   setTimeout(()=>{
    if(room.phase==="discussion")beginSoloVoting(code);
   },30000);
  }
  return;
 }
 const player=active[room.clueIndex];
 emitClueTurn(code,player,room.clueIndex+1,active.length);
 if(!player.isAI)return;
 setTimeout(()=>{
  if(!rooms[code]||room.phase!=="clues")return;
  translateSoloText(aiClue(room,player),room.language).then(clue=>{
   if(room.phase!=="clues")return;
   clearClueTimer(room);
   room.clues[player.id]={username:player.username,clue};
   io.to(code).emit("cluesUpdate",Object.values(room.clues));
   room.clueIndex++;
   advanceSoloClues(code);
  });
 },5000);
}

function beginSoloVoting(code){
 const room=rooms[code];
 if(!room||room.mode!=="solo"||room.phase!=="discussion")return;
 const active=room.players.filter(p=>!p.eliminated);
 room.phase="voting";
 room.votes={};
 io.to(code).emit("votingStarted",active.map(p=>p.username));
 startVoteTimer(code);
 active.filter(p=>p.isAI).forEach((bot,i)=>setTimeout(()=>{
  if(room.phase!=="voting"||room.votes[bot.id])return;
  const target=aiVote(room,bot);
  room.votes[bot.id]=target;
  const chosen=room.players.find(p=>p.id===target);
  io.to(code).emit("aiVoteUpdate",{voter:bot.username,target:chosen?.username||""});
  finishShadowVoting(code);
 },6000+i*6000));
}

io.on("connection", socket => {

  socket.on("translateClue", async data => {
    if (!data || typeof data.text !== "string") return;
    const text = data.text.trim().slice(0, 500);
    const target = data.target === "hi" ? "hi" : "en";
    if (!text) return;
    try {
      const url = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=" + target + "&dt=t&q=" + encodeURIComponent(text);
      const response = await fetch(url);
      if (!response.ok) throw new Error("Translation service unavailable");
      const result = await response.json();
      const translated = result[0].map(part => part[0]).join("");
      socket.emit("clueTranslated", { original: text, translated, target, requestId: data.requestId });
    } catch (error) {
      socket.emit("clueTranslated", { original: text, error: "Translation failed. Please try again.", requestId: data.requestId });
    }
  });


  console.log("Player connected:", socket.id);

  socket.on("createRoom", username => {
    if (typeof username !== "string") return;

    username = username.trim().slice(0, 18);
    if (!username) {
      return socket.emit("errorMessage", "Enter a valid username!");
    }

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    rooms[code] = {
      host: socket.id,
      players: [{ id: socket.id, username }],
      phase: "lobby",
      clues: {},
      votes: {}
    };

    socket.join(code);
    socket.emit("roomCreated", {
      roomCode: code,
      players: rooms[code].players
    });
  });

  socket.on("createSoloRoom", (username, language) => {
    if (typeof username !== "string") return;
    username = username.trim().slice(0, 18);
    if (!username) return socket.emit("errorMessage", "Enter a valid username!");

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const aiNames = ["KAI", "RAVEN", "ZERO"];
    const players = [{ id: socket.id, username, isAI: false }];
    aiNames.forEach((name, i) => {
      players.push({
        id: "AI_" + code + "_" + (i + 1),
        username: name,
        isAI: true,
        personality: ["careful", "analytical", "bold"][i]
      });
    });

    rooms[code] = {
      host: socket.id,
      players,
      mode: "solo",
      language: language === "hi" ? "hi" : "en",
      phase: "lobby",
      clues: {},
      votes: {}
    };

    socket.join(code);
    socket.emit("roomCreated", {
      roomCode: code,
      players,
      mode: "solo"
    });
  });

  socket.on("joinRoom", data => {
    if (!data || typeof data.username !== "string" ||
        typeof data.roomCode !== "string") return;

    const username = data.username.trim().slice(0, 18);
    const code = data.roomCode.trim().toUpperCase();
    const room = rooms[code];

    if (!username) return socket.emit("errorMessage", "Enter a valid username!");
    if (!room) return socket.emit("errorMessage", "Room not found!");
    if (room.phase !== "lobby") return socket.emit("errorMessage", "Game already started!");
    if (room.players.length >= 4) return socket.emit("errorMessage", "Room is full! Exactly 4 players allowed.");
    if (room.players.some(p => p.username.toLowerCase() === username.toLowerCase())) {
      return socket.emit("errorMessage", "Username already taken!");
    }

    room.players.push({ id: socket.id, username });
    socket.join(code);

    socket.emit("roomJoined", {
      roomCode: code,
      players: room.players,
      host: room.host
    });

    sendPlayers(code);
  });

  socket.on("startGame", () => {
    const code = findRoom(socket.id);
    if (!code) return;

    const room = rooms[code];

    if (room.host !== socket.id) {
      return socket.emit("errorMessage", "Only host can start!");
    }
    if (room.phase !== "lobby") return;
    room.round = 1;
    room.players.forEach(p => p.eliminated = false);
    if (room.players.length !== 4) {
      return socket.emit("errorMessage", "Exactly 4 players are required!");
    }

    room.usedWords = room.usedWords || [];
    let availableWords = words.filter(item => !room.usedWords.includes(item.word));
    if (!availableWords.length) {
      room.usedWords = [];
      availableWords = words;
    }
    const selected = availableWords[Math.floor(Math.random() * availableWords.length)];
    room.usedWords.push(selected.word);

    room.word = selected.word;
    room.category = selected.category;
    room.shadow = room.players[Math.floor(Math.random() * 4)].id;
    room.phase = "clues";
    room.clues = {};
    room.votes = {};
    room.clueIndex = 0;

    io.to(code).emit("gameStarted", {
      players: room.players.map(p => p.username)
    });

    room.players.forEach(player => {
      const isShadow = player.id === room.shadow;
      if (player.isAI) {
        player.aiRole = isShadow ? "SHADOW" : "INSIDER";
      } else {
        io.to(player.id).emit("yourRole", {
          role: isShadow ? "SHADOW" : "INSIDER",
          category: isShadow ? "" : room.category,
          word: isShadow ? "" : room.word
        });
      }
    });

    emitClueTurn(code,room.players[0],1,room.players.length);
  });

  socket.on("submitClue", clue => {
    const code = findRoom(socket.id);
    if (!code) return;
    const room = rooms[code];
    if (room.phase !== "clues") return;
    const sender=room.players.find(p=>p.id===socket.id);
    if(!sender||sender.eliminated)return socket.emit("errorMessage","Eliminated players cannot give clues!");
    if (typeof clue !== "string" || !clue.trim() || clue.trim().length > 100) return;
    if (room.clues[socket.id]) return;
    const cluePlayers = room.mode === "solo" ? room.players.filter(p => !p.eliminated) : room.players;
    if (cluePlayers[room.clueIndex]?.id !== socket.id)
      return socket.emit("errorMessage", "Wait for your clue turn!");
    const player = cluePlayers[room.clueIndex];
    clearClueTimer(room);
    room.clues[socket.id] = { username: player.username, clue: clue.trim() };
    io.to(code).emit("cluesUpdate", Object.values(room.clues));
    room.clueIndex++;

    if (room.mode === "solo") {
      advanceSoloClues(code);
    } else if (room.clueIndex === 4) {
      room.phase = "discussion";
      io.to(code).emit("cluesComplete");
    } else {
      emitClueTurn(code,room.players[room.clueIndex],room.clueIndex+1,room.players.length);
    }
  });

  socket.on("startVoting", () => {
    const code = findRoom(socket.id);
    if (!code) return;
    const room = rooms[code];
    if (room.host !== socket.id) return socket.emit("errorMessage", "Only host can start voting!");
    if (room.phase !== "discussion") return;
    if (room.mode === "solo") { beginSoloVoting(code); return; }
    room.phase = "voting";
    room.votes = {};
    io.to(code).emit("votingStarted", room.players.map(p => p.username));
    startVoteTimer(code);

    if (room.mode === "solo") {
      room.players.filter(p => p.isAI).forEach((bot,i) => {
        setTimeout(() => {
          if (!rooms[code] || room.phase !== "voting" || room.votes[bot.id]) return;
          const target = aiVote(room,bot);
          room.votes[bot.id] = target;
          const chosen = room.players.find(p => p.id === target);
          io.to(code).emit("aiVoteUpdate", {voter:bot.username,target:chosen?.username || ""});
          finishShadowVoting(code);
        },6000+i*6000);
      });
    }
  });

  socket.on("submitVote", username => {
    const code = findRoom(socket.id);
    if (!code) return;

    const room = rooms[code];

    if (room.phase !== "voting" || room.votes[socket.id]) return;
    if (typeof username !== "string") return;

    const activeVoters = room.players.filter(p => !p.eliminated);
    if (!activeVoters.some(p => p.id === socket.id))
      return socket.emit("errorMessage", "Eliminated players cannot vote!");
    const target = activeVoters.find(p => p.username === username);
    if (!target) return socket.emit("errorMessage", "Invalid vote!");
    if (target.id === socket.id) {
      return socket.emit("errorMessage", "You cannot vote for yourself!");
    }

    room.votes[socket.id] = target.id;
    const voter = room.players.find(p => p.id === socket.id);
    io.to(code).emit("votePublicUpdate", {voter:voter?.username || "Player", target:target.username});
    socket.emit("voteReceived");

    if (room.mode === "solo") return finishShadowVoting(code);
    if (Object.keys(room.votes).length === 4) finishOnlineVoting(code);
  });

  socket.on("playAgain", () => {
    const code = findRoom(socket.id);
    if (!code) return;

    const room = rooms[code];

    if (room.host !== socket.id) {
      return socket.emit("errorMessage", "Only host can restart!");
    }
    if (room.phase !== "finished") return;

    resetRoom(code);
  });

  socket.on("voice:signal", data => {
    if (!data || typeof data.target !== "string") return;
    const code = findRoom(socket.id);
    if (!code || !rooms[code]) return;
    if (!rooms[code].players.some(p => p.id === data.target)) return;
    const payload = { from: socket.id };
    if (data.description) payload.description = data.description;
    if (data.candidate) payload.candidate = data.candidate;
    io.to(data.target).emit("voice:signal", payload);
  });

  socket.on("leaveRoom", () => {
    const code = findRoom(socket.id);
    if (!code || !rooms[code]) return;

    const room = rooms[code];
    io.to(code).emit("voice:peer-left", { id: socket.id });
    room.players = room.players.filter(p => p.id !== socket.id);
    socket.leave(code);

    if (!room.players.length) {
      delete rooms[code];
    } else {
      if (room.host === socket.id) {
        room.host = room.players[0].id;
        io.to(code).emit("hostChanged", {
          host: room.host,
          username: room.players[0].username
        });
      }

      if (room.phase !== "lobby") {
        resetRoom(code);
        io.to(code).emit("errorMessage", "A player left. Game reset to lobby.");
      } else {
        sendPlayers(code);
      }
    }
    socket.emit("roomLeft");
  });

  socket.on("disconnect", () => {
    const code = findRoom(socket.id);
    if (!code) return;

    const room = rooms[code];
    io.to(code).emit("voice:peer-left", { id: socket.id });
    room.players = room.players.filter(p => p.id !== socket.id);

    if (!room.players.length) {
      delete rooms[code];
      return;
    }

    if (room.host === socket.id) {
      room.host = room.players[0].id;
      io.to(code).emit("hostChanged", {
        host: room.host,
        username: room.players[0].username
      });
    }

    if (room.phase !== "lobby") {
      resetRoom(code);
      io.to(code).emit("errorMessage", "A player disconnected. Game reset to lobby.");
    } else {
      sendPlayers(code);
    }
  });
});

server.listen(process.env.PORT || 3000, "0.0.0.0", () => {
  console.log("SHADOW server running on port " + (process.env.PORT || 3000));
});
