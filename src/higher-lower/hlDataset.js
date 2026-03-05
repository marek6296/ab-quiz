import { supabase } from '../lib/supabase';

export const HL_DATASET = [
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

// Returns a single random category object, with its items shuffled
export const getRandomGameSequence = async (length = 100) => {
    let cat;
    let items = [];

    // Try DB first
    try {
        const { data: categories, error: catErr } = await supabase.from('higher_lower_categories').select('*');
        if (!catErr && categories && categories.length > 0) {
            cat = categories[Math.floor(Math.random() * categories.length)];
            const { data: dbItems, error: itemsErr } = await supabase.from('higher_lower_items').select('*').eq('category_id', cat.id);
            if (!itemsErr && dbItems && dbItems.length > 0) {
                items = dbItems;
            }
        }
    } catch (err) {
        console.error("Failed to fetch HL dataset from DB:", err);
    }

    // Fallback to local
    if (!cat || items.length === 0) {
        cat = HL_DATASET[Math.floor(Math.random() * HL_DATASET.length)];
        items = [...cat.items];
        cat = { name: cat.category, metric: cat.metric }; // Normalize to DB shape
    }

    // Shuffle items
    items.sort(() => Math.random() - 0.5);

    // If we need more than we have, we will repeat but make sure no direct duplicates
    let sequence = [];
    let lastItem = null;

    for (let i = 0; i < length; i++) {
        let candidates = items.filter(it => it.name !== lastItem?.name);
        if (candidates.length === 0) candidates = items; // Fallback

        let picked = candidates[Math.floor(Math.random() * candidates.length)];
        sequence.push(picked);
        lastItem = picked;
    }

    return {
        topic: cat.name,
        metric: cat.metric,
        sequence
    };
};
