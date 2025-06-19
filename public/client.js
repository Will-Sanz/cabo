const socket = io();
const playersDiv = document.getElementById('players');
const handDiv = document.getElementById('hand');
const othersDiv = document.getElementById('others');
const messagesDiv = document.getElementById('messages');

let hand = [];
let revealed = [];
let players = [];
let drawn = null;

function renderHand() {
  handDiv.innerHTML = '';
  hand.forEach((card, i) => {
    const div = document.createElement('div');
    div.className = 'card';
    div.textContent = revealed[i] ? card : '?';
    if (drawn !== null) {
      div.onclick = () => {
        socket.emit('replace', i);
        clearHandlers();
      };
    }
    handDiv.appendChild(div);
  });
}

function renderPlayers() {
  othersDiv.innerHTML = '';
  players.forEach(p => {
    if (p.id === socket.id) return;
    const cont = document.createElement('div');
    cont.textContent = p.name;
    const h = document.createElement('div');
    h.className = 'other-hand';
    for (let i = 0; i < 4; i++) {
      const c = document.createElement('div');
      c.className = 'card';
      c.textContent = '?';
      h.appendChild(c);
    }
    cont.appendChild(h);
    othersDiv.appendChild(cont);
  });
}

function clearHandlers() {
  const cardDivs = handDiv.querySelectorAll('.card');
  cardDivs.forEach(div => (div.onclick = null));
  drawn = null;
}

document.getElementById('join').onclick = () => {
  const name = document.getElementById('name').value.trim();
  if (name) socket.emit('join', name);
};

document.getElementById('start').onclick = () => socket.emit('start');

document.getElementById('draw').onclick = () => socket.emit('draw');

document.getElementById('discard').onclick = () => {
  if (drawn !== null) {
    socket.emit('discard', drawn);
    clearHandlers();
  }
};

document.getElementById('call').onclick = () => socket.emit('callCabo');

socket.on('players', list => {
  players = list;
  playersDiv.textContent = 'Players: ' + list.map(p => p.name).join(', ');
  renderPlayers();
});

socket.on('start', () => {
  messagesDiv.textContent = 'Game started!';
});

socket.on('hand', data => {
  hand = data.cards;
  revealed = data.revealed;
  renderHand();
});

socket.on('yourTurn', () => {
  messagesDiv.textContent = 'Your turn! Draw a card.';
});

socket.on('drawn', card => {
  drawn = card;
  messagesDiv.textContent = `You drew ${card}. Click a card to replace or Discard.`;
  renderHand();
});

socket.on('power', ({ type }) => {
  let payload = {};
  if (type === 'peekSelf') {
    const idx = parseInt(prompt('Look at which of your cards? (0-3)'), 10);
    payload.index = idx;
  } else if (type === 'peekOther') {
    const player = prompt('Target player id');
    const idx = parseInt(prompt('Card index 0-3'), 10);
    payload = { target: player, index: idx };
  } else if (type === 'blindSwap' || type === 'lookSwap') {
    const target = prompt('Target player id');
    const my = parseInt(prompt('Your card index 0-3'), 10);
    const their = parseInt(prompt('Their card index 0-3'), 10);
    payload = { target, my, their };
  }
  socket.emit('power', payload);
});

socket.on('reveal', card => {
  alert('Revealed: ' + card);
});

socket.on('cabo', scores => {
  let text = 'Cabo called! Scores:\n';
  for (const [name, score] of Object.entries(scores)) {
    text += `${name}: ${score}\n`;
  }
  messagesDiv.textContent = text;
});

