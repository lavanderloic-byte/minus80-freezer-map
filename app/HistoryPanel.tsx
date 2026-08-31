'use client';

import { useCallback, useEffect, useState } from 'react';
import { supabase, supabaseConfigured } from '@/lib/supabase';

type HistoryEntry = {
  id: number;
  slot_id: string;
  old_occupant: string;
  new_occupant: string;
  changed_at: string;
};

function formatTime(value: string) {
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
      timeZone: 'Asia/Shanghai',
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export default function HistoryPanel() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (!supabaseConfigured) throw new Error('数据库尚未配置');
      const { data, error: queryError } = await supabase
        .from('freezer_history')
        .select('id, slot_id, old_occupant, new_occupant, changed_at')
        .order('changed_at', { ascending: false })
        .limit(100);
      if (queryError) throw queryError;
      setEntries((data ?? []) as HistoryEntry[]);
    } catch {
      setError('修改历史尚未启用，请先应用 Supabase 历史记录迁移。');
    } finally {
      setLoading(false);
    }
  }, []);

  const show = () => {
    setOpen(true);
    void load();
  };

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [open]);

  return (
    <>
      <button type="button" className="history-fab" onClick={show}>↺ 修改历史</button>
      {open && <div className="history-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setOpen(false)}>
        <section className="history-card" role="dialog" aria-modal="true" aria-labelledby="history-title">
          <button type="button" className="history-close" onClick={() => setOpen(false)} aria-label="关闭">×</button>
          <div className="history-head">
            <p className="eyebrow">CHANGE LOG</p>
            <h2 id="history-title">修改历史</h2>
            <p>显示最近 100 次实际变更；重复保存相同内容不会生成记录。</p>
          </div>
          <div className="history-list" aria-live="polite">
            {loading && <div className="history-state">正在读取修改历史…</div>}
            {!loading && error && <div className="history-state">{error}</div>}
            {!loading && !error && entries.length === 0 && <div className="history-state">还没有修改记录</div>}
            {!loading && !error && entries.map((entry) => <article className="history-item" key={entry.id}>
              <div className="history-item-top"><span className="history-slot">{entry.slot_id}</span><time className="history-time">{formatTime(entry.changed_at)}</time></div>
              <div className="history-change">
                <span className={`history-value ${entry.old_occupant ? '' : 'empty'}`} title={entry.old_occupant || '空位'}>{entry.old_occupant || '空位'}</span>
                <span className="history-arrow">→</span>
                <span className={`history-value ${entry.new_occupant ? '' : 'empty'}`} title={entry.new_occupant || '空位'}>{entry.new_occupant || '空位'}</span>
              </div>
            </article>)}
          </div>
          <button type="button" className="history-refresh" onClick={() => void load()} disabled={loading}>{loading ? '正在刷新…' : '刷新记录'}</button>
        </section>
      </div>}
    </>
  );
}
