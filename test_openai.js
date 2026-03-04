import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

const apiKey = process.env.VITE_OPENAI_API_KEY;
if (!apiKey) {
    console.error("No API key found in .env");
    process.exit(1);
}

const req = async () => {
    let diffDesc = "STREDNÁ (Fakty pre bežného diváka. Nie tá najzákladnejšia vec, ale stále známa informácia. Napr. konkrétny rok začatia 2. sv. vojny, hlavné mesto menšieho štátu.)";
    const avoidList = "";
    const count = 5;
    const cat = "Hry";

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: "gpt-4o",
            temperature: 0.7,
            messages: [
                {
                    role: "system",
                    content: `Si PROFESIONÁLNY moderátor kvízových relácií (ako AZ-Kvíz na Slovensku). Tvojou úlohou je tvoriť otázky, ktoré sú presné, jednoznačné, majú len jednu možnú odpoveď a sú výborne štylisticky položené.

STRIKTNÉ KRITÉRIÁ:
1. PRIAMOČIAROSŤ A ŠTÝL: Pýtaj sa jasne a priamo. Žiadne zbytočné a zdĺhavé robotické opisy. Formulácia musí znieť prirodzene z úst moderátora (Napr. namiesto "Aký je názov filmu, v ktorom..." použi "V ktorom slávnom filme...").
2. JEDNOZNAČNOSŤ: Odpoveď musí byť nespochybniteľná. Pri osobách vždy uveď národnosť a povolanie (napr. 'Ktorá americká popová speváčka...').
3. ÚDERNOŤ ODPOVEDÍ: Odpovede udržuj čo najkratšie – ideálne 1 až 2 slová. (napr. namiesto "Mesto Bratislava" použi iba "Bratislava").
4. ŠPECIFIKÁ TÉM:
    - 'Slovensko': Len unikátne slovenské fakty (najvyššie, najstaršie, jediné).
    - 'Logika a Hádanky': Klasické vtipné hádanky, kde je odpoveď zväčša predmet alebo zviera.
    - 'Hry': Generuj otázky LEN o notoricky najznámejších hrách (GTA, Mafia, Zaklínač, CS:GO, LoL, Mario). *VÁGNE OTÁZKY SÚ ZAKÁZANÉ!* Otázka musí mať *absolútne nezameniteľný a vysoko špecifický záchytný bod* (presné meno vedľajšej postavy, špecifické mesto, názov vývojárskeho štúdia alebo unikátny predmet). Nedovoľ situáciu, aby na otázku pasovalo viacero celosvetových hier!
5. ABSOLÚTNE ZAKÁZANÉ (KRITICKÉ): Text otázky nesmie obsahovať odpoveď, ani jej koreň slova, *A ANI JEJ PREKLAD ČI DOSLOVNÝ VÝZNAM*! Ak je odpoveď "Monster Hunter", tak v zadaní nesmieš napísať opisy ako "lovci príšer/monštier" (lebo je to priamy doslovný preklad odpovede). Ak je odpoveď "Minecraft", nesmieš napísať "craftovanie" ani "ťaženie". Pýtaj sa radšej múdro cez postavy a svet. Žiadne otázky v štýle "Ktorá hra sa volá X?". Objavujúca sa odpoveď (aj v preklade) v otázke je fatálnou chybou, ktorú nesmieš spraviť!
6. FORMÁT: Vždy vráť JSON s kľúčom "questions". Každý objekt má kľúče: question_text, answer, category.`
                },
                {
                    role: "user",
                    content: `Záväzná úloha: Vygeneruj PRESNE ${count} unikátnych otázok výhradne pre tému: "${cat}". Požadovaná náročnosť: ${diffDesc}. Je ABSOLÚTNE NEVYHNUTNÉ, aby výsledný JSON obsahoval presne ${count} položiek. Nesmieš to odfláknuť ani vrátiť prázdny zoznam, vygeneruj ich za každú cenu a presne na mieru! ${avoidList}`
                }
            ],
            response_format: { type: "json_object" }
        })
    });

    const text = await response.text();
    console.log(text);
};

req();
