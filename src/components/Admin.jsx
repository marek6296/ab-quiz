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

    // --- RESTORED FUNCTIONS ---
    // Form for manual add
    const [newQuestion, setNewQuestion] = useState({
        question_text: '',
        answer: '',
        category: '',
        difficulty: 1
    });

    useEffect(() => {
        fetchStats();
        fetchQuestions();
    }, []);

    const fetchStats = async () => {
        const { data, error } = await supabase.from('questions').select('category');
        if (data) {
            const counts = data.reduce((acc, q) => {
                acc[q.category] = (acc[q.category] || 0) + 1;
                return acc;
            }, {});
            setStats({ total: data.length, byCategory: counts });
        }
    };

    const fetchQuestions = async () => {
        setLoading(true);
        let query = supabase.from('questions').select('*').order('created_at', { ascending: false }).limit(50);

        if (searchTerm) {
            query = query.ilike('question_text', `%${searchTerm}%`);
        }

        const { data, error } = await query;
        if (data) setQuestions(data);
        setLoading(false);
    };

    const handleAddQuestion = async (e) => {
        e.preventDefault();
        const { error } = await supabase.from('questions').insert([newQuestion]);
        if (!error) {
            setNewQuestion({ question_text: '', answer: '', category: '', difficulty: 1 });
            fetchQuestions();
            fetchStats();
            alert('Otázka pridaná!');
        } else {
            alert('Chyba: ' + error.message);
        }
    };

    const handleDeleteQuestion = async (id) => {
        if (!window.confirm('Ste si istý, že chcete vymazať túto otázku?')) return;
        const { error } = await supabase.from('questions').delete().eq('id', id);
        if (!error) {
            fetchQuestions();
            fetchStats();
        } else {
            alert('Chyba pri mazaní: ' + error.message);
        }
    };

    const handleDeleteAllQuestions = async () => {
        if (!window.confirm('VAROVANIE: Naozaj chcete natrvalo ZMAZAŤ ÚPLNE VŠETKY otázky z databázy?')) return;
        if (!window.confirm('Ste si absolútne istý? Túto akciu nie je možné vrátiť späť!')) return;

        // Supabase requires a filter for deletes on all rows, mapping an always true condition
        const { error } = await supabase.from('questions').delete().gte('difficulty', 0);
        if (!error) {
            setQuestions([]);
            fetchStats();
            alert('Všetky otázky boli úspešne vymazané.');
        } else {
            alert('Chyba pri mazaní všetkých otázok: ' + error.message);
        }
    };
    // --------------------------

    return (
        <div className="game-container lobby admin-panel" style={{ overflowY: 'auto', padding: '2rem' }}>
            <div className="lobby-header" style={{ marginBottom: '2rem' }}>
                <h1>Administrácia</h1>
                <button className="secondary" onClick={onBack}>Späť do Lobby</button>
            </div>

            <div className="admin-grid">
                {/* Sidebar Stats */}
                <div className="admin-sidebar lobby-panel">
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
                <div className="admin-main lobby-panel">
                    <div className="tab-buttons">
                        <button className={`secondary ${activeTab === 'list' ? 'active' : ''}`} onClick={() => setActiveTab('list')}>Zoznam</button>
                        <button className={`secondary ${activeTab === 'add' ? 'active' : ''}`} onClick={() => setActiveTab('add')}>Manuálne</button>
                        <button className={`secondary ${activeTab === 'generate' ? 'active' : ''}`} onClick={() => setActiveTab('generate')}>AI Generátor</button>
                    </div>

                    {activeTab === 'list' && (
                        <>
                            <div className="admin-search-row">
                                <div className="form-group search-input">
                                    <input
                                        type="text"
                                        placeholder="Hľadať..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && fetchQuestions()}
                                    />
                                </div>
                                <button className="danger delete-all-btn" onClick={handleDeleteAllQuestions}>
                                    🗑️ Zmazať všetko
                                </button>
                            </div>
                            <div className="admin-table-wrapper">
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>Otázka</th>
                                            <th>Odpoveď</th>
                                            <th className="hide-mobile">Kat.</th>
                                            <th className="hide-mobile">Úroveň</th>
                                            <th style={{ textAlign: 'center' }}>Akcie</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {questions.map(q => (
                                            <tr key={q.id}>
                                                <td className="q-text">{q.question_text}</td>
                                                <td className="q-answer">{q.answer}</td>
                                                <td className="q-cat hide-mobile">{q.category}</td>
                                                <td className="q-diff hide-mobile">{q.difficulty}</td>
                                                <td className="q-actions">
                                                    <button
                                                        onClick={() => handleDeleteQuestion(q.id)}
                                                        className="delete-btn"
                                                        title="Vymazať"
                                                    >
                                                        ❌
                                                    </button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {loading && <div className="loading-spinner">Načítavam...</div>}
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
                            <div className="form-row">
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

                                    <div className="category-container">
                                        {PREDEFINED_CAT.map(cat => {
                                            const isSelected = genCategories.includes(cat);
                                            return (
                                                <button
                                                    key={cat}
                                                    type="button"
                                                    onClick={() => toggleGenCategory(cat)}
                                                    className={`category-chip ${isSelected ? 'selected' : ''}`}
                                                    style={{
                                                        background: isSelected ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.05)',
                                                        color: isSelected ? '#38bdf8' : '#94a3b8',
                                                        border: `1px solid ${isSelected ? '#38bdf8' : 'rgba(255,255,255,0.1)'}`,
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

                                <div className="form-row">
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
                                                    temperature: 0.3,
                                                    messages: [
                                                        {
                                                            role: "system",
                                                            content: `Si ELITNÝ autor kvízových otázok pre slovenskú súťaž. Tvojou úlohou je vygenerovať otázky, ktoré sú 100% FAKTICKY SPRÁVNE, JEDNOZNAČNÉ a STRUČNÉ.

                                                            STRIKTNÉ PRAVIDLÁ PRE KVALITU:
                                                            1. ŽIADNA HALUCINÁCIA: Ak si nie si 100% istý faktom (najmä pri CZ/SK scéne), radšej danú otázku NEGENERUJ a skús inú tému.
                                                            2. JEDNOZNAČNOSŤ: Otázka musí mať presne JEDNU nespochybniteľnú odpoveď. Vyhni sa otázkam typu "Kto bol prvý...", ak existujú viaceré interpretácie.
                                                            3. ULTRA-STRUČNOSŤ (Max 8-10 slov): Otázka musí byť prečítateľná za 3 sekundy. Priamočiare vety.
                                                            4. ŠPECIFIKÁ KATEGÓRIÍ:
                                                               - Streameri a YouTuberi: VÝHRADNE CZ/SK scéna. Zameraj sa na overené fakty, ikonické mená a hlášky (napr. 'Kto založil projekt Madmonq?', 'Ktorý streamer je známy ako Kráľ českej YouTube scény?'). 
                                                               - Slovensko: Geografia, história, osobnosti (napr. 'Ktorá rieka preteká Piešťanmi?', 'V ktorom roku vznikla SR?').
                                                               - Ostatné: Používaj všeobecne známy prehľad (nie akademické detaily).
                                                            5. ODPOVEDE: Musia byť presné, 1-2 slová.
                                                            6. FORMÁT: Striktne vráť JSON objekt, ktorý obasuje kľúč **"questions"**. Tento kľúč bude obsahovať pole objektov s kľúčmi 'question_text', 'answer', 'category'. Nikdy nevracaj iba jeden objekt, vždy pole vo vnútri "questions".`
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

                                            let questionsList = [];
                                            if (result.questions && Array.isArray(result.questions)) {
                                                questionsList = result.questions;
                                            } else if (Array.isArray(result)) {
                                                questionsList = result;
                                            } else if (result.question_text) {
                                                // Handle case where GPT rogue-returns a single object instead of an array
                                                questionsList = [result];
                                            }

                                            if (questionsList.length > 0) {
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
