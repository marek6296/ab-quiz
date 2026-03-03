import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_DIR = path.join(__dirname, 'databaza otazky');
const OUT_FILE = path.join(__dirname, 'frontend', 'public', 'questions.json');

async function buildQuestions() {
    console.log('Scanning CSV database...');
    let questions = [];
    let idCounter = 1;

    if (!fs.existsSync(DB_DIR)) {
        console.error(`Directory ${DB_DIR} not found!`);
        process.exit(1);
    }

    const files = fs.readdirSync(DB_DIR).filter(f => f.endsWith('.csv'));

    for (const file of files) {
        const filePath = path.join(DB_DIR, file);
        const content = fs.readFileSync(filePath, 'utf-8');
        const lines = content.split('\n');

        // Skip header line
        let started = false;
        for (const line of lines) {
            if (!line.trim() || line.startsWith('kategoria')) continue;

            const parts = line.split(';');
            if (parts.length >= 4) {
                questions.push({
                    id: idCounter++,
                    category: parts[0].trim(),
                    difficulty: parseInt(parts[1].trim(), 10),
                    text: parts[2].trim(),
                    answer: parts[3].trim()
                });
            }
        }
        console.log(`Parsed ${file}, total questions so far: ${questions.length}`);
    }

    // Ensure output dir exists
    const outDir = path.dirname(OUT_FILE);
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    // Group metadata
    const categoriesObj = Array.from(new Set(questions.map(q => q.category))).sort();

    const finalPayload = {
        metadata: {
            totalQuestions: questions.length,
            categories: categoriesObj,
            difficulties: [1, 2, 3]
        },
        data: questions
    };

    fs.writeFileSync(OUT_FILE, JSON.stringify(finalPayload), 'utf-8');
    console.log(`\nSuccessfully built ${questions.length} questions into ${OUT_FILE}`);
}

buildQuestions();
