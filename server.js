const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

const PORT = process.env.PORT || 3000;

const words = [
  "Pizza", "Football", "School", "Airport", "Beach", "Mountain",
  "Doctor", "Computer", "Ice Cream", "Cinema", "Guitar", "Car",
  "Hospital", "Restaurant", "Moon", "Rain", "Robot", "Forest",
  "Chocolate", "Birthday", "Train", "Phone", "Ocean", "Basketball"
];

let players = [];
let phase = "lobby"; // lobby | clue | vote | reveal | guess | finished
let secretWord = "";
let imposterId = null;
let clues = {};
let votes = {};
let resultData = null;

function publicPlayers() {
  return players.map((p, index) => ({
    id: p.id,
    name: p.name,
    host: index === 0
  }));
}

function broadcastState() {
  io.emit("playersUpdate", publicPlayers());
  io.emit("phaseUpdate", phase);
}

function resetRoundToLobby() {
  phase = "lobby";
  secretWord = "";
  imposterId = null;
  clues = {};
  votes = {};
  resultData = null;
  broadcastState();
}

function countUniqueVotes() {
  return new Set(Object.keys(votes)).size;
}

function resolveVotes() {
  const counts = {};
  for (const targetId of Object.values(votes)) {
    counts[targetId] = (counts[targetId] || 0) + 1;
  }

  let mostVotedId = null;
  let highest = -1;

  for (const [id, count] of Object.entries(counts)) {
    if (count > highest) {
      highest = count;
      mostVotedId = id;
    }
  }

  const eliminated = players.find(p => p.id === mostVotedId);
  const imposter = players.find(p => p.id === imposterId);
  const tied = Object.values(counts).filter(c => c === highest).length > 1;

  if (tied) {
    resultData = {
      type: "tie",
      message: "It's a tie! No one is eliminated.",
      imposterName: imposter?.name || "Unknown",
      word: secretWord
    };
    phase = "reveal";
  } else if (mostVotedId === imposterId) {
    resultData = {
      type: "caught",
      message: `${imposter?.name || "The player"} was the Imposter!`,
      imposterName: imposter?.name || "Unknown",
      word: secretWord
    };
    phase = "guess";
    io.to(imposterId).emit("imposterGuessTime", { wordHint: "Guess the secret word." });
  } else {
    resultData = {
      type: "miss",
      message: `${eliminated?.name || "A player"} was voted out, but they were not the Imposter.`,
      imposterName: imposter?.name || "Unknown",
      word: secretWord
    };
    phase = "finished";
  }

  io.emit("voteResult", {
    ...resultData,
    phase
  });
}

io.on("connection", (socket) => {
  socket.on("joinGame", (rawName) => {
    if (phase !== "lobby") {
      socket.emit("errorMessage", "The game is already running. Join when the round ends.");
      return;
    }

    const name = String(rawName ?? "").trim().slice(0, 20);

    if (!name) {
      socket.emit("errorMessage", "Enter a name first.");
      return;
    }

    if (players.length >= 20) {
      socket.emit("errorMessage", "The lobby is full (20 players maximum).");
      return;
    }

    if (players.some(p => p.name.toLowerCase() === name.toLowerCase())) {
      socket.emit("errorMessage", "That name is already taken.");
      return;
    }

    players.push({ id: socket.id, name });

    socket.emit("joined", {
      id: socket.id,
      host: players[0].id === socket.id
    });

    broadcastState();
  });

  socket.on("startGame", () => {
    if (phase !== "lobby") return;
    if (!players.length || players[0].id !== socket.id) return;

    if (players.length < 3) {
      socket.emit("errorMessage", "You need at least 3 players to start.");
      return;
    }

    secretWord = words[Math.floor(Math.random() * words.length)];
    imposterId = players[Math.floor(Math.random() * players.length)].id;
    clues = {};
    votes = {};
    resultData = null;
    phase = "clue";

    players.forEach(player => {
      io.to(player.id).emit("gameStarted", {
        role: player.id === imposterId ? "imposter" : "crew",
        word: player.id === imposterId ? null : secretWord
      });
    });

    io.emit("clueCount", 0);
    io.emit("phaseUpdate", phase);
  });

  socket.on("submitClue", (rawClue) => {
    if (phase !== "clue") return;
    if (!players.some(p => p.id === socket.id)) return;
    if (clues[socket.id]) return;

    const clue = String(rawClue ?? "").trim().slice(0, 80);
    if (!clue) {
      socket.emit("errorMessage", "Write a clue first.");
      return;
    }

    clues[socket.id] = clue;
    io.emit("clueCount", Object.keys(clues).length);

    if (Object.keys(clues).length === players.length) {
      phase = "vote";

      const clueList = players.map(p => ({
        name: p.name,
        clue: clues[p.id] || ""
      }));

      io.emit("allClues", clueList);
      io.emit("phaseUpdate", phase);
    }
  });

  socket.on("requestClues", () => {
    if (phase === "vote" || phase === "reveal" || phase === "guess" || phase === "finished") {
      const clueList = players.map(p => ({
        name: p.name,
        clue: clues[p.id] || ""
      }));
      socket.emit("allClues", clueList);
    }
  });

  socket.on("vote", (targetId) => {
    if (phase !== "vote") return;
    if (!players.some(p => p.id === socket.id)) return;
    if (!players.some(p => p.id === targetId)) return;
    if (socket.id === targetId) return;
    if (votes[socket.id]) return;

    votes[socket.id] = targetId;
    io.emit("voteCount", countUniqueVotes());

    if (countUniqueVotes() === players.length) {
      resolveVotes();
    }
  });

  socket.on("imposterGuess", (rawGuess) => {
    if (phase !== "guess" || socket.id !== imposterId) return;

    const guess = String(rawGuess ?? "").trim().toLowerCase();
    const correct = guess === secretWord.toLowerCase();

    const imposter = players.find(p => p.id === imposterId);
    resultData = {
      type: correct ? "imposterWin" : "crewWin",
      message: correct
        ? `${imposter?.name || "The Imposter"} guessed the word correctly!`
        : `${imposter?.name || "The Imposter"} guessed wrong.`,
      imposterName: imposter?.name || "Unknown",
      word: secretWord
    };

    phase = "finished";
    io.emit("finalResult", resultData);
    io.emit("phaseUpdate", phase);
  });

  socket.on("nextRound", () => {
    if (players.length === 0) return;
    if (players[0]?.id !== socket.id) return;
    resetRoundToLobby();
  });

  socket.on("leaveGame", () => {
    players = players.filter(p => p.id !== socket.id);
    if (players.length === 0) {
      resetRoundToLobby();
    } else {
      if (phase !== "lobby") {
        // Keep the running round simple: cancel it if the lobby changes.
        resetRoundToLobby();
      } else {
        broadcastState();
      }
    }
  });

  socket.on("disconnect", () => {
    players = players.filter(p => p.id !== socket.id);

    if (players.length === 0) {
      resetRoundToLobby();
    } else if (phase !== "lobby") {
      resetRoundToLobby();
    } else {
      broadcastState();
    }
  });
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Imposter game running on port ${PORT}`);
});
