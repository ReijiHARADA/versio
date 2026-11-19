// SCOWL word lists (sizes 10–60): common English words with their inflections,
// used to tell a word broken at a line end (`cate-` + `gories`) from a compound.
import english10 from "wordlist-english/english-words-10.json";
import english20 from "wordlist-english/english-words-20.json";
import english35 from "wordlist-english/english-words-35.json";
import english40 from "wordlist-english/english-words-40.json";
import english50 from "wordlist-english/english-words-50.json";
import english55 from "wordlist-english/english-words-55.json";
import english60 from "wordlist-english/english-words-60.json";
import american10 from "wordlist-english/american-words-10.json";
import american20 from "wordlist-english/american-words-20.json";
import american35 from "wordlist-english/american-words-35.json";
import american40 from "wordlist-english/american-words-40.json";
import american50 from "wordlist-english/american-words-50.json";
import american55 from "wordlist-english/american-words-55.json";
import american60 from "wordlist-english/american-words-60.json";
import british10 from "wordlist-english/british-words-10.json";
import british20 from "wordlist-english/british-words-20.json";
import british35 from "wordlist-english/british-words-35.json";
import british40 from "wordlist-english/british-words-40.json";
import british50 from "wordlist-english/british-words-50.json";
import british55 from "wordlist-english/british-words-55.json";
import british60 from "wordlist-english/british-words-60.json";

let words: Set<string> | undefined;
let commonWords: Set<string> | undefined;
const toSet = (lists: unknown[]) => new Set((lists as string[][]).flat().map((word) => word.toLowerCase()));

// Prefix compounds (`non-linear`, `pre-defined`) are spelled both ways; at a
// line end only a common word (`inter-national`) is taken as one broken word.
const PREFIX = /^(?:anti|co|counter|cross|inter|intra|long|micro|macro|multi|non|off|out|over|post|pre|re|self|semi|sub|super|two|three|under|well)$/i;

export function joinsAsEnglishWord(head: string, tail: string): boolean {
  const word = `${head}${tail}`.toLowerCase();
  // Built on first use so app start-up does not pay for the lists.
  words ??= toSet([english10, english20, english35, english40, english50, english55, english60, american10, american20, american35, american40, american50, american55, american60, british10, british20, british35, british40, british50, british55, british60]);
  commonWords ??= toSet([english10, english20, english35, american10, american20, american35, british10, british20, british35]);
  return PREFIX.test(head) ? commonWords.has(word) : words.has(word);
}
