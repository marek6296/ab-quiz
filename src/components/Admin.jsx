import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export const Admin = ({ onBack }) => {
    const [questions, setQuestions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [stats, setStats] = useState({ total: 0, byCategory: {} });
    const [searchTerm, setSearchTerm] = useState('');
    const [activeTab, setActiveTab] = useState('list'); // 'list' or 'generate'

    // AI Gen State
    const [genCategories, setGenCategories] = useState([]);
    const [customCat, setCustomCat] = useState('');

    const PREDEFINED_CAT = [
        'Slovensko', 'Hry', 'Streameri a YouTuberi', 'Geografia', 'História', 'Šport', 'Veda a Technika',
        'Kultúra a Umenie', 'Príroda', 'Slovenský jazyk', 'Literatúra',
        'Filmy a Seriály', 'Hudba', 'Logika a Hádanky', 'Všeobecný prehľad'
    ];

    const toggleGenCategory = (cat) => {
        setGenCategories(prev =>
            prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
        );
    };

    return (
        <div className="game-container lobby admin-panel" style={{ overflowY: 'auto', padding: '2rem' }}>
            <div className="lobby-header" style={{ marginBottom: '2rem' }}>
                <h1>Administrácia</h1>
                <button className="secondary" onClick={onBack}>Späť do Lobby</button>
            </div>

            <div className="lobby-content" style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '2rem', alignItems: 'start' }}>
                {/* Sidebar Stats */}
                <div className="lobby-panel" style={{ height: 'auto' }}>
                    <h3>Štatistiky</h3>
                    <div style={{ fontSize: '1.2rem', marginBottom: '1rem', color: '#38bdf8' }}>
                        Celkom otázok: <strong>{stats.total}</strong>
                    </div>
                    <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                        {Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
                            <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                <span style={{ color: '#94a3b8' }}>{cat}</span>
                                <span style={{ fontWeight: 'bold' }}>{count}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Main Content */}
                <div className="lobby-panel" style={{ height: 'auto' }}>
                    <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem' }}>
                        <button className={`secondary ${activeTab === 'list' ? 'active' : ''}`} onClick={() => setActiveTab('list')}>Zoznam</button>
                        <button className={`secondary ${activeTab === 'add' ? 'active' : ''}`} onClick={() => setActiveTab('add')}>Pridať manuálne</button>
                        <button className={`secondary ${activeTab === 'generate' ? 'active' : ''}`} onClick={() => setActiveTab('generate')}>Generovať AI</button>
                    </div>

                    {activeTab === 'list' && (
                        <>
                            <div className="form-group" style={{ marginBottom: '1rem' }}>
                                <input
                                    type="text"
                                    placeholder="Hľadať v otázkach..."
                                    value={searchTerm}
                                    onChange={(e) => setSearchTerm(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && fetchQuestions()}
                                />
                            </div>
                            <div style={{ maxHeight: '600px', overflowY: 'auto', background: 'rgba(0,0,0,0.2)', borderRadius: '8px' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '2px solid rgba(255,255,255,0.1)' }}>
                                            <th style={{ padding: '1rem' }}>Otázka</th>
                                            <th style={{ padding: '1rem' }}>Odpoveď</th>
                                            <th style={{ padding: '1rem' }}>Kat.</th>
                                            <th style={{ padding: '1rem' }}>Úroveň</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {questions.map(q => (
                                            <tr key={q.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                                                <td style={{ padding: '0.8rem', fontSize: '0.9rem' }}>{q.question_text}</td>
                                                <td style={{ padding: '0.8rem', fontSize: '0.9rem', color: '#4ade80' }}>{q.answer}</td>
                                                <td style={{ padding: '0.8rem', fontSize: '0.8rem', color: '#94a3b8' }}>{q.category}</td>
                                                <td style={{ padding: '0.8rem', textAlign: 'center' }}>{q.difficulty}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {loading && <div style={{ padding: '2rem', textAlign: 'center' }}>Načítavam...</div>}
                            </div>
                        </>
                    )}

                    {activeTab === 'add' && (
                        <form onSubmit={handleAddQuestion} className="auth-form" style={{ maxWidth: '600px' }}>
                            <div className="form-group">
                                <label>Text otázky</label>
                                <textarea
                                    value={newQuestion.question_text}
                                    onChange={e => setNewQuestion({ ...newQuestion, question_text: e.target.value })}
                                    required
                                    style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '0.8rem', borderRadius: '8px', minHeight: '100px' }}
                                />
                            </div>
                            <div className="form-group">
                                <label>Odpoveď</label>
                                <input
                                    type="text"
                                    value={newQuestion.answer}
                                    onChange={e => setNewQuestion({ ...newQuestion, answer: e.target.value })}
                                    required
                                />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div className="form-group">
                                    <label>Kategória</label>
                                    <input
                                        type="text"
                                        value={newQuestion.category}
                                        onChange={e => setNewQuestion({ ...newQuestion, category: e.target.value })}
                                        required
                                        placeholder="napr. História"
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Náročnosť (1-3)</label>
                                    <select
                                        value={newQuestion.difficulty}
                                        onChange={e => setNewQuestion({ ...newQuestion, difficulty: parseInt(e.target.value) })}
                                        style={{ background: '#1e293b', color: 'white', padding: '0.8rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}
                                    >
                                        <option value={1}>1 - Ľahká</option>
                                        <option value={2}>2 - Stredná</option>
                                        <option value={3}>3 - Ťažká</option>
                                    </select>
                                </div>
                            </div>
                            <button type="submit" className="primary" style={{ width: '100%', marginTop: '1rem' }}>Pridať Question</button>
                        </form>
                    )}

                    {activeTab === 'generate' && (
                        <div style={{ padding: '1rem' }}>
                            <h3 style={{ marginBottom: '1.5rem' }}>AI Generátor Otázok</h3>

                            <form className="auth-form" style={{ maxWidth: '700px', marginBottom: '2rem' }}>
                                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                    <label style={{ display: 'block', marginBottom: '0.8rem' }}>Vyberte kategórie (môžete viacero)</label>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
                                        <button
                                            type="button"
                                            onClick={() => setGenCategories(PREDEFINED_CAT)}
                                            style={{ padding: '0.4rem 0.8rem', borderRadius: '20px', fontSize: '0.8rem', background: '#38bdf8', color: '#0f172a', border: 'none', cursor: 'pointer' }}
                                        >
                                            Všetky kategórie
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setGenCategories([])}
                                            style={{ padding: '0.4rem 0.8rem', borderRadius: '20px', fontSize: '0.8rem', background: 'rgba(255,255,255,0.1)', color: 'white', border: 'none', cursor: 'pointer' }}
                                        >
                                            Zrušiť výber
                                        </button>
                                    </div>

                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        {PREDEFINED_CAT.map(cat => {
                                            const isSelected = genCategories.includes(cat);
                                            return (
                                                <button
                                                    key={cat}
                                                    type="button"
                                                    onClick={() => toggleGenCategory(cat)}
                                                    style={{
                                                        padding: '0.5rem 1rem',
                                                        borderRadius: '20px',
                                                        fontSize: '0.85rem',
                                                        background: isSelected ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.05)',
                                                        color: isSelected ? '#38bdf8' : '#94a3b8',
                                                        border: `1px solid ${isSelected ? '#38bdf8' : 'rgba(255,255,255,0.1)'}`,
                                                        cursor: 'pointer',
                                                        transition: 'all 0.2s',
                                                        margin: 0
                                                    }}
                                                >
                                                    {cat}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="form-group">
                                    <label>Vlastná téma (voliteľné)</label>
                                    <input
                                        type="text"
                                        placeholder="Pridajte vlastnú kategóriu..."
                                        value={customCat}
                                        onChange={e => setCustomCat(e.target.value)}
                                        onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                                e.preventDefault();
                                                if (customCat && !genCategories.includes(customCat)) {
                                                    setGenCategories([...genCategories, customCat]);
                                                    setCustomCat('');
                                                }
                                            }
                                        }}
                                    />
                                </div>

                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div className="form-group">
                                        <label>Počet otázok CELKOM (1-50)</label>
                                        <input type="number" id="gen_count" defaultValue={10} min={1} max={50} />
                                    </div>
                                    <div className="form-group">
                                        <label>Obtiažnosť (1-3)</label>
                                        <select id="gen_diff" style={{ background: '#1e293b', color: 'white', padding: '0.8rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}>
                                            <option value={1}>1 - Ľahká</option>
                                            <option value={2}>2 - Stredná</option>
                                            <option value={3}>3 - Ťažká</option>
                                        </select>
                                    </div>
                                </div>

                                <button
                                    className="primary"
                                    onClick={async (e) => {
                                        e.preventDefault();
                                        const finalCategories = [...genCategories];
                                        if (customCat) finalCategories.push(customCat);

                                        const count = parseInt(document.getElementById('gen_count').value);
                                        const diff = parseInt(document.getElementById('gen_diff').value);
                                        const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

                                        if (finalCategories.length === 0) return alert('Vyber aspoň jednu kategóriu!');
                                        if (!apiKey) return alert('Chýba VITE_OPENAI_API_KEY v premenných Vercelu!');

                                        setLoading(true);
                                        try {
                                            // Fetch existing questions for selected categories to avoid duplicates
                                            const { data: existingData } = await supabase
                                                .from('questions')
                                                .select('question_text')
                                                .in('category', finalCategories)
                                                .eq('difficulty', diff);

                                            const existingQuestions = existingData?.map(q => q.question_text) || [];
                                            const avoidList = existingQuestions.length > 0
                                                ? `Zoznam otázok, ktoré už v DB máme a NIKDY ich neopakuj: [${existingQuestions.slice(0, 100).join(', ')}]`
                                                : "";

                                            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                                                method: 'POST',
                                                headers: {
                                                    'Content-Type': 'application/json',
                                                    'Authorization': `Bearer ${apiKey}`
                                                },
                                                body: JSON.stringify({
                                                    model: "gpt-4o",
                                                    messages: [
                                                        {
                                                            role: "system",
                                                            content: `Si profesionálny generátor otázok pre slovenský TV kvíz. 
                                                            VAŽNE PRAVIDLÁ:
                                                            1. OTÁZKY: Musia byť ultra-stručné a priame (max 8-10 slov). Žiadne omáčky. Hráč má len 10 sekúnd na prečítanie aj odpoveď.
                                                            2. ODPOVEDE: Musia byť jednoslovné, maximálne dvojslovné. Musia byť jednoznačné.
                                                            3. TÉMY A ŠPECIFIKÁCIE:
                                                               - Slovensko: Geografia, história a osobnosti SR (napr. najvyšší vrch, prezidenti, mestá).
                                                               - Hry: Svetové aj domáce videohry (PC/Konzoly), herné postavy a legendárne tituly (GTA, Zaklínač, FIFA).
                                                               - Streameri a YouTuberi: VÝHRADNE CZ/SK scéna (Madmonq, Gogo, Agraelus, Expl0, Restt, Duklock).
                                                               - Geografia: Svetové hlavné mestá, moria, pohoria a pamiatky.
                                                               - História: Kľúčové svetové udalosti, panovníci a objavy (vhodné pre širokú verejnosť).
                                                               - Šport: Futbal, hokej, tenis, F1 a olympijské disciplíny (hlavne známe mená a kluby).
                                                               - Veda a technika: Známe objavy, planéty, jednotky a technické značky.
                                                               - Slovenský jazyk/Literatúra: Známi autori (Štúr, Kukučín, Harry Potter), gramatika a príslovia.
                                                               - Filmy, Seriály a Hudba: Aktuálne hity, legendárne filmy a svetové kúzla.
                                                               - Logika a hádanky: Rýchle logické úlohy a hravé slovné slová.
                                                            4. NÁROČNOSŤ (${diff}/3): 1=ľahké pre deti, 2=stredné pre dospelých, 3=expert (náročné detaily).
                                                            5. FORMÁT: Vráť čistý JSON (pole objektov s kľúčmi 'question_text', 'answer', 'category').
                                                            6. UNIKÁTNOSŤ: Prísne ignoruj témy a fakty zo zoznamu nižšie.`
                                                        },
                                                        {
                                                            role: "user",
                                                            content: `Vygeneruj ${count} UNIKÁTNYCH otázok v týchto kategóriách: ${finalCategories.join(', ')}. ${avoidList}`
                                                        }
                                                    ],
                                                    response_format: { type: "json_object" }
                                                })
                                            });

                                            const rawData = await response.json();
                                            const result = JSON.parse(rawData.choices[0].message.content);
                                            const questionsList = result.questions || result.data || Object.values(result)[0] || [];

                                            if (Array.isArray(questionsList)) {
                                                const toInsert = questionsList.map(q => ({
                                                    question_text: q.question_text,
                                                    answer: q.answer,
                                                    category: q.category || finalCategories[0],
                                                    difficulty: diff
                                                }));

                                                const { error } = await supabase.from('questions').insert(toInsert);
                                                if (error) throw error;

                                                alert(`Úspešne pridaných ${toInsert.length} otázok naprieč kategóriami!`);
                                                setGenCategories([]);
                                                setCustomCat('');
                                                fetchStats();
                                                fetchQuestions();
                                            } else {
                                                throw new Error("Neočakávaný formát z AI: " + JSON.stringify(result));
                                            }
                                        } catch (err) {
                                            console.error(err);
                                            alert("Chyba AI generátora: " + err.message);
                                        } finally {
                                            setLoading(false);
                                        }
                                    }}
                                    disabled={loading}
                                    style={{ width: '100%', marginTop: '1rem', background: '#ec4899', fontSize: '1.1rem' }}
                                >
                                    {loading ? 'AI Generuje a Triedi...' : '✨ Vygenerovať balík otázok'}
                                </button>
                            </form>

                            <div style={{ background: 'rgba(56, 189, 248, 0.05)', border: '1px dashed rgba(56, 189, 248, 0.3)', padding: '1.5rem', borderRadius: '12px', fontSize: '0.9rem', color: '#94a3b8' }}>
                                <p><strong>Tip:</strong> GPT-4 vygeneruje otázky a automaticky ich zaradí do vybraných kategórií. Môžete nastaviť až 50 otázok naraz.</p>
                                <p style={{ fontSize: '0.8rem', marginTop: '0.5rem' }}>Použitý model: gpt-4o</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
