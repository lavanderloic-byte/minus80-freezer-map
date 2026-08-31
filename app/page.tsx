'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, supabaseConfigured } from '@/lib/supabase';

const levels = ['L1', 'L2', 'L3', 'L4'] as const;
const columns = ['C1', 'C2', 'C3', 'C4', 'C5'] as const;

type Level = (typeof levels)[number];
type Slot = { id: string; level: Level; column: string; height: string; depth: string; occupant: string };
type StoredSlot = { id: string; occupant: string };

function emptySlots(): Slot[] {
  return levels.flatMap((level) => Array.from({ length: 5 }, (_, h) =>
    Array.from({ length: 4 }, (_, d) => columns.map((column) => ({
      id: `${level}-${column}-H${h + 1}-D${d + 1}`,
      level, column, height: `H${h + 1}`, depth: `D${d + 1}`, occupant: '',
    }))).flat(),
  ).flat());
}

export default function Home() {
  const [activeLevel, setActiveLevel] = useState<Level>('L1');
  const [query, setQuery] = useState('');
  const [slots, setSlots] = useState<Slot[]>(emptySlots);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [selected, setSelected] = useState<Slot | null>(null);
  const [occupantDraft, setOccupantDraft] = useState('');
  const [editCode, setEditCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const refresh = useCallback(async () => {
    setStatus('loading');
    try {
      if (!supabaseConfigured) throw new Error('数据库尚未配置');
      const { data, error } = await supabase
        .from('freezer_slots')
        .select('id, occupant')
        .neq('occupant', '')
        .order('id');
      if (error) throw error;
      const owners = new Map((data as StoredSlot[]).map((slot) => [slot.id, slot.occupant]));
      setSlots(emptySlots().map((slot) => ({ ...slot, occupant: owners.get(slot.id) ?? '' })));
      setStatus('ready');
    } catch { setStatus('error'); }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  useEffect(() => {
    if (!selected) return;
    const close = (event: KeyboardEvent) => event.key === 'Escape' && setSelected(null);
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [selected]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const matches = useMemo(() => normalizedQuery
    ? slots.filter((slot) => slot.occupant.toLocaleLowerCase().includes(normalizedQuery))
    : [], [normalizedQuery, slots]);
  const matchedIds = useMemo(() => new Set(matches.map((slot) => slot.id)), [matches]);
  const levelSlots = useMemo(() => slots.filter((slot) => slot.level === activeLevel), [activeLevel, slots]);
  const occupied = slots.filter((slot) => slot.occupant).length;

  const openSlot = (slot: Slot) => {
    setSelected(slot);
    setOccupantDraft(slot.occupant);
    setMessage('');
  };

  const saveSlot = async () => {
    if (!selected) return;
    setSaving(true);
    setMessage('');
    try {
      if (!supabaseConfigured) throw new Error('数据库尚未配置');
      const { error } = await supabase.rpc('update_freezer_slot', {
        p_id: selected.id,
        p_occupant: occupantDraft,
        p_code: editCode,
      });
      if (error) {
        if (error.message.includes('invalid_edit_code')) throw new Error('编辑码不正确');
        throw error;
      }
      setSlots((current) => current.map((slot) => slot.id === selected.id ? { ...slot, occupant: occupantDraft.trim() } : slot));
      setSelected(null);
      setMessage('已保存');
      window.setTimeout(() => setMessage(''), 2200);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败，请重试');
    } finally { setSaving(false); }
  };

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">HKUST(GZ) · Shared storage</p>
          <h1>−80°C Freezer Map</h1>
          <p className="subtitle">快速查找样品位置 · D1 靠门，D4 最深</p>
        </div>
        <button className={`live-pill ${status}`} onClick={() => void refresh()} aria-label="Refresh freezer map">
          <span /> {status === 'ready' ? '地图已同步' : status === 'loading' ? '正在同步' : '点击重试'}
        </button>
      </header>

      <section className="search-panel" aria-label="Search freezer occupants">
        <label htmlFor="search">搜索姓名或类别</label>
        <div className="search-box">
          <span aria-hidden="true">⌕</span>
          <input id="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例如：Wen、Virus、Tissue" autoComplete="off" />
          {query && <button onClick={() => setQuery('')} aria-label="Clear search">×</button>}
        </div>
        {!normalizedQuery && <p className="search-hint">输入姓名后，所有匹配位置会自动高亮</p>}
        {normalizedQuery && matches.length === 0 && <p className="search-hint no-match">未找到“{query.trim()}”的占用位置</p>}
        {matches.length > 0 && <div className="results" aria-live="polite"><p>找到 <strong>{matches.length}</strong> 个位置</p><div>{matches.map((slot) => <button key={slot.id} onClick={() => { setActiveLevel(slot.level); openSlot(slot); }}>{slot.id}</button>)}</div></div>}
      </section>

      <nav className="level-tabs" aria-label="Freezer levels">
        {levels.map((level, index) => <button key={level} className={activeLevel === level ? 'active' : ''} onClick={() => setActiveLevel(level)}>
          <strong>{level}</strong><small>{index === 0 ? '顶部' : index === 3 ? '底部' : `第 ${index + 1} 层`}</small>
          {normalizedQuery && matches.some((slot) => slot.level === level) && <em>{matches.filter((slot) => slot.level === level).length}</em>}
        </button>)}
      </nav>

      <section className="map-card">
        <div className="map-heading"><div><p className="eyebrow">{activeLevel} · 大层</p><h2>选择一个位置</h2></div><div className="legend"><span className="available" /> 空位 <span className="occupied" /> 已占用 <span className="highlighted" /> 匹配</div></div>
        <div className="column-labels" aria-hidden="true"><span />{columns.map((column) => <strong key={column}>{column}</strong>)}</div>
        <div className="shelf-list">
          {Array.from({ length: 5 }, (_, h) => `H${h + 1}`).map((height) => <section className="shelf-row" key={height}>
            <div className="shelf-label"><strong>{height}</strong><small>上 → 下</small></div>
            {columns.map((column) => <div className="depth-stack" key={column}>{levelSlots.filter((slot) => slot.height === height && slot.column === column).map((slot) => <button
              key={slot.id} className={`${slot.occupant ? 'occupied' : ''} ${matchedIds.has(slot.id) ? 'matched' : ''} ${normalizedQuery && !matchedIds.has(slot.id) ? 'dimmed' : ''}`}
              aria-label={`${slot.id}, ${slot.occupant || 'available'}`} title={`${slot.id}${slot.occupant ? ` · ${slot.occupant}` : ''}`} onClick={() => openSlot(slot)}
            ><span>{slot.depth}</span>{slot.occupant && <small>{slot.occupant}</small>}</button>)}</div>)}
          </section>)}
        </div>
      </section>

      <footer><p><strong>{status === 'ready' ? occupied : '—'}</strong> / 400 已占用</p><p>数据保存在本网页</p></footer>

      {selected && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}>
        <section className="slot-modal" role="dialog" aria-modal="true" aria-labelledby="slot-title">
          <button className="modal-close" onClick={() => setSelected(null)} aria-label="Close">×</button>
          <p className="eyebrow">位置代码</p><h2 id="slot-title">{selected.id}</h2>
          <dl><div><dt>大层</dt><dd>{selected.level}</dd></div><div><dt>列</dt><dd>{selected.column}</dd></div><div><dt>高度</dt><dd>{selected.height}</dd></div><div><dt>深度</dt><dd>{selected.depth}</dd></div></dl>
          <label htmlFor="occupant">占用者 / 类别</label><input id="occupant" value={occupantDraft} onChange={(event) => setOccupantDraft(event.target.value)} maxLength={80} placeholder="姓名 或 姓名 - Category" autoFocus />
          <p className="form-help">留空并保存，即可释放该位置。</p>
          <label className="code-label" htmlFor="edit-code">实验室编辑码</label><input id="edit-code" value={editCode} onChange={(event) => setEditCode(event.target.value)} type="password" inputMode="numeric" placeholder="输入编辑码" />
          {message && <p className="form-message" role="alert">{message}</p>}
          <div className="modal-actions"><button className="secondary" onClick={() => setSelected(null)}>取消</button><button className="primary" onClick={() => void saveSlot()} disabled={saving || !editCode}>{saving ? '正在保存…' : '保存'}</button></div>
        </section>
      </div>}
      {message === '已保存' && <div className="toast" role="status">✓ 已保存</div>}
    </main>
  );
}
