import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export const Admin = ({ onBack }) => {
    const [questions, setQuestions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingStatus, setLoadingStatus] = useState('');
    const [stats, setStats] = useState({ total: 0, byCategory: {} });
    const [searchTerm, setSearchTerm] = useState('');
    const [filterCategory, setFilterCategory] = useState('');
    const [activeTab, setActiveTab] = useState('list');

    // Edit State
    const [editingId, setEditingId] = useState(null);
    const [editFormData, setEditFormData] = useState({});

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
        let query = supabase.from('questions').select('*').order('created_at', { ascending: false }).limit(100);

        if (searchTerm) {
            query = query.ilike('question_text', `%${searchTerm}%`);
        }

        if (filterCategory) {
            query = query.eq('category', filterCategory);
        }

        const { data, error } = await query;
        if (data) setQuestions(data);
        setLoading(false);
    };

    useEffect(() => {
        fetchQuestions();
    }, [filterCategory]);

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

    const handleUpdateQuestion = async (id) => {
        const { error } = await supabase
            .from('questions')
            .update({
                question_text: editFormData.question_text,
                answer: editFormData.answer,
                category: editFormData.category,
                difficulty: editFormData.difficulty
            })
            .eq('id', id);

        if (!error) {
            setEditingId(null);
            fetchQuestions();
            fetchStats();
        } else {
            alert('Chyba pri aktualizácii: ' + error.message);
        }
    };

    const startEditing = (q) => {
        setEditingId(q.id);
        setEditFormData({ ...q });
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
        <div className="game-container lobby admin-panel">
            <div className="lobby-header">
                <h1>Administrácia</h1>
                <button className="secondary" onClick={onBack}>Späť do Lobby</button>
            </div>

            <div className="admin-grid">
                {/* Sidebar Stats */}
                <div className="admin-sidebar lobby-panel">
                    <h3>Štatistiky</h3>
                    <div className="admin-stats-total">
                        Celkom: <strong>{stats.total}</strong>
                    </div>
                    <div className="admin-stats-list">
                        {Object.entries(stats.byCategory).sort((a, b) => b[1] - a[1]).map(([cat, count]) => (
                            <div key={cat} className="admin-stat-row">
                                <span className="stat-cat">{cat}</span>
                                <span className="stat-count">{count}</span>
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
                                        placeholder="Hľadať otázku..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && fetchQuestions()}
                                    />
                                </div>
                                <div className="form-group" style={{ flex: 1 }}>
                                    <select
                                        value={filterCategory}
                                        onChange={(e) => setFilterCategory(e.target.value)}
                                        style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '0.8rem', borderRadius: '8px', width: '100%' }}
                                    >
                                        <option value="">Všetky kategórie</option>
                                        {Object.keys(stats.byCategory).sort().map(cat => (
                                            <option key={cat} value={cat}>{cat} ({stats.byCategory[cat]})</option>
                                        ))}
                                    </select>
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
                                                {editingId === q.id ? (
                                                    <>
                                                        <td>
                                                            <textarea
                                                                className="edit-input"
                                                                value={editFormData.question_text}
                                                                onChange={e => setEditFormData({ ...editFormData, question_text: e.target.value })}
                                                                style={{ width: '100%', minHeight: '60px', background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid #38bdf8', padding: '0.5rem', borderRadius: '4px' }}
                                                            />
                                                        </td>
                                                        <td>
                                                            <input
                                                                className="edit-input"
                                                                value={editFormData.answer}
                                                                onChange={e => setEditFormData({ ...editFormData, answer: e.target.value })}
                                                                style={{ width: '100%', background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid #38bdf8', padding: '0.5rem', borderRadius: '4px' }}
                                                            />
                                                        </td>
                                                        <td className="hide-mobile">
                                                            <input
                                                                className="edit-input"
                                                                value={editFormData.category}
                                                                onChange={e => setEditFormData({ ...editFormData, category: e.target.value })}
                                                                style={{ width: '100%', background: 'rgba(0,0,0,0.5)', color: 'white', border: '1px solid #38bdf8', padding: '0.5rem', borderRadius: '4px' }}
                                                            />
                                                        </td>
                                                        <td className="hide-mobile">
                                                            <select
                                                                value={editFormData.difficulty}
                                                                onChange={e => setEditFormData({ ...editFormData, difficulty: parseInt(e.target.value) })}
                                                                style={{ background: '#1e293b', color: 'white', padding: '0.5rem', borderRadius: '4px', border: '1px solid #38bdf8' }}
                                                            >
                                                                <option value={1}>1</option>
                                                                <option value={2}>2</option>
                                                                <option value={3}>3</option>
                                                            </select>
                                                        </td>
                                                        <td className="q-actions" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                                            <button onClick={() => handleUpdateQuestion(q.id)} className="secondary" style={{ padding: '0.4rem', fontSize: '1rem' }} title="Uložiť">✅</button>
                                                            <button onClick={() => setEditingId(null)} className="neutral" style={{ padding: '0.4rem', fontSize: '1rem' }} title="Zrušiť">❌</button>
                                                        </td>
                                                    </>
                                                ) : (
                                                    <>
                                                        <td className="q-text">{q.question_text}</td>
                                                        <td className="q-answer">{q.answer}</td>
                                                        <td className="q-cat hide-mobile">{q.category}</td>
                                                        <td className="q-diff hide-mobile">{q.difficulty}</td>
                                                        <td className="q-actions" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                                            <button
                                                                onClick={() => startEditing(q)}
                                                                className="neutral"
                                                                style={{ padding: '0.4rem', fontSize: '1rem', background: 'rgba(255,255,255,0.05)' }}
                                                                title="Upraviť"
                                                            >
                                                                ✏️
                                                            </button>
                                                            <button
                                                                onClick={() => handleDeleteQuestion(q.id)}
                                                                className="delete-btn"
                                                                style={{ padding: '0.4rem', fontSize: '1rem' }}
                                                                title="Vymazať"
                                                            >
                                                                🗑️
                                                            </button>
                                                        </td>
                                                    </>
                                                )}
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
                                        <label>Počet otázok NA KATEGÓRIU (1-50)</label>
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
                                        let diffDesc = "ĽAHKÁ (Základné, všeobecne známe fakty pre bežného konzumenta.)";
                                        if (diff === 2) diffDesc = "STREDNÁ (Špecifickejšie fakty, ktoré pozná priemerný fanúšik.)";
                                        if (diff === 3) diffDesc = "ŤAŽKÁ (Veľmi ojedinelé detaily, roky, mená začiatočných postáv. Pre expertov.)";
                                        const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

                                        if (finalCategories.length === 0) return alert('Vyber aspoň jednu kategóriu!');
                                        if (!apiKey) return alert('Chýba VITE_OPENAI_API_KEY v premenných Vercelu!');

                                        setLoading(true);
                                        try {
                                            let totalInserted = 0;

                                            // Iterate sequentially over each category
                                            for (let i = 0; i < finalCategories.length; i++) {
                                                const cat = finalCategories[i];
                                                setLoadingStatus(`Generujem tému: ${cat} (${i + 1}/${finalCategories.length})...`);

                                                // Fetch only a small subset of existing questions to avoid hitting tokens/context limits
                                                const { data: existingData } = await supabase
                                                    .from('questions')
                                                    .select('question_text')
                                                    .eq('category', cat)
                                                    .limit(30);

                                                const avoidList = existingData?.length > 0
                                                    ? `\nTIETO OTÁZKY UŽ MÁME (NEOPAKOVAŤ): ${existingData.map(q => q.question_text).join(' | ')}`
                                                    : "";

                                                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                                                    method: 'POST',
                                                    headers: {
                                                        'Content-Type': 'application/json',
                                                        'Authorization': `Bearer ${apiKey}`
                                                    },
                                                    body: JSON.stringify({
                                                        model: "gpt-4o",
                                                        temperature: 0.4, // Lower temperature for more factual and less random content
                                                        messages: [
                                                            {
                                                                role: "system",
                                                                content: `Si PROFESIONÁLNY autor kvízových otázok pre slovenskú obdobu AZ-KVÍZu. Tvojou úlohou je tvoriť otázky vysokej kvality, ktoré sú JEDNOZNÁČNÉ a majú IBA JEDNU možnú odpoveď.

    STRIKTNÉ KRITÉRIÁ:
    1. KONTEXT V OTÁZKE: Otázka musí obsahovať dostatok informácií, aby bola odpoveď unikátna. (Zlé: 'V ktorom meste je hrad?', Dobré: 'V ktorom slovenskom meste na sútoku Váhu a Nitry stojí protiturecká pevnosť?')
    2. JEDNOZNAČNOSŤ: Vyhni sa všeobecným názvom. Ak sa pýtaš na album '1989', musíš špecifikovať speváčku (Taylor Swift) ALEBO ak sa pýtaš na Taylor Swift, musíš uviesť špecifický rekord/fakt, ktorý ju odlišuje.
    3. SLOVENSKÉ ŠPECIFIKÁ:
       - 'Slovensko': Zameraj sa na unikátne geografické a historické fakty (najvyššie, najstaršie, jediné).
       - 'Streameri a YouTuberi': Používaj výhradne CZ/SK mená a špecifické projekty (napr. Madmonq, RealGeek, mená ich psov, legendárne herné série).
       - 'Logika a Hádanky': Odpoveď musí byť hmotný predmet alebo zvieratko, jedno slovo.
    4. JAZYK: Používaj spisovnú slovenčinu a profesionálnu formuláciu.
    5. FORMÁT: Vždy vráť JSON s kľúčom "questions". Každý objekt má kľúče: question_text, answer, category.`
                                                            },
                                                            {
                                                                role: "user",
                                                                content: `Vygeneruj PRESNE ${count} unikátnych otázok výhradne pre tému: ${cat}. Požadovaná náročnosť: ${diffDesc}. ${avoidList}`
                                                            }
                                                        ],
                                                        response_format: { type: "json_object" }
                                                    })
                                                });

                                                if (!response.ok) {
                                                    const errData = await response.json().catch(() => ({}));
                                                    throw new Error(errData.error?.message || `HTTP ${response.status}`);
                                                }

                                                const rawData = await response.json();
                                                if (!rawData.choices?.[0]?.message?.content) {
                                                    throw new Error(`AI nevrátila žiadny obsah pre ${cat}.`);
                                                }

                                                const result = JSON.parse(rawData.choices[0].message.content);
                                                let questionsList = result.questions || (Array.isArray(result) ? result : []);

                                                if (questionsList.length > 0) {
                                                    // Validate and normalize
                                                    const toInsert = questionsList.map(q => ({
                                                        question_text: q.question_text || q.text,
                                                        answer: String(q.answer).trim(),
                                                        category: cat, // Force correct category
                                                        difficulty: diff
                                                    })).filter(q => q.question_text && q.answer); // Basic sanitization

                                                    if (toInsert.length > 0) {
                                                        const { error } = await supabase.from('questions').insert(toInsert);
                                                        if (error) throw error;
                                                        totalInserted += toInsert.length;
                                                    }
                                                } else {
                                                    console.warn(`Skrze logiku AI bol vrátený prázdny JSON pre tému ${cat}. Preskakujem.`);
                                                }
                                            }

                                            alert(`🎉 Úspešne pridaných ${totalInserted} otázok!`);
                                            setGenCategories([]);
                                            setCustomCat('');
                                            fetchStats();
                                            fetchQuestions();
                                        } catch (err) {
                                            console.error("Generator Error:", err);
                                            alert("⚠ Chyba AI: " + err.message);
                                        } finally {
                                            setLoading(false);
                                            setLoadingStatus('');
                                        }
                                    }}
                                    disabled={loading}
                                    style={{ width: '100%', marginTop: '2rem', fontSize: '1.2rem', padding: loading ? '1.2rem' : '1.5rem', opacity: loading ? 0.9 : 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.6rem', transition: 'all 0.3s ease' }}
                                >
                                    {loading ? (
                                        <>
                                            <div className="loader" style={{ width: '28px', height: '28px', border: '3px solid rgba(255,255,255,0.2)', borderTop: '3px solid white', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                                            <span style={{ fontSize: '1rem', fontWeight: 'bold' }}>{loadingStatus || 'Inicializujem...'}</span>
                                        </>
                                    ) : '✨ Generovať s AI'}
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
