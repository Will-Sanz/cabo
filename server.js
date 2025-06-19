const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Simple Cabo game state
let game = {
  players: {}, // socket.id -> {name, hand: [], revealed: [], drawn: null, pendingPower: null}
  order: [],
  deck: [],
  discard: [],
  started: false,
  turnIndex: 0,
};

const suits = ['H', 'D', 'C', 'S']; // hearts/diamonds/clubs/spades

function createDeck() {
  const deck = [];
  for (let r = 1; r <= 13; r++) {
    for (const s of suits) {
      deck.push({ rank: r, suit: s });
    }
  }
  return shuffle(deck);
}

function cardString(card) {
  const names = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
  return `${names[card.rank] || card.rank}${card.suit}`;
}

function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function cardValue(card) {
  if (card.rank === 13 && (card.suit === 'H' || card.suit === 'D')) return -1;
  return card.rank;
}

function sendHand(id) {
  const p = game.players[id];
  io.to(id).emit('hand', {
    cards: p.hand.map(cardString),
    revealed: p.revealed,
  });
}

function currentPlayer() {
  const id = game.order[game.turnIndex];
  return game.players[id];
}

function nextTurn() {
  game.turnIndex = (game.turnIndex + 1) % game.order.length;
}

function handlePower(socket, card) {
  const player = game.players[socket.id];
  if (!card) return nextTurn();
  switch (card.rank) {
    case 7:
    case 8:
      player.pendingPower = { type: 'peekSelf' };
      socket.emit('power', { type: 'peekSelf' });
      return;
    case 9:
    case 10:
      player.pendingPower = { type: 'peekOther' };
      socket.emit('power', { type: 'peekOther' });
      return;
    case 11:
    case 12:
      player.pendingPower = { type: 'blindSwap' };
      socket.emit('power', { type: 'blindSwap' });
      return;
    case 13:
      if (card.suit === 'S' || card.suit === 'C') {
        player.pendingPower = { type: 'lookSwap' };
        socket.emit('power', { type: 'lookSwap' });
        return;
      }
  }
  nextTurn();
  io.to(game.order[game.turnIndex]).emit('yourTurn');
}

function deal() {
  game.deck = createDeck();
  game.discard = [];
  game.order.forEach(id => {
    const player = game.players[id];
    player.hand = [];
    player.revealed = [false, false, false, false];
    player.drawn = null;
    player.pendingPower = null;
    for (let i = 0; i < 4; i++) {
      player.hand.push(game.deck.pop());
    }
    const a = Math.floor(Math.random() * 4);
    let b;
    do { b = Math.floor(Math.random() * 4); } while (b === a);
    player.revealed[a] = true;
    player.revealed[b] = true;
    sendHand(id);
  });
  game.started = true;
  game.turnIndex = 0;
}

io.on('connection', (socket) => {
  socket.on('join', (name) => {
    if (Object.keys(game.players).length >= 6 || game.started) return;
    game.players[socket.id] = { name, hand: [], revealed: [], drawn: null, pendingPower: null };
    game.order.push(socket.id);
    io.emit('players', game.order.map(pid => ({ id: pid, name: game.players[pid].name })));
  });

  socket.on('start', () => {
    if (game.started) return;
    if (socket.id === game.order[0]) {
      deal();
      io.emit('start', game.order.map(id => ({ id, name: game.players[id].name })));
      io.to(game.order[game.turnIndex]).emit('yourTurn');
    }
  });

  socket.on('draw', () => {
    const player = game.players[socket.id];
    if (!game.started || currentPlayer() !== player) return;
    player.drawn = game.deck.pop();
    socket.emit('drawn', cardString(player.drawn));
  });

  socket.on('replace', (index) => {
    const player = game.players[socket.id];
    if (!game.started || currentPlayer() !== player) return;
    const old = player.hand[index];
    player.hand[index] = player.drawn;
    player.revealed[index] = true;
    game.discard.push(old);
    sendHand(socket.id);
    player.drawn = null;
    handlePower(socket, old);
  });

  socket.on('discard', () => {
    const player = game.players[socket.id];
    if (!game.started || currentPlayer() !== player) return;
    const card = player.drawn;
    game.discard.push(card);
    player.drawn = null;
    sendHand(socket.id);
    handlePower(socket, card);
  });

  socket.on('power', data => {
    const player = game.players[socket.id];
    if (!player.pendingPower) return;
    switch (player.pendingPower.type) {
      case 'peekSelf':
        player.revealed[data.index] = true;
        sendHand(socket.id);
        break;
      case 'peekOther':
        const target = game.players[data.target];
        if (target) {
          socket.emit('reveal', cardString(target.hand[data.index]));
        }
        break;
      case 'blindSwap':
        const t = game.players[data.target];
        if (t) {
          const tmp = player.hand[data.my];
          player.hand[data.my] = t.hand[data.their];
          t.hand[data.their] = tmp;
          player.revealed[data.my] = false;
          if (t.revealed) t.revealed[data.their] = false;
          sendHand(socket.id);
          sendHand(data.target);
        }
        break;
      case 'lookSwap':
        const tgt = game.players[data.target];
        if (tgt) {
          player.revealed[data.my] = true;
          const temp = player.hand[data.my];
          player.hand[data.my] = tgt.hand[data.their];
          tgt.hand[data.their] = temp;
          if (tgt.revealed) tgt.revealed[data.their] = false;
          sendHand(socket.id);
          sendHand(data.target);
        }
        break;
    }
    player.pendingPower = null;
    nextTurn();
    io.to(game.order[game.turnIndex]).emit('yourTurn');
  });

  socket.on('matchKnown', data => {
    const player = game.players[socket.id];
    if (!game.started || currentPlayer() !== player) return;
    const top = game.discard[game.discard.length - 1];
    const target = game.players[data.target];
    if (!top || !target) return;
    const targetCard = target.hand[data.their];
    if (targetCard && targetCard.rank === top.rank && targetCard.suit === top.suit) {
      game.discard.push(target.hand.splice(data.their, 1)[0]);
      const given = player.hand.splice(data.my, 1)[0];
      target.hand.splice(data.their, 0, given);
      if (target.revealed) target.revealed.splice(data.their, 0, false);
      player.revealed.splice(data.my, 1);
      sendHand(socket.id);
      sendHand(data.target);
    }
    nextTurn();
    io.to(game.order[game.turnIndex]).emit('yourTurn');
  });

  socket.on('callCabo', () => {
    if (!game.started) return;
    const scores = {};
    game.order.forEach(id => {
      scores[game.players[id].name] = game.players[id].hand.reduce((a, b) => a + cardValue(b), 0);
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
