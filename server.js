const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Simple Cabo game state
let game = {
  players: {}, // socket.id -> {name, hand: [], ready: false}
  order: [],
  deck: [],
  discard: [],
  started: false,
  turnIndex: 0,
};

function createDeck() {
  const deck = [];
  for (let i = 0; i <= 12; i++) {
    for (let j = 0; j < 4; j++) {
      deck.push(i);
    }
  }
  return shuffle(deck);
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function currentPlayer() {
  const id = game.order[game.turnIndex];
  return game.players[id];
}

function nextTurn() {
  game.turnIndex = (game.turnIndex + 1) % game.order.length;
}

function deal() {
  game.deck = createDeck();
  game.discard = [];
  game.order.forEach(id => {
    const player = game.players[id];
    player.hand = [];
    for (let i = 0; i < 4; i++) {
      player.hand.push(game.deck.pop());
    }
    io.to(id).emit('hand', player.hand);
  });
  game.started = true;
  game.turnIndex = 0;
}

io.on('connection', (socket) => {
  socket.on('join', (name) => {
    if (Object.keys(game.players).length >= 6 || game.started) return;
    game.players[socket.id] = { name, hand: [], ready: false };
    game.order.push(socket.id);
    io.emit('players', Object.values(game.players).map(p => p.name));
  });

  socket.on('start', () => {
    if (game.started) return;
    if (socket.id === game.order[0]) {
      deal();
      io.emit('start', game.order.map(id => game.players[id].name));
      io.to(game.order[game.turnIndex]).emit('yourTurn');
    }
  });

  socket.on('draw', () => {
    const player = game.players[socket.id];
    if (!game.started || currentPlayer() !== player) return;
    const card = game.deck.pop();
    socket.emit('drawn', card);
  });

  socket.on('replace', (index, card) => {
    const player = game.players[socket.id];
    if (!game.started || currentPlayer() !== player) return;
    const old = player.hand[index];
    player.hand[index] = card;
    game.discard.push(old);
    socket.emit('hand', player.hand);
    nextTurn();
    io.to(game.order[game.turnIndex]).emit('yourTurn');
  });

  socket.on('discard', (card) => {
    const player = game.players[socket.id];
    if (!game.started || currentPlayer() !== player) return;
    game.discard.push(card);
    socket.emit('hand', player.hand);
    nextTurn();
    io.to(game.order[game.turnIndex]).emit('yourTurn');
  });

  socket.on('callCabo', () => {
    if (!game.started) return;
    const scores = {};
    game.order.forEach(id => {
      scores[game.players[id].name] = game.players[id].hand.reduce((a,b) => a+b, 0);
    });
    io.emit('cabo', scores);
    game.started = false;
    game.players = {};
    game.order = [];
  });

  socket.on('disconnect', () => {
    delete game.players[socket.id];
    game.order = game.order.filter(id => id !== socket.id);
    if (game.order.length === 0) {
      game.started = false;
      game.deck = [];
      game.discard = [];
    }
  });
});

server.listen(3000, () => {
  console.log('listening on *:3000');
});
