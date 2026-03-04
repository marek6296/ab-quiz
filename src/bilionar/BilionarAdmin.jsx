import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export const BilionarAdmin = ({ onBack }) => {
    const [questions, setQuestions] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loadingStatus, setLoadingStatus] = useState('');
    const [stats, setStats] = useState({ total: 0, byCategory: {} });
    const [searchTerm, setSearchTerm] = useState(() => localStorage.getItem('b_admin_search') || '');
    const [filterCategory, setFilterCategory] = useState(() => localStorage.getItem('b_admin_cat') || '');
    const [filterDifficulty, setFilterDifficulty] = useState(() => localStorage.getItem('b_admin_diff') || '');
    const [activeTab, setActiveTab] = useState(() => localStorage.getItem('b_admin_tab') || 'list');
    const [allCats, setAllCats] = useState([]);
    const [selectedIds, setSelectedIds] = useState([]);

    const [editingId, setEditingId] = useState(null);
    const [editFormData, setEditFormData] = useState({});

    const [genCategories, setGenCategories] = useState([]);
    const [customCat, setCustomCat] = useState('');

    const PREDEFINED_CAT = [
        'Slovensko', 'Hry', 'Geografia', 'História', 'Šport', 'Veda a Technika',
        'Kultúra a Umenie', 'Príroda', 'Slovenský jazyk', 'Literatúra',
        'Filmy a Seriály', 'Hudba', 'Logika a Hádanky', 'Všeobecný prehľad'
    ];

    const toggleGenCategory = (cat) => {
        setGenCategories(prev =>
            prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
        );
    };

    const emptyQuestion = {
        question_text: '',
        option_a: '',
        option_b: '',
        option_c: '',
        option_d: '',
        correct_answer: 'A',
        category: '',
        difficulty: 1
    };
    const [newQuestion, setNewQuestion] = useState(emptyQuestion);

    useEffect(() => {
        fetchStats();
        fetchQuestions();
    }, []);

    useEffect(() => {
        localStorage.setItem('b_admin_tab', activeTab);
    }, [activeTab]);

    useEffect(() => {
        localStorage.setItem('b_admin_cat', filterCategory);
        localStorage.setItem('b_admin_diff', filterDifficulty);
        localStorage.setItem('b_admin_search', searchTerm);
    }, [filterCategory, filterDifficulty, searchTerm]);

    useEffect(() => {
        fetchQuestions();
    }, [filterCategory, filterDifficulty]);

    const fetchStats = async () => {
        let allData = [];
        let r_from = 0;
        let r_to = 999;
        let fetchMore = true;

        while (fetchMore) {
            const { data, error } = await supabase
                .from('bilionar_questions')
                .select('category, difficulty')
                .range(r_from, r_to);

            if (error) {
                console.error("Stats fetch error:", error);
                break;
            }

            if (data && data.length > 0) {
                allData = [...allData, ...data];
                if (data.length < 1000) {
                    fetchMore = false;
                } else {
                    r_from += 1000;
                    r_to += 1000;
                }
            } else {
                fetchMore = false;
            }
        }

        if (allData.length > 0) {
            const statsObj = allData.reduce((acc, q) => {
                const cat = (q.category || '').trim();
                if (!cat) return acc;
                const diff = q.difficulty || 1;
                if (!acc[cat]) acc[cat] = { total: 0, 1: 0, 2: 0, 3: 0 };
                acc[cat].total += 1;
                if (acc[cat][diff] !== undefined) acc[cat][diff] += 1;
                return acc;
            }, {});
            setStats({ total: allData.length, byCategory: statsObj });
            setAllCats(Object.keys(statsObj).sort());
        } else {
            setStats({ total: 0, byCategory: {} });
            setAllCats([]);
        }
    };

    const fetchQuestions = async () => {
        setLoading(true);
        setQuestions([]);
        setSelectedIds([]);
        let query = supabase.from('bilionar_questions').select('*').order('created_at', { ascending: false }).range(0, 100);

        if (searchTerm) query = query.ilike('question_text', `%${searchTerm}%`);
        if (filterCategory) query = query.eq('category', filterCategory);
        if (filterDifficulty) query = query.eq('difficulty', parseInt(filterDifficulty));

        const { data, error } = await query;
        if (error) console.error("Questions fetch error:", error);
        else setQuestions(data || []);
        setLoading(false);
    };

    const handleSelectToggle = (id) => {
        setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const handleSelectAllToggle = () => {
        if (selectedIds.length === questions.length && questions.length > 0) {
            setSelectedIds([]);
        } else {
            setSelectedIds(questions.map(q => q.id));
        }
    };

    const handleDeleteSelected = async () => {
        if (selectedIds.length === 0) return;
        if (!window.confirm(`Naozaj chcete vymazať ${selectedIds.length} vybraných otázok?`)) return;

        const { error } = await supabase.from('bilionar_questions').delete().in('id', selectedIds);
        if (!error) {
            setSelectedIds([]);
            fetchQuestions();
            fetchStats();
        } else alert('Chyba: ' + error.message);
    };

    const handleAddQuestion = async (e) => {
        e.preventDefault();
        const { error } = await supabase.from('bilionar_questions').insert([newQuestion]);
        if (!error) {
            setNewQuestion(emptyQuestion);
            fetchQuestions();
            fetchStats();
            alert('Otázka pridaná!');
        } else alert('Chyba: ' + error.message);
    };

    const handleUpdateQuestion = async (id) => {
        const { error } = await supabase.from('bilionar_questions').update(editFormData).eq('id', id);
        if (!error) {
            setEditingId(null);
            fetchQuestions();
            fetchStats();
        } else alert('Chyba pri aktualizácii: ' + error.message);
    };

    const startEditing = (q) => {
        setEditingId(q.id);
        const { created_at, updated_at, ...updateData } = q;
        setEditFormData(updateData);
    };

    const handleDeleteQuestion = async (id) => {
        if (!window.confirm('Istotne zmazať otázku?')) return;
        await supabase.from('bilionar_questions').delete().eq('id', id);
        fetchQuestions();
        fetchStats();
    };

    return (
        <div className="game-container lobby admin-panel" style={{ overflowY: 'auto', height: '100vh', padding: '2rem' }}>
            <div className="lobby-header">
                <h1>Bilionár Administrácia</h1>
                <button className="secondary" onClick={onBack}>Späť</button>
            </div>

            <div className="admin-grid" style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: '2rem' }}>
                <div className="admin-sidebar lobby-panel">
                    <h3>Štatistiky</h3>
                    <div className="admin-stats-total">Celkom: <strong>{stats.total}</strong></div>
                    <div className="admin-stats-list" style={{ maxHeight: '600px', overflowY: 'auto', marginTop: '1rem' }}>
                        {Object.entries(stats.byCategory).sort((a, b) => b[1].total - a[1].total).map(([cat, counts]) => (
                            <div key={cat} style={{ display: 'flex', flexDirection: 'column', marginBottom: '1rem', background: 'rgba(255,255,255,0.05)', padding: '0.8rem', borderRadius: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                    <strong style={{ color: '#facc15' }}>{cat}</strong>
                                    <span style={{ fontWeight: 'bold' }}>{counts.total}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#94a3b8' }}>
                                    <span>🟢 {counts[1]}</span>
                                    <span>🟡 {counts[2]}</span>
                                    <span>🔴 {counts[3]}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                <div className="admin-main lobby-panel">
                    <div className="tab-buttons" style={{ display: 'flex', gap: '1rem', marginBottom: '2rem' }}>
                        <button className={`secondary ${activeTab === 'list' ? 'active' : ''}`} onClick={() => setActiveTab('list')}>Zoznam</button>
                        <button className={`secondary ${activeTab === 'add' ? 'active' : ''}`} onClick={() => setActiveTab('add')}>Manuálne</button>
                        <button className={`secondary ${activeTab === 'generate' ? 'active' : ''}`} onClick={() => setActiveTab('generate')} style={{ background: activeTab === 'generate' ? 'rgba(250, 204, 21, 0.2)' : '' }}>✨ AI Generátor</button>
                    </div>

                    {activeTab === 'add' && (
                        <form onSubmit={handleAddQuestion} className="auth-form" style={{ maxWidth: '600px', background: 'rgba(0,0,0,0.2)', padding: '2rem', borderRadius: '12px' }}>
                            <div className="form-group" style={{ marginBottom: '1rem' }}>
                                <label>Text otázky</label>
                                <textarea value={newQuestion.question_text} onChange={e => setNewQuestion({ ...newQuestion, question_text: e.target.value })} required style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', minHeight: '80px', background: 'rgba(255,255,255,0.1)', color: 'white' }} />
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                <div><label>Možnosť A</label><input type="text" value={newQuestion.option_a} onChange={e => setNewQuestion({ ...newQuestion, option_a: e.target.value })} required /></div>
                                <div><label>Možnosť B</label><input type="text" value={newQuestion.option_b} onChange={e => setNewQuestion({ ...newQuestion, option_b: e.target.value })} required /></div>
                                <div><label>Možnosť C</label><input type="text" value={newQuestion.option_c} onChange={e => setNewQuestion({ ...newQuestion, option_c: e.target.value })} required /></div>
                                <div><label>Možnosť D</label><input type="text" value={newQuestion.option_d} onChange={e => setNewQuestion({ ...newQuestion, option_d: e.target.value })} required /></div>
                            </div>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
                                <div>
                                    <label>Správna Odpoveď</label>
                                    <select value={newQuestion.correct_answer} onChange={e => setNewQuestion({ ...newQuestion, correct_answer: e.target.value })} style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', background: 'rgba(0,0,0,0.5)', color: 'white' }}>
                                        <option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option>
                                    </select>
                                </div>
                                <div>
                                    <label>Náročnosť</label>
                                    <select value={newQuestion.difficulty} onChange={e => setNewQuestion({ ...newQuestion, difficulty: parseInt(e.target.value) })} style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', background: 'rgba(0,0,0,0.5)', color: 'white' }}>
                                        <option value={1}>1 - Ľahká</option><option value={2}>2 - Stredná</option><option value={3}>3 - Ťažká</option>
                                    </select>
                                </div>
                                <div>
                                    <label>Kategória</label>
                                    <input type="text" value={newQuestion.category} onChange={e => setNewQuestion({ ...newQuestion, category: e.target.value })} required placeholder="napr. História" />
                                </div>
                            </div>
                            <button type="submit" className="primary" style={{ width: '100%', padding: '1rem', fontSize: '1.2rem' }}>Pridať Question</button>
                        </form>
                    )}

                    {activeTab === 'generate' && (
                        <div style={{ padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '12px' }}>
                            <h3 style={{ marginBottom: '1rem', color: '#facc15' }}>AI Generátor Otázok pre Bilionár Battle</h3>
                            <p style={{ color: '#94a3b8', marginBottom: '2rem' }}>Generuje 4-možnostné otázky s jednou správnou odpoveďou pomocou GPT-4.</p>

                            <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                                <label style={{ display: 'block', marginBottom: '0.8rem' }}>Kategórie</label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    {PREDEFINED_CAT.map(cat => (
                                        <button key={cat} onClick={() => toggleGenCategory(cat)} className={`category-chip ${genCategories.includes(cat) ? 'selected' : ''}`} style={{ background: genCategories.includes(cat) ? 'rgba(250, 204, 21, 0.2)' : 'rgba(255,255,255,0.05)', color: genCategories.includes(cat) ? '#facc15' : '#94a3b8', border: `1px solid ${genCategories.includes(cat) ? '#facc15' : 'rgba(255,255,255,0.1)'}`, padding: '0.5rem 1rem', borderRadius: '30px', cursor: 'pointer' }}>
                                            {cat}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div><label>Počet (1-30)</label><input type="number" id="gen_count" defaultValue={10} min={1} max={30} style={{ width: '100%' }} /></div>
                                <div>
                                    <label>Obtiažnosť</label>
                                    <select id="gen_diff" style={{ width: '100%', padding: '0.8rem', borderRadius: '8px', background: 'rgba(0,0,0,0.5)', color: 'white' }}>
                                        <option value={1}>1 - Ľahká (Základ)</option>
                                        <option value={2}>2 - Stredná (Väčšina)</option>
                                        <option value={3}>3 - Ťažká (Experti)</option>
                                    </select>
                                </div>
                            </div>

                            <button
                                className="primary"
                                onClick={async (e) => {
                                    e.preventDefault();
                                    const finalCategories = [...genCategories];
                                    const count = parseInt(document.getElementById('gen_count').value);
                                    const diff = parseInt(document.getElementById('gen_diff').value);
                                    const apiKey = import.meta.env.VITE_OPENAI_API_KEY;

                                    if (finalCategories.length === 0) return alert('Vyber aspoň jednu kategóriu!');
                                    if (!apiKey) return alert('Chýba OpenAI API Kľúč');

                                    setLoading(true);
                                    try {
                                        let totalInserted = 0;
                                        for (let i = 0; i < finalCategories.length; i++) {
                                            const cat = finalCategories[i];
                                            setLoadingStatus(`Generujem: ${cat}...`);

                                            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                                                method: 'POST',
                                                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
                                                body: JSON.stringify({
                                                    model: "gpt-4o",
                                                    temperature: 0.7,
                                                    messages: [
                                                        {
                                                            role: "system",
                                                            content: `Si profesionálny tvorca otázok pre vedomostnú šou typu 'Milionár'.
Generuješ len JSON vo formáte: {"questions": [{"question_text": "...", "option_a": "...", "option_b": "...", "option_c": "...", "option_d": "...", "correct_answer": "A|B|C|D", "category": "..."}]}
Pravidlá:
1. Otázky musia byť zaujímavé, jednoznačné a 100% fakty.
2. Na rozdiel od prvej hry, kedy bola odpoveď priama, toto je multiple-choice forma. Správna odpoveď musí byť v always valid "A", "B", "C", alebo "D", a reálny text musí byť vyplnený v option_X.
3. Nesmie to byť triviálne rozoznateľné len z formátu, zmešaj pozíciu správnej odpovede (nesmie byť vždy A).
4. Možnosti by mali byť rovnako dlhé a relevantné.`
                                                        },
                                                        {
                                                            role: "user",
                                                            content: `Vygeneruj presne ${count} otázok pre tému "${cat}" s náročnosťou úrovne ${diff} (1=ľahké, 2=stredné, 3=ťažké).`
                                                        }
                                                    ],
                                                    response_format: { type: "json_object" }
                                                })
                                            });

                                            if (!response.ok) throw new Error("Chyba API");
                                            const rawData = await response.json();
                                            const result = JSON.parse(rawData.choices[0].message.content);
                                            const qs = result.questions || [];

                                            const toInsert = qs.map(q => ({
                                                question_text: q.question_text,
                                                option_a: String(q.option_a),
                                                option_b: String(q.option_b),
                                                option_c: String(q.option_c),
                                                option_d: String(q.option_d),
                                                correct_answer: String(q.correct_answer).toUpperCase().match(/^[ABCD]$/) ? String(q.correct_answer).toUpperCase() : 'A',
                                                category: cat,
                                                difficulty: diff
                                            })).filter(q => q.question_text);

                                            if (toInsert.length > 0) {
                                                await supabase.from('bilionar_questions').insert(toInsert);
                                                totalInserted += toInsert.length;
                                            }
                                        }

                                        alert(`Úspešne pridaných ${totalInserted} otázok!`);
                                        fetchStats();
                                        fetchQuestions();
                                    } catch (err) {
                                        alert("Chyba: " + err.message);
                                    } finally {
                                        setLoading(false);
                                        setLoadingStatus('');
                                    }
                                }}
                                disabled={loading}
                                style={{ width: '100%', marginTop: '2rem', padding: '1.2rem', fontSize: '1.2rem', background: '#facc15', color: '#0f172a' }}
                            >
                                {loading ? loadingStatus : '✨ Generovať otázky'}
                            </button>
                        </div>
                    )}

                    {activeTab === 'list' && (
                        <div style={{ background: 'rgba(0,0,0,0.2)', padding: '1.5rem', borderRadius: '12px' }}>
                            <div style={{ display: 'flex', gap: '1rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
                                <input type="text" placeholder="Hľadať otázku..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} onKeyDown={e => e.key === 'Enter' && fetchQuestions()} style={{ flex: 1, padding: '0.8rem', borderRadius: '8px' }} />
                                <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ padding: '0.8rem', borderRadius: '8px' }}>
                                    <option value="">Všetky kat.</option>
                                    {allCats.map(c => <option key={c} value={c}>{c}</option>)}
                                </select>
                                <select value={filterDifficulty} onChange={e => setFilterDifficulty(e.target.value)} style={{ padding: '0.8rem', borderRadius: '8px' }}>
                                    <option value="">Všetky obt.</option>
                                    <option value="1">1</option><option value="2">2</option><option value="3">3</option>
                                </select>
                            </div>

                            {selectedIds.length > 0 && <button className="danger" onClick={handleDeleteSelected} style={{ marginBottom: '1rem' }}>🗑️ Zmazať {selectedIds.length} vybraných</button>}

                            <table className="admin-table" style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: 'rgba(255,255,255,0.05)' }}>
                                        <th style={{ padding: '0.8rem', width: '40px' }}><input type="checkbox" checked={selectedIds.length === questions.length && questions.length > 0} onChange={handleSelectAllToggle} /></th>
                                        <th style={{ padding: '0.8rem' }}>Otázka</th>
                                        <th style={{ padding: '0.8rem' }}>Možnosti</th>
                                        <th style={{ padding: '0.8rem', textAlign: 'center' }}>Akcie</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {questions.map(q => (
                                        <tr key={q.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', background: selectedIds.includes(q.id) ? 'rgba(250, 204, 21, 0.1)' : 'transparent' }}>
                                            <td style={{ padding: '0.8rem', textAlign: 'center' }}><input type="checkbox" checked={selectedIds.includes(q.id)} onChange={() => handleSelectToggle(q.id)} /></td>

                                            {editingId === q.id ? (
                                                <td colSpan="3" style={{ padding: '1rem' }}>
                                                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                                        <textarea value={editFormData.question_text} onChange={e => setEditFormData({ ...editFormData, question_text: e.target.value })} style={{ width: '100%', minHeight: '60px' }} />
                                                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                            <input type="text" value={editFormData.option_a} onChange={e => setEditFormData({ ...editFormData, option_a: e.target.value })} style={{ flex: 1 }} />
                                                            <input type="text" value={editFormData.option_b} onChange={e => setEditFormData({ ...editFormData, option_b: e.target.value })} style={{ flex: 1 }} />
                                                            <input type="text" value={editFormData.option_c} onChange={e => setEditFormData({ ...editFormData, option_c: e.target.value })} style={{ flex: 1 }} />
                                                            <input type="text" value={editFormData.option_d} onChange={e => setEditFormData({ ...editFormData, option_d: e.target.value })} style={{ flex: 1 }} />
                                                            <select value={editFormData.correct_answer} onChange={e => setEditFormData({ ...editFormData, correct_answer: e.target.value })}>
                                                                <option value="A">A</option><option value="B">B</option><option value="C">C</option><option value="D">D</option>
                                                            </select>
                                                        </div>
                                                        <div style={{ display: 'flex', gap: '1rem' }}>
                                                            <button onClick={() => handleUpdateQuestion(q.id)} className="primary">Uložiť</button>
                                                            <button onClick={() => setEditingId(null)} className="neutral">Zrušiť</button>
                                                        </div>
                                                    </div>
                                                </td>
                                            ) : (
                                                <>
                                                    <td style={{ padding: '0.8rem' }}>
                                                        <strong>{q.question_text}</strong>
                                                        <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '4px' }}>{q.category} • Diff: {q.difficulty}</div>
                                                    </td>
                                                    <td style={{ padding: '0.8rem', fontSize: '0.9rem' }}>
                                                        <div style={{ color: q.correct_answer === 'A' ? '#4ade80' : '#cbd5e1' }}>A: {q.option_a}</div>
                                                        <div style={{ color: q.correct_answer === 'B' ? '#4ade80' : '#cbd5e1' }}>B: {q.option_b}</div>
                                                        <div style={{ color: q.correct_answer === 'C' ? '#4ade80' : '#cbd5e1' }}>C: {q.option_c}</div>
                                                        <div style={{ color: q.correct_answer === 'D' ? '#4ade80' : '#cbd5e1' }}>D: {q.option_d}</div>
                                                    </td>
                                                    <td style={{ padding: '0.8rem', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                                        <button onClick={() => startEditing(q)} className="neutral" style={{ padding: '0.4rem', marginRight: '0.5rem' }}>✏️</button>
                                                        <button onClick={() => handleDeleteQuestion(q.id)} className="danger" style={{ padding: '0.4rem' }}>🗑️</button>
                                                    </td>
                                                </>
                                            )}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                            {loading && <div style={{ textAlign: 'center', margin: '2rem 0' }}>Načítavam...</div>}
                        </div>
                    )}
                </div>
            </div>

            {(loading) && loadingStatus && (
                <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.8)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                    <div className="loader" style={{ border: '4px solid #f3f3f3', borderTop: '4px solid #facc15', borderRadius: '50%', width: '60px', height: '60px', animation: 'spin 1s linear infinite' }} />
                    <p style={{ marginTop: '20px', fontSize: '1.2rem', color: '#facc15' }}>{loadingStatus}</p>
                </div>
            )}
        </div>
    );
};
