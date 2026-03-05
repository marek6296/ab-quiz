import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export const HigherLowerAdmin = ({ onBack }) => {
    const [categories, setCategories] = useState([]);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState(() => localStorage.getItem('hl_admin_tab') || 'items');

    // Filters
    const [filterCategory, setFilterCategory] = useState('');
    const [filterDifficulty, setFilterDifficulty] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    // Edit state
    const [editingItemId, setEditingItemId] = useState(null);
    const [editItemData, setEditItemData] = useState({});

    // Add item form
    const [newItem, setNewItem] = useState({ name: '', value: '', image: '', category_id: '', difficulty: 1 });

    // AI Generator state
    const [selectedGenCats, setSelectedGenCats] = useState([]);
    const [aiCount, setAiCount] = useState(10);
    const [aiDifficulty, setAiDifficulty] = useState(1);
    const [aiLoading, setAiLoading] = useState(false);
    const [aiStatus, setAiStatus] = useState('');

    // Category management
    const [editingCatId, setEditingCatId] = useState(null);
    const [editCatData, setEditCatData] = useState({});
    const [newCat, setNewCat] = useState({ name: '', metric: '' });

    useEffect(() => {
        fetchCategories();
    }, []);

    useEffect(() => {
        fetchItems();
    }, [filterCategory, filterDifficulty]);

    useEffect(() => {
        localStorage.setItem('hl_admin_tab', activeTab);
    }, [activeTab]);

    const fetchCategories = async () => {
        const { data } = await supabase.from('higher_lower_categories').select(`*, higher_lower_items(count)`).order('created_at', { ascending: true });
        if (data) setCategories(data);
    };

    const fetchItems = async () => {
        setLoading(true);
        let query = supabase.from('higher_lower_items').select('*, higher_lower_categories(name, metric)').order('created_at', { ascending: false }).range(0, 100);

        if (filterCategory) {
            query = query.eq('category_id', filterCategory);
        }
        if (filterDifficulty) {
            query = query.eq('difficulty', parseInt(filterDifficulty));
        }
        if (searchTerm) {
            query = query.ilike('name', `%${searchTerm}%`);
        }

        const { data } = await query;
        if (data) setItems(data);
        setLoading(false);
    };

    // --- ITEM ACTIONS ---
    const handleUpdateItem = async (id) => {
        const { error } = await supabase.from('higher_lower_items').update({
            name: editItemData.name,
            value: parseFloat(editItemData.value) || 0,
            image: editItemData.image,
            category_id: editItemData.category_id,
            difficulty: parseInt(editItemData.difficulty) || 1
        }).eq('id', id);

        if (!error) {
            setEditingItemId(null);
            fetchItems();
        } else {
            alert('Chyba: ' + error.message);
        }
    };

    const handleDeleteItem = async (id) => {
        if (!window.confirm('Vymazať položku?')) return;
        const { error } = await supabase.from('higher_lower_items').delete().eq('id', id);
        if (!error) {
            fetchItems();
            fetchCategories(); // update counts
        }
    };

    const handleAddItem = async (e) => {
        e.preventDefault();
        const { error } = await supabase.from('higher_lower_items').insert([{
            name: newItem.name,
            value: parseFloat(newItem.value) || 0,
            image: newItem.image,
            category_id: newItem.category_id,
            difficulty: parseInt(newItem.difficulty) || 1
        }]);
        if (!error) {
            setNewItem({ name: '', value: '', image: '', category_id: filterCategory || '', difficulty: 1 });
            fetchItems();
            fetchCategories();
            alert('Položka pridaná!');
        } else {
            alert('Chyba: ' + error.message);
        }
    };

    // --- CATEGORY ACTIONS ---
    const handleUpdateCategory = async (id) => {
        const { error } = await supabase.from('higher_lower_categories').update({
            name: editCatData.name,
            metric: editCatData.metric
        }).eq('id', id);

        if (!error) {
            setEditingCatId(null);
            fetchCategories();
            fetchItems();
        } else {
            alert('Chyba: ' + error.message);
        }
    };

    const handleDeleteCategory = async (id) => {
        if (!window.confirm('Naozaj vymazať celú kategóriu aj s jej položkami?!')) return;
        const { error } = await supabase.from('higher_lower_categories').delete().eq('id', id);
        if (!error) {
            fetchCategories();
            fetchItems();
        } else {
            alert('Chyba: ' + error.message);
        }
    };

    const handleAddCategory = async (e) => {
        e.preventDefault();
        const { error } = await supabase.from('higher_lower_categories').insert([newCat]);
        if (!error) {
            setNewCat({ name: '', metric: '' });
            fetchCategories();
            alert('Kategória vytvorená!');
        } else {
            alert('Chyba: ' + error.message);
        }
    };

    // Helpers
    const getCatDetails = (cId) => categories.find(c => c.id === cId) || {};

    const handleGenerateAI = async () => {
        if (selectedGenCats.length === 0) return alert("Najprv vyber na paneli kategórie, pre ktoré chceš generovať!");
        if (!aiCount || aiCount < 1) return alert("Zadaj platný počet položiek (napr. 10)!");

        setAiLoading(true);

        try {
            const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
            if (!apiKey) throw new Error("Chýba VITE_OPENAI_API_KEY");

            let totalInserted = 0;

            for (let i = 0; i < selectedGenCats.length; i++) {
                const catId = selectedGenCats[i];
                const catObj = getCatDetails(catId);

                setAiStatus(`Generujem tému: ${catObj.name} (${i + 1}/${selectedGenCats.length})...`);

                // Fetch some existing items to avoid duplicates
                const { data: existingData } = await supabase
                    .from('higher_lower_items')
                    .select('name')
                    .eq('category_id', catId)
                    .limit(50);

                const avoidList = existingData?.length > 0
                    ? `\nTIETO POLOŽKY UŽ MÁME (NEOPAKOVAŤ ICH): ${existingData.map(val => val.name).join(', ')}`
                    : "";

                const response = await fetch('https://api.openai.com/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`
                    },
                    body: JSON.stringify({
                        model: "gpt-4o",
                        temperature: 0.8,
                        messages: [
                            {
                                role: "system",
                                content: `Si ODBORNÝ EDITOR dát pre hru Higher/Lower. Tvojou úlohou je vygenerovať presne ten počet záznamov, o aký ťa požiadame.
Vytváraš JSON pre kategóriu "${catObj.name}" s metrikou "${catObj.metric}".
Cieľová NÁROČNOSŤ (1=ľahké známe fakty, 2=stredné, 3=ťažké špecifické fakty) je VŽDY nastavená na: ${aiDifficulty}.

AKCIA:
1. Vygeneruj unikátne záznamy, ktoré sa presne hodia do kategórie.
2. Zisti si PRESNÚ HODNOTU danej veci vo svete (napr. zisk, výška, váha, kalórie atď. podľa aktuálnej metriky) - "value" MUSÍ byť len čisté matematické číslo (napríklad 1500000 namiesto 1 500 000). Nechaj to ako normálne JSON číslo. Nepridávaj do hodnoty texty.
3. Pre každú položku vymysli výstižné 1 VIZUÁLNE EMOJI. To pôjde do kľúča "image". Povoľujeme max 1 znak (emoji).
4. Krátky a jasný názov veci pôjde do "name".
5. Nesmieš použiť rovnaké položky ako tieto: ${avoidList}

Výstup musí byť vždy JSON { "items": [ { "name": "...", "value": 1500, "image": "🚗" }, ... ] }`
                            },
                            {
                                role: "user",
                                content: `Záväzná úloha: Vygeneruj presne ${aiCount} nových záznamov pre kategóriu "${catObj.name}".`
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
                const result = JSON.parse(rawData.choices[0].message.content);
                const generatedItems = result.items || [];

                if (generatedItems.length === 0) throw new Error(`AI nevrátilo žiadne položky pre kategóriu ${catObj.name}`);

                const toInsert = generatedItems.map(it => ({
                    name: String(it.name),
                    value: parseFloat(it.value) || 0,
                    image: it.image || '❓',
                    category_id: catId,
                    difficulty: parseInt(aiDifficulty, 10)
                }));

                const { error } = await supabase.from('higher_lower_items').insert(toInsert);
                if (error) throw error;

                totalInserted += toInsert.length;
            }

            alert(`✅ Úspešne vygenerovaných a pridaných: ${totalInserted} položiek!`);
            fetchItems();
            fetchCategories();
            setSelectedGenCats([]);
        } catch (err) {
            console.error(err);
            alert('Chyba pri AI generovaní: ' + err.message);
        } finally {
            setAiLoading(false);
            setAiStatus('');
        }
    };

    return (
        <div className="game-container lobby admin-panel">
            <div className="lobby-header">
                <h1>Administrácia: Higher / Lower</h1>
                <button className="secondary" onClick={onBack}>Späť do Lobby</button>
            </div>

            <div className="admin-grid">
                {/* Sidebar Stats */}
                <div className="admin-sidebar lobby-panel">
                    <h3>Kategórie ({categories.length})</h3>
                    <div className="admin-stats-list" style={{ marginTop: '1rem' }}>
                        <div
                            className="admin-stat-row"
                            style={{ display: 'flex', justifyContent: 'space-between', padding: '0.8rem', cursor: 'pointer', background: filterCategory === '' ? 'rgba(56, 189, 248, 0.2)' : 'rgba(255,255,255,0.05)', borderRadius: '8px', marginBottom: '0.5rem' }}
                            onClick={() => { setFilterCategory(''); setActiveTab('items'); }}
                        >
                            <strong style={{ color: filterCategory === '' ? '#38bdf8' : 'white' }}>Zobraziť Všetky</strong>
                            <span style={{ fontWeight: 'bold' }}>{categories.reduce((acc, c) => acc + (c.higher_lower_items?.[0]?.count || 0), 0)}</span>
                        </div>
                        {categories.map((cat) => (
                            <div
                                key={cat.id}
                                className="admin-stat-row"
                                style={{ display: 'flex', flexDirection: 'column', marginBottom: '0.5rem', background: filterCategory === cat.id ? 'rgba(250, 204, 21, 0.2)' : 'rgba(255,255,255,0.05)', padding: '0.8rem', borderRadius: '8px', cursor: 'pointer', border: filterCategory === cat.id ? '1px solid rgba(250, 204, 21, 0.5)' : 'none' }}
                                onClick={() => { setFilterCategory(cat.id); setActiveTab('items'); }}
                            >
                                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                    <strong className="stat-cat" style={{ color: filterCategory === cat.id ? '#facc15' : '#38bdf8' }}>{cat.name}</strong>
                                    <span className="stat-count" style={{ fontWeight: 'bold' }}>{cat.higher_lower_items?.[0]?.count || 0}</span>
                                </div>
                                <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.2rem' }}>Metrika: {cat.metric}</div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Main Content */}
                <div className="admin-main lobby-panel">
                    <div className="tab-buttons">
                        <button className={`secondary ${activeTab === 'items' ? 'active' : ''}`} onClick={() => setActiveTab('items')}>Položky</button>
                        <button className={`secondary ${activeTab === 'add_item' ? 'active' : ''}`} onClick={() => setActiveTab('add_item')}>Pridať Položku</button>
                        <button className={`secondary ${activeTab === 'categories' ? 'active' : ''}`} onClick={() => setActiveTab('categories')}>Kategórie</button>
                        <button className={`secondary ${activeTab === 'generate' ? 'active' : ''}`} onClick={() => setActiveTab('generate')}>AI Generátor</button>
                    </div>

                    {activeTab === 'items' && (
                        <>
                            <div className="admin-search-row">
                                <div className="form-group search-input">
                                    <input
                                        type="text"
                                        placeholder="Hľadať položku..."
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        onKeyDown={(e) => e.key === 'Enter' && fetchItems()}
                                    />
                                </div>
                                <div className="form-group" style={{ flex: 1, minWidth: '150px' }}>
                                    <select
                                        value={filterCategory}
                                        onChange={(e) => setFilterCategory(e.target.value)}
                                        style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '0.8rem', borderRadius: '8px', width: '100%' }}
                                    >
                                        <option value="">Všetky kategórie</option>
                                        {categories.map(cat => (
                                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                                        ))}
                                    </select>
                                </div>
                                <div className="form-group" style={{ width: '160px' }}>
                                    <select
                                        value={filterDifficulty}
                                        onChange={(e) => setFilterDifficulty(e.target.value)}
                                        style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', padding: '0.8rem', borderRadius: '8px', width: '100%' }}
                                    >
                                        <option value="">Náročnosť</option>
                                        <option value="1">1 (Ľahké)</option>
                                        <option value="2">2 (Stredné)</option>
                                        <option value="3">3 (Ťažké)</option>
                                    </select>
                                </div>
                                {(filterCategory || filterDifficulty || searchTerm) && (
                                    <button className="neutral" onClick={() => { setFilterCategory(''); setFilterDifficulty(''); setSearchTerm(''); fetchItems(); }} style={{ padding: '0.8rem' }}>✖ Zrušiť</button>
                                )}
                            </div>
                            <div className="admin-table-wrapper">
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>Obrázok</th>
                                            <th>Názov</th>
                                            <th>Hodnota</th>
                                            <th className="hide-mobile">Kategória</th>
                                            <th>Kat.</th>
                                            <th style={{ textAlign: 'center' }}>Akcie</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {items.map(it => (
                                            <tr key={it.id}>
                                                {editingItemId === it.id ? (
                                                    <>
                                                        <td>
                                                            <input className="edit-input" value={editItemData.image} onChange={e => setEditItemData({ ...editItemData, image: e.target.value })} style={{ width: '60px' }} />
                                                        </td>
                                                        <td>
                                                            <input className="edit-input" value={editItemData.name} onChange={e => setEditItemData({ ...editItemData, name: e.target.value })} style={{ width: '100%' }} />
                                                        </td>
                                                        <td>
                                                            <input className="edit-input" type="number" value={editItemData.value} onChange={e => setEditItemData({ ...editItemData, value: e.target.value })} style={{ width: '100px' }} />
                                                        </td>
                                                        <td className="hide-mobile">
                                                            <select value={editItemData.category_id} onChange={e => setEditItemData({ ...editItemData, category_id: e.target.value })} style={{ width: '100%', background: '#1e293b', color: 'white', padding: '0.4rem' }}>
                                                                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                                            </select>
                                                        </td>
                                                        <td>
                                                            <select value={editItemData.difficulty} onChange={e => setEditItemData(prev => ({ ...prev, difficulty: e.target.value }))} style={{ width: '60px', background: '#1e293b', color: 'white', padding: '0.4rem' }}>
                                                                <option value="1">1</option>
                                                                <option value="2">2</option>
                                                                <option value="3">3</option>
                                                            </select>
                                                        </td>
                                                        <td className="q-actions" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                                            <button onClick={() => handleUpdateItem(it.id)} className="secondary" title="Uložiť">✅</button>
                                                            <button onClick={() => setEditingItemId(null)} className="neutral" title="Zrušiť">❌</button>
                                                        </td>
                                                    </>
                                                ) : (
                                                    <>
                                                        <td style={{ fontSize: '2rem', textAlign: 'center' }}>{it.image}</td>
                                                        <td style={{ fontWeight: 'bold' }}>{it.name}</td>
                                                        <td style={{ color: '#facc15', fontWeight: 'bold', fontSize: '1.2rem' }}>
                                                            {it.value.toLocaleString('sk-SK')} <span style={{ fontSize: '0.9rem', color: '#94a3b8' }}>{it.higher_lower_categories?.metric}</span>
                                                        </td>
                                                        <td className="hide-mobile">{it.higher_lower_categories?.name}</td>
                                                        <td style={{ textAlign: 'center', color: it.difficulty === 1 ? '#10b981' : it.difficulty === 2 ? '#facc15' : '#ef4444' }}>
                                                            <b>{it.difficulty}</b>
                                                        </td>
                                                        <td className="q-actions" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                                            <button onClick={() => { setEditingItemId(it.id); setEditItemData({ ...it }); }} className="neutral" title="Upraviť">✏️</button>
                                                            <button onClick={() => handleDeleteItem(it.id)} className="delete-btn" title="Vymazať">🗑️</button>
                                                        </td>
                                                    </>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {loading && <div className="loading-spinner">Načítavam...</div>}
                                {items.length === 0 && !loading && <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8' }}>Žiadne položky sa nenašli.</div>}
                            </div>
                        </>
                    )}

                    {activeTab === 'add_item' && (
                        <form onSubmit={handleAddItem} className="auth-form" style={{ maxWidth: '600px' }}>
                            <div className="form-group">
                                <label>Kategória</label>
                                <select
                                    value={newItem.category_id}
                                    onChange={e => setNewItem({ ...newItem, category_id: e.target.value })}
                                    required
                                    style={{ background: '#1e293b', color: 'white', padding: '0.8rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}
                                >
                                    <option value="" disabled>Vyberte kategóriu...</option>
                                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Náročnosť</label>
                                <select
                                    value={newItem.difficulty}
                                    onChange={e => setNewItem({ ...newItem, difficulty: e.target.value })}
                                    style={{ background: '#1e293b', color: 'white', padding: '0.8rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}
                                >
                                    <option value="1">1 (Ľahké - 95% ľudí vie)</option>
                                    <option value="2">2 (Stredné - priemerný prehľad)</option>
                                    <option value="3">3 (Ťažké - pre expertov)</option>
                                </select>
                            </div>
                            <div className="form-group">
                                <label>Názov (Príklad: "Orol Skalný")</label>
                                <input type="text" value={newItem.name} onChange={e => setNewItem({ ...newItem, name: e.target.value })} required />
                            </div>
                            <div className="form-row">
                                <div className="form-group">
                                    <label>Hodnota ({newItem.category_id ? getCatDetails(newItem.category_id).metric : 'číselná'})</label>
                                    <input type="number" step="any" value={newItem.value} onChange={e => setNewItem({ ...newItem, value: e.target.value })} required />
                                </div>
                                <div className="form-group">
                                    <label>Obrázok (text/Emoji 🦅)</label>
                                    <input type="text" value={newItem.image} onChange={e => setNewItem({ ...newItem, image: e.target.value })} />
                                </div>
                            </div>
                            <button type="submit" className="primary" style={{ width: '100%', marginTop: '1rem', background: '#facc15', color: '#0f172a' }}>Pridať Položku</button>
                        </form>
                    )}

                    {activeTab === 'categories' && (
                        <>
                            <div className="admin-table-wrapper" style={{ marginBottom: '2rem' }}>
                                <h3>Existujúce Kategórie</h3>
                                <table className="admin-table">
                                    <thead>
                                        <tr>
                                            <th>Názov</th>
                                            <th>Metrika</th>
                                            <th style={{ textAlign: 'center' }}>Akcie</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {categories.map(cat => (
                                            <tr key={cat.id}>
                                                {editingCatId === cat.id ? (
                                                    <>
                                                        <td><input className="edit-input" value={editCatData.name} onChange={e => setEditCatData({ ...editCatData, name: e.target.value })} style={{ width: '100%' }} /></td>
                                                        <td><input className="edit-input" value={editCatData.metric} onChange={e => setEditCatData({ ...editCatData, metric: e.target.value })} style={{ width: '150px' }} /></td>
                                                        <td className="q-actions" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                                            <button onClick={() => handleUpdateCategory(cat.id)} className="secondary" title="Uložiť">✅</button>
                                                            <button onClick={() => setEditingCatId(null)} className="neutral" title="Zrušiť">❌</button>
                                                        </td>
                                                    </>
                                                ) : (
                                                    <>
                                                        <td style={{ fontWeight: 'bold' }}>{cat.name}</td>
                                                        <td style={{ color: '#38bdf8' }}>{cat.metric}</td>
                                                        <td className="q-actions" style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
                                                            <button onClick={() => { setEditingCatId(cat.id); setEditCatData({ ...cat }); }} className="neutral" title="Upraviť">✏️</button>
                                                            <button onClick={() => handleDeleteCategory(cat.id)} className="delete-btn" title="Vymazať">🗑️</button>
                                                        </td>
                                                    </>
                                                )}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>

                            <form onSubmit={handleAddCategory} className="auth-form" style={{ maxWidth: '600px', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: '2rem' }}>
                                <h3>Nová Kategória</h3>
                                <div className="form-group">
                                    <label>Názov (Príklad: Rýchlosť zvierat)</label>
                                    <input type="text" value={newCat.name} onChange={e => setNewCat({ ...newCat, name: e.target.value })} required />
                                </div>
                                <div className="form-group">
                                    <label>Metrika (Príklad: km/h)</label>
                                    <input type="text" value={newCat.metric} onChange={e => setNewCat({ ...newCat, metric: e.target.value })} required />
                                </div>
                                <button type="submit" className="primary" style={{ marginTop: '0.5rem' }}>Pridať Kategóriu</button>
                            </form>
                        </>
                    )}

                    {activeTab === 'generate' && (
                        <div className="auth-form" style={{ maxWidth: '800px' }}>
                            <h2 style={{ color: '#facc15', marginBottom: '1rem' }}>AI Generátor Položiek</h2>
                            <p style={{ color: '#94a3b8', marginBottom: '2rem' }}>
                                Vyber si jednu alebo viac herných kategórií, napíš množstvo položiek per kategóriu, a AI ich automaticky vymyslí spolu s ich reálnymi hodnotami a priradeným emoji!
                            </p>

                            <div className="form-group">
                                <label style={{ marginBottom: '0.8rem', display: 'block' }}>Kategórie na generovanie</label>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedGenCats(categories.map(c => c.id))}
                                        style={{ padding: '0.4rem 0.8rem', borderRadius: '8px', fontSize: '0.9rem', background: 'rgba(56, 189, 248, 0.2)', color: '#38bdf8', border: '1px solid #38bdf8' }}
                                    >Všetky Kategórie</button>
                                    <button
                                        type="button"
                                        onClick={() => setSelectedGenCats([])}
                                        style={{ padding: '0.4rem 0.8rem', borderRadius: '8px', fontSize: '0.9rem', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', border: '1px solid #ef4444' }}
                                    >Zrušiť Výber</button>
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                    {categories.map(cat => {
                                        const isSelected = selectedGenCats.includes(cat.id);
                                        return (
                                            <button
                                                key={`gen-${cat.id}`}
                                                type="button"
                                                onClick={() => {
                                                    setSelectedGenCats(prev =>
                                                        isSelected ? prev.filter(id => id !== cat.id) : [...prev, cat.id]
                                                    );
                                                }}
                                                style={{
                                                    padding: '0.6rem 1rem', borderRadius: '12px', cursor: 'pointer',
                                                    background: isSelected ? '#10b981' : 'rgba(255,255,255,0.05)',
                                                    color: isSelected ? 'white' : '#94a3b8',
                                                    fontWeight: 'bold', fontSize: '0.9rem',
                                                    transition: 'all 0.2s', border: isSelected ? '1px solid #34d399' : '1px solid rgba(255,255,255,0.1)'
                                                }}
                                            >
                                                {cat.name}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="form-row">
                                <div className="form-group">
                                    <label>Počet položiek NA KATEGÓRIU (1-50)</label>
                                    <input
                                        type="number"
                                        value={aiCount}
                                        onChange={e => setAiCount(parseInt(e.target.value) || 1)}
                                        min={1}
                                        max={50}
                                        required
                                        style={{ width: '100%', background: '#1e293b', color: 'white', padding: '0.8rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}
                                    />
                                </div>
                                <div className="form-group">
                                    <label>Náročnosť položiek pre AI</label>
                                    <select
                                        value={aiDifficulty}
                                        onChange={e => setAiDifficulty(e.target.value)}
                                        style={{ background: '#1e293b', color: 'white', padding: '0.8rem', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.1)' }}
                                    >
                                        <option value="1">1 (Ľahké - 95% ľudí pozná tieto veci)</option>
                                        <option value="2">2 (Stredné - bežný rozhľad)</option>
                                        <option value="3">3 (Ťažké - pre expertov s detailmi)</option>
                                    </select>
                                </div>
                            </div>

                            <button
                                onClick={handleGenerateAI}
                                disabled={aiLoading || selectedGenCats.length === 0}
                                className="primary"
                                style={{ width: '100%', marginTop: '1rem', background: '#facc15', color: '#0f172a', fontWeight: 'bold', fontSize: '1.2rem', padding: '1rem', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                            >
                                {aiLoading ? (
                                    <>
                                        <div className="loader" style={{ width: '28px', height: '28px', border: '3px solid rgba(0,0,0,0.2)', borderTop: '3px solid black', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
                                        <span style={{ fontSize: '1rem', fontWeight: 'bold' }}>{aiStatus || 'Beží...'}</span>
                                    </>
                                ) : '✨ Generovať zvolené kategórie s AI'}
                            </button>

                            {aiStatus && !aiLoading && (
                                <div style={{ marginTop: '1.5rem', padding: '1rem', background: 'rgba(56, 189, 248, 0.1)', color: '#38bdf8', borderRadius: '8px', border: '1px dashed #38bdf8' }}>
                                    {aiStatus}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
