const socket = io();

const $ = (id) => document.getElementById(id);

const screens = {
  login: $("login"),
  lobby: $("lobby"),
  role: $("role"),
  clue: $("clue"),
  vote: $("vote"),
  result: $("result")
};

let myId = null;
let myName = "";
let myRole = "";
let myWord = "";
let players = [];
let isHost = false;

function show(name) {
  Object.values(screens).forEach(s => s.classList.add("hidden"));
  screens[name].classList.remove("hidden");
  window.scrollTo(0, 0);
}

function clearErrors() {
  ["loginError", "lobbyError", "clueError", "resultError"].forEach(id => $(id).textContent = "");
}

function renderPlayers() {
  $("playerCount").textContent = `${players.length} player${players.length === 1 ? "" : "s"}`;
  $("playerList").innerHTML = players.map((p, i) => `
    <div class="player">
      <span>${escapeHtml(p.name)}</span>
      ${i === 0 ? '<span class="host">HOST</span>' : ""}
    </div>
  `).join("");

  $("start").disabled = !isHost || players.length < 3;
  $("hostHint").textContent = isHost
    ? "You are the host."
    : "Waiting for the host to start the game.";
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[ch]));
}

$("join").addEventListener("click", () => {
  clearErrors();
  myName = $("name").value.trim();
  if (!myName) {
    $("loginError").textContent = "Enter your name.";
    return;
  }
  socket.emit("joinGame", myName);
});

$("name").addEventListener("keydown", e => {
  if (e.key === "Enter") $("join").click();
});

$("start").addEventListener("click", () => {
  $("lobbyError").textContent = "";
  socket.emit("startGame");
});

socket.on("joined", data => {
  myId = data.id;
  isHost = data.host;
  show("lobby");
  renderPlayers();
});

socket.on("playersUpdate", data => {
  players = data;
  const me = players.find(p => p.id === myId);
  if (me) isHost = me.host;
  renderPlayers();
});

socket.on("errorMessage", message => {
  const current = Object.entries(screens).find(([, el]) => !el.classList.contains("hidden"))?.[0];
  const target = current === "login" ? "loginError"
    : current === "lobby" ? "lobbyError"
    : current === "clue" ? "clueError"
    : "resultError";
  if ($(target)) $(target).textContent = message;
});

socket.on("gameStarted", data => {
  myRole = data.role;
  myWord = data.word || "";
  $("roleBadge").textContent = myRole === "imposter" ? "IMPOSTER" : "CREWMATE";
  $("roleTitle").textContent = myRole === "imposter"
    ? "You don't know the word."
    : "You know the word.";
  $("roleText").textContent = myRole === "imposter"
    ? "Listen carefully to everyone's clues and try to figure out the secret word."
    : "Give a clue that relates to the word without making it painfully obvious.";
  $("secretWord").textContent = myRole === "imposter" ? "???" : myWord;
  $("ready").textContent = "I'M READY";
  show("role");
});

$("ready").addEventListener("click", () => {
  $("knownWord").textContent = myRole === "crew" ? `Your word: ${myWord}` : "You are the Imposter.";
  $("clueInput").value = "";
  $("clueStatus").textContent = "";
  $("sendClue").disabled = false;
  show("clue");
});

$("sendClue").addEventListener("click", submitClue);
$("clueInput").addEventListener("keydown", e => {
  if (e.key === "Enter") submitClue();
});

function submitClue() {
  const value = $("clueInput").value.trim();
  $("clueError").textContent = "";
  if (!value) {
    $("clueError").textContent = "Write a clue first.";
    return;
  }
  $("sendClue").disabled = true;
  $("clueStatus").textContent = "Clue submitted. Waiting for everyone...";
  socket.emit("submitClue", value);
}

socket.on("clueCount", count => {
  $("clueCount").textContent = `${count}/${players.length}`;
});

socket.on("allClues", clues => {
  $("clues").innerHTML = clues.map(c => `
    <div class="clue">
      <div class="clueName">${escapeHtml(c.name)}</div>
      <div class="clueText">${escapeHtml(c.clue)}</div>
    </div>
  `).join("");

  renderVoteButtons();
  show("vote");
});

function renderVoteButtons() {
  $("voteButtons").innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "voteWrap";

  players.filter(p => p.id !== myId).forEach(p => {
    const btn = document.createElement("button");
    btn.textContent = `Vote: ${p.name}`;
    btn.addEventListener("click", () => {
      [...wrap.querySelectorAll("button")].forEach(b => b.disabled = true);
      $("voteStatus").textContent = "Vote submitted. Waiting for everyone...";
      socket.emit("vote", p.id);
    });
    wrap.appendChild(btn);
  });

  $("voteButtons").appendChild(wrap);
}

socket.on("voteCount", count => {
  $("voteCount").textContent = `${count}/${players.length}`;
});

socket.on("voteResult", data => {
  $("resultTitle").textContent =
    data.type === "caught" ? "THE IMPOSTER WAS CAUGHT" :
    data.type === "miss" ? "THE IMPOSTER ESCAPED" :
    "IT'S A TIE";

  $("resultMessage").textContent = data.message;
  $("imposterName").textContent = data.imposterName;
  $("revealedWord").textContent = data.word;
  $("guessBox").classList.toggle("hidden", data.type !== "caught" || myRole !== "imposter");
  $("nextRound").style.display = data.type === "caught" && myRole === "imposter" ? "none" : "block";
  show("result");

  if (data.type === "caught" && myRole === "imposter") {
    $("guessBox").classList.remove("hidden");
  }
});

socket.on("imposterGuessTime", () => {
  if (myRole !== "imposter") return;
  $("guessBox").classList.remove("hidden");
  $("nextRound").style.display = "none";
});

$("guessButton").addEventListener("click", () => {
  const guess = $("guessInput").value.trim();
  if (!guess) return;
  $("guessButton").disabled = true;
  socket.emit("imposterGuess", guess);
});

socket.on("finalResult", data => {
  $("resultTitle").textContent = data.type === "imposterWin" ? "IMPOSTER WINS!" : "CREW WINS!";
  $("resultMessage").textContent = data.message;
  $("imposterName").textContent = data.imposterName;
  $("revealedWord").textContent = data.word;
  $("guessBox").classList.add("hidden");
  $("nextRound").style.display = "block";
  show("result");
});

$("nextRound").addEventListener("click", () => {
  socket.emit("nextRound");
});

socket.on("backToLobby", () => {
  isHost = players[0]?.id === myId;
  $("lobbyError").textContent = "";
  show("lobby");
  renderPlayers();
});
