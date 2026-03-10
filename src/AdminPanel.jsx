import { useState, useEffect, useCallback } from 'react';
import { supabase } from './lib/supabase';



const S = {
  wrap: { height: '100vh', overflowY: 'auto', background: '#050505', color: '#fff', fontFamily: 'Inter, system-ui, sans-serif' },
  header: { display: 'flex', alignItems: 'center', gap: 16, padding: '16px 24px', borderBottom: '1px solid #1a1a1a', background: '#0a0a0a' },
  back: { background: 'none', border: '1px solid #333', color: '#888', padding: '8px 16px', borderRadius: 10, cursor: 'pointer', fontSize: 13 },
  title: { fontSize: 22, fontWeight: 900, color: '#a855f7' },
  tabs: { display: 'flex', gap: 4, padding: '12px 24px', borderBottom: '1px solid #111' },
  tab: (active) => ({ padding: '8px 18px', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: active ? 700 : 500, background: active ? 'rgba(168,85,247,0.2)' : 'rgba(255,255,255,0.04)', color: active ? '#c084fc' : '#666', transition: 'all 0.15s' }),
  body: { padding: '20px 24px' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { textAlign: 'left', padding: '10px 12px', color: '#555', borderBottom: '1px solid #1a1a1a', fontWeight: 600, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' },
  td: { padding: '10px 12px', borderBottom: '1px solid #111', verticalAlign: 'top' },
  badge: (color) => ({ display: 'inline-block', padding: '2px 8px', borderRadius: 6, fontSize: 11, fontWeight: 700, background: `${color}22`, color, border: `1px solid ${color}44` }),
  btn: (color = '#a855f7', sm = false) => ({ padding: sm ? '4px 10px' : '8px 18px', borderRadius: sm ? 6 : 10, border: `1px solid ${color}55`, background: `${color}15`, color, fontSize: sm ? 11 : 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }),
  input: { background: '#111', border: '1px solid #333', color: '#fff', padding: '8px 12px', borderRadius: 8, fontSize: 13, width: '100%', boxSizing: 'border-box', fontFamily: 'Inter, system-ui, sans-serif' },
  select: { background: '#111', border: '1px solid #333', color: '#fff', padding: '8px 12px', borderRadius: 8, fontSize: 13, width: '100%', boxSizing: 'border-box' },
  section: { marginBottom: 32 },
  sectionTitle: { fontSize: 16, fontWeight: 700, color: '#c084fc', marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #1a1a1a' },
  formGrid: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 },
  label: { display: 'block', fontSize: 11, color: '#666', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' },
  errBox: { background: '#1a0000', border: '1px solid #500', borderRadius: 8, padding: '10px 14px', color: '#f87171', fontSize: 13, marginBottom: 12 },
  successBox: { background: '#001a00', border: '1px solid #0a5', borderRadius: 8, padding: '10px 14px', color: '#4ade80', fontSize: 13, marginBottom: 12 },
};

const DIFF_LABELS = { 1: 'Ľahká', 2: 'Stredná', 3: 'Ťažká' };
const DIFF_COLORS = { 1: '#22c55e', 2: '#f59e0b', 3: '#ef4444' };

function useQuizQuestions() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('quiz_questions').select('*').order('created_at', { ascending: false });
    setRows(data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  return { rows, loading, reload: load };
}

function useHLDataset() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('hl_dataset').select('*').order('created_at', { ascending: false }).limit(200);
    setRows(data || []);
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  return { rows, loading, reload: load };
}

// ── Quiz Questions Tab ────────────────────────────────────────────────────────
function QuizQuestionsTab() {
  const { rows, loading, reload } = useQuizQuestions();
  const [filter, setFilter] = useState('all'); // all|reported|easy|medium|hard
  const [msg, setMsg] = useState(null);
  const [form, setForm] = useState({ question: '', answer_a: '', answer_b: '', answer_c: '', answer_d: '', correct_answer: 0, difficulty: 1 });
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const filtered = rows.filter(r => {
    if (filter === 'reported') return r.reported;
    if (filter === 'easy') return r.difficulty === 1 && !r.reported;
    if (filter === 'medium') return r.difficulty === 2 && !r.reported;
    if (filter === 'hard') return r.difficulty === 3 && !r.reported;
    return !r.reported;
  });
  const reportedCount = rows.filter(r => r.reported).length;

  async function deleteQ(id) {
    if (!confirm('Zmazať otázku?')) return;
    await supabase.from('quiz_questions').delete().eq('id', id);
    setMsg({ type: 'success', text: 'Otázka zmazaná.' }); reload();
  }
  async function approveQ(id) {
    await supabase.from('quiz_questions').update({ reported: false }).eq('id', id);
    setMsg({ type: 'success', text: 'Otázka schválená.' }); reload();
  }
  async function saveNew(e) {
    e.preventDefault();
    if (!form.question || !form.answer_a || !form.answer_b || !form.answer_c || !form.answer_d) {
      setMsg({ type: 'error', text: 'Vyplň všetky polia!' }); return;
    }
    setSaving(true);
    const { error } = await supabase.from('quiz_questions').insert({ ...form, reported: false });
    setSaving(false);
    if (error) { setMsg({ type: 'error', text: error.message }); return; }
    setMsg({ type: 'success', text: 'Otázka pridaná!' });
    setForm({ question: '', answer_a: '', answer_b: '', answer_c: '', answer_d: '', correct_answer: 0, difficulty: 1 });
    setShowForm(false); reload();
  }

  const labels = ['A', 'B', 'C', 'D'];
  const keys = ['answer_a', 'answer_b', 'answer_c', 'answer_d'];

  return (
    <div style={S.body}>
      {msg && <div style={msg.type === 'error' ? S.errBox : S.successBox}>{msg.text} <button onClick={() => setMsg(null)} style={{ float: 'right', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>✕</button></div>}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {['all', 'reported', 'easy', 'medium', 'hard'].map(f => (
          <button key={f} style={S.tab(filter === f)} onClick={() => setFilter(f)}>
            {f === 'all' ? 'Všetky' : f === 'reported' ? `⚠️ Nahlásené (${reportedCount})` : DIFF_LABELS[f === 'easy' ? 1 : f === 'medium' ? 2 : 3]}
          </button>
        ))}
        <button style={{ ...S.btn('#22c55e'), marginLeft: 'auto' }} onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ Zavrieť' : '➕ Pridať otázku'}
        </button>
      </div>

      {showForm && (
        <div style={{ background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 14, padding: '20px', marginBottom: 20 }}>
          <div style={S.sectionTitle}>Nová otázka (Kvíz Duel / Milionár)</div>
          <form onSubmit={saveNew}>
            <div style={{ marginBottom: 10 }}>
              <label style={S.label}>Otázka</label>
              <input style={S.input} value={form.question} onChange={e => setForm(f => ({ ...f, question: e.target.value }))} placeholder="Napíš otázku..." />
            </div>
            <div style={S.formGrid}>
              {keys.map((k, i) => (
                <div key={k}>
                  <label style={S.label}>Odpoveď {labels[i]}</label>
                  <input style={{ ...S.input, borderColor: form.correct_answer === i ? '#22c55e' : '#333' }}
                    value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} placeholder={`Odpoveď ${labels[i]}`} />
                </div>
              ))}
            </div>
            <div style={S.formGrid}>
              <div>
                <label style={S.label}>Správna odpoveď</label>
                <select style={S.select} value={form.correct_answer} onChange={e => setForm(f => ({ ...f, correct_answer: Number(e.target.value) }))}>
                  {labels.map((l, i) => <option key={i} value={i}>Odpoveď {l}</option>)}
                </select>
              </div>
              <div>
                <label style={S.label}>Obtiažnosť</label>
                <select style={S.select} value={form.difficulty} onChange={e => setForm(f => ({ ...f, difficulty: Number(e.target.value) }))}>
                  <option value={1}>1 – Ľahká</option>
                  <option value={2}>2 – Stredná</option>
                  <option value={3}>3 – Ťažká</option>
                </select>
              </div>
            </div>
            <button type="submit" style={S.btn('#22c55e')} disabled={saving}>{saving ? 'Ukladám...' : '💾 Uložiť otázku'}</button>
          </form>
        </div>
      )}

      {loading ? <div style={{ color: '#555', padding: '32px 0', textAlign: 'center' }}>Načítavam...</div> : (
        <table style={S.table}>
          <thead>
            <tr>
              <th style={S.th}>Otázka</th>
              <th style={S.th}>A</th><th style={S.th}>B</th><th style={S.th}>C</th><th style={S.th}>D</th>
              <th style={S.th}>Správna</th>
              <th style={S.th}>Obtiažnosť</th>
              <th style={S.th}>Akcie</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} style={{ background: r.reported ? '#1a0000' : 'transparent' }}>
                <td style={{ ...S.td, maxWidth: 240, color: r.reported ? '#f87171' : '#fff' }}>
                  {r.reported && <span style={{ color: '#ef4444', fontSize: 11, display: 'block' }}>⚠️ Nahlásená</span>}
                  {r.question}
                </td>
                <td style={{ ...S.td, color: '#888' }}>{r.answer_a}</td>
                <td style={{ ...S.td, color: '#888' }}>{r.answer_b}</td>
                <td style={{ ...S.td, color: '#888' }}>{r.answer_c}</td>
                <td style={{ ...S.td, color: '#888' }}>{r.answer_d}</td>
                <td style={S.td}><span style={S.badge('#22c55e')}>{['A','B','C','D'][r.correct_answer]}</span></td>
                <td style={S.td}><span style={S.badge(DIFF_COLORS[r.difficulty] || '#888')}>{DIFF_LABELS[r.difficulty] || r.difficulty}</span></td>
                <td style={{ ...S.td, whiteSpace: 'nowrap' }}>
                  {r.reported && <button style={{ ...S.btn('#22c55e', true), marginRight: 4 }} onClick={() => approveQ(r.id)}>✓ Schváliť</button>}
                  <button style={S.btn('#ef4444', true)} onClick={() => deleteQ(r.id)}>🗑</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={8} style={{ padding: '32px 12px', textAlign: 'center', color: '#333' }}>Žiadne otázky</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Higher or Lower Tab ────────────────────────────────────────────────────────
function HigherLowerTab() {
  const { rows, loading, reload } = useHLDataset();
  const [filter, setFilter] = useState('all');
  const [msg, setMsg] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', value: '', metric: '', topic: '', image: '', difficulty: 2 });

  const filtered = rows.filter(r => {
    if (filter === 'reported') return r.reported;
    if (filter === 'easy') return r.difficulty === 1;
    if (filter === 'medium') return r.difficulty === 2;
    if (filter === 'hard') return r.difficulty === 3;
    return !r.reported;
  });
  const reportedCount = rows.filter(r => r.reported).length;

  async function deleteItem(id) {
    if (!confirm('Zmazať položku?')) return;
    await supabase.from('hl_dataset').delete().eq('id', id);
    setMsg({ type: 'success', text: 'Položka zmazaná.' }); reload();
  }
  async function approveItem(id) {
    await supabase.from('hl_dataset').update({ reported: false }).eq('id', id);
    setMsg({ type: 'success', text: 'Položka schválená.' }); reload();
  }
  async function saveNew(e) {
    e.preventDefault();
    if (!form.name || !form.value || !form.metric) { setMsg({ type: 'error', text: 'Vyplň Názov, Hodnotu a Metriku!' }); return; }
    setSaving(true);
    const { error } = await supabase.from('hl_dataset').insert({ ...form, value: Number(form.value), reported: false });
    setSaving(false);
    if (error) { setMsg({ type: 'error', text: error.message }); return; }
    setMsg({ type: 'success', text: 'Položka pridaná!' });
    setForm({ name: '', value: '', metric: '', topic: '', image: '', difficulty: 2 }); setShowForm(false); reload();
  }

  return (
    <div style={S.body}>
      {msg && <div style={msg.type === 'error' ? S.errBox : S.successBox}>{msg.text} <button onClick={() => setMsg(null)} style={{ float: 'right', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>✕</button></div>}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
        {['all', 'reported', 'easy', 'medium', 'hard'].map(f => (
          <button key={f} style={S.tab(filter === f)} onClick={() => setFilter(f)}>
            {f === 'all' ? 'Všetky' : f === 'reported' ? `⚠️ Nahlásené (${reportedCount})` : DIFF_LABELS[f === 'easy' ? 1 : f === 'medium' ? 2 : 3]}
          </button>
        ))}
        <button style={{ ...S.btn('#f59e0b'), marginLeft: 'auto' }} onClick={() => setShowForm(!showForm)}>
          {showForm ? '✕ Zavrieť' : '➕ Pridať položku'}
        </button>
      </div>

      {showForm && (
        <div style={{ background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 14, padding: '20px', marginBottom: 20 }}>
          <div style={{ ...S.sectionTitle, color: '#fbbf24' }}>Nová položka (Higher or Lower)</div>
          <form onSubmit={saveNew}>
            <div style={S.formGrid}>
              <div><label style={S.label}>Názov</label><input style={S.input} value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="napr. Eiffelova veža" /></div>
              <div><label style={S.label}>Hodnota</label><input style={{ ...S.input }} type="number" value={form.value} onChange={e => setForm(f => ({ ...f, value: e.target.value }))} placeholder="324" /></div>
              <div><label style={S.label}>Metrika</label><input style={S.input} value={form.metric} onChange={e => setForm(f => ({ ...f, metric: e.target.value }))} placeholder="metrov" /></div>
              <div><label style={S.label}>Téma / Topic</label><input style={S.input} value={form.topic} onChange={e => setForm(f => ({ ...f, topic: e.target.value }))} placeholder="Výška stavieb" /></div>
              <div><label style={S.label}>Emoji / Ikona</label><input style={S.input} value={form.image} onChange={e => setForm(f => ({ ...f, image: e.target.value }))} placeholder="🗼" /></div>
              <div><label style={S.label}>Obtiažnosť</label>
                <select style={S.select} value={form.difficulty} onChange={e => setForm(f => ({ ...f, difficulty: Number(e.target.value) }))}>
                  <option value={1}>1 – Ľahká</option><option value={2}>2 – Stredná</option><option value={3}>3 – Ťažká</option>
                </select>
              </div>
            </div>
            <button type="submit" style={S.btn('#f59e0b')} disabled={saving}>{saving ? 'Ukladám...' : '💾 Uložiť'}</button>
          </form>
        </div>
      )}

      {loading ? <div style={{ color: '#555', padding: '32px 0', textAlign: 'center' }}>Načítavam...</div> : (
        <table style={S.table}>
          <thead><tr><th style={S.th}>Ikona</th><th style={S.th}>Názov</th><th style={S.th}>Hodnota</th><th style={S.th}>Metrika</th><th style={S.th}>Téma</th><th style={S.th}>Obtiažnosť</th><th style={S.th}>Akcie</th></tr></thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} style={{ background: r.reported ? '#1a0000' : 'transparent' }}>
                <td style={S.td}>{r.image}</td>
                <td style={{ ...S.td, color: r.reported ? '#f87171' : '#fff' }}>
                  {r.reported && <span style={{ color: '#ef4444', fontSize: 11, display: 'block' }}>⚠️ Nahlásená</span>}
                  {r.name}
                </td>
                <td style={{ ...S.td, color: '#fbbf24', fontWeight: 700 }}>{Number(r.value).toLocaleString('sk-SK')}</td>
                <td style={{ ...S.td, color: '#888' }}>{r.metric}</td>
                <td style={{ ...S.td, color: '#666' }}>{r.topic}</td>
                <td style={S.td}><span style={S.badge(DIFF_COLORS[r.difficulty] || '#888')}>{DIFF_LABELS[r.difficulty] || r.difficulty}</span></td>
                <td style={{ ...S.td, whiteSpace: 'nowrap' }}>
                  {r.reported && <button style={{ ...S.btn('#22c55e', true), marginRight: 4 }} onClick={() => approveItem(r.id)}>✓ Schváliť</button>}
                  <button style={S.btn('#ef4444', true)} onClick={() => deleteItem(r.id)}>🗑</button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && <tr><td colSpan={7} style={{ padding: '32px 12px', textAlign: 'center', color: '#333' }}>Žiadne položky</td></tr>}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── Milionár Battle Tab ─────────────────────────────────────────────────────
function MillionaireTab() {
  const { rows, loading, reload } = useQuizQuestions();
  const [filter, setFilter] = useState('all');
  const [msg, setMsg] = useState(null);
  const [form, setForm] = useState({ question: '', answer_a: '', answer_b: '', answer_c: '', answer_d: '', correct_answer: 0, difficulty: 1 });
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sessions, setSessions] = useState([]);
  const [sessLoading, setSessLoading] = useState(true);

  // Load sessions
  useEffect(() => {
    (async () => {
      setSessLoading(true);
      const { data } = await supabase.from('game_sessions').select('*').eq('game_type', 'millionaire').order('created_at', { ascending: false }).limit(50);
      setSessions(data || []);
      setSessLoading(false);
    })();
  }, []);

  const filtered = rows.filter(r => {
    if (filter === 'reported') return r.reported;
    if (filter === 'easy') return r.difficulty === 1 && !r.reported;
    if (filter === 'medium') return r.difficulty === 2 && !r.reported;
    if (filter === 'hard') return r.difficulty === 3 && !r.reported;
    return !r.reported;
  });
  const reportedCount = rows.filter(r => r.reported).length;

  async function deleteQ(id) {
    if (!confirm('Zmazať otázku?')) return;
    await supabase.from('quiz_questions').delete().eq('id', id);
    setMsg({ type: 'success', text: 'Otázka zmazaná.' }); reload();
  }
  async function approveQ(id) {
    await supabase.from('quiz_questions').update({ reported: false }).eq('id', id);
    setMsg({ type: 'success', text: 'Otázka schválená.' }); reload();
  }
  async function saveNew(e) {
    e.preventDefault();
    if (!form.question || !form.answer_a || !form.answer_b || !form.answer_c || !form.answer_d) {
      setMsg({ type: 'error', text: 'Vyplň všetky polia!' }); return;
    }
    setSaving(true);
    const { error } = await supabase.from('quiz_questions').insert({ ...form, reported: false });
    setSaving(false);
    if (error) { setMsg({ type: 'error', text: error.message }); return; }
    setMsg({ type: 'success', text: 'Otázka pridaná!' });
    setForm({ question: '', answer_a: '', answer_b: '', answer_c: '', answer_d: '', correct_answer: 0, difficulty: 1 });
    setShowForm(false); reload();
  }

  async function deleteSession(id) {
    if (!confirm('Zmazať session?')) return;
    await supabase.from('game_sessions').delete().eq('id', id);
    setSessions(prev => prev.filter(s => s.id !== id));
    setMsg({ type: 'success', text: 'Session zmazaná.' });
  }

  const labels = ['A', 'B', 'C', 'D'];
  const keys = ['answer_a', 'answer_b', 'answer_c', 'answer_d'];

  const STATUS_COLORS = { waiting: '#f59e0b', playing: '#3b82f6', finished: '#22c55e', cancelled: '#ef4444', abandoned: '#ef4444' };
  const STATUS_LABELS = { waiting: 'Čaká', playing: 'Hrá sa', finished: 'Dokončená', cancelled: 'Zrušená', abandoned: 'Opustená' };

  return (
    <div style={S.body}>
      {msg && <div style={msg.type === 'error' ? S.errBox : S.successBox}>{msg.text} <button onClick={() => setMsg(null)} style={{ float: 'right', background: 'none', border: 'none', color: 'inherit', cursor: 'pointer' }}>✕</button></div>}

      {/* ── Otázky sekcia ── */}
      <div style={S.section}>
        <div style={{ ...S.sectionTitle, color: '#c084fc' }}>💎 Otázky (zdieľané s Kvíz Duel)</div>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap', alignItems: 'center' }}>
          {['all', 'reported', 'easy', 'medium', 'hard'].map(f => (
            <button key={f} style={S.tab(filter === f)} onClick={() => setFilter(f)}>
              {f === 'all' ? 'Všetky' : f === 'reported' ? `⚠️ Nahlásené (${reportedCount})` : DIFF_LABELS[f === 'easy' ? 1 : f === 'medium' ? 2 : 3]}
            </button>
          ))}
          <button style={{ ...S.btn('#22c55e'), marginLeft: 'auto' }} onClick={() => setShowForm(!showForm)}>
            {showForm ? '✕ Zavrieť' : '➕ Pridať otázku'}
          </button>
        </div>

        {showForm && (
          <div style={{ background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 14, padding: '20px', marginBottom: 20 }}>
            <div style={S.sectionTitle}>Nová otázka (Milionár / Kvíz Duel)</div>
            <form onSubmit={saveNew}>
              <div style={{ marginBottom: 10 }}>
                <label style={S.label}>Otázka</label>
                <input style={S.input} value={form.question} onChange={e => setForm(f => ({ ...f, question: e.target.value }))} placeholder="Napíš otázku..." />
              </div>
              <div style={S.formGrid}>
                {keys.map((k, i) => (
                  <div key={k}>
                    <label style={S.label}>Odpoveď {labels[i]}</label>
                    <input style={{ ...S.input, borderColor: form.correct_answer === i ? '#22c55e' : '#333' }}
                      value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} placeholder={`Odpoveď ${labels[i]}`} />
                  </div>
                ))}
              </div>
              <div style={S.formGrid}>
                <div>
                  <label style={S.label}>Správna odpoveď</label>
                  <select style={S.select} value={form.correct_answer} onChange={e => setForm(f => ({ ...f, correct_answer: Number(e.target.value) }))}>
                    {labels.map((l, i) => <option key={i} value={i}>Odpoveď {l}</option>)}
                  </select>
                </div>
                <div>
                  <label style={S.label}>Obtiažnosť</label>
                  <select style={S.select} value={form.difficulty} onChange={e => setForm(f => ({ ...f, difficulty: Number(e.target.value) }))}>
                    <option value={1}>1 – Ľahká</option>
                    <option value={2}>2 – Stredná</option>
                    <option value={3}>3 – Ťažká</option>
                  </select>
                </div>
              </div>
              <button type="submit" style={S.btn('#22c55e')} disabled={saving}>{saving ? 'Ukladám...' : '💾 Uložiť otázku'}</button>
            </form>
          </div>
        )}

        {loading ? <div style={{ color: '#555', padding: '32px 0', textAlign: 'center' }}>Načítavam...</div> : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>Otázka</th>
                <th style={S.th}>A</th><th style={S.th}>B</th><th style={S.th}>C</th><th style={S.th}>D</th>
                <th style={S.th}>Správna</th>
                <th style={S.th}>Obtiažnosť</th>
                <th style={S.th}>Akcie</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} style={{ background: r.reported ? '#1a0000' : 'transparent' }}>
                  <td style={{ ...S.td, maxWidth: 240, color: r.reported ? '#f87171' : '#fff' }}>
                    {r.reported && <span style={{ color: '#ef4444', fontSize: 11, display: 'block' }}>⚠️ Nahlásená</span>}
                    {r.question}
                  </td>
                  <td style={{ ...S.td, color: '#888' }}>{r.answer_a}</td>
                  <td style={{ ...S.td, color: '#888' }}>{r.answer_b}</td>
                  <td style={{ ...S.td, color: '#888' }}>{r.answer_c}</td>
                  <td style={{ ...S.td, color: '#888' }}>{r.answer_d}</td>
                  <td style={S.td}><span style={S.badge('#22c55e')}>{['A','B','C','D'][r.correct_answer]}</span></td>
                  <td style={S.td}><span style={S.badge(DIFF_COLORS[r.difficulty] || '#888')}>{DIFF_LABELS[r.difficulty] || r.difficulty}</span></td>
                  <td style={{ ...S.td, whiteSpace: 'nowrap' }}>
                    {r.reported && <button style={{ ...S.btn('#22c55e', true), marginRight: 4 }} onClick={() => approveQ(r.id)}>✓ Schváliť</button>}
                    <button style={S.btn('#ef4444', true)} onClick={() => deleteQ(r.id)}>🗑</button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && <tr><td colSpan={8} style={{ padding: '32px 12px', textAlign: 'center', color: '#333' }}>Žiadne otázky</td></tr>}
            </tbody>
          </table>
        )}
      </div>

      {/* ── Online Sessions sekcia ── */}
      <div style={S.section}>
        <div style={{ ...S.sectionTitle, color: '#c084fc' }}>🎮 Online Sessions (posledných 50)</div>
        {sessLoading ? <div style={{ color: '#555', padding: '32px 0', textAlign: 'center' }}>Načítavam...</div> : (
          <table style={S.table}>
            <thead>
              <tr>
                <th style={S.th}>ID</th>
                <th style={S.th}>Stav</th>
                <th style={S.th}>Kód</th>
                <th style={S.th}>Obtiažnosť</th>
                <th style={S.th}>Vytvorená</th>
                <th style={S.th}>Akcie</th>
              </tr>
            </thead>
            <tbody>
              {sessions.map(s => (
                <tr key={s.id}>
                  <td style={{ ...S.td, color: '#666', fontSize: 11, fontFamily: 'monospace' }}>{s.id.slice(0, 8)}…</td>
                  <td style={S.td}><span style={S.badge(STATUS_COLORS[s.status] || '#888')}>{STATUS_LABELS[s.status] || s.status}</span></td>
                  <td style={{ ...S.td, color: '#c084fc', fontWeight: 700 }}>{s.join_code || '–'}</td>
                  <td style={S.td}><span style={S.badge(DIFF_COLORS[s.difficulty] || '#888')}>{DIFF_LABELS[s.difficulty] || s.difficulty}</span></td>
                  <td style={{ ...S.td, color: '#666', fontSize: 12 }}>{new Date(s.created_at).toLocaleString('sk-SK')}</td>
                  <td style={{ ...S.td, whiteSpace: 'nowrap' }}>
                    <button style={S.btn('#ef4444', true)} onClick={() => deleteSession(s.id)}>🗑</button>
                  </td>
                </tr>
              ))}
              {sessions.length === 0 && <tr><td colSpan={6} style={{ padding: '32px 12px', textAlign: 'center', color: '#333' }}>Žiadne sessions</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ── Stats Tab ─────────────────────────────────────────────────────────────────
function StatsTab() {
  const [stats, setStats] = useState(null);
  useEffect(() => {
    async function load() {
      const [qq, hl, ms] = await Promise.all([
        supabase.from('quiz_questions').select('difficulty, reported'),
        supabase.from('hl_dataset').select('difficulty, reported'),
        supabase.from('game_sessions').select('game_type, status'),
      ]);
      const q = qq.data || [], h = hl.data || [], g = ms.data || [];
      const mill = g.filter(x => x.game_type === 'millionaire');
      const quiz = g.filter(x => x.game_type === 'quiz_duel');
      const hlSess = g.filter(x => x.game_type === 'higher_lower');
      setStats({
        qTotal: q.length, qReported: q.filter(x => x.reported).length,
        qEasy: q.filter(x => x.difficulty === 1 && !x.reported).length,
        qMed: q.filter(x => x.difficulty === 2 && !x.reported).length,
        qHard: q.filter(x => x.difficulty === 3 && !x.reported).length,
        hTotal: h.length, hReported: h.filter(x => x.reported).length,
        millTotal: mill.length, millActive: mill.filter(x => x.status === 'waiting' || x.status === 'playing').length,
        quizSess: quiz.length, hlSess: hlSess.length,
      });
    }
    load();
  }, []);
  if (!stats) return <div style={{ ...S.body, color: '#555' }}>Načítavam štatistiky...</div>;
  return (
    <div style={S.body}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        {[
          { label: 'Kvíz otázky celkom', val: stats.qTotal, color: '#a855f7' },
          { label: '⚠️ Nahlásené (kvíz)', val: stats.qReported, color: '#ef4444' },
          { label: 'Kvíz – Ľahké', val: stats.qEasy, color: '#22c55e' },
          { label: 'Kvíz – Stredné', val: stats.qMed, color: '#f59e0b' },
          { label: 'Kvíz – Ťažké', val: stats.qHard, color: '#ef4444' },
          { label: 'H&L položky', val: stats.hTotal, color: '#f59e0b' },
          { label: '⚠️ Nahlásené (H&L)', val: stats.hReported, color: '#ef4444' },
          { label: '🎮 Milionár Sessions', val: stats.millTotal, color: '#c084fc' },
          { label: '🟢 Milionár Aktívne', val: stats.millActive, color: '#3b82f6' },
          { label: '⚔️ Kvíz Duel Sessions', val: stats.quizSess, color: '#a855f7' },
          { label: '📈 H&L Sessions', val: stats.hlSess, color: '#f59e0b' },
        ].map(s => (
          <div key={s.label} style={{ background: '#0d0d0d', border: '1px solid #1a1a1a', borderRadius: 12, padding: '16px 20px' }}>
            <div style={{ fontSize: 11, color: '#555', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
            <div style={{ fontSize: 32, fontWeight: 900, color: s.color }}>{s.val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main Export ───────────────────────────────────────────────────────────────
const TABS = [
  { id: 'stats', label: '📊 Prehľad' },
  { id: 'quiz', label: '🎯 Kvíz otázky' },
  { id: 'hl', label: '📈 Higher or Lower' },
  { id: 'millionaire', label: '💎 Milionár Battle' },
];

export function AdminPanel({ user, onBack }) {
  const [tab, setTab] = useState('stats');

  // Access check – any logged-in user
  if (!user) {
    return (
      <div style={{ ...S.wrap, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16 }}>
        <div style={{ fontSize: 48 }}>🔒</div>
        <div style={{ fontSize: 20, fontWeight: 700, color: '#ef4444' }}>Prístup zamietnutý</div>
        <div style={{ color: '#555', fontSize: 14 }}>Tento panel je len pre administrátorov.</div>
        <button style={S.btn('#888')} onClick={onBack}>← Späť</button>
      </div>
    );
  }

  return (
    <div style={S.wrap}>
      <div style={S.header}>
        <button style={S.back} onClick={onBack}>← Späť</button>
        <div style={S.title}>⚙️ Admin Panel</div>
        <div style={{ marginLeft: 'auto', fontSize: 12, color: '#444' }}>{user.email}</div>
      </div>
      <div style={S.tabs}>
        {TABS.map(t => <button key={t.id} style={S.tab(tab === t.id)} onClick={() => setTab(t.id)}>{t.label}</button>)}
      </div>
      {tab === 'stats' && <StatsTab />}
      {tab === 'quiz' && <QuizQuestionsTab />}
      {tab === 'hl' && <HigherLowerTab />}
      {tab === 'millionaire' && <MillionaireTab />}
    </div>
  );
}
