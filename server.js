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

const SUITS = ['H', 'D', 'C', 'S'];

function createDeck() {
  const deck = [];
  for (let value = 1; value <= 13; value++) {
    for (const suit of SUITS) {
      deck.push({ value, suit });
    }
  }
  return shuffle(deck);
}

function isRed(card) {
  return card.suit === 'H' || card.suit === 'D';
}

function cardScore(card) {
  if (card.value === 13 && isRed(card)) {
    return -1;
  }
  return card.value;
}

function broadcastHands() {
  const data = game.order.map(id => ({
    name: game.players[id].name,
    hand: game.players[id].hand,
  }));
  io.emit('hands', data);
}

function handlePower(card, socket) {
  const player = game.players[socket.id];
  switch (card.value) {
    case 7:
    case 8: {
      const idx = Math.floor(Math.random() * player.hand.length);
      socket.emit('reveal', {
        target: player.name,
        index: idx,
        card: player.hand[idx],
      });
      break;
    }
    case 9:
    case 10: {
      const otherId = game.order.find(id => id !== socket.id);
      if (otherId) {
        const otherPlayer = game.players[otherId];
        const idx = Math.floor(Math.random() * otherPlayer.hand.length);
        socket.emit('reveal', {
          target: otherPlayer.name,
          index: idx,
          card: otherPlayer.hand[idx],
        });
      }
      break;
    }
    case 11:
    case 12: {
      const otherId = game.order.find(id => id !== socket.id);
      if (otherId) {
        const otherPlayer = game.players[otherId];
        const idxSelf = Math.floor(Math.random() * player.hand.length);
        const idxOther = Math.floor(Math.random() * otherPlayer.hand.length);
        [player.hand[idxSelf], otherPlayer.hand[idxOther]] = [
          otherPlayer.hand[idxOther],
          player.hand[idxSelf],
        ];
        broadcastHands();
      }
      break;
    }
    case 13: {
      if (card.suit === 'S' || card.suit === 'C') {
        const otherId = game.order.find(id => id !== socket.id);
        if (otherId) {
          const otherPlayer = game.players[otherId];
          const idxSelf = Math.floor(Math.random() * player.hand.length);
          const idxOther = Math.floor(Math.random() * otherPlayer.hand.length);
          socket.emit('reveal', {
            target: player.name,
            index: idxSelf,
            card: player.hand[idxSelf],
          });
          socket.emit('reveal', {
            target: otherPlayer.name,
            index: idxOther,
            card: otherPlayer.hand[idxOther],
          });
          [player.hand[idxSelf], otherPlayer.hand[idxOther]] = [
            otherPlayer.hand[idxOther],
            player.hand[idxSelf],
          ];
          broadcastHands();
        }
      }
      break;
    }
  }
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
  broadcastHands();
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
    handlePower(old, socket);
    broadcastHands();
    nextTurn();
    io.to(game.order[game.turnIndex]).emit('yourTurn');
  });

  socket.on('discard', (card) => {
    const player = game.players[socket.id];
    if (!game.started || currentPlayer() !== player) return;
    game.discard.push(card);
    socket.emit('hand', player.hand);
    handlePower(card, socket);
    broadcastHands();
    nextTurn();
    io.to(game.order[game.turnIndex]).emit('yourTurn');
  });

  socket.on('callCabo', () => {
    if (!game.started) return;
    const scores = {};
    game.order.forEach(id => {
      scores[game.players[id].name] = game.players[id].hand.reduce(
        (a, b) => a + cardScore(b),
        0
      );
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
