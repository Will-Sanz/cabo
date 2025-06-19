const socket = io();
const playersDiv = document.getElementById('players');
const handDiv = document.getElementById('hand');
const othersDiv = document.getElementById('others');
const discardDiv = document.getElementById('discard');
const messagesDiv = document.getElementById('messages');

let handSize = 0;
let players = [];
let drawn = null;
let peeks = 0;

function renderHand() {
  handDiv.innerHTML = '';
  for (let i = 0; i < handSize; i++) {
    const div = document.createElement('div');
    div.className = 'card';
    div.textContent = '?';
    if (drawn !== null) {
      div.onclick = () => {
        socket.emit('replace', i);
        clearHandlers();
      };
    } else if (peeks > 0) {
      div.onclick = () => socket.emit('peek', i);
    }
    handDiv.appendChild(div);
  }
}

function renderPlayers() {
  othersDiv.innerHTML = '';
  const others = players.filter(p => p.id !== socket.id);
  const n = others.length;
  others.forEach((p, idx) => {
    const angle = (2 * Math.PI * idx) / n;
    const cont = document.createElement('div');
    cont.className = 'other';
    cont.style.left = 50 + 40 * Math.cos(angle) + '%';
    cont.style.top = 50 + 40 * Math.sin(angle) + '%';
    const name = document.createElement('div');
    name.textContent = p.name;
    const h = document.createElement('div');
    h.className = 'other-hand';
    for (let i = 0; i < 4; i++) {
      const c = document.createElement('div');
      c.className = 'card';
      c.textContent = '?';
      h.appendChild(c);
    }
    cont.appendChild(name);
    cont.appendChild(h);
    othersDiv.appendChild(cont);
  });
}

function clearHandlers() {
  Array.from(handDiv.children).forEach(div => (div.onclick = null));
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
    socket.emit('discard');
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
  handSize = data.size;
  renderHand();
});

socket.on('peeks', count => {
  peeks = count;
});

socket.on('yourTurn', () => {
  messagesDiv.textContent = 'Your turn! Draw a card.';
});

socket.on('drawn', card => {
  drawn = card;
  messagesDiv.textContent = `You drew ${card}. Click a card to replace or Discard.`;
  renderHand();
});

socket.on('reveal', ({ index, card, player }) => {
  if (player && player !== socket.id) {
    alert(`Player ${player} card ${index}: ${card}`);
    return;
  }
  const div = handDiv.children[index];
  if (div) {
    div.textContent = card;
    setTimeout(() => { div.textContent = '?'; }, 2000);
  }
});

socket.on('discardTop', card => {
  discardDiv.textContent = card || '';
});

socket.on('cabo', scores => {
  let text = 'Cabo called! Scores:\n';
  for (const [name, score] of Object.entries(scores)) {
    text += `${name}: ${score}\n`;
  }
  messagesDiv.textContent = text;
});
