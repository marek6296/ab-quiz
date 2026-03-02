export const questions = [
  { id: 1, text: "Aké je hlavné mesto Slovenska?", answer: "Bratislava" },
  { id: 2, text: "Ako sa volá naša najdlhšia rieka?", answer: "Váh" },
  { id: 3, text: "Ktoré je najvyššie pohorie na Slovensku?", answer: "Vysoké Tatry" },
  { id: 4, text: "V ktorom meste sa nachádza Dóm sv. Alžbety?", answer: "Košice" },
  { id: 5, text: "Aké zviera máme v štátnom znaku okrem dvojkríža?", answer: "Žiadne, je tam len dvojkríž a trojvršie" },
  { id: 6, text: "Akej farby je prostredný pruh na slovenskej vlajke?", answer: "Modrá" },
  { id: 7, text: "Ako sa volal prvý slovenský kozmonaut?", answer: "Ivan Bella" },
  { id: 8, text: "Ktorá rieka tečie cez Bratislavu?", answer: "Dunaj" },
  { id: 9, text: "Ako sa volá najvyšší vrch Slovenska?", answer: "Gerlachovský štít" },
  { id: 10, text: "Ktorý hrad je vyobrazený na starej dvojeurovej minci?", answer: "Bratislavský hrad" },
  { id: 11, text: "Kto napísal sádrový epos Slávy dcera?", answer: "Ján Kollár" },
  { id: 12, text: "V ktorom meste sa narodil Milan Rastislav Štefánik?", answer: "Košariská" },
  { id: 13, text: "Aké auto sa vyrába v bratislavskom Volkswagene okrem iných? (napr. luxusné SUV)", answer: "Porsche Cayenne / VW Touareg" },
  { id: 14, text: "Ako sa volá najväčší slovenský národný park?", answer: "Tatranský národný park (TANAP)" },
  { id: 15, text: "Ktoré slovenské mesto je známe ťažbou rúd a mincovňou?", answer: "Kremnica" },
  { id: 16, text: "Ako sa volá slovenská národná hrdinka, ktorá bojovala proti Turkom? (povestná)", answer: "Vlastne žiadna špecifická, ale známy je Jánošík bojujúci proti panstvu" },
  { id: 17, text: "Kto je autorom slovenskej štátnej hymny?", answer: "Janko Matúška" },
  { id: 18, text: "Ako sa volá naša najznámejšia jaskyňa v Slovenskom krase?", answer: "Domica" },
  { id: 19, text: "V ktorej obci sa nachádza drevený orloj?", answer: "Stará Bystrica" },
  { id: 20, text: "Aké tradičné jedlo používame s bryndzou?", answer: "Halušky" },
  { id: 21, text: "Ktoré slovenské mesto bolo Európskym hlavným mestom kultúry v roku 2013?", answer: "Košice" },
  { id: 22, text: "Ako sa volá najväčší hradný komplex na Slovensku?", answer: "Spišský hrad" },
  { id: 23, text: "Ktorý slovenský cyklista nosil žltý dres na Tour de France?", answer: "Peter Sagan" },
  { id: 24, text: "V akom slovenskom meste je známy hudobný festival Pohoda?", answer: "Trenčín" },
  { id: 25, text: "Ako sa volá slovenský ľudový hudobný nástroj, podobný dlhej píšťale?", answer: "Fujara" },
  { id: 26, text: "Koľko susedných štátov má Slovensko?", answer: "5 (Česko, Poľsko, Ukrajina, Maďarsko, Rakúsko)" },
  { id: 27, text: "Ako sa volá najznámejší slovenský kúpeľný ostrov?", answer: "Kúpeľný ostrov v Piešťanoch" },
  { id: 28, text: "O aké jazero sa jedná, ak sa povie 'Oko a Morské'? (Tatry)", answer: "Morské oko" },
  { id: 29, text: "Z ktorého mesta pochádzal Andy Warhol (jeho rodičia)?", answer: "Miková" },
  { id: 30, text: "Ktorý mesiac je označovaný ako 'mesiac knihy'?", answer: "Marec" }
];

export const getRandomQuestion = () => {
  const randomIndex = Math.floor(Math.random() * questions.length);
  return questions[randomIndex];
};
