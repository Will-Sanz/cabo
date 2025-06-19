const socket = io();
const playersDiv = document.getElementById('players');
const messagesDiv = document.getElementById('messages');

let myName = '';
let myCards = [];

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
  socket.emit('draw');
};

document.getElementById('call').onclick = () => {
  socket.emit('callCabo');
};

socket.on('players', names => {
  // Show joined players before the game starts
  playersDiv.textContent = 'Players: ' + names.join(', ');
});

socket.on('start', names => {
  messagesDiv.textContent = 'Game started!';
  playersDiv.innerHTML = '';
  myCards = [];
  names.forEach(n => {
    const pDiv = document.createElement('div');
    pDiv.className = 'player';
    const nameDiv = document.createElement('div');
    nameDiv.textContent = n;
    const hand = document.createElement('div');
    hand.className = 'player-hand';
    for (let i = 0; i < 4; i++) {
      const c = document.createElement('div');
      c.className = 'card';
      hand.appendChild(c);
    }
    pDiv.appendChild(nameDiv);
    pDiv.appendChild(hand);
    playersDiv.appendChild(pDiv);
    if (n === myName) {
      myCards = Array.from(hand.children);
    }
  });
});

socket.on('hand', cards => {
  // store card values on your own card elements
  myCards.forEach((div, idx) => {
    div.dataset.value = cards[idx];
  });
});

socket.on('yourTurn', () => {
  messagesDiv.textContent = 'Your turn! Draw a card.';
});

socket.on('drawn', card => {
  messagesDiv.textContent = 'You drew ' + card + '. Click one of your cards to replace or Discard.';
  myCards.forEach((div, idx) => {
    div.onclick = () => {
      socket.emit('replace', idx, card);
      clearHandlers();
    };
  });
});

socket.on('cabo', scores => {
  let text = 'Cabo called! Scores:\n';
  for (const [name, score] of Object.entries(scores)) {
    text += `${name}: ${score}\n`;
  }
  messagesDiv.textContent = text;
});

function clearHandlers() {
  myCards.forEach(div => (div.onclick = null));
}
