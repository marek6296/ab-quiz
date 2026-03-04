export const HL_DATASET = [
    {
        category: "Priemerný mesačný plat (€)", items: [
            { name: "Programátor (Slovensko)", value: 2500 },
            { name: "Lekár s atestáciou", value: 3800 },
            { name: "Učiteľ ZŠ", value: 1400 },
            { name: "Predavač/ka", value: 1100 },
            { name: "Pekár", value: 1200 },
            { name: "Zubár", value: 4500 }
        ]
    },
    {
        category: "Počet vyhľadávaní na Google (mesačne SR/ČR)", items: [
            { name: "Počasie", value: 1500000 },
            { name: "Facebook", value: 2000000 },
            { name: "YouTube", value: 3500000 },
            { name: "Prekladač", value: 1200000 },
            { name: "Recepty", value: 800000 },
            { name: "Minecraft", value: 450000 }
        ]
    },
    {
        category: "Kalórie (na 100g)", items: [
            { name: "Jablko", value: 52 },
            { name: "Banán", value: 89 },
            { name: "Mliečna čokoláda", value: 535 },
            { name: "Vlašské orechy", value: 654 },
            { name: "Avokádo", value: 160 },
            { name: "Bravčová masť", value: 898 }
        ]
    },
    {
        category: "Rýchlosť zvierat (km/h)", items: [
            { name: "Gepard", value: 110 },
            { name: "Lev", value: 80 },
            { name: "Kôň", value: 70 },
            { name: "Sliepka", value: 15 },
            { name: "Zajac", value: 55 },
            { name: "Medveď hnedý", value: 50 },
            { name: "Sokol sťahovavý", value: 389 }
        ]
    },
    {
        category: "Doba rozkladu v prírode (roky)", items: [
            { name: "Ohryzok z jablka", value: 0.1 }, // cca mesiac
            { name: "Papierová servítka", value: 0.2 }, // cca 2-3 mesiace
            { name: "Žuvačka", value: 50 },
            { name: "Plastová fľaša", value: 450 },
            { name: "Plechovka", value: 50 },
            { name: "Sklenená fľaša", value: 4000 }
        ]
    },
    {
        category: "Priemerná dĺžka života zvierat (roky)", items: [
            { name: "Pes", value: 13 },
            { name: "Mačka domáca", value: 15 },
            { name: "Slon africký", value: 70 },
            { name: "Myš", value: 2 },
            { name: "Korytnačka obrovská", value: 150 },
            { name: "Papagáj (Ara)", value: 50 }
        ]
    },
    {
        category: "Nasledovatelia na Instagrame (v miliónoch)", items: [
            { name: "Cristiano Ronaldo", value: 620 },
            { name: "Lionel Messi", value: 500 },
            { name: "Selena Gomez", value: 429 },
            { name: "Kim Kardashian", value: 364 },
            { name: "National Geographic", value: 283 },
            { name: "Zendaya", value: 184 }
        ]
    },
    {
        category: "Výška známych budov/štruktúr (metre)", items: [
            { name: "Eiffelova veža", value: 330 },
            { name: "Burdž Chalífa", value: 828 },
            { name: "Socha Slobody", value: 93 },
            { name: "Veľká pyramída v Gíze", value: 138 },
            { name: "Empire State Building", value: 443 },
            { name: "Bratislavský hrad (výška od Dunaja)", value: 85 }
        ]
    }
];

export const getRandomRoundData = () => {
    // Pick random category
    const cat = HL_DATASET[Math.floor(Math.random() * HL_DATASET.length)];
    // Pick two distinct items
    let i1 = Math.floor(Math.random() * cat.items.length);
    let i2 = Math.floor(Math.random() * cat.items.length);
    while (i2 === i1) i2 = Math.floor(Math.random() * cat.items.length);

    return {
        topic: cat.category,
        first: cat.items[i1],
        second: cat.items[i2]
    };
};
