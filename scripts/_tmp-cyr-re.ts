const s = "Прегледни рад Ивана Ж. БАЛТЕЗАРЕВИЋ* Факултет";
for (const ch of [...s]) {
  if (/[\u0400-\u04FF.*\s]/.test(ch)) {
    process.stdout.write(`${ch}(U+${ch.codePointAt(0)!.toString(16)}) `);
  }
}
console.log();
const cleaned = s.replace(/[*†‡§]/gu, " ").replace(/\s+/g, " ").trim();
console.log(
  "no-boundary",
  cleaned.match(/([А-ЯЁ][а-яё]{2,}\s+[А-ЯЁ]\.\s+[А-ЯЁ][А-ЯЁа-яё'’-]{2,})/u)?.[1],
);
console.log(
  "with-boundary",
  cleaned.match(/\b([А-ЯЁ][а-яё]{2,}\s+[А-ЯЁ]\.\s+[А-ЯЁ][А-ЯЁа-яё'’-]{2,})\b/u)?.[1],
);
console.log("Ивана", /^[А-ЯЁ][а-яё]{2,}$/u.test("Ивана"));
console.log("БАЛТЕЗАРЕВИЋ", /^[А-ЯЁ][А-ЯЁа-яё'’-]{2,}$/u.test("БАЛТЕЗАРЕВИЋ"));
