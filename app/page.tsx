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
  const [batchMode, setBatchMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchOccupant, setBatchOccupant] = useState('');
  const [batchCode, setBatchCode] = useState('');

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
    if (!selected && !batchOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelected(null);
        setBatchOpen(false);
      }
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [selected, batchOpen]);

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
    setEditCode('');
    setMessage('');
  };

  const toggleBatchMode = () => {
    setBatchMode((current) => !current);
    setSelectedIds(new Set());
    setMessage('');
  };

  const toggleSlot = (slot: Slot) => {
    if (!batchMode) {
      openSlot(slot);
      return;
    }
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(slot.id)) next.delete(slot.id);
      else next.add(slot.id);
      return next;
    });
  };

  const toggleDepthGroup = (height: string, column: string) => {
    const ids = levelSlots
      .filter((slot) => slot.height === height && slot.column === column)
      .map((slot) => slot.id);
    setSelectedIds((current) => {
      const next = new Set(current);
      const allSelected = ids.every((id) => next.has(id));
      ids.forEach((id) => allSelected ? next.delete(id) : next.add(id));
      return next;
    });
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
      setEditCode('');
      setMessage('已保存');
      window.setTimeout(() => setMessage(''), 2200);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '保存失败，请重试');
    } finally { setSaving(false); }
  };

  const saveBatch = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    setSaving(true);
    setMessage('');
    try {
      if (!supabaseConfigured) throw new Error('数据库尚未配置');
      const results = await Promise.all(ids.map((id) => supabase.rpc('update_freezer_slot', {
        p_id: id,
        p_occupant: batchOccupant,
        p_code: batchCode,
      })));
      const firstError = results.find((result) => result.error)?.error;
      if (firstError) {
        if (firstError.message.includes('invalid_edit_code')) throw new Error('编辑码不正确');
        throw firstError;
      }
      const cleaned = batchOccupant.trim();
      setSlots((current) => current.map((slot) => selectedIds.has(slot.id) ? { ...slot, occupant: cleaned } : slot));
      setBatchOpen(false);
      setBatchMode(false);
      setSelectedIds(new Set());
      setBatchOccupant('');
      setBatchCode('');
      setMessage(`已批量保存 ${ids.length} 个位置`);
      window.setTimeout(() => setMessage(''), 2400);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '批量保存失败，请重试');
    } finally { setSaving(false); }
  };

  return (
    <main className="app-shell">
      <header className="hero">
        <div>
          <p className="eyebrow">HKUST(GZ) · Shared storage</p>
          <h1>−80°C Freezer Map</h1>
          <p className="subtitle">搜索样品，或按 L → C → H → D 定位冰箱位置</p>
        </div>
        <button className={`live-pill ${status}`} onClick={() => void refresh()} aria-label="Refresh freezer map">
          <span /> {status === 'ready' ? '地图已同步' : status === 'loading' ? '正在同步' : '点击重试'}
        </button>
      </header>

      <section className="search-panel" aria-label="Search freezer occupants">
        <label htmlFor="search">搜索姓名或类别</label>
        <div className="search-box">
          <span aria-hidden="true">⌕</span>
          <input id="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="例如：lyx、Virus、Tissue" autoComplete="off" />
          {query && <button onClick={() => setQuery('')} aria-label="Clear search">×</button>}
        </div>
        {!normalizedQuery && <p className="search-hint">输入姓名或类别，所有匹配位置会自动高亮</p>}
        {normalizedQuery && matches.length === 0 && <p className="search-hint no-match">未找到“{query.trim()}”的占用位置</p>}
        {matches.length > 0 && <div className="results" aria-live="polite"><p>找到 <strong>{matches.length}</strong> 个位置</p><div>{matches.map((slot) => <button key={slot.id} onClick={() => { setActiveLevel(slot.level); openSlot(slot); }}>{slot.id}</button>)}</div></div>}
      </section>

      <section className="position-guide" aria-label="Position code guide">
        <div className="guide-heading">
          <div><p className="eyebrow">位置编号说明</p><h2>先看懂 L · C · H · D</h2></div>
          <code>L2-C3-H4-D1</code>
        </div>
        <div className="guide-grid">
          <div className="code-guide"><strong>L</strong><span>Level · 冰箱大层</span><small>L1 顶部 → L4 底部</small></div>
          <div className="code-guide"><strong>C</strong><span>Column · 架子列</span><small>C1 左侧 → C5 右侧</small></div>
          <div className="code-guide"><strong>H</strong><span>Height · 架子高度</span><small>H1 上层 → H5 下层</small></div>
          <div className="code-guide"><strong>D</strong><span>Depth · 前后深度</span><small>D1 靠门 → D4 靠冰箱内部</small></div>
        </div>
        <div className="depth-guide">
          <div><strong>门口</strong><span>取样方向</span></div>
          <ol><li>D1</li><li>D2</li><li>D3</li><li>D4</li></ol>
          <div className="inside"><strong>冰箱内部</strong><span>越往里 D 越大</span></div>
        </div>
        <p className="example-line"><strong>例如：</strong>L2-C3-H4-D1 = 第 2 大层 → 第 3 列架子 → 第 4 层高 → 最靠门的位置。</p>
      </section>

      <section className="map-card">
        <div className="map-heading">
          <div><p className="eyebrow">冰箱地图</p><h2>选择一个位置</h2></div>
          <button className={`batch-toggle ${batchMode ? 'active' : ''}`} onClick={toggleBatchMode}>{batchMode ? '退出批量选择' : '＋ 批量占用'}</button>
        </div>

        <nav className="level-tabs" aria-label="Freezer levels">
          {levels.map((level, index) => <button key={level} className={activeLevel === level ? 'active' : ''} onClick={() => setActiveLevel(level)}>
            <strong>{level}</strong><small>{index === 0 ? '顶部' : index === 3 ? '底部' : `第 ${index + 1} 层`}</small>
            {normalizedQuery && matches.some((slot) => slot.level === level) && <em>{matches.filter((slot) => slot.level === level).length}</em>}
          </button>)}
        </nav>

        {batchMode && <div className="batch-banner"><div><strong>批量选择模式</strong><span>逐个点格子；也可以点每组上方的“D1–D4 全选”</span></div><b>{selectedIds.size} 个已选</b></div>}

        <div className="map-subheading"><div><strong>{activeLevel}</strong><span>{activeLevel === 'L1' ? '顶部大层' : activeLevel === 'L4' ? '底部大层' : `第 ${Number(activeLevel.slice(1))} 大层`}</span></div><div className="legend"><span className="available" /> 空位 <span className="occupied" /> 已占用 <span className="highlighted" /> 匹配 {batchMode && <><span className="selected-key" /> 已选择</>}</div></div>
        <div className="column-labels" aria-hidden="true"><span />{columns.map((column) => <strong key={column}>{column}</strong>)}</div>
        <div className="shelf-list">
          {Array.from({ length: 5 }, (_, h) => `H${h + 1}`).map((height) => <section className="shelf-row" key={height}>
            <div className="shelf-label"><strong>{height}</strong><small>上 → 下</small></div>
            {columns.map((column) => {
              const groupSlots = levelSlots.filter((slot) => slot.height === height && slot.column === column);
              const groupSelected = groupSlots.every((slot) => selectedIds.has(slot.id));
              return <div className="depth-group" key={column}>
                {batchMode && <button className={`select-depths ${groupSelected ? 'active' : ''}`} onClick={() => toggleDepthGroup(height, column)}>{groupSelected ? '✓ D1–D4' : 'D1–D4 全选'}</button>}
                <div className="depth-stack">{groupSlots.map((slot) => <button
                  key={slot.id} className={`${slot.occupant ? 'occupied' : ''} ${matchedIds.has(slot.id) ? 'matched' : ''} ${normalizedQuery && !matchedIds.has(slot.id) ? 'dimmed' : ''} ${selectedIds.has(slot.id) ? 'batch-selected' : ''}`}
                  aria-label={`${slot.id}, ${slot.occupant || 'available'}`} title={`${slot.id}${slot.occupant ? ` · ${slot.occupant}` : ''}`} onClick={() => toggleSlot(slot)}
                >{selectedIds.has(slot.id) && <i>✓</i>}<span>{slot.depth}</span>{slot.occupant && <small>{slot.occupant}</small>}</button>)}</div>
              </div>;
            })}
          </section>)}
        </div>
      </section>

      {batchMode && <div className="batch-action-bar"><div><strong>{selectedIds.size}</strong><span>个位置已选择</span></div><button onClick={() => setBatchOpen(true)} disabled={!selectedIds.size}>批量登记</button></div>}

      <footer><p><strong>{status === 'ready' ? occupied : '—'}</strong> / 400 已占用</p><p>数据实时同步到 Supabase</p></footer>

      {selected && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setSelected(null)}>
        <section className="slot-modal" role="dialog" aria-modal="true" aria-labelledby="slot-title">
          <button className="modal-close" onClick={() => setSelected(null)} aria-label="Close">×</button>
          <p className="eyebrow">位置代码</p><h2 id="slot-title">{selected.id}</h2>
          <dl><div><dt>大层 L</dt><dd>{selected.level}</dd></div><div><dt>列 C</dt><dd>{selected.column}</dd></div><div><dt>高度 H</dt><dd>{selected.height}</dd></div><div><dt>深度 D</dt><dd>{selected.depth}</dd></div></dl>
          <label htmlFor="occupant">占用者 / 类别</label><input id="occupant" value={occupantDraft} onChange={(event) => setOccupantDraft(event.target.value)} maxLength={80} placeholder="姓名 或 姓名 - Category" autoFocus />
          <p className="form-help">留空并保存，即可释放该位置。</p>
          <label className="code-label" htmlFor="edit-code">实验室编辑码</label><input id="edit-code" value={editCode} onChange={(event) => setEditCode(event.target.value)} type="password" inputMode="numeric" placeholder="输入编辑码" />
          {message && <p className="form-message" role="alert">{message}</p>}
          <div className="modal-actions"><button className="secondary" onClick={() => setSelected(null)}>取消</button><button className="primary" onClick={() => void saveSlot()} disabled={saving || !editCode}>{saving ? '正在保存…' : '保存'}</button></div>
        </section>
      </div>}

      {batchOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setBatchOpen(false)}>
        <section className="slot-modal batch-modal" role="dialog" aria-modal="true" aria-labelledby="batch-title">
          <button className="modal-close" onClick={() => setBatchOpen(false)} aria-label="Close">×</button>
          <p className="eyebrow">批量占用</p><h2 id="batch-title">登记 {selectedIds.size} 个位置</h2>
          <p className="batch-summary">这些位置会统一写入同一个占用者 / 类别。若其中已有占用信息，将被新的内容覆盖。</p>
          <label htmlFor="batch-occupant">占用者 / 类别</label><input id="batch-occupant" value={batchOccupant} onChange={(event) => setBatchOccupant(event.target.value)} maxLength={80} placeholder="例如：Wen - Virus" autoFocus />
          <p className="form-help">留空并保存，可以一次释放所有已选位置。</p>
          <label className="code-label" htmlFor="batch-code">实验室编辑码</label><input id="batch-code" value={batchCode} onChange={(event) => setBatchCode(event.target.value)} type="password" inputMode="numeric" placeholder="输入编辑码" />
          {message && <p className="form-message" role="alert">{message}</p>}
          <div className="modal-actions"><button className="secondary" onClick={() => setBatchOpen(false)}>取消</button><button className="primary" onClick={() => void saveBatch()} disabled={saving || !batchCode}>{saving ? '正在保存…' : `保存 ${selectedIds.size} 个位置`}</button></div>
        </section>
      </div>}

      {message.startsWith('已') && <div className="toast" role="status">✓ {message}</div>}
    </main>
  );
}
