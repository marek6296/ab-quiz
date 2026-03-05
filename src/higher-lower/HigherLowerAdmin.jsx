import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export const HigherLowerAdmin = ({ onBack }) => {
    const [categories, setCategories] = useState([]);
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [activeTab, setActiveTab] = useState(() => localStorage.getItem('hl_admin_tab') || 'items');

    // Filters
    const [filterCategory, setFilterCategory] = useState('');
    const [searchTerm, setSearchTerm] = useState('');

    // Edit state
    const [editingItemId, setEditingItemId] = useState(null);
    const [editItemData, setEditItemData] = useState({});

    // Add item form
    const [newItem, setNewItem] = useState({ name: '', value: '', image: '', category_id: '' });

    // Category management
    const [editingCatId, setEditingCatId] = useState(null);
    const [editCatData, setEditCatData] = useState({});
    const [newCat, setNewCat] = useState({ name: '', metric: '' });

    useEffect(() => {
        fetchCategories();
    }, []);

    useEffect(() => {
        fetchItems();
    }, [filterCategory]);

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
            category_id: editItemData.category_id
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
            category_id: newItem.category_id
        }]);
        if (!error) {
            setNewItem({ name: '', value: '', image: '', category_id: filterCategory || '' });
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
                                {(filterCategory || searchTerm) && (
                                    <button className="neutral" onClick={() => { setFilterCategory(''); setSearchTerm(''); fetchItems(); }} style={{ padding: '0.8rem' }}>✖ Zrušiť</button>
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
                </div>
            </div>
        </div>
    );
};
