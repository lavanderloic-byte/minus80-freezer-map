'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'freezer_edit_session_v1';

type StoredSession = { code: string };

function readSession(): StoredSession | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSession & { expiresAt?: number };
    if (!parsed.code) {
      window.localStorage.removeItem(STORAGE_KEY);
      return null;
    }
    // Older 30-day sessions are upgraded automatically to permanent local trust.
    const permanent = { code: parsed.code };
    if ('expiresAt' in parsed) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(permanent));
    return permanent;
  } catch {
    return null;
  }
}

function setReactInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

export default function EditCodeSession() {
  const [remembered, setRemembered] = useState(false);

  useEffect(() => {
    const sync = () => {
      const session = readSession();
      const active = Boolean(session);
      setRemembered(active);
      document.body.classList.toggle('edit-code-remembered', active);
      if (session) {
        document.querySelectorAll<HTMLInputElement>('.code-input').forEach((input) => {
          if (input.value !== session.code) setReactInputValue(input, session.code);
        });
      }
    };

    const observer = new MutationObserver(() => {
      const invalid = Array.from(document.querySelectorAll('.form-message')).some((node) =>
        node.textContent?.includes('编辑码不正确'),
      );
      if (invalid) {
        window.localStorage.removeItem(STORAGE_KEY);
        document.body.classList.remove('edit-code-remembered');
        setRemembered(false);
      }
      sync();
    });

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target?.closest('.primary')) return;
      const dialog = target.closest('.slot-modal');
      const input = dialog?.querySelector<HTMLInputElement>('.code-input');
      const code = input?.value.trim();
      if (!code) return;
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ code }));
      setRemembered(true);
      document.body.classList.add('edit-code-remembered');
    };

    sync();
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener('click', onClick, true);
    return () => {
      observer.disconnect();
      document.removeEventListener('click', onClick, true);
      document.body.classList.remove('edit-code-remembered');
    };
  }, []);

  const logout = () => {
    window.localStorage.removeItem(STORAGE_KEY);
    document.body.classList.remove('edit-code-remembered');
    document.querySelectorAll<HTMLInputElement>('.code-input').forEach((input) => setReactInputValue(input, ''));
    setRemembered(false);
  };

  if (!remembered) return null;

  return (
    <button
      type="button"
      onClick={logout}
      aria-label="退出本机编辑权限"
      style={{
        position: 'fixed',
        right: 12,
        bottom: 12,
        zIndex: 40,
        border: '1px solid #c8ddd9',
        borderRadius: 999,
        background: 'rgba(255,255,255,.95)',
        color: '#506b68',
        padding: '8px 12px',
        fontSize: 11,
        fontWeight: 700,
        boxShadow: '0 6px 18px rgba(19,76,70,.10)',
      }}
    >
      🔓 本机已授权 · 退出
    </button>
  );
}
