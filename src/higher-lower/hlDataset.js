import { supabase } from '../lib/supabase';

export const HL_DATASET = [
    {
        category: "Priemerný mesačný plat (€)",
        metric: "€",
        items: [
            { name: "Programátor (SVK)", value: 2500, image: "💻", difficulty: 1 },
            { name: "Lekár s atestáciou", value: 3800, image: "⚕️", difficulty: 1 },
            { name: "Učiteľ ZŠ", value: 1400, image: "🏫", difficulty: 3 },
            { name: "Predavač/ka", value: 1100, image: "🛒", difficulty: 3 },
            { name: "Pekár", value: 1200, image: "🥖", difficulty: 2 },
            { name: "Zubár", value: 4500, image: "🦷", difficulty: 1 },
            { name: "Právnik", value: 3000, image: "⚖️", difficulty: 1 },
            { name: "Automechanik", value: 1500, image: "🔧", difficulty: 2 }
        ]
    },
    {
        category: "Mesačné vyhľadávania na Google",
        metric: "vyhľadávaní",
        items: [
            { name: "Počasie", value: 1500000, image: "🌤️", difficulty: 1 },
            { name: "Facebook", value: 2000000, image: "📱", difficulty: 1 },
            { name: "YouTube", value: 3500000, image: "▶️", difficulty: 1 },
            { name: "Prekladač", value: 1200000, image: "🌐", difficulty: 2 },
            { name: "Recepty", value: 800000, image: "🍳", difficulty: 2 },
            { name: "Minecraft", value: 450000, image: "⛏️", difficulty: 2 },
            { name: "Tesla", value: 300000, image: "🚗", difficulty: 3 },
            { name: "Netflix", value: 900000, image: "🍿", difficulty: 3 }
        ]
    },
    {
        category: "Kalórie (na 100g)",
        metric: "kcal",
        items: [
            { name: "Jablko", value: 52, image: "🍎", difficulty: 1 },
            { name: "Banán", value: 89, image: "🍌", difficulty: 1 },
            { name: "Mliečna čokoláda", value: 535, image: "🍫", difficulty: 1 },
            { name: "Vlašské orechy", value: 654, image: "🌰", difficulty: 2 },
            { name: "Avokádo", value: 160, image: "🥑", difficulty: 2 },
            { name: "Bravčová masť", value: 898, image: "🥓", difficulty: 3 },
            { name: "Zemiakové lupienky", value: 536, image: "🥔", difficulty: 2 },
            { name: "Cukor", value: 387, image: "🧂", difficulty: 3 }
        ]
    }
];

// Fisher-Yates shuffle
function shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// Returns a random game sequence, filtered by difficulty
// difficulty: null = all, 1 = easy, 2 = medium, 3 = hard
export const getRandomGameSequence = async (length = 100, difficulty = null) => {
    let allItems = [];
    let categories = [];

    // Try DB first
    try {
        const { data: cats, error: catErr } = await supabase
            .from('higher_lower_categories')
            .select('*');

        if (!catErr && cats && cats.length > 0) {
            let query = supabase.from('higher_lower_items').select('*, category:higher_lower_categories(name, metric)');
            if (difficulty) query = query.eq('difficulty', difficulty);

            const { data: items, error: itemsErr } = await query;

            if (!itemsErr && items && items.length > 0) {
                // Group by category
                const catMap = {};
                items.forEach(item => {
                    const catName = item.category?.name || 'Neznáma';
                    if (!catMap[catName]) {
                        catMap[catName] = {
                            name: catName,
                            metric: item.category?.metric || '',
                            items: []
                        };
                    }
                    catMap[catName].items.push(item);
                });

                // Only use categories with at least 4 items for variety
                categories = Object.values(catMap).filter(c => c.items.length >= 4);
            }
        }
    } catch (err) {
        console.error("Failed to fetch HL dataset from DB:", err);
    }

    // Fallback to local dataset
    if (categories.length === 0) {
        categories = HL_DATASET.map(cat => ({
            name: cat.category,
            metric: cat.metric,
            items: difficulty
                ? cat.items.filter(i => i.difficulty === difficulty)
                : cat.items
        })).filter(c => c.items.length >= 4);

        if (categories.length === 0) {
            // If difficulty filter left us empty, use all
            categories = HL_DATASET.map(cat => ({
                name: cat.category,
                metric: cat.metric,
                items: cat.items
            }));
        }
    }

    // Pick a random category
    const cat = categories[Math.floor(Math.random() * categories.length)];
    const items = shuffle(cat.items);

    // Build sequence with no direct consecutive duplicates
    let sequence = [];
    let lastItem = null;
    for (let i = 0; i < length; i++) {
        let candidates = items.filter(it => it.name !== lastItem?.name);
        if (candidates.length === 0) candidates = items;
        const picked = candidates[Math.floor(Math.random() * candidates.length)];
        sequence.push(picked);
        lastItem = picked;
    }

    return {
        topic: cat.name,
        metric: cat.metric,
        sequence
    };
};
