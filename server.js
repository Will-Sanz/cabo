const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

// Simple Cabo game state
let game = {
  players: {}, // socket.id -> {name, hand: [], ready: false, hasDrawn: false}
  order: [],
  deck: [],
  discard: [],
  started: false,
  turnIndex: 0,
  caboCalledBy: null,
  finalRoundStartIndex: null,
  inFinalRound: false,
};

const SUITS = ['H', 'D', 'C', 'S'];

function createDeck() {
  const deck = [];
  for (let value = 1; value <= 13; value++) {
    for (const suit of SUITS) {
      deck.push({ value, suit });
    }
  }
  // Add 2 jokers
  deck.push({ value: 0, suit: 'JOKER_RED' });
  deck.push({ value: 0, suit: 'JOKER_BLACK' });
  return shuffle(deck);
}

function isRed(card) {
  return card.suit === 'H' || card.suit === 'D';
}

function cardScore(card) {
  if (card.value === 0) {
    return 0; // Jokers = 0
  }
  if (card.value === 13 && (card.suit === 'H' || card.suit === 'D')) {
    return -1; // Red Kings = -1
  }
  if (card.value === 13) {
    return 13; // Black Kings = 13
  }
  if (card.value === 1) {
    return 1; // Aces = 1
  }
  return card.value;
}

function broadcastHands() {
  const data = game.order.map((id, index) => ({
    name: game.players[id].name,
    hand: game.players[id].hand,
    isCurrentTurn: index === game.turnIndex,
  }));
  io.emit('hands', data);
  
  // Also broadcast discard pile top card
  const topCard = game.discard.length > 0 ? game.discard[game.discard.length - 1] : null;
  io.emit('discardTop', topCard);
}

function handlePower(card, socket, fromDeck = true) {
  // Power cards only work when drawn from face-down deck
  if (!fromDeck) return;
  
  const player = game.players[socket.id];
  switch (card.value) {
    case 7:
    case 8: {
      // Peek at one of your own cards - let player choose
      socket.emit('choosePeek', {
        type: 'own',
        message: 'Choose one of your cards to peek at'
      });
      break;
    }
    case 9:
    case 10: {
      // Peek at opponent's card - let player choose opponent and card
      const opponents = game.order.filter(id => id !== socket.id);
      if (opponents.length > 0) {
        socket.emit('choosePeek', {
          type: 'opponent',
          message: 'Choose an opponent and their card to peek at',
          opponents: opponents.map(id => game.players[id].name)
        });
      }
      break;
    }
    case 11:
    case 12: {
      // Blind swap - let player choose which of their cards and which opponent
      const opponents = game.order.filter(id => id !== socket.id);
      if (opponents.length > 0) {
        socket.emit('chooseSwap', {
          type: 'blind',
          message: 'Choose one of your cards and an opponent to blind swap with',
          opponents: opponents.map(id => game.players[id].name)
        });
      }
      break;
    }
    case 13: {
      // Black King power: peek opponent + own, optional swap
      if (card.suit === 'S' || card.suit === 'C') {
        const opponents = game.order.filter(id => id !== socket.id);
        if (opponents.length > 0) {
          socket.emit('blackKingPower', {
            message: 'Black King: Choose an opponent card to peek at, then one of your own',
            opponents: opponents.map(id => game.players[id].name)
          });
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

function reshuffleDeck() {
  if (game.discard.length <= 1) return; // Keep at least the top card
  
  // Take all but the top discard card and shuffle into deck
  const topCard = game.discard.pop();
  game.deck = shuffle(game.discard);
  game.discard = [topCard];
}

function currentPlayer() {
  const id = game.order[game.turnIndex];
  return game.players[id];
}

function nextTurn() {
  game.turnIndex = (game.turnIndex + 1) % game.order.length;
  
  // Check if final round is over
  if (game.inFinalRound && game.turnIndex === game.finalRoundStartIndex) {
    // Final round completed - end game
    if (game.caboCalledBy) {
      endGame('cabo', game.caboCalledBy);
    } else {
      endGame('noCards');
    }
    return;
  }
}

function endGame(reason, winner = null) {
  const scores = {};
  let lowestScore = Infinity;
  let actualWinner = winner;
  
  game.order.forEach(id => {
    const playerScore = game.players[id].hand.reduce((a, b) => a + cardScore(b), 0);
    scores[game.players[id].name] = playerScore;
    if (playerScore < lowestScore) {
      lowestScore = playerScore;
      if (!actualWinner) actualWinner = game.players[id].name;
    }
  });
  
  io.emit('gameEnd', { reason, winner: actualWinner, scores });
  
  // Reset game state
  game.started = false;
  game.players = {};
  game.order = [];
  game.deck = [];
  game.discard = [];
  game.caboCalledBy = null;
  game.finalRoundStartIndex = null;
  game.inFinalRound = false;
}

function deal() {
  game.deck = createDeck();
  game.discard = [];
  
  // Start with one card in discard pile
  game.discard.push(game.deck.pop());
  
  game.order.forEach(id => {
    const player = game.players[id];
    player.hand = [];
    player.hasDrawn = false;
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
    if (Object.keys(game.players).length >= 8 || game.started) return;
    game.players[socket.id] = { name, hand: [], ready: false, hasDrawn: false };
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

  socket.on('draw', (source) => {
    const player = game.players[socket.id];
    if (!game.started || currentPlayer() !== player) {
      socket.emit('drawDenied', { message: 'Not your turn!' });
      return;
    }
    
    let card;
    let fromDiscard = false;
    
    if (source === 'discard') {
      // Draw from discard pile
      if (game.discard.length === 0) {
        socket.emit('drawDenied', { message: 'Discard pile is empty!' });
        return;
      }
      card = game.discard.pop();
      fromDiscard = true;
    } else {
      // Draw from deck
      if (game.deck.length === 0) {
        reshuffleDeck();
        if (game.deck.length === 0) {
          // Still no cards after reshuffle - game ends
          endGame('deckEmpty');
          return;
        }
      }
      card = game.deck.pop();
      
      // Send card flip animation for deck draw
      socket.emit('deckFlip', { card });
    }
    
    // Mark that this player has drawn for the first time
    player.hasDrawn = true;
    
    socket.emit('drawn', { card, fromDiscard });
  });

  socket.on('clickDiscard', (cardIndex) => {
    const player = game.players[socket.id];
    if (!game.started || game.discard.length === 0) return;
    
    const topCard = game.discard[game.discard.length - 1];
    const clickedCard = player.hand[cardIndex];
    
    if (clickedCard && clickedCard.value === topCard.value) {
      // Correct match - discard the card
      const discardedCard = player.hand.splice(cardIndex, 1)[0];
      game.discard.push(discardedCard);
      
      socket.emit('hand', player.hand);
      broadcastHands();
      
      // Check if player has no cards left
      if (player.hand.length === 0) {
        if (!game.inFinalRound) {
          // Start final round
          game.inFinalRound = true;
          game.finalRoundStartIndex = game.turnIndex;
          io.emit('finalRound', { message: `${player.name} ran out of cards! Everyone gets one more turn.` });
        }
        return;
      }
    } else {
      // Wrong card - player draws a penalty card
      if (game.deck.length === 0) {
        reshuffleDeck();
      }
      const penaltyCard = game.deck.pop();
      player.hand.push(penaltyCard);
      socket.emit('hand', player.hand);
      socket.emit('penalty', { message: 'Wrong card! Drew penalty card.' });
      broadcastHands();
    }
  });

  socket.on('peekOwnCard', (cardIndex) => {
    const player = game.players[socket.id];
    console.log(`Player ${player.name} trying to peek at card ${cardIndex}, hasDrawn: ${player.hasDrawn}`);
    
    if (!game.started) return;
    
    // Before first draw: can only peek at bottom 2 cards (indices 2 and 3)
    if (!player.hasDrawn) {
      if (cardIndex !== 2 && cardIndex !== 3) {
        socket.emit('peekDenied', { message: 'You can only look at your bottom 2 cards before your first turn!', cardIndex });
        return;
      }
      
      console.log(`Sending cardPeek for card: ${JSON.stringify(player.hand[cardIndex])}`);
      // Show the card in popup
      socket.emit('cardPeek', {
        card: player.hand[cardIndex]
      });
    } else {
      // After first draw: cannot peek unless it's during a special action
      socket.emit('peekDenied', { message: 'You can only peek at cards using power cards or when replacing!', cardIndex });
    }
  });

  // Add a special peek event for power cards and replacement actions
  socket.on('powerPeekOwnCard', (cardIndex) => {
    const player = game.players[socket.id];
    if (!game.started) return;
    
    // This is used during power card actions - always allowed
    socket.emit('cardPeek', {
      card: player.hand[cardIndex]
    });
  });

  socket.on('replace', (index, card) => {
    const player = game.players[socket.id];
    if (!game.started || currentPlayer() !== player) return;
    const old = player.hand[index];
    player.hand[index] = card;
    game.discard.push(old); // Add replaced card to discard pile
    
    // Show the card being discarded with animation
    socket.emit('cardReplaced', {
      cardIndex: index,
      oldCard: old,
      newCard: card
    });
    
    socket.emit('hand', player.hand);
    // Don't trigger power on replaced card - only on discarded drawn cards
    broadcastHands();
    nextTurn();
    io.to(game.order[game.turnIndex]).emit('yourTurn');
  });

  socket.on('discard', (card) => {
    const player = game.players[socket.id];
    if (!game.started || currentPlayer() !== player) return;
    game.discard.push(card); // Add discarded card to discard pile
    socket.emit('hand', player.hand);
    handlePower(card, socket, true); // Trigger power when discarding drawn card
    broadcastHands();
    nextTurn();
    io.to(game.order[game.turnIndex]).emit('yourTurn');
  });

  socket.on('peekCard', (data) => {
    const player = game.players[socket.id];
    if (!game.started || currentPlayer() !== player) return;
    
    if (data.type === 'own') {
      // Send card peek popup
      socket.emit('cardPeek', {
        card: player.hand[data.cardIndex]
      });
    } else if (data.type === 'opponent') {
      const targetId = game.order.find(id => game.players[id].name === data.opponent);
      if (targetId) {
        const targetPlayer = game.players[targetId];
        
        // For opponent cards, show a temporary peek with chat message
        socket.emit('reveal', {
          target: targetPlayer.name,
          index: data.cardIndex,
          card: targetPlayer.hand[data.cardIndex],
        });
      }
    }
  });

  socket.on('swapCards', (data) => {
    const player = game.players[socket.id];
    if (!game.started || currentPlayer() !== player) return;
    
    const targetId = game.order.find(id => game.players[id].name === data.opponent);
    if (targetId) {
      const targetPlayer = game.players[targetId];
      [player.hand[data.myCardIndex], targetPlayer.hand[data.opponentCardIndex]] = [
        targetPlayer.hand[data.opponentCardIndex],
        player.hand[data.myCardIndex],
      ];
      broadcastHands();
    }
  });

  socket.on('blackKingPeek', (data) => {
    const player = game.players[socket.id];
    if (!game.started || currentPlayer() !== player) return;
    
    // First peek at opponent's card
    const targetId = game.order.find(id => game.players[id].name === data.opponent);
    if (targetId) {
      const targetPlayer = game.players[targetId];
      const opponentCard = targetPlayer.hand[data.opponentCardIndex];
      
      socket.emit('reveal', {
        target: targetPlayer.name,
        index: data.opponentCardIndex,
        card: opponentCard,
      });
      
      // Then peek at own card
      const ownCard = player.hand[data.ownCardIndex];
      
      // Send card peek popup for own card
      socket.emit('cardPeek', {
        card: ownCard
      });
      
      // Offer swap option
      socket.emit('blackKingSwapOption', {
        message: 'Do you want to swap these cards?',
        opponentCard: opponentCard,
        ownCard: ownCard,
        opponent: data.opponent,
        opponentCardIndex: data.opponentCardIndex,
        ownCardIndex: data.ownCardIndex
      });
    }
  });

  socket.on('blackKingSwap', (data) => {
    const player = game.players[socket.id];
    if (!game.started || currentPlayer() !== player) return;
    
    if (data.doSwap) {
      const targetId = game.order.find(id => game.players[id].name === data.opponent);
      if (targetId) {
        const targetPlayer = game.players[targetId];
        [player.hand[data.ownCardIndex], targetPlayer.hand[data.opponentCardIndex]] = [
          targetPlayer.hand[data.opponentCardIndex],
          player.hand[data.ownCardIndex],
        ];
        socket.emit('hand', player.hand);
        broadcastHands();
      }
    }
  });

  socket.on('callCabo', () => {
    if (!game.started || game.inFinalRound) return;
    const caller = game.players[socket.id];
    
    // Start final round
    game.inFinalRound = true;
    game.caboCalledBy = caller.name;
    game.finalRoundStartIndex = game.turnIndex;
    
    io.emit('finalRound', { message: `${caller.name} called Cabo! Everyone gets one more turn.` });
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
