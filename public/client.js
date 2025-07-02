const socket = io();
const playersDiv = document.getElementById('players');
const messagesDiv = document.getElementById('messages');

let myName = '';
let myCards = [];
let playerCards = {};
let peekingCard = null;
let peekTimeout = null;

function cardLabel(card) {
  if (card.value === 0) {
    return card.suit === 'JOKER_RED' ? '🃏' : '🂿';
  }
  const valueMap = { 1: 'A', 11: 'J', 12: 'Q', 13: 'K' };
  const suitMap = { H: '♥', D: '♦', C: '♣', S: '♠' };
  const v = valueMap[card.value] || card.value;
  return v + suitMap[card.suit];
}

function isRedCard(card) {
  return card.suit === 'H' || card.suit === 'D';
}

document.getElementById('join').onclick = () => {
  const name = document.getElementById('name').value.trim();
  if (name) {
    myName = name;
    socket.emit('join', name);
  }
};

document.getElementById('start').onclick = () => {
  socket.emit('start');
};

document.getElementById('draw').onclick = () => {
  socket.emit('draw', 'deck');
};

// Add click handler for discard pile to draw from it
document.getElementById('discard').onclick = () => {
  socket.emit('draw', 'discard');
};

// Discard pile can now be clicked to draw from it

document.getElementById('call').onclick = () => {
  socket.emit('callCabo');
};

document.getElementById('rules').onclick = () => {
  document.getElementById('rulesModal').style.display = 'block';
};

// Close modal when clicking the X
document.querySelector('.close').onclick = () => {
  document.getElementById('rulesModal').style.display = 'none';
};

// Close modal when clicking outside of it
window.onclick = (event) => {
  const modal = document.getElementById('rulesModal');
  if (event.target === modal) {
    modal.style.display = 'none';
  }
};

socket.on('players', names => {
  // Update player count in top bar
  document.getElementById('playerCount').textContent = `Players: ${names.length}`;
  
  // Show joined players before the game starts
  playersDiv.textContent = 'Players: ' + names.join(', ');
  
  // Update game status
  const gameStatus = document.getElementById('gameStatus');
  if (names.length >= 2) {
    gameStatus.textContent = 'Ready to start';
    gameStatus.style.color = '#10b981';
  } else {
    gameStatus.textContent = 'Waiting for more players...';
    gameStatus.style.color = '#f59e0b';
  }
});

socket.on('start', names => {
  // Update UI status
  messagesDiv.innerHTML = '🎮 <strong>Game started!</strong> Look at your bottom 2 cards.';
  document.getElementById('gameStatus').textContent = 'Game in progress';
  document.getElementById('gameStatus').style.color = '#22d3ee';
  
  // Reset peek state
  peekingCard = null;
  if (peekTimeout) {
    clearTimeout(peekTimeout);
    peekTimeout = null;
  }
  
  playersDiv.innerHTML = '';
  myCards = [];
  playerCards = {};
  
  // Arrange players with current player at bottom, others clockwise
  const myIndex = names.indexOf(myName);
  const arrangedNames = [];
  
  // Put current player first (will be positioned at bottom)
  arrangedNames.push(myName);
  
  // Add other players in clockwise order
  for (let i = 1; i < names.length; i++) {
    const nextIndex = (myIndex + i) % names.length;
    arrangedNames.push(names[nextIndex]);
  }
  
  arrangedNames.forEach((n, index) => {
    const pDiv = document.createElement('div');
    pDiv.className = `player player-${index}`;
    
    // Add player name with styling
    const nameDiv = document.createElement('div');
    nameDiv.textContent = n;
    
    // Add hand container
    const hand = document.createElement('div');
    hand.className = 'player-hand';
    
    // Create cards with dealing animation
    for (let i = 0; i < 4; i++) {
      const c = document.createElement('div');
      c.className = 'card face-down card-dealing';
      c.style.animationDelay = `${(index * 4 + i) * 100}ms`;
      hand.appendChild(c);
    }
    
    pDiv.appendChild(nameDiv);
    pDiv.appendChild(hand);
    playersDiv.appendChild(pDiv);
    
    if (n === myName) {
      myCards = Array.from(hand.children);
      pDiv.classList.add('my-player');
    }
    playerCards[n] = Array.from(hand.children);
  });
});

socket.on('hand', cards => {
  // store card values on your own card elements
  myCards.forEach((div, idx) => {
    const card = cards[idx];
    if (!card) return; // Handle case where card was removed
    
    div.dataset.value = card.value;
    div.dataset.suit = card.suit;
    
    // ALL cards stay face-down on the board at all times
    div.className = 'card face-down';
    div.textContent = '';
  });
  
  // Set up click handlers for all cards
  setupCardClickHandlers();
});

socket.on('hands', data => {
  data.forEach(({ name, hand, isCurrentTurn }) => {
    const elems = playerCards[name] || [];
    elems.forEach((div, idx) => {
      const card = hand[idx];
      if (card && div) {
        // All cards stay face-down for all players
        div.className = 'card face-down';
        div.textContent = '';
        div.dataset.value = card.value;
        div.dataset.suit = card.suit;
      }
    });
    
    // Update player styling based on turn
    const playerDivs = document.querySelectorAll('.player');
    playerDivs.forEach(playerDiv => {
      const nameDiv = playerDiv.querySelector('div');
      if (nameDiv && nameDiv.textContent === name) {
        playerDiv.classList.toggle('current-turn', isCurrentTurn);
        playerDiv.classList.toggle('my-player', name === myName);
      }
    });
  });
});

socket.on('reveal', ({ target, index, card }) => {
  // Only show reveal message for opponent cards, not your own
  if (target !== myName) {
    messagesDiv.innerHTML = `👁️ <strong>Revealed:</strong> ${target}'s card ${index + 1} is <span style="color: ${isRedCard(card) ? '#dc2626' : '#1e293b'}">${cardLabel(card)}</span>`;
  }
});

socket.on('peekDenied', data => {
  messagesDiv.innerHTML = `🚫 <strong style="color: #ef4444;">${data.message}</strong>`;
  
  // Shake the card that was clicked
  if (data.cardIndex !== undefined && myCards[data.cardIndex]) {
    const cardDiv = myCards[data.cardIndex];
    cardDiv.classList.add('card-shake');
    setTimeout(() => {
      cardDiv.classList.remove('card-shake');
    }, 600);
  }
});

socket.on('drawDenied', data => {
  messagesDiv.innerHTML = `🚫 <strong style="color: #ef4444;">${data.message}</strong>`;
});

socket.on('choosePeek', (data) => {
  if (data.type === 'own') {
    messagesDiv.innerHTML = `
      <div>${data.message}</div>
      <div>Click on one of your cards to peek at it</div>
    `;
    myCards.forEach((div, idx) => {
      div.onclick = () => {
        socket.emit('peekCard', { type: 'own', cardIndex: idx });
        clearHandlers();
      };
    });
  } else if (data.type === 'opponent') {
    let html = `<div>${data.message}</div>`;
    data.opponents.forEach(opponent => {
      html += `<button onclick="chooseOpponentPeek('${opponent}')">${opponent}</button>`;
    });
    messagesDiv.innerHTML = html;
  }
});

socket.on('chooseSwap', (data) => {
  messagesDiv.innerHTML = `
    <div>${data.message}</div>
    <div>First, click one of your cards:</div>
  `;
  let myCardIndex = null;
  
  myCards.forEach((div, idx) => {
    div.onclick = () => {
      myCardIndex = idx;
      div.style.border = '2px solid yellow';
      
      let html = '<div>Now choose an opponent:</div>';
      data.opponents.forEach(opponent => {
        html += `<button onclick="chooseOpponentSwap('${opponent}', ${myCardIndex})">${opponent}</button>`;
      });
      messagesDiv.innerHTML = html;
      clearHandlers();
    };
  });
});

function chooseOpponentPeek(opponent) {
  messagesDiv.innerHTML = `<div>Choose which card of ${opponent} to peek at (1-4):</div>`;
  for (let i = 0; i < 4; i++) {
    messagesDiv.innerHTML += `<button onclick="peekOpponentCard('${opponent}', ${i})">Card ${i + 1}</button>`;
  }
}

function peekOpponentCard(opponent, cardIndex) {
  socket.emit('peekCard', { type: 'opponent', opponent, cardIndex });
}

function chooseOpponentSwap(opponent, myCardIndex) {
  messagesDiv.innerHTML = `<div>Choose which card of ${opponent} to swap with (1-4):</div>`;
  for (let i = 0; i < 4; i++) {
    messagesDiv.innerHTML += `<button onclick="swapWithOpponent('${opponent}', ${myCardIndex}, ${i})">Card ${i + 1}</button>`;
  }
}

function swapWithOpponent(opponent, myCardIndex, opponentCardIndex) {
  socket.emit('swapCards', { opponent, myCardIndex, opponentCardIndex });
  // Reset card border styles
  myCards.forEach(div => div.style.border = '1px solid #fff');
}

socket.on('blackKingPower', (data) => {
  messagesDiv.innerHTML = `<div>${data.message}</div>`;
  data.opponents.forEach(opponent => {
    messagesDiv.innerHTML += `<button onclick="chooseOpponentForBlackKing('${opponent}')">${opponent}</button>`;
  });
});

function chooseOpponentForBlackKing(opponent) {
  messagesDiv.innerHTML = `<div>Choose which card of ${opponent} to peek at (1-4):</div>`;
  for (let i = 0; i < 4; i++) {
    messagesDiv.innerHTML += `<button onclick="blackKingOpponentCard('${opponent}', ${i})">Card ${i + 1}</button>`;
  }
}

function blackKingOpponentCard(opponent, opponentCardIndex) {
  messagesDiv.innerHTML = '<div>Now choose one of your cards to peek at:</div>';
  myCards.forEach((div, idx) => {
    div.onclick = () => {
      socket.emit('blackKingPeek', { opponent, opponentCardIndex, ownCardIndex: idx });
      clearHandlers();
    };
  });
}

socket.on('blackKingSwapOption', (data) => {
  messagesDiv.innerHTML = `
    <div>${data.message}</div>
    <div>Opponent card: ${cardLabel(data.opponentCard)} | Your card: ${cardLabel(data.ownCard)}</div>
    <button onclick="blackKingSwapDecision(true, '${data.opponent}', ${data.opponentCardIndex}, ${data.ownCardIndex})">Swap</button>
    <button onclick="blackKingSwapDecision(false, '${data.opponent}', ${data.opponentCardIndex}, ${data.ownCardIndex})">Keep</button>
  `;
});

function blackKingSwapDecision(doSwap, opponent, opponentCardIndex, ownCardIndex) {
  socket.emit('blackKingSwap', { doSwap, opponent, opponentCardIndex, ownCardIndex });
}

socket.on('yourTurn', () => {
  messagesDiv.innerHTML = '⚡ <strong>Your turn!</strong> Draw a card from the deck or discard pile.';
});

let currentDrawnCard = null;

socket.on('drawn', data => {
  const card = data.card || data;
  const fromDiscard = data.fromDiscard || false;
  currentDrawnCard = { card, fromDiscard };
  
  const cardColor = isRedCard(card) ? '#dc2626' : '#1e293b';
  messagesDiv.innerHTML = `
    <div>🎯 You drew <span style="color: ${cardColor}; font-weight: bold;">${cardLabel(card)}</span>${fromDiscard ? ' from discard pile' : ' from deck'}.</div>
    <div style="margin-top: 12px;">
      <button onclick="replaceCard()" class="btn-primary" style="margin-right: 8px;">Replace a card</button>
      <button onclick="discardCard()" class="btn-secondary">Discard card</button>
    </div>
  `;
  
  // Show floating drawn card
  showFloatingCard(card, false);
});

let persistentFloatingCard = null;

function showFloatingCard(card, isPeek = false) {
  // Remove any existing floating card
  if (persistentFloatingCard) {
    document.body.removeChild(persistentFloatingCard);
  }
  
  // Create floating card element
  persistentFloatingCard = document.createElement('div');
  persistentFloatingCard.className = 'floating-card persistent';
  persistentFloatingCard.textContent = cardLabel(card);
  persistentFloatingCard.style.cssText = `
    position: fixed;
    top: 30%;
    right: 20px;
    transform: scale(0);
    width: 100px;
    height: 140px;
    background: linear-gradient(145deg, #f8fafc, #e2e8f0);
    border: 2px solid #cbd5e1;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: 700;
    color: ${isRedCard(card) ? '#dc2626' : '#1e293b'};
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
    z-index: 1000;
    animation: floatingCardShow 0.5s ease-out forwards;
  `;
  
  document.body.appendChild(persistentFloatingCard);
  
  // Auto-hide peek cards after 2 seconds
  if (isPeek) {
    setTimeout(() => {
      hideFloatingCard();
    }, 2000);
  }
}

function hideFloatingCard() {
  if (persistentFloatingCard) {
    persistentFloatingCard.style.animation = 'floatingCardHide 0.3s ease-in forwards';
    setTimeout(() => {
      if (persistentFloatingCard) {
        document.body.removeChild(persistentFloatingCard);
        persistentFloatingCard = null;
      }
    }, 300);
  }
}

function replaceCard() {
  if (!currentDrawnCard) return;
  messagesDiv.innerHTML = '🔄 <strong>Click one of your cards to replace:</strong>';
  
  // Add visual feedback for clickable cards
  myCards.forEach((div, idx) => {
    div.style.cursor = 'pointer';
    div.style.filter = 'brightness(1.2)';
    div.onclick = () => {
      socket.emit('replace', idx, currentDrawnCard.card);
      clearHandlers();
      currentDrawnCard = null;
      hideFloatingCard();
      messagesDiv.innerHTML = '✅ Card replaced!';
    };
  });
}

socket.on('penalty', data => {
  messagesDiv.innerHTML = `❌ <strong style="color: #ef4444;">${data.message}</strong>`;
});

socket.on('discardTop', card => {
  const discardDiv = document.getElementById('discard');
  if (card) {
    discardDiv.textContent = cardLabel(card);
    discardDiv.className = (isRedCard(card) ? 'red' : '');
    discardDiv.style.background = 'linear-gradient(145deg, #f8fafc, #e2e8f0)';
    discardDiv.style.color = isRedCard(card) ? '#dc2626' : '#1e293b';
  } else {
    discardDiv.textContent = '';
    discardDiv.style.background = 'linear-gradient(145deg, #f8fafc, #e2e8f0)';
    discardDiv.style.color = '#64748b';
  }
});

// Handle deck flip animation when drawing
socket.on('deckFlip', data => {
  const deckDiv = document.getElementById('deck');
  
  // Show flip animation on deck
  deckDiv.classList.add('card-flipping');
  
  // After flip animation, briefly show the drawn card
  setTimeout(() => {
    // Remove the "DECK" pseudo-element and show card
    deckDiv.style.setProperty('--show-card', '1');
    deckDiv.textContent = cardLabel(data.card);
    deckDiv.style.background = 'linear-gradient(145deg, #f8fafc, #e2e8f0)';
    deckDiv.style.color = isRedCard(data.card) ? '#dc2626' : '#1e293b';
    deckDiv.style.fontSize = '12px';
    deckDiv.style.fontWeight = '700';
    
    // Show the card for 1.5 seconds, then flip back
    setTimeout(() => {
      deckDiv.classList.add('card-flipping');
      setTimeout(() => {
        // Restore deck appearance
        deckDiv.style.removeProperty('--show-card');
        deckDiv.textContent = '';
        deckDiv.style.background = 'linear-gradient(145deg, #1e40af, #1d4ed8)';
        deckDiv.style.color = 'white';
        deckDiv.style.fontSize = '';
        deckDiv.style.fontWeight = '';
        deckDiv.classList.remove('card-flipping');
      }, 300);
    }, 1500);
    
    deckDiv.classList.remove('card-flipping');
  }, 300);
});

// Handle card flip animation when peeking
// Handle card peek - show in popup instead of flipping on board
socket.on('cardPeek', data => {
  console.log('Received cardPeek:', data);
  const card = data.card;
  showFloatingCard(card, true);
});

// Simple function to set up click handlers for own cards
function setupCardClickHandlers() {
  myCards.forEach((div, idx) => {
    div.onclick = () => {
      // Prevent multiple cards from being peeked at once
      if (peekingCard !== null) {
        return;
      }
      
      console.log(`Clicking card ${idx}`); // Debug log
      peekingCard = idx;
      socket.emit('peekOwnCard', idx);
      
      // Reset peek state after timeout
      peekTimeout = setTimeout(() => {
        peekingCard = null;
      }, 2000);
    };
  });
}

// Handle card replacement - show old card in popup briefly
socket.on('cardReplaced', data => {
  // Show the discarded card in popup for 1 second
  showFloatingCard(data.oldCard, false);
  setTimeout(() => {
    hideFloatingCard();
  }, 1000);
  
  // Card on board stays face-down - no visual changes needed
});

function discardCard() {
  if (!currentDrawnCard) return;
  socket.emit('discard', currentDrawnCard.card);
  currentDrawnCard = null;
  hideFloatingCard();
  clearHandlers();
  messagesDiv.innerHTML = '🗑️ Card discarded.';
}

socket.on('finalRound', data => {
  messagesDiv.innerHTML = `🏁 <strong style="color: #f59e0b;">${data.message}</strong>`;
});

socket.on('gameEnd', data => {
  let title = '';
  switch (data.reason) {
    case 'cabo':
      title = `🎯 ${data.winner} called Cabo!`;
      break;
    case 'noCards':
      title = '🎮 Game ended!';
      break;
    case 'deckEmpty':
      title = '📱 Deck ran out!';
      break;
  }
  
  let scoresHtml = '<div style="margin-top: 12px;"><strong>Final Scores:</strong></div>';
  for (const [name, score] of Object.entries(data.scores)) {
    const isWinner = name === data.winner;
    const color = isWinner ? '#10b981' : '#e2e8f0';
    const emoji = isWinner ? '👑' : '';
    scoresHtml += `<div style="color: ${color}; margin: 4px 0;">${emoji} ${name}: ${score} points</div>`;
  }
  
  messagesDiv.innerHTML = `<strong style="color: #3b82f6;">${title}</strong>${scoresHtml}`;
  
  // Update game status
  document.getElementById('gameStatus').textContent = 'Game finished';
  document.getElementById('gameStatus').style.color = '#64748b';
});

function clearHandlers() {
  myCards.forEach((div, idx) => {
    // Reset visual feedback
    div.style.cursor = 'pointer';
    div.style.filter = 'none';
    
    // Reset to default handler - peek any card
    div.onclick = () => {
      // Prevent multiple cards from being peeked at once
      if (peekingCard !== null) {
        return;
      }
      
      peekingCard = idx;
      socket.emit('peekOwnCard', idx);
      
      // Reset peek state after timeout
      peekTimeout = setTimeout(() => {
        peekingCard = null;
      }, 2000);
    };
  });
}
