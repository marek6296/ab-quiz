import { supabase } from '../lib/supabase';

export const HL_DATASET = [
    {
        category: "Priemerný mesačný plat (€)",
        metric: "€",
        items: [
            { name: "Programátor (SVK)", value: 2500, image: "💻", difficulty: 1 },
            { name: "Lekár s atestáciou", value: 3800, image: "⚕️", difficulty: 1 },
            { name: "Učiteľ ZŠ", value: 1400, image: "🏫", difficulty: 2 },
            { name: "Predavač/ka", value: 1100, image: "🛒", difficulty: 2 },
            { name: "Pekár", value: 1200, image: "🥖", difficulty: 2 },
            { name: "Zubár", value: 4500, image: "🦷", difficulty: 1 },
            { name: "Právnik", value: 3000, image: "⚖️", difficulty: 1 },
            { name: "Automechanik", value: 1500, image: "🔧", difficulty: 2 },
            { name: "Inžinier", value: 2200, image: "📐", difficulty: 2 },
            { name: "Hasič", value: 1350, image: "🚒", difficulty: 3 },
            { name: "Policajt", value: 1600, image: "👮", difficulty: 2 },
            { name: "Farmaceut", value: 2800, image: "💊", difficulty: 2 },
            { name: "Účtovník", value: 1800, image: "📊", difficulty: 3 },
            { name: "Architekt", value: 2600, image: "🏗️", difficulty: 2 },
            { name: "Veterinár", value: 2100, image: "🐾", difficulty: 3 },
            { name: "Kuchár", value: 1250, image: "👨‍🍳", difficulty: 2 },
            { name: "Elektrikár", value: 1700, image: "⚡", difficulty: 3 },
            { name: "Pilot", value: 5500, image: "✈️", difficulty: 1 },
            { name: "Smetiar", value: 1050, image: "🗑️", difficulty: 3 },
            { name: "Novinár", value: 1300, image: "📰", difficulty: 3 },
        ]
    },
    {
        category: "Mesačné vyhľadávania na Google (SVK)",
        metric: "vyhľadávaní",
        items: [
            { name: "Počasie", value: 1500000, image: "🌤️", difficulty: 1 },
            { name: "Facebook", value: 2000000, image: "📱", difficulty: 1 },
            { name: "YouTube", value: 3500000, image: "▶️", difficulty: 1 },
            { name: "Prekladač", value: 1200000, image: "🌐", difficulty: 2 },
            { name: "Recepty", value: 800000, image: "🍳", difficulty: 2 },
            { name: "Minecraft", value: 450000, image: "⛏️", difficulty: 2 },
            { name: "Tesla", value: 300000, image: "🚗", difficulty: 3 },
            { name: "Netflix", value: 900000, image: "🍿", difficulty: 2 },
            { name: "Instagram", value: 1800000, image: "📸", difficulty: 1 },
            { name: "TikTok", value: 2200000, image: "🎵", difficulty: 1 },
            { name: "ChatGPT", value: 600000, image: "🤖", difficulty: 3 },
            { name: "Bazos.sk", value: 950000, image: "🏷️", difficulty: 2 },
            { name: "Mapy Google", value: 1100000, image: "🗺️", difficulty: 2 },
            { name: "Wikipedia", value: 700000, image: "📚", difficulty: 3 },
            { name: "Spotify", value: 400000, image: "🎧", difficulty: 3 },
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
            { name: "Bravčová masť", value: 898, image: "🫠", difficulty: 3 },
            { name: "Zemiakové lupienky", value: 536, image: "🥔", difficulty: 2 },
            { name: "Cukor", value: 387, image: "🍬", difficulty: 2 },
            { name: "Ryža (varená)", value: 130, image: "🍚", difficulty: 2 },
            { name: "Olivový olej", value: 884, image: "🫒", difficulty: 3 },
            { name: "Biely chlieb", value: 265, image: "🍞", difficulty: 2 },
            { name: "Kúracie prsia", value: 165, image: "🍗", difficulty: 2 },
            { name: "Med", value: 304, image: "🍯", difficulty: 3 },
            { name: "Slanina", value: 541, image: "🥓", difficulty: 2 },
            { name: "Maslo", value: 717, image: "🧈", difficulty: 2 },
            { name: "Uhorka", value: 15, image: "🥒", difficulty: 1 },
            { name: "Arašidové maslo", value: 588, image: "🥜", difficulty: 3 },
            { name: "Nutella", value: 539, image: "🍫", difficulty: 2 },
        ]
    },
    {
        category: "Počet obyvateľov (milióny)",
        metric: "mil. obyvateľov",
        items: [
            { name: "Slovensko", value: 5.4, image: "🇸🇰", difficulty: 1 },
            { name: "Česko", value: 10.7, image: "🇨🇿", difficulty: 1 },
            { name: "Nemecko", value: 83.2, image: "🇩🇪", difficulty: 1 },
            { name: "USA", value: 331, image: "🇺🇸", difficulty: 1 },
            { name: "India", value: 1428, image: "🇮🇳", difficulty: 1 },
            { name: "Japonsko", value: 125, image: "🇯🇵", difficulty: 2 },
            { name: "Brazília", value: 214, image: "🇧🇷", difficulty: 2 },
            { name: "Austrália", value: 26, image: "🇦🇺", difficulty: 2 },
            { name: "Kanada", value: 38, image: "🇨🇦", difficulty: 2 },
            { name: "Poľsko", value: 38, image: "🇵🇱", difficulty: 2 },
            { name: "Maďarsko", value: 9.7, image: "🇭🇺", difficulty: 2 },
            { name: "Rakúsko", value: 9.1, image: "🇦🇹", difficulty: 2 },
            { name: "Nórsko", value: 5.4, image: "🇳🇴", difficulty: 3 },
            { name: "Island", value: 0.37, image: "🇮🇸", difficulty: 3 },
            { name: "Nigéria", value: 223, image: "🇳🇬", difficulty: 3 },
            { name: "Etiópia", value: 126, image: "🇪🇹", difficulty: 3 },
            { name: "Egypt", value: 112, image: "🇪🇬", difficulty: 2 },
            { name: "Ukrajina", value: 37, image: "🇺🇦", difficulty: 2 },
        ]
    },
    {
        category: "Rozloha krajiny (km²)",
        metric: "km²",
        items: [
            { name: "Slovensko", value: 49035, image: "🇸🇰", difficulty: 1 },
            { name: "Česko", value: 78866, image: "🇨🇿", difficulty: 1 },
            { name: "Rusko", value: 17098242, image: "🇷🇺", difficulty: 1 },
            { name: "Kanada", value: 9984670, image: "🇨🇦", difficulty: 1 },
            { name: "Francúzsko", value: 640679, image: "🇫🇷", difficulty: 2 },
            { name: "Nemecko", value: 357022, image: "🇩🇪", difficulty: 2 },
            { name: "Japonsko", value: 377975, image: "🇯🇵", difficulty: 2 },
            { name: "Austrália", value: 7692024, image: "🇦🇺", difficulty: 1 },
            { name: "Brazília", value: 8515767, image: "🇧🇷", difficulty: 1 },
            { name: "Rakúsko", value: 83879, image: "🇦🇹", difficulty: 2 },
            { name: "Švajčiarsko", value: 41285, image: "🇨🇭", difficulty: 3 },
            { name: "Maďarsko", value: 93028, image: "🇭🇺", difficulty: 2 },
            { name: "Poľsko", value: 312696, image: "🇵🇱", difficulty: 2 },
            { name: "Taliansko", value: 301340, image: "🇮🇹", difficulty: 2 },
            { name: "Indonézia", value: 1904569, image: "🇮🇩", difficulty: 3 },
            { name: "Mongolsko", value: 1564116, image: "🇲🇳", difficulty: 3 },
        ]
    },
    {
        category: "Najvyšší vrch (m n.m.)",
        metric: "m n.m.",
        items: [
            { name: "Mount Everest", value: 8849, image: "🏔️", difficulty: 1 },
            { name: "K2", value: 8611, image: "⛰️", difficulty: 2 },
            { name: "Mont Blanc", value: 4808, image: "🏔️", difficulty: 1 },
            { name: "Gerlach (SVK)", value: 2655, image: "🇸🇰", difficulty: 1 },
            { name: "Kilimandžáro", value: 5895, image: "🌍", difficulty: 2 },
            { name: "Elbrus", value: 5642, image: "🏔️", difficulty: 3 },
            { name: "Sněžka", value: 1603, image: "🇨🇿", difficulty: 2 },
            { name: "Rysy", value: 2503, image: "🏔️", difficulty: 2 },
            { name: "Denali", value: 6190, image: "🇺🇸", difficulty: 3 },
            { name: "Aconcagua", value: 6961, image: "🇦🇷", difficulty: 3 },
            { name: "Kriváň", value: 2495, image: "🇸🇰", difficulty: 2 },
            { name: "Grossglockner", value: 3798, image: "🇦🇹", difficulty: 3 },
            { name: "Matterhorn", value: 4478, image: "🇨🇭", difficulty: 2 },
            { name: "Zugspitze", value: 2962, image: "🇩🇪", difficulty: 3 },
        ]
    },
    {
        category: "Ročná spotreba piva (litre/osoba)",
        metric: "litrov/osobu",
        items: [
            { name: "Česko", value: 184, image: "🇨🇿", difficulty: 1 },
            { name: "Nemecko", value: 99, image: "🇩🇪", difficulty: 2 },
            { name: "Rakúsko", value: 106, image: "🇦🇹", difficulty: 2 },
            { name: "Poľsko", value: 96, image: "🇵🇱", difficulty: 2 },
            { name: "Slovensko", value: 73, image: "🇸🇰", difficulty: 2 },
            { name: "USA", value: 76, image: "🇺🇸", difficulty: 2 },
            { name: "Írsko", value: 85, image: "🇮🇪", difficulty: 3 },
            { name: "Belgicko", value: 68, image: "🇧🇪", difficulty: 3 },
            { name: "Japonsko", value: 42, image: "🇯🇵", difficulty: 3 },
            { name: "Francúzsko", value: 33, image: "🇫🇷", difficulty: 3 },
            { name: "Taliansko", value: 34, image: "🇮🇹", difficulty: 3 },
            { name: "Turecko", value: 14, image: "🇹🇷", difficulty: 3 },
            { name: "Rumunsko", value: 88, image: "🇷🇴", difficulty: 3 },
        ]
    },
    {
        category: "Rok postavenia slávnych budov",
        metric: "rok",
        items: [
            { name: "Veľká pyramída", value: -2560, image: "🏛️", difficulty: 1 },
            { name: "Koloseum", value: 80, image: "🏟️", difficulty: 1 },
            { name: "Eiffelova veža", value: 1889, image: "🗼", difficulty: 1 },
            { name: "Socha Slobody", value: 1886, image: "🗽", difficulty: 2 },
            { name: "Taj Mahal", value: 1653, image: "🕌", difficulty: 2 },
            { name: "Big Ben", value: 1859, image: "🇬🇧", difficulty: 2 },
            { name: "Bratislavský hrad", value: 1287, image: "🏰", difficulty: 2 },
            { name: "Sagrada Família", value: 1882, image: "⛪", difficulty: 3 },
            { name: "Šikmá veža v Pise", value: 1173, image: "🏗️", difficulty: 2 },
            { name: "Notre-Dame", value: 1163, image: "⛪", difficulty: 2 },
            { name: "Hagia Sophia", value: 537, image: "🕌", difficulty: 3 },
            { name: "Stonehenge", value: -3000, image: "🪨", difficulty: 2 },
            { name: "Burj Khalifa", value: 2010, image: "🏢", difficulty: 1 },
        ]
    },
    {
        category: "Maximálna rýchlosť (km/h)",
        metric: "km/h",
        items: [
            { name: "Gepard", value: 112, image: "🐆", difficulty: 1 },
            { name: "Usain Bolt", value: 45, image: "🏃", difficulty: 1 },
            { name: "Formule 1", value: 372, image: "🏎️", difficulty: 1 },
            { name: "Boeing 747", value: 920, image: "✈️", difficulty: 2 },
            { name: "Rýchlosť zvuku", value: 1235, image: "🔊", difficulty: 1 },
            { name: "Tornádo (najsilnejšie)", value: 480, image: "🌪️", difficulty: 2 },
            { name: "Guľka z pušky", value: 1800, image: "💨", difficulty: 2 },
            { name: "Chrt (pes)", value: 72, image: "🐕", difficulty: 2 },
            { name: "Kôň (cválanie)", value: 70, image: "🐎", difficulty: 2 },
            { name: "Tučniak (vo vode)", value: 36, image: "🐧", difficulty: 3 },
            { name: "Sokol sťahovavý (strmhlavý let)", value: 389, image: "🦅", difficulty: 2 },
            { name: "Raketoplán Space Shuttle", value: 28000, image: "🚀", difficulty: 2 },
            { name: "Delfín", value: 60, image: "🐬", difficulty: 3 },
            { name: "Veľryba", value: 48, image: "🐋", difficulty: 3 },
        ]
    },
    {
        category: "Dĺžka riek (km)",
        metric: "km",
        items: [
            { name: "Níl", value: 6650, image: "🌊", difficulty: 1 },
            { name: "Amazonka", value: 6400, image: "🌊", difficulty: 1 },
            { name: "Dunaj", value: 2850, image: "🌊", difficulty: 1 },
            { name: "Volga", value: 3531, image: "🌊", difficulty: 2 },
            { name: "Váh", value: 403, image: "🇸🇰", difficulty: 1 },
            { name: "Hron", value: 298, image: "🇸🇰", difficulty: 2 },
            { name: "Vltava", value: 430, image: "🇨🇿", difficulty: 2 },
            { name: "Mississippi", value: 3766, image: "🇺🇸", difficulty: 2 },
            { name: "Rýn", value: 1233, image: "🌊", difficulty: 2 },
            { name: "Temža", value: 346, image: "🇬🇧", difficulty: 3 },
            { name: "Seina", value: 777, image: "🇫🇷", difficulty: 3 },
            { name: "Morava", value: 352, image: "🇸🇰", difficulty: 2 },
            { name: "Ganga", value: 2525, image: "🇮🇳", difficulty: 3 },
            { name: "Mekong", value: 4350, image: "🌏", difficulty: 3 },
        ]
    },
    {
        category: "Cena smartfónu (€)",
        metric: "€",
        items: [
            { name: "iPhone 16 Pro Max", value: 1449, image: "📱", difficulty: 1 },
            { name: "Samsung Galaxy S24 Ultra", value: 1399, image: "📱", difficulty: 1 },
            { name: "Xiaomi 14", value: 599, image: "📱", difficulty: 2 },
            { name: "Google Pixel 8", value: 699, image: "📱", difficulty: 2 },
            { name: "iPhone SE", value: 529, image: "📱", difficulty: 2 },
            { name: "Samsung Galaxy A15", value: 179, image: "📱", difficulty: 2 },
            { name: "OnePlus 12", value: 899, image: "📱", difficulty: 3 },
            { name: "iPhone 16", value: 969, image: "📱", difficulty: 1 },
            { name: "Xiaomi Redmi Note 13", value: 199, image: "📱", difficulty: 2 },
            { name: "Samsung Galaxy Z Fold 5", value: 1899, image: "📱", difficulty: 2 },
            { name: "Nothing Phone 2", value: 549, image: "📱", difficulty: 3 },
            { name: "Motorola Edge 50", value: 449, image: "📱", difficulty: 3 },
        ]
    },
    {
        category: "Počet followrov na Instagrame (milióny)",
        metric: "mil. followrov",
        items: [
            { name: "Cristiano Ronaldo", value: 636, image: "⚽", difficulty: 1 },
            { name: "Lionel Messi", value: 503, image: "⚽", difficulty: 1 },
            { name: "Selena Gomez", value: 429, image: "🎤", difficulty: 2 },
            { name: "Kylie Jenner", value: 399, image: "💄", difficulty: 2 },
            { name: "The Rock", value: 395, image: "💪", difficulty: 2 },
            { name: "Kim Kardashian", value: 364, image: "📸", difficulty: 2 },
            { name: "Beyoncé", value: 319, image: "🎵", difficulty: 2 },
            { name: "Taylor Swift", value: 283, image: "🎤", difficulty: 2 },
            { name: "Neymar", value: 228, image: "⚽", difficulty: 2 },
            { name: "Khloé Kardashian", value: 311, image: "📸", difficulty: 3 },
            { name: "Nike", value: 303, image: "👟", difficulty: 3 },
            { name: "Virat Kohli", value: 271, image: "🏏", difficulty: 3 },
            { name: "Justin Bieber", value: 293, image: "🎤", difficulty: 2 },
        ]
    },
    {
        category: "Priemerná teplota v januári (°C)",
        metric: "°C",
        items: [
            { name: "Bratislava", value: 0, image: "🇸🇰", difficulty: 1 },
            { name: "Moskva", value: -10, image: "🇷🇺", difficulty: 1 },
            { name: "Dubaj", value: 19, image: "🇦🇪", difficulty: 1 },
            { name: "Bangkok", value: 27, image: "🇹🇭", difficulty: 2 },
            { name: "Reykjavík", value: 0, image: "🇮🇸", difficulty: 2 },
            { name: "New York", value: 0, image: "🇺🇸", difficulty: 2 },
            { name: "Sydney", value: 23, image: "🇦🇺", difficulty: 2 },
            { name: "Tokio", value: 5, image: "🇯🇵", difficulty: 2 },
            { name: "Káhira", value: 14, image: "🇪🇬", difficulty: 3 },
            { name: "Helsinki", value: -5, image: "🇫🇮", difficulty: 2 },
            { name: "Rio de Janeiro", value: 27, image: "🇧🇷", difficulty: 3 },
            { name: "Nairobi", value: 18, image: "🇰🇪", difficulty: 3 },
            { name: "Oymyakon (najchladnejšie)", value: -50, image: "🥶", difficulty: 3 },
            { name: "Košice", value: -2, image: "🇸🇰", difficulty: 2 },
        ]
    },
    {
        category: "Rok vzniku vynálezu",
        metric: "rok",
        items: [
            { name: "Kníhtlač (Gutenberg)", value: 1440, image: "📜", difficulty: 2 },
            { name: "Telefón", value: 1876, image: "📞", difficulty: 2 },
            { name: "Žiarovka", value: 1879, image: "💡", difficulty: 2 },
            { name: "Automobil", value: 1886, image: "🚗", difficulty: 2 },
            { name: "Internet (WWW)", value: 1991, image: "🌐", difficulty: 1 },
            { name: "iPhone", value: 2007, image: "📱", difficulty: 1 },
            { name: "Facebook", value: 2004, image: "📱", difficulty: 1 },
            { name: "Bitcoin", value: 2009, image: "₿", difficulty: 2 },
            { name: "ChatGPT", value: 2022, image: "🤖", difficulty: 1 },
            { name: "Televízia", value: 1927, image: "📺", difficulty: 2 },
            { name: "Röntgenové žiarenie", value: 1895, image: "🩻", difficulty: 3 },
            { name: "Penicilín", value: 1928, image: "💊", difficulty: 3 },
            { name: "Parný stroj", value: 1712, image: "🚂", difficulty: 3 },
            { name: "YouTube", value: 2005, image: "▶️", difficulty: 1 },
            { name: "Instagram", value: 2010, image: "📸", difficulty: 1 },
            { name: "Dynamit", value: 1867, image: "🧨", difficulty: 3 },
        ]
    },
    {
        category: "Dĺžka života zvieraťa (roky)",
        metric: "rokov",
        items: [
            { name: "Slon", value: 70, image: "🐘", difficulty: 1 },
            { name: "Pes", value: 13, image: "🐕", difficulty: 1 },
            { name: "Mačka", value: 15, image: "🐈", difficulty: 1 },
            { name: "Korytnačka obrovská", value: 175, image: "🐢", difficulty: 1 },
            { name: "Papagáj ara", value: 60, image: "🦜", difficulty: 2 },
            { name: "Zlatá rybka", value: 10, image: "🐟", difficulty: 2 },
            { name: "Kôň", value: 30, image: "🐎", difficulty: 2 },
            { name: "Myš", value: 3, image: "🐭", difficulty: 2 },
            { name: "Grónsky žralok", value: 400, image: "🦈", difficulty: 3 },
            { name: "Mucha", value: 0.07, image: "🪰", difficulty: 1 },
            { name: "Vrana", value: 14, image: "🐦‍⬛", difficulty: 3 },
            { name: "Gorila", value: 40, image: "🦍", difficulty: 2 },
            { name: "Bocian biely", value: 25, image: "🦩", difficulty: 3 },
            { name: "Krokodíl", value: 70, image: "🐊", difficulty: 2 },
            { name: "Zajac", value: 9, image: "🐰", difficulty: 3 },
        ]
    },
    {
        category: "Počet krajín na kontinente",
        metric: "krajín",
        items: [
            { name: "Európa", value: 44, image: "🌍", difficulty: 1 },
            { name: "Afrika", value: 54, image: "🌍", difficulty: 1 },
            { name: "Ázia", value: 48, image: "🌏", difficulty: 1 },
            { name: "Južná Amerika", value: 12, image: "🌎", difficulty: 1 },
            { name: "Severná Amerika", value: 23, image: "🌎", difficulty: 2 },
            { name: "Oceánia", value: 14, image: "🌏", difficulty: 2 },
        ]
    },
    {
        category: "Hmotnosť zvieraťa (kg)",
        metric: "kg",
        items: [
            { name: "Modrá veľryba", value: 150000, image: "🐋", difficulty: 1 },
            { name: "Slon africký", value: 6000, image: "🐘", difficulty: 1 },
            { name: "Ľadový medveď", value: 450, image: "🐻‍❄️", difficulty: 2 },
            { name: "Lev", value: 190, image: "🦁", difficulty: 2 },
            { name: "Vlk", value: 50, image: "🐺", difficulty: 2 },
            { name: "Orol", value: 5, image: "🦅", difficulty: 2 },
            { name: "Mačka domáca", value: 4.5, image: "🐈", difficulty: 1 },
            { name: "Kolibrík", value: 0.004, image: "🐦", difficulty: 2 },
            { name: "Žirafa", value: 1100, image: "🦒", difficulty: 2 },
            { name: "Nosorožec", value: 2300, image: "🦏", difficulty: 2 },
            { name: "Gorila", value: 160, image: "🦍", difficulty: 2 },
            { name: "Hroch", value: 1500, image: "🦛", difficulty: 3 },
            { name: "Tučniak", value: 35, image: "🐧", difficulty: 3 },
            { name: "Krokodíl", value: 500, image: "🐊", difficulty: 3 },
            { name: "Delfín", value: 200, image: "🐬", difficulty: 3 },
        ]
    },
    {
        category: "Vzdialenosť z Bratislavy (km)",
        metric: "km",
        items: [
            { name: "Viedeň", value: 65, image: "🇦🇹", difficulty: 1 },
            { name: "Budapešť", value: 200, image: "🇭🇺", difficulty: 1 },
            { name: "Praha", value: 330, image: "🇨🇿", difficulty: 1 },
            { name: "Košice", value: 400, image: "🇸🇰", difficulty: 1 },
            { name: "Berlín", value: 660, image: "🇩🇪", difficulty: 2 },
            { name: "Paríž", value: 1230, image: "🇫🇷", difficulty: 2 },
            { name: "Londýn", value: 1460, image: "🇬🇧", difficulty: 2 },
            { name: "Rím", value: 1120, image: "🇮🇹", difficulty: 2 },
            { name: "Madrid", value: 2300, image: "🇪🇸", difficulty: 3 },
            { name: "Moskva", value: 1820, image: "🇷🇺", difficulty: 3 },
            { name: "Istanbul", value: 1260, image: "🇹🇷", difficulty: 3 },
            { name: "New York", value: 6880, image: "🇺🇸", difficulty: 2 },
            { name: "Varšava", value: 530, image: "🇵🇱", difficulty: 2 },
            { name: "Záhreb", value: 420, image: "🇭🇷", difficulty: 3 },
        ]
    },
    {
        category: "Počet gólov v kariére (futbal)",
        metric: "gólov",
        items: [
            { name: "Cristiano Ronaldo", value: 899, image: "⚽", difficulty: 1 },
            { name: "Lionel Messi", value: 838, image: "⚽", difficulty: 1 },
            { name: "Pelé", value: 767, image: "⚽", difficulty: 1 },
            { name: "Robert Lewandowski", value: 655, image: "⚽", difficulty: 2 },
            { name: "Neymar", value: 439, image: "⚽", difficulty: 2 },
            { name: "Zlatan Ibrahimovič", value: 496, image: "⚽", difficulty: 2 },
            { name: "Karim Benzema", value: 435, image: "⚽", difficulty: 2 },
            { name: "Luis Suárez", value: 440, image: "⚽", difficulty: 3 },
            { name: "Wayne Rooney", value: 313, image: "⚽", difficulty: 3 },
            { name: "Thierry Henry", value: 411, image: "⚽", difficulty: 3 },
            { name: "Erling Haaland", value: 250, image: "⚽", difficulty: 2 },
            { name: "Kylian Mbappé", value: 290, image: "⚽", difficulty: 2 },
            { name: "Marek Hamšík", value: 140, image: "🇸🇰", difficulty: 2 },
        ]
    },
    {
        category: "Rozpočet filmu (milióny $)",
        metric: "mil. $",
        items: [
            { name: "Avatar 2", value: 460, image: "🎬", difficulty: 1 },
            { name: "Avengers: Endgame", value: 356, image: "🎬", difficulty: 1 },
            { name: "Titanic", value: 200, image: "🚢", difficulty: 1 },
            { name: "The Batman (2022)", value: 185, image: "🦇", difficulty: 2 },
            { name: "Barbie (2023)", value: 145, image: "💖", difficulty: 2 },
            { name: "Joker", value: 55, image: "🃏", difficulty: 3 },
            { name: "Oppenheimer", value: 100, image: "💣", difficulty: 2 },
            { name: "Spider-Man: No Way Home", value: 200, image: "🕷️", difficulty: 2 },
            { name: "Top Gun: Maverick", value: 170, image: "✈️", difficulty: 2 },
            { name: "Dune 2", value: 190, image: "🏜️", difficulty: 3 },
            { name: "John Wick 4", value: 100, image: "🔫", difficulty: 3 },
            { name: "Piráti z Karibiku 4", value: 410, image: "🏴‍☠️", difficulty: 2 },
            { name: "Star Wars: Sila sa prebúdza", value: 245, image: "⭐", difficulty: 2 },
            { name: "Frozen 2", value: 150, image: "❄️", difficulty: 3 },
        ]
    },
    {
        category: "Odberatelia na YouTube (milióny)",
        metric: "mil. odberateľov",
        items: [
            { name: "MrBeast", value: 340, image: "▶️", difficulty: 1 },
            { name: "T-Series", value: 278, image: "🎵", difficulty: 2 },
            { name: "Cocomelon", value: 180, image: "👶", difficulty: 2 },
            { name: "PewDiePie", value: 111, image: "🎮", difficulty: 1 },
            { name: "SET India", value: 175, image: "📺", difficulty: 3 },
            { name: "Kids Diana Show", value: 125, image: "👧", difficulty: 3 },
            { name: "Like Nastya", value: 118, image: "👧", difficulty: 3 },
            { name: "WWE", value: 103, image: "💪", difficulty: 2 },
            { name: "Dude Perfect", value: 60, image: "🏀", difficulty: 2 },
            { name: "Markiplier", value: 37, image: "🎮", difficulty: 3 },
            { name: "Logan Paul", value: 23, image: "🥊", difficulty: 3 },
            { name: "GoGo (SVK)", value: 1.3, image: "🇸🇰", difficulty: 2 },
        ]
    },
    {
        category: "Počet obyvateľov mesta na Slovensku (tisíce)",
        metric: "tisíc obyvateľov",
        items: [
            { name: "Bratislava", value: 475, image: "🏙️", difficulty: 1 },
            { name: "Košice", value: 229, image: "🏙️", difficulty: 1 },
            { name: "Prešov", value: 85, image: "🏘️", difficulty: 1 },
            { name: "Žilina", value: 80, image: "🏘️", difficulty: 2 },
            { name: "Banská Bystrica", value: 74, image: "🏘️", difficulty: 2 },
            { name: "Nitra", value: 76, image: "🏘️", difficulty: 2 },
            { name: "Trnava", value: 63, image: "🏘️", difficulty: 2 },
            { name: "Martin", value: 53, image: "🏘️", difficulty: 2 },
            { name: "Trenčín", value: 53, image: "🏘️", difficulty: 2 },
            { name: "Poprad", value: 50, image: "🏔️", difficulty: 3 },
            { name: "Piešťany", value: 27, image: "♨️", difficulty: 3 },
            { name: "Zvolen", value: 41, image: "🏘️", difficulty: 3 },
            { name: "Michalovce", value: 38, image: "🏘️", difficulty: 3 },
            { name: "Komárno", value: 33, image: "🏘️", difficulty: 3 },
            { name: "Dunajská Streda", value: 22, image: "🏘️", difficulty: 3 },
        ]
    },
    {
        category: "Nadmorská výška európskych hlavných miest (m)",
        metric: "m n.m.",
        items: [
            { name: "Madrid", value: 667, image: "🇪🇸", difficulty: 2 },
            { name: "Bratislava", value: 152, image: "🇸🇰", difficulty: 1 },
            { name: "Viedeň", value: 171, image: "🇦🇹", difficulty: 2 },
            { name: "Berlín", value: 34, image: "🇩🇪", difficulty: 2 },
            { name: "Paríž", value: 35, image: "🇫🇷", difficulty: 2 },
            { name: "Londýn", value: 11, image: "🇬🇧", difficulty: 2 },
            { name: "Rím", value: 21, image: "🇮🇹", difficulty: 3 },
            { name: "Amsterdam", value: -2, image: "🇳🇱", difficulty: 3 },
            { name: "Bern", value: 542, image: "🇨🇭", difficulty: 3 },
            { name: "Praha", value: 235, image: "🇨🇿", difficulty: 1 },
            { name: "Varšava", value: 100, image: "🇵🇱", difficulty: 2 },
            { name: "Budapešť", value: 96, image: "🇭🇺", difficulty: 2 },
            { name: "Atény", value: 70, image: "🇬🇷", difficulty: 3 },
            { name: "Helsinki", value: 26, image: "🇫🇮", difficulty: 3 },
        ]
    },
    {
        category: "Priemer planéty Slnečnej sústavy (km)",
        metric: "km",
        items: [
            { name: "Jupiter", value: 139820, image: "🪐", difficulty: 1 },
            { name: "Saturn", value: 116460, image: "🪐", difficulty: 1 },
            { name: "Zem", value: 12742, image: "🌍", difficulty: 1 },
            { name: "Mars", value: 6779, image: "🔴", difficulty: 1 },
            { name: "Merkúr", value: 4879, image: "☿️", difficulty: 2 },
            { name: "Venuša", value: 12104, image: "♀️", difficulty: 2 },
            { name: "Urán", value: 50724, image: "🪐", difficulty: 2 },
            { name: "Neptún", value: 49244, image: "🪐", difficulty: 2 },
            { name: "Slnko", value: 1392700, image: "☀️", difficulty: 1 },
            { name: "Mesiac", value: 3474, image: "🌙", difficulty: 1 },
            { name: "Pluto (trpasličia)", value: 2377, image: "⚫", difficulty: 2 },
        ]
    },
    {
        category: "Cena potravín v obchode (€/kg)",
        metric: "€/kg",
        items: [
            { name: "Banány", value: 1.5, image: "🍌", difficulty: 1 },
            { name: "Kuracie prsia", value: 7.5, image: "🍗", difficulty: 1 },
            { name: "Losos", value: 18, image: "🐟", difficulty: 1 },
            { name: "Ryža", value: 2.2, image: "🍚", difficulty: 2 },
            { name: "Hovädzie mäso", value: 14, image: "🥩", difficulty: 2 },
            { name: "Mrkva", value: 1.0, image: "🥕", difficulty: 1 },
            { name: "Jablká", value: 1.8, image: "🍎", difficulty: 2 },
            { name: "Maslo", value: 12, image: "🧈", difficulty: 2 },
            { name: "Syr Eidam", value: 9, image: "🧀", difficulty: 2 },
            { name: "Čokoláda Milka", value: 11, image: "🍫", difficulty: 3 },
            { name: "Šafran", value: 8000, image: "🌸", difficulty: 1 },
            { name: "Avokádo", value: 5, image: "🥑", difficulty: 2 },
            { name: "Mango", value: 4, image: "🥭", difficulty: 3 },
            { name: "Pistácie", value: 25, image: "🥜", difficulty: 3 },
            { name: "Zemiaky", value: 0.9, image: "🥔", difficulty: 1 },
        ]
    },
    {
        category: "Tržby filmu celosvetovo (miliardy $)",
        metric: "mld. $",
        items: [
            { name: "Avatar (2009)", value: 2.92, image: "🎬", difficulty: 1 },
            { name: "Avengers: Endgame", value: 2.80, image: "🦸", difficulty: 1 },
            { name: "Titanic", value: 2.26, image: "🚢", difficulty: 1 },
            { name: "Star Wars: Sila sa prebúdza", value: 2.07, image: "⭐", difficulty: 2 },
            { name: "Spider-Man: No Way Home", value: 1.92, image: "🕷️", difficulty: 2 },
            { name: "Top Gun: Maverick", value: 1.49, image: "✈️", difficulty: 2 },
            { name: "Barbie (2023)", value: 1.44, image: "💖", difficulty: 2 },
            { name: "Frozen 2", value: 1.45, image: "❄️", difficulty: 3 },
            { name: "Joker", value: 1.07, image: "🃏", difficulty: 3 },
            { name: "Oppenheimer", value: 0.95, image: "💣", difficulty: 3 },
            { name: "Harry Potter a Dary smrti 2", value: 1.34, image: "🧙", difficulty: 2 },
            { name: "Leví kráľ (2019)", value: 1.66, image: "🦁", difficulty: 2 },
            { name: "Jurský svet", value: 1.67, image: "🦕", difficulty: 3 },
        ]
    },
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
                const catMap = {};
                items.forEach(item => {
                    const catName = item.category?.name || 'Neznáma';
                    if (!catMap[catName]) {
                        catMap[catName] = { name: catName, metric: item.category?.metric || '', items: [] };
                    }
                    catMap[catName].items.push(item);
                });
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
                ? cat.items.filter(i => i.difficulty <= difficulty)
                : cat.items
        })).filter(c => c.items.length >= 4);

        if (categories.length === 0) {
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

    // Build sequence — truly random, no consecutive duplicates
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
