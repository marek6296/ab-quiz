import fs from 'fs';
import path from 'path';

const jsonPath = path.join(process.cwd(), 'frontend', 'public', 'questions.json');
const rawData = fs.readFileSync(jsonPath, 'utf8');
const { data } = JSON.parse(rawData);

const BATCH_SIZE = 500;
let batchCount = 0;

for (let i = 0; i < data.length; i += BATCH_SIZE) {
    const batch = data.slice(i, i + BATCH_SIZE);
    const values = batch.map(q => {
        // Escape single quotes for SQL
        const text = q.text.replace(/'/g, "''");
        const answer = q.answer.replace(/'/g, "''");
        const category = q.category.replace(/'/g, "''");
        return `('${category}', ${q.difficulty}, '${text}', '${answer}')`;
    }).join(',\n');

    const sql = `INSERT INTO public.questions (category, difficulty, question_text, answer) VALUES \n${values};`;
    fs.writeFileSync(`batch_${batchCount}.sql`, sql);
    batchCount++;
}

console.log(`Created ${batchCount} SQL batch files.`);
