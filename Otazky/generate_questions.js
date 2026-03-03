import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import OpenAI from 'openai';

// Inicializácia OpenAI klienta (bude potrebovať premennú prostredia OPENAI_API_KEY)
const openai = new OpenAI();
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const CATEGORIES = [
  "Technológie", "IT", "Chémia", "Fyzika", "Dejiny",
  "Geografia", "Biológia", "Anatómia", "Ríša zvierat", "Botanika",
  "Politika", "Aktuálne dianie", "Mytológia", "Náboženstvo", "Literatúra",
  "Filmy a seriály", "Hudba", "Výtvarné umenie", "Šport", "Gastro",
  "Popkultúra a celebrity", "Móda", "Hry a hračky", "Slovenský jazyk",
  "Logika a hádanky", "Cudzie jazyky"
];

const DIFFICULTIES = [1, 2, 3]; // 1 = Ľahké, 2 = Normálne, 3 = Ťažké
const QUESTIONS_PER_BATCH = 50;
const TARGET_PER_DIFFICULTY = 100;

async function generateQuestionsBatch(category, difficulty, existingQuestions) {
  const existingText = existingQuestions.length > 0
    ? `\nTIETO OTÁZKY SI UŽ VYGENEROVAL, NESMIEŠ ICH POUŽIŤ ZNOVA (ZABEZPEČ 100% UNIKÁTNOSŤ):\n${existingQuestions.map(q => "- " + q).join("\n")}\n`
    : "";

  const prompt = `
Si generátor otázok pre vedomostnú hru v štýle AZ-Kvíz.
Tvoja úloha je vygenerovať presne ${QUESTIONS_PER_BATCH} unikátnych otázok vo formáte CSV.
Žiadny iný text, iba samotné CSV radky. Hlavičku CSV negeneruj.

Pravidlá:
- Téma: ${category}
- Náročnosť: ${difficulty} (1 = veľmi ľahké pre bežných ľudí, 2 = stredne ťažké, 3 = veľmi ťažké pre expertov). Prísne dodržuj túto náročnosť!
- STRIKTNÉ PRAVIDLO PRE ODPOVEDE: Odpoveď musí byť maximálne 1 alebo 2 slová! Hráči to budú písať na klávesnici (podobne ako v hre AZ-kvíz). Nesmie obsahovať pomocné texty ani dlhé názvy. Iba čistá jednoslovná alebo dvojslovná odpoveď.
- Žiadne vulgarizmy. Zameraj sa na jasné a overiteľné fakty.
- Formát CSV výstupu: kategoria;narocnost;otazka;odpoved
- Na oddelenie hodnôt použi výhradne znak bodkočiarky ";" - v otázke sa teda nesmie nachádzať žiadna iná bodkočiarka.
- Neskracuj to, vygeneruj presne ${QUESTIONS_PER_BATCH} riadkov.
${existingText}
Príklad výstupu pre technológie náročnosť 1:
Technológie;1;Ako sa volá populárny operačný systém od Microsoftu?;Windows
Technológie;1;Ktorá firma vyrába iPhone?;Apple
`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini", // Používame gpt-4o-mini pre rýchlosť a nízku cenu pri tak obrovskom objeme
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7,
    });

    return response.choices[0].message.content.trim();
  } catch (error) {
    console.error(`Chyba pri generovaní pre kategóriu ${category} (Náročnosť: ${difficulty}):`, error.message);
    return null;
  }
}

async function startGeneration() {
  const outDir = path.join(__dirname, 'out');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir);
  }

  for (const category of CATEGORIES) {
    const safeCategoryName = category.toLowerCase().replace(/[^a-z0-9]/g, '_');
    const filePath = path.join(outDir, `${safeCategoryName}.csv`);

    let existingQuestionsInCat = [];
    let diffCounts = { 1: 0, 2: 0, 3: 0 };

    if (fs.existsSync(filePath)) {
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const lines = fileContent.split('\n');
      for (const line of lines) {
        if (line.trim() && !line.startsWith('kategoria')) {
          const parts = line.split(';');
          if (parts.length >= 4) {
            const diff = parseInt(parts[1], 10);
            if (diffCounts[diff] !== undefined) diffCounts[diff]++;
            existingQuestionsInCat.push(parts[2].trim());
          }
        }
      }
    } else {
      fs.writeFileSync(filePath, "kategoria;narocnost;otazka;odpoved\n", "utf8");
    }

    console.log(`\n--- Začínam s kategóriou: ${category} ---`);

    for (const difficulty of DIFFICULTIES) {
      console.log(`  Náročnosť: ${difficulty}`);
      let currentCount = diffCounts[difficulty] || 0;

      if (currentCount >= TARGET_PER_DIFFICULTY) {
        console.log(`    Hotovo (${currentCount}/${TARGET_PER_DIFFICULTY}), preskakujem...`);
        continue;
      }

      while (currentCount < TARGET_PER_DIFFICULTY) {
        console.log(`    Generujem dávku ${currentCount} až ${currentCount + QUESTIONS_PER_BATCH} (Pamäť unikátnosti: ${existingQuestionsInCat.length} otázok)...`);

        const csvData = await generateQuestionsBatch(category, difficulty, existingQuestionsInCat);
        if (csvData) {
          // Očistiť možné formátovanie z markdownu ak by ho AI pridalo
          let cleanData = csvData.replace(/```csv/g, '').replace(/```/g, '').trim();

          // Zozbieranie vygenerovaných otázok a kontrola počtu
          const lines = cleanData.split('\n');
          let addedCount = 0;
          for (const line of lines) {
            if (line.trim() && !line.startsWith('kategoria')) {
              const parts = line.split(';');
              if (parts.length >= 3) {
                existingQuestionsInCat.push(parts[2].trim());
                addedCount++;
              }
            }
          }

          // Použijeme konečne štandardný '\\n' -> '\n'
          fs.appendFileSync(filePath, cleanData + "\n", "utf8");
          currentCount += addedCount > 0 ? addedCount : QUESTIONS_PER_BATCH;
        } else {
          console.log("    Čakám 5 sekúnd a skúšam znova...");
          await new Promise(r => setTimeout(r, 5000));
        }
      }
    }
  }
}

startGeneration().then(() => {
  console.log("Generovanie je úspešne dokončené!");
});
