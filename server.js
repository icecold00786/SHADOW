const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static("public"));

const rooms = {};

function findRoom(socketId) {
  return Object.keys(rooms).find(code =>
    rooms[code].players.some(p => p.id === socketId)
  );
}

function sendPlayers(code) {
  const room = rooms[code];
  if (!room) return;
  io.to(code).emit("playerUpdate", room.players);
}

function resetRoom(code) {
  const room = rooms[code];
  if (!room) return;
  room.phase = "lobby";
  room.questions = [];
  room.votes = {};
  room.spy = null;
  io.to(code).emit("gameReset", {
    players: room.players,
    host: room.host
  });
  sendPlayers(code);
}

io.on("connection", socket => {
  console.log("Player connected:", socket.id);

  socket.on("createRoom", username => {
    if (typeof username !== "string") return;
    username = username.trim().slice(0, 18);
    if (!username) return socket.emit("errorMessage", "Enter a valid username!");

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    rooms[code] = {
      host: socket.id,
      players: [{ id: socket.id, username }],
      phase: "lobby",
      questions: [],
      votes: {},
      spy: null
    };
    socket.join(code);
    socket.emit("roomCreated", {
      roomCode: code,
      players: rooms[code].players
    });
  });

  socket.on("joinRoom", data => {
    if (!data || typeof data.username !== "string" || typeof data.roomCode !== "string") return;
    const username = data.username.trim().slice(0, 18);
    const code = data.roomCode.trim().toUpperCase();
    const room = rooms[code];

    if (!username) return socket.emit("errorMessage", "Enter a valid username!");
    if (!room) return socket.emit("errorMessage", "Room not found!");
    if (room.phase !== "lobby") return socket.emit("errorMessage", "Game already started!");
    if (room.players.length >= 20) return socket.emit("errorMessage", "Room is full!");
    if (room.players.some(p => p.username.toLowerCase() === username.toLowerCase()))
      return socket.emit("errorMessage", "Username already taken!");

    room.players.push({ id: socket.id, username });
    socket.join(code);
    socket.emit("roomJoined", { roomCode: code, players: room.players, host: room.host });
    sendPlayers(code);
  });

  socket.on("startGame", () => {
    const code = findRoom(socket.id);
    if (!code) return;
    const room = rooms[code];
    if (room.host !== socket.id) return socket.emit("errorMessage", "Only host can start!");
    if (room.phase !== "lobby") return;
    if (room.players.length < 4) return socket.emit("errorMessage", "At least 4 players required!");

    room.spy = room.players[Math.floor(Math.random() * room.players.length)].id;
    room.phase = "questions";
    room.questions = [];
    room.votes = {};

    room.players.forEach(p => {
      io.to(p.id).emit("yourRole", { role: p.id === room.spy ? "SPY" : "DETECTIVE" });
    });
    io.to(code).emit("gameStarted", { players: room.players.map(p => p.username) });
  });

  socket.on("submitQuestion", question => {
    const code = findRoom(socket.id);
    if (!code) return;
    const room = rooms[code];
    if (room.phase !== "questions") return;
    if (typeof question !== "string" || !question.trim() || question.length > 200) return;

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;
    room.questions.push({ username: player.username, question: question.trim() });
    io.to(code).emit("questionUpdate", room.questions);
  });

  socket.on("startVoting", () => {
    const code = findRoom(socket.id);
    if (!code) return;
    const room = rooms[code];
    if (room.host !== socket.id || room.phase !== "questions") return;

    const allAsked = room.players.every(p =>
      room.questions.some(q => q.username === p.username)
    );
    if (!allAsked)
      return socket.emit("errorMessage", "All players must ask at least one question first!");

    room.phase = "voting";
    io.to(code).emit("votingStarted", room.players.map(p => p.username));
  });

  socket.on("submitVote", username => {
    const code = findRoom(socket.id);
    if (!code) return;
    const room = rooms[code];
    if (room.phase !== "voting" || room.votes[socket.id]) return;
    if (typeof username !== "string") return;

    const voter = room.players.find(p => p.id === socket.id);
    const target = room.players.find(p => p.username === username);
    if (!voter || !target) return socket.emit("errorMessage", "Invalid vote!");
    if (target.id === socket.id) return socket.emit("errorMessage", "You cannot vote for yourself!");

    room.votes[socket.id] = username;
    socket.emit("voteReceived");

    if (Object.keys(room.votes).length === room.players.length) {
      const counts = {};
      Object.values(room.votes).forEach(name => {
        counts[name] = (counts[name] || 0) + 1;
      });

      const highest = Math.max(...Object.values(counts));
      const winners = Object.keys(counts).filter(n => counts[n] === highest);
      const caught = winners.length === 1 &&
        room.players.find(p => p.username === winners[0]).id === room.spy;

      room.phase = "finished";
      io.to(code).emit("gameResult", {
        spy: room.players.find(p => p.id === room.spy).username,
        votes: counts,
        caught
      });
    }
  });

  socket.on("playAgain", () => {
    const code = findRoom(socket.id);
    if (!code) return;
    const room = rooms[code];
    if (room.host !== socket.id) return socket.emit("errorMessage", "Only host can restart!");
    if (room.phase !== "finished") return;
    resetRoom(code);
  });

  socket.on("disconnect", () => {
    const code = findRoom(socket.id);
    if (!code) return;

    const room = rooms[code];
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

    if (room.phase === "questions" || room.phase === "voting") {
      resetRoom(code);
      io.to(code).emit("errorMessage", "A player disconnected. Game reset to lobby.");
    } else {
      sendPlayers(code);
    }
  });
});

server.listen(process.env.PORT || 3000, "0.0.0.0", () =>
  console.log("SHADOW server running on port " + (process.env.PORT || 3000))
);
