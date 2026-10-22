const t = "Carlos A. P. Pizzino1*, Phani-Teja Singamaneni2,";
const y = 230.9;
console.log({
  y: y < 320,
  len: t.length <= 140,
  commaEnd: /,\s*$/.test(t.trim()),
  digit: /\d[*†‡§✉]*/.test(t),
  caps: (t.match(/[A-Z][\p{L}'’-]+/gu) ?? []).length,
  capsList: t.match(/[A-Z][\p{L}'’-]+/gu),
  noUni: !/\b(?:university|department|edited|reviewed|keywords?)\b/i.test(t),
});
