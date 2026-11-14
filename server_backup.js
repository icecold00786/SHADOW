const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static("public"));

const rooms = {};

io.on("connection", (socket) => {
  console.log("Player connected:", socket.id);

  socket.on("createRoom", (username) => {
    const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    rooms[roomCode] = { players: [{ id: socket.id, username }], deleteTimer: null };
    socket.join(roomCode);
    socket.emit("roomCreated", { roomCode, players: rooms[roomCode].players });
    console.log(username + " created room " + roomCode);
  });

  socket.on("joinRoom", ({ username, roomCode }) => {
    const room = rooms[roomCode];
    if (!room) return socket.emit("errorMessage", "Room not found!");
    if (room.deleteTimer) {
      clearTimeout(room.deleteTimer);
      room.deleteTimer = null;
    }
    let player = room.players.find(p => p.username === username);
    if (player) player.id = socket.id;
    else {
      if (room.players.length >= 20) return socket.emit("errorMessage", "Room is full!");
      player = { id: socket.id, username };
      room.players.push(player);
    }
    socket.join(roomCode);
    io.to(roomCode).emit("playerUpdate", room.players);
    console.log(username + " joined room " + roomCode);
  });

  socket.on("startGame", () => {
    const roomCode = [...socket.rooms].find(code => rooms[code]);
    if (!roomCode) return;
    const room = rooms[roomCode];
    if (room.players.length < 4) {
      socket.emit("errorMessage", "At least 4 players required!");
      return;
    }
    const spyIndex = Math.floor(Math.random() * room.players.length);
    room.players.forEach((player, index) => {
      const role = index === spyIndex ? "SPY" : "DETECTIVE";
      io.to(player.id).emit("yourRole", { role });
    });
    io.to(roomCode).emit("gameStarted");
    console.log("Game started in room " + roomCode);
  });

  socket.on("disconnect", () => {
    for (const code in rooms) {
      const room = rooms[code];
      room.players = room.players.filter(p => p.id !== socket.id);
      if (room.players.length === 0) {
        room.deleteTimer = setTimeout(() => {
          if (rooms[code] && rooms[code].players.length === 0) delete rooms[code];
        }, 5 * 60 * 1000);
      } else io.to(code).emit("playerUpdate", room.players);
    }
    console.log("Player disconnected:", socket.id);
  });
});

server.listen(3000, "0.0.0.0", () => {
  console.log("SHADOW server running on port 3000");
});
