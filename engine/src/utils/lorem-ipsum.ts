const WORDS = [
  "lorem",
  "ipsum",
  "dolor",
  "sit",
  "amet",
  "consectetur",
  "adipiscing",
  "elit",
  "sed",
  "do",
  "eiusmod",
  "tempor",
  "incididunt",
  "ut",
  "labore",
  "et",
  "dolore",
  "magna",
  "aliqua",
];

function randomWord(): string {
  return WORDS[Math.floor(Math.random() * WORDS.length)];
}

export function loremIpsum(words: number): string {
  const result = [];
  for (let i = 0; i < words; i++) {
    result.push(randomWord());
  }
  // capitalize first word, add period
  const sentence = result.join(" ");
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + ".";
}
