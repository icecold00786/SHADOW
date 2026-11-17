const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const rooms = {};

const words = [
  { category: "SPORTS", word: "GOLF" },
  { category: "FOOD", word: "RICE" },
  { category: "ANIMALS", word: "LION" },
  { category: "FRUITS", word: "PEAR" },
  { category: "PLACES", word: "PARK" },
  { category: "OBJECTS", word: "LAMP" },
  { category: "VEHICLES", word: "BIKE" }
];

function findRoom(id) {
  return Object.keys(rooms).find(code =>
    rooms[code].players.some(p => p.id === id)
  );
}

function sendPlayers(code) {
  if (rooms[code]) {
    io.to(code).emit("playerUpdate", rooms[code].players);
  }
}

function resetRoom(code) {
  const room = rooms[code];
  if (!room) return;

  room.phase = "lobby";
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

io.on("connection", socket => {
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
    if (room.players.length !== 4) {
      return socket.emit("errorMessage", "Exactly 4 players are required!");
    }

    const selected = words[Math.floor(Math.random() * words.length)];

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

      io.to(player.id).emit("yourRole", {
        role: isShadow ? "SHADOW" : "INSIDER",
        category: isShadow ? "" : room.category,
        word: isShadow ? "" : room.word
      });
    });

    io.to(code).emit("clueTurn", {
      username: room.players[0].username,
      index: 1,
      total: 4
    });
  });

  socket.on("submitClue", clue => {
    const code = findRoom(socket.id);
    if (!code) return;

    const room = rooms[code];

    if (room.phase !== "clues") return;
    if (typeof clue !== "string" || !clue.trim() || clue.trim().length > 100) return;
    if (room.clues[socket.id]) return;
    if (room.players[room.clueIndex]?.id !== socket.id) {
      return socket.emit("errorMessage", "Wait for your clue turn!");
    }

    const player = room.players[room.clueIndex];

    room.clues[socket.id] = {
      username: player.username,
      clue: clue.trim()
    };

    io.to(code).emit("cluesUpdate", Object.values(room.clues));

    room.clueIndex++;

    if (room.clueIndex === 4) {
      room.phase = "discussion";
      io.to(code).emit("cluesComplete");
    } else {
      io.to(code).emit("clueTurn", {
        username: room.players[room.clueIndex].username,
        index: room.clueIndex + 1,
        total: 4
      });
    }
  });

  socket.on("startVoting", () => {
    const code = findRoom(socket.id);
    if (!code) return;

    const room = rooms[code];

    if (room.host !== socket.id) {
      return socket.emit("errorMessage", "Only host can start voting!");
    }
    if (room.phase !== "discussion") return;

    room.phase = "voting";
    room.votes = {};

    io.to(code).emit("votingStarted",
      room.players.map(p => p.username)
    );
  });

  socket.on("submitVote", username => {
    const code = findRoom(socket.id);
    if (!code) return;

    const room = rooms[code];

    if (room.phase !== "voting" || room.votes[socket.id]) return;
    if (typeof username !== "string") return;

    const target = room.players.find(p => p.username === username);
    if (!target) return socket.emit("errorMessage", "Invalid vote!");
    if (target.id === socket.id) {
      return socket.emit("errorMessage", "You cannot vote for yourself!");
    }

    room.votes[socket.id] = target.id;
    socket.emit("voteReceived");

    if (Object.keys(room.votes).length !== 4) return;

    const counts = {};

    Object.values(room.votes).forEach(id => {
      const player = room.players.find(p => p.id === id);
      if (player) {
        counts[player.username] = (counts[player.username] || 0) + 1;
      }
    });

    const highest = Math.max(...Object.values(counts));
    const leaders = Object.keys(counts).filter(name => counts[name] === highest);

    const tie = leaders.length !== 1;
    const eliminated = tie ? null : room.players.find(p => p.username === leaders[0]);
    const caught = !!eliminated && eliminated.id === room.shadow;

    room.phase = "finished";

    io.to(code).emit("gameResult", {
      spy: room.players.find(p => p.id === room.shadow).username,
      word: room.word,
      votes: counts,
      eliminated: eliminated ? eliminated.username : null,
      caught,
      tie,
      winner: caught ? "INSIDERS" : "SHADOW"
    });
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
