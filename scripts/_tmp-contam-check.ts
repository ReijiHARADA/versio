const t = "The Medicine Quality Monitoring Globe: A public health intelligence system for collecting and curating reports of substandard and falsified medical products from publicly available Internet news media";
console.log("len", t.length);
console.log("comma-lower", /[,;]\s+[a-z]/.test(t));
console.log("comma-and-A", /,\s+and\s+[A-Z]/.test(t));
console.log("commas", t.match(/,/g));
console.log("frontiers crumb", /^[A-ZÀ-ÖØ-Þ][\p{L}'’-]+(?:\s+[A-Z]\.?)?(?:\s+[A-ZÀ-ÖØ-Þ][\p{L}'’-]+){1,3},\s+[A-ZÀ-ÖØ-Þ]/u.test(t));
console.log("body In/The", /^(?:In|The|This|We|Our|These|Those|However|Moreover)\b/.test(t) && t.split(/\s+/).length >= 10);
// starts with The - and words >= 10! THAT'S THE BUG
console.log("starts The + long", /^(?:In|The|This|We|Our|These|Those|However|Moreover)\b/.test(t), t.split(/\s+/).length);
