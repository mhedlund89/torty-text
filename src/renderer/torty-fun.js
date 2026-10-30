// What Torty says when clicked. All built in, so it works offline.

const TORTY_JOKES = [
  'Why did the turtle cross the road? To get to the Shell station.',
  'What do you call a turtle with a camera? A snapping turtle.',
  'How do turtles keep in touch? Shell phones.',
  'How does Torty answer the phone? "Shello?"',
  'Why don\'t turtles ever get lost? They always bring their home with them.',
  'What\'s a turtle\'s favorite email strategy? A slow drip campaign.',
  'What did the turtle say at the deadline? Slow and steady ships the release.',
  'Why do programmers prefer dark mode? Because light attracts bugs.',
  'A SQL query walks into a bar, walks up to two tables and asks, "Can I join you?"',
  'There are 10 kinds of people: those who understand binary and those who don\'t.',
  'I\'d tell you a joke about UDP, but you might not get it.',
  'Why did the developer go broke? They used up all their cache.',
  'Debugging: being the detective in a crime movie where you\'re also the culprit.',
  'Why did the email land in spam? Too many exclamation points!!!',
  'My subject line A/B test was a tie. I\'m calling it a draw and taking a nap.',
  'Why was the snippet so confident? It knew it would be used again and again.',
  'What\'s a turtle\'s favorite shortcut? Command+Shell+Z.',
  'Why did the turtle become a developer? It was great at handling callbacks. Eventually.',
];

const TORTY_WORDS = [
  ['serendipity', 'noun', 'finding something good without looking for it'],
  ['ebullient', 'adjective', 'cheerful and full of energy'],
  ['petrichor', 'noun', 'the earthy smell after rain falls on dry ground'],
  ['quixotic', 'adjective', 'idealistic in a way that is unrealistic or impractical'],
  ['laconic', 'adjective', 'using very few words'],
  ['mellifluous', 'adjective', 'sweet and smooth to hear'],
  ['ephemeral', 'adjective', 'lasting a very short time'],
  ['halcyon', 'adjective', 'calm, peaceful and happy, often said of the past'],
  ['perspicacious', 'adjective', 'quick to notice and understand things'],
  ['sanguine', 'adjective', 'optimistic, especially in a hard situation'],
  ['ineffable', 'adjective', 'too great or extreme to be put into words'],
  ['apricity', 'noun', 'the warmth of the sun in winter'],
  ['defenestration', 'noun', 'the act of throwing someone or something out of a window'],
  ['lagniappe', 'noun', 'a small bonus given with a purchase'],
  ['susurrus', 'noun', 'a soft whispering or rustling sound'],
  ['effervescent', 'adjective', 'bubbly; lively and enthusiastic'],
  ['gregarious', 'adjective', 'fond of company; sociable'],
  ['nadir', 'noun', 'the lowest point of something'],
  ['zenith', 'noun', 'the highest point of something'],
  ['ubiquitous', 'adjective', 'found everywhere'],
  ['cogent', 'adjective', 'clear, logical and convincing'],
  ['perfunctory', 'adjective', 'done with minimal effort or care'],
  ['alacrity', 'noun', 'brisk and cheerful readiness'],
  ['sesquipedalian', 'adjective', 'given to using long words'],
  ['verisimilitude', 'noun', 'the appearance of being true or real'],
  ['insouciant', 'adjective', 'casually unconcerned'],
  ['pithy', 'adjective', 'short but full of meaning'],
  ['kerfuffle', 'noun', 'a commotion or fuss'],
  ['flummox', 'verb', 'to confuse or bewilder completely'],
  ['hullabaloo', 'noun', 'a noisy commotion'],
  ['sonder', 'noun', 'the realization that every passerby has a life as vivid as your own'],
];

const TORTY_FACTS = [
  'Turtles have been around for more than 200 million years, longer than many dinosaurs.',
  'A turtle\'s shell is part of its skeleton, built from fused ribs and backbone.',
  'Some giant tortoises live well past 150 years.',
  'Resting sea turtles can hold their breath for several hours.',
  'For many turtles, nest temperature decides the hatchlings\' sex. Warmer nests produce more females.',
  'Leatherback sea turtles can dive more than 1,000 meters deep.',
  'All tortoises are turtles, but not all turtles are tortoises.',
  'A group of turtles is sometimes called a bale.',
  'Turtles have no teeth. They use a sharp, beak-like mouth instead.',
  'Box turtles have a hinged lower shell, so they can close up completely.',
];

function tortyTips(hotkey) {
  return [
    'Type a snippet\'s abbreviation in any app and I\'ll swap in the snippet.',
    `Press ${hotkey} in any app to search your snippets.`,
    'Put [[cursor]] in a snippet and I\'ll leave your cursor right there after pasting.',
    '[[clipboard]] drops in whatever you copied last.',
    'In the menu bar popover, New From Clipboard turns what you just copied into a snippet.',
    'In the menu bar popover, press ⌘1 through ⌘9 to insert a recent snippet instantly.',
    'Double-click a group name to rename it.',
    'Type the same phrase a few times and I\'ll suggest it under Suggested.',
  ];
}

const pick = list => list[Math.floor(Math.random() * list.length)];

// The word of the day stays the same all day.
function wordOfTheDay() {
  const day = Math.floor((Date.now() - new Date().getTimezoneOffset() * 60000) / 86400000);
  return TORTY_WORDS[day % TORTY_WORDS.length];
}

// Rotates through the kinds so consecutive clicks feel different.
const TORTY_ORDER = ['joke', 'word', 'fact', 'joke', 'tip'];
let tortyTurn = Math.floor(Math.random() * TORTY_ORDER.length);
let tortyLast = '';

function tortySays(hotkey) {
  const kind = TORTY_ORDER[tortyTurn++ % TORTY_ORDER.length];
  let say;
  do {
    if (kind === 'word') {
      const [word, pos, meaning] = wordOfTheDay();
      say = { label: 'Word of the day', html: `<b>${word}</b> <i>(${pos})</i>: ${meaning}.` };
    } else if (kind === 'fact') {
      say = { label: 'Turtle fact', html: esc(pick(TORTY_FACTS)) };
    } else if (kind === 'tip') {
      say = { label: 'Tip', html: esc(pick(tortyTips(hotkey))) };
    } else {
      say = { label: 'Joke', html: esc(pick(TORTY_JOKES)) };
    }
  } while (say.html === tortyLast && kind !== 'word');
  tortyLast = say.html;
  return say;
}
