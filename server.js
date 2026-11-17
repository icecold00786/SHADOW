const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);
app.use(express.static("public"));

const rooms = {};

const wordPairs = [
  { category: "SPORTS", word: "GOLF", spyWord: "POLO" },
  { category: "FOOD", word: "RICE", spyWord: "CAKE" },
  { category: "ANIMALS", word: "LION", spyWord: "BEAR" },
  { category: "FRUITS", word: "PEAR", spyWord: "PLUM" },
  { category: "PLACES", word: "PARK", spyWord: "MALL" },
  { category: "OBJECTS", word: "LAMP", spyWord: "FORK" },
  { category: "VEHICLES", word: "BIKE", spyWord: "CART" }
];

function findRoom(id) {
  return Object.keys(rooms).find(code =>
    rooms[code].players.some(p => p.id === id)
  );
}

function sendPlayers(code) {
  if (rooms[code]) io.to(code).emit("playerUpdate", rooms[code].players);
}

function resetRoom(code) {
  const room = rooms[code];
  if (!room) return;

  room.phase = "lobby";
  room.word = null;
  room.spyWord = null;
  room.category = null;
  room.spy = null;
  room.clues = {};
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
    if (!username) return socket.emit("errorMessage", "Enter a valid username!");

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

    if (room.host !== socket.id) return socket.emit("errorMessage", "Only host can start!");
    if (room.phase !== "lobby") return;
    if (room.players.length < 4)
      return socket.emit("errorMessage", "At least 4 players required!");

    const pair = wordPairs[Math.floor(Math.random() * wordPairs.length)];
    room.word = pair.word;
    room.spyWord = pair.spyWord;
    room.category = pair.category;
    room.spy = room.players[Math.floor(Math.random() * room.players.length)].id;
    room.phase = "clues";
    room.clues = {};
    room.votes = {};

    io.to(code).emit("gameStarted", {
      players: room.players.map(p => p.username)
    });

    room.players.forEach(p => {
      io.to(p.id).emit("yourRole", {
        role: p.id === room.spy ? "SPY" : "DETECTIVE",
        category: room.category,
        word: p.id === room.spy ? room.spyWord : room.word
      });
    });
  });

  socket.on("submitClue", clue => {
    const code = findRoom(socket.id);
    if (!code) return;
    const room = rooms[code];

    if (room.phase !== "clues") return;
    if (typeof clue !== "string" || !clue.trim() || clue.trim().length > 100) return;
    if (room.clues[socket.id]) return socket.emit("errorMessage", "You already submitted your clue!");

    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    room.clues[socket.id] = {
      username: player.username,
      clue: clue.trim()
    };

    io.to(code).emit("cluesUpdate", Object.values(room.clues));

    if (Object.keys(room.clues).length === room.players.length) {
      room.phase = "discussion";
      io.to(code).emit("cluesComplete");
    }
  });

  socket.on("startVoting", () => {
    const code = findRoom(socket.id);
    if (!code) return;
    const room = rooms[code];

    if (room.host !== socket.id) return socket.emit("errorMessage", "Only host can start voting!");
    if (room.phase !== "discussion") return;

    room.phase = "voting";
    io.to(code).emit("votingStarted", room.players.map(p => p.username));
  });

  socket.on("submitVote", username => {
    const code = findRoom(socket.id);
    if (!code) return;
    const room = rooms[code];

    if (room.phase !== "voting" || room.votes[socket.id]) return;
    if (typeof username !== "string") return;

    const target = room.players.find(p => p.username === username);
    if (!target) return socket.emit("errorMessage", "Invalid vote!");
    if (target.id === socket.id)
      return socket.emit("errorMessage", "You cannot vote for yourself!");

    room.votes[socket.id] = target.id;
    socket.emit("voteReceived");

    if (Object.keys(room.votes).length === room.players.length) {
      const counts = {};
      Object.values(room.votes).forEach(id => {
        const player = room.players.find(p => p.id === id);
        if (player) counts[player.username] = (counts[player.username] || 0) + 1;
      });

      const highest = Math.max(...Object.values(counts));
      const leaders = Object.keys(counts).filter(n => counts[n] === highest);

      if (leaders.length !== 1) {
        room.phase = "finished";
        return io.to(code).emit("gameResult", {
          spy: room.players.find(p => p.id === room.spy).username,
          word: room.word,
          votes: counts,
          caught: false,
          tie: true,
          spyGuessed: false,
          winner: "SPY"
        });
      }

      const caughtPlayer = room.players.find(p => p.username === leaders[0]);

      if (caughtPlayer.id === room.spy) {
        room.phase = "spyGuess";
        io.to(code).emit("spyCaught", { username: caughtPlayer.username });
        io.to(room.spy).emit("spyGuessTurn", { message: "Guess the detectives' secret word!" });
      } else {
        room.phase = "finished";
        io.to(code).emit("gameResult", {
          spy: room.players.find(p => p.id === room.spy).username,
          word: room.word,
          votes: counts,
          caught: false,
          tie: false,
          spyGuessed: false,
          winner: "SPY"
        });
      }
    }
  });

  socket.on("spyGuess", guess => {
    const code = findRoom(socket.id);
    if (!code) return;
    const room = rooms[code];

    if (room.phase !== "spyGuess" || socket.id !== room.spy) return;
    if (typeof guess !== "string" || !guess.trim() || guess.length > 30) return;

    const correct = guess.trim().toUpperCase() === room.word;
    room.phase = "finished";

    io.to(code).emit("gameResult", {
      spy: room.players.find(p => p.id === room.spy).username,
      word: room.word,
      votes: Object.fromEntries(
        Object.entries(room.votes).map(([id, targetId]) => [
          room.players.find(p => p.id === id)?.username || "Player",
          1
        ]).reduce((arr, [name, value]) => {
          const found = arr.find(x => x[0] === name);
          if (found) found[1] += value;
          else arr.push([name, value]);
          return arr;
        }, [])
      ),
      caught: true,
      tie: false,
      spyGuessed: correct,
      winner: correct ? "SPY" : "DETECTIVES"
    });
  });

  socket.on("playAgain", () => {
    const code = findRoom(socket.id);
    if (!code) return;
    const room = rooms[code];

    if (room.host !== socket.id)
      return socket.emit("errorMessage", "Only host can restart!");
    if (room.phase !== "finished")
      return socket.emit("errorMessage", "The game is not finished yet!");

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

server.listen(process.env.PORT || 3000, "0.0.0.0", () =>
  console.log("SHADOW server running on port " + (process.env.PORT || 3000))
);
