const socket = io();
const playersDiv = document.getElementById('players');
const handDiv = document.getElementById('hand');
const messagesDiv = document.getElementById('messages');

document.getElementById('join').onclick = () => {
  const name = document.getElementById('name').value.trim();
  if (name) socket.emit('join', name);
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
  playersDiv.textContent = 'Players: ' + names.join(', ');
});

socket.on('start', names => {
  messagesDiv.textContent = 'Game started!';
});

socket.on('hand', cards => {
  handDiv.innerHTML = '';
  cards.forEach(card => {
    const div = document.createElement('div');
    div.className = 'card';
    div.textContent = card;
    handDiv.appendChild(div);
  });
});

socket.on('yourTurn', () => {
  messagesDiv.textContent = 'Your turn! Draw a card.';
});

socket.on('drawn', card => {
  messagesDiv.textContent = 'You drew ' + card + '. Click one of your cards to replace or Discard.';
  const cardDivs = handDiv.querySelectorAll('.card');
  cardDivs.forEach((div, idx) => {
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
  const cardDivs = handDiv.querySelectorAll('.card');
  cardDivs.forEach(div => (div.onclick = null));
}
