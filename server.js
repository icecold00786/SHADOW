const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static("public"));

const rooms = {};

io.on("connection", socket => {
  console.log("Player connected:", socket.id);

  socket.on("createRoom", username => {
    const code = Math.random().toString(36).substring(2,8).toUpperCase();
    rooms[code] = {
      host: socket.id,
      players: [{id:socket.id,username}],
      phase:"lobby",
      questions:[],
      votes:{},
      spy:null
    };
    socket.join(code);
    socket.emit("roomCreated",{roomCode:code,players:rooms[code].players});
  });

  socket.on("joinRoom", ({username,roomCode}) => {
    const room = rooms[roomCode];
    if (!room) return socket.emit("errorMessage","Room not found!");
    if (room.phase !== "lobby") return socket.emit("errorMessage","Game already started!");
    if (room.players.length >= 20) return socket.emit("errorMessage","Room is full!");
    if (room.players.some(p=>p.username===username))
      return socket.emit("errorMessage","Username already taken!");

    room.players.push({id:socket.id,username});
    socket.join(roomCode);
    io.to(roomCode).emit("playerUpdate",room.players);
  });

  socket.on("startGame",()=>{
    const code = Object.keys(rooms).find(c=>rooms[c].players.some(p=>p.id===socket.id));
    if (!code) return;
    const room=rooms[code];
    if(room.host!==socket.id) return socket.emit("errorMessage","Only host can start!");
    if(room.players.length<4) return socket.emit("errorMessage","At least 4 players required!");

    room.spy=room.players[Math.floor(Math.random()*room.players.length)].id;
    room.phase="questions";
    room.questions=[];
    room.votes={};

    room.players.forEach(p=>{
      io.to(p.id).emit("yourRole",{role:p.id===room.spy?"SPY":"DETECTIVE"});
    });
    io.to(code).emit("gameStarted",{players:room.players.map(p=>p.username)});
  });

  socket.on("submitQuestion",question=>{
    const code=Object.keys(rooms).find(c=>rooms[c].players.some(p=>p.id===socket.id));
    if(!code) return;
    const room=rooms[code];
    if(room.phase!=="questions") return;
    if(typeof question!=="string" || !question.trim() || question.length>200) return;
    const player=room.players.find(p=>p.id===socket.id);
    room.questions.push({username:player.username,question:question.trim()});
    io.to(code).emit("questionUpdate",room.questions);
  });

  socket.on("startVoting",()=>{
    const code=Object.keys(rooms).find(c=>rooms[c].players.some(p=>p.id===socket.id));
    if(!code) return;
    const room=rooms[code];
    if(room.host!==socket.id || room.phase!=="questions") return;
    room.phase="voting";
    io.to(code).emit("votingStarted",room.players.map(p=>p.username));
  });

  socket.on("submitVote",username=>{
    const code=Object.keys(rooms).find(c=>rooms[c].players.some(p=>p.id===socket.id));
    if(!code) return;
    const room=rooms[code];
    if(room.phase!=="voting" || room.votes[socket.id]) return;
    if(!room.players.some(p=>p.username===username)) return;
    room.votes[socket.id]=username;
    io.to(socket.id).emit("voteReceived");
    if(Object.keys(room.votes).length===room.players.length){
      const counts={};
      Object.values(room.votes).forEach(name=>counts[name]=(counts[name]||0)+1);
      const highest=Math.max(...Object.values(counts));
      const winners=Object.keys(counts).filter(n=>counts[n]===highest);
      const caught=winners.length===1 && room.players.find(p=>p.username===winners[0]).id===room.spy;
      room.phase="finished";
      io.to(code).emit("gameResult",{
        spy:room.players.find(p=>p.id===room.spy).username,
        votes:counts,
        caught
      });
    }
  });

  socket.on("disconnect",()=>{
    for(const code in rooms){
      const room=rooms[code];
      room.players=room.players.filter(p=>p.id!==socket.id);
      if(!room.players.length) delete rooms[code];
      else {
        if(room.host===socket.id) room.host=room.players[0].id;
        io.to(code).emit("playerUpdate",room.players);
      }
    }
  });
});

server.listen(process.env.PORT || 3000,"0.0.0.0",()=>console.log("SHADOW server running on port 3000"));
