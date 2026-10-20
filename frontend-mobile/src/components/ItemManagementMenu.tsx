import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { ApiClientError } from '../services/apiClient';
import { deleteServerItem, describeItemMutationError } from '../services/itemApi';
import type { Item } from '../types';
import './ItemManagementMenu.css';

export default function ItemManagementMenu({ item, locked }: { item: Item; locked: boolean }) {
  const { logout } = useApp();
  const navigate = useNavigate();
  const menu = useRef<HTMLDetailsElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const submitting = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      if (event.target instanceof Node && !menu.current?.contains(event.target) && menu.current) menu.current.open = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && menu.current) menu.current.open = false;
    };
    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, []);

  useEffect(() => {
    if (confirming) dialog.current?.showModal();
    else {
      const wasOpen = dialog.current?.open;
      dialog.current?.close();
      if (wasOpen) menu.current?.querySelector('summary')?.focus();
    }
  }, [confirming]);

  async function remove() {
    if (submitting.current || locked || !item.serverId) return;
    submitting.current = true;
    setBusy(true);
    setError('');
    try {
      await deleteServerItem(item.type, item.serverId);
      window.dispatchEvent(new Event('lostquest:data-changed'));
      navigate('/mypage', { replace: true, state: { itemDeleted: true } });
    } catch (cause) {
      if (cause instanceof ApiClientError && cause.status === 401) {
        logout();
        navigate(`/login?returnTo=${encodeURIComponent(`/items/${item.id}`)}`);
      } else setError(describeItemMutationError(cause, 'delete'));
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  return <>
    <details className="item-management" ref={menu}>
      <summary><MoreHorizontal size={19} aria-hidden="true" />물품글 관리</summary>
      <div className="item-management-options" aria-label="물품글 관리 메뉴">
        {locked
          ? <button disabled><Pencil size={16} />물품글 수정</button>
          : <Link to={`/items/${item.id}/edit`}><Pencil size={16} />물품글 수정</Link>}
        <button className="item-delete-option" disabled={locked} onClick={() => {
          if (menu.current) menu.current.open = false;
          setError(''); setConfirming(true);
        }}><Trash2 size={16} />물품글 삭제</button>
        {locked && <p>반환이 진행 중이거나 완료된 글은 수정·삭제할 수 없어요.</p>}
      </div>
    </details>
    <dialog className="item-delete-dialog" ref={dialog} aria-labelledby="delete-item-title"
      onCancel={event => { event.preventDefault(); if (!busy) setConfirming(false); }}
      onClick={event => { if (event.target === event.currentTarget && !busy) setConfirming(false); }}>
      <h2 id="delete-item-title">물품글을 삭제할까요?</h2>
      <p><strong>{item.title}</strong></p>
      <p>삭제한 글은 목록에서 사라지며 다시 복구할 수 없어요.</p>
      {error && <p className="field-error" role="alert">{error}</p>}
      <div className="item-delete-actions">
        <button className="button button-secondary" autoFocus disabled={busy} onClick={() => setConfirming(false)}>취소</button>
        <button className="button item-delete-button" disabled={busy} onClick={() => { void remove(); }}>{busy ? '삭제 중…' : '삭제하기'}</button>
      </div>
    </dialog>
  </>;
}
