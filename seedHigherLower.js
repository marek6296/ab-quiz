import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, '.env') });

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: {
        persistSession: false,
    }
});

const HL_DATASET = [
    {
        category: "Priemerný mesačný plat (€)",
        metric: "€",
        items: [
            { name: "Programátor (SVK)", value: 2500, image: "💻" },
            { name: "Lekár s atestáciou", value: 3800, image: "⚕️" },
            { name: "Učiteľ ZŠ", value: 1400, image: "🏫" },
            { name: "Predavač/ka", value: 1100, image: "🛒" },
            { name: "Pekár", value: 1200, image: "🥖" },
            { name: "Zubár", value: 4500, image: "🦷" },
            { name: "Právnik", value: 3000, image: "⚖️" },
            { name: "Automechanik", value: 1500, image: "🔧" }
        ]
    },
    {
        category: "Mesačné vyhľadávania na Google",
        metric: "vyhľadávaní",
        items: [
            { name: "Počasie", value: 1500000, image: "🌤️" },
            { name: "Facebook", value: 2000000, image: "📱" },
            { name: "YouTube", value: 3500000, image: "▶️" },
            { name: "Prekladač", value: 1200000, image: "🌐" },
            { name: "Recepty", value: 800000, image: "🍳" },
            { name: "Minecraft", value: 450000, image: "⛏️" },
            { name: "Tesla", value: 300000, image: "🚗" },
            { name: "Netflix", value: 900000, image: "🍿" }
        ]
    },
    {
        category: "Kalórie (na 100g)",
        metric: "kcal",
        items: [
            { name: "Jablko", value: 52, image: "🍎" },
            { name: "Banán", value: 89, image: "🍌" },
            { name: "Mliečna čokoláda", value: 535, image: "🍫" },
            { name: "Vlašské orechy", value: 654, image: "🌰" },
            { name: "Avokádo", value: 160, image: "🥑" },
            { name: "Bravčová masť", value: 898, image: "🥓" },
            { name: "Zemiakové lupienky", value: 536, image: "🥔" },
            { name: "Cukor", value: 387, image: "🧂" }
        ]
    }
];

async function seed() {
    // 1. Sign in as the user 'marek.dendis@gmail.com' (who is admin) using env or service key...
    // Actually wait, do we need it if we are using postgres directly? Yes, scripts are annoying because we can't easily sign in.
    // I will write this but since I have RLS, inserting might fail with anon_key.
    // Instead I'll use the API mcp_supabase-mcp-server_execute_sql
}

seed();
