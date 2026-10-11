import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ArrowRight, ChevronRight, Package, Plus, RefreshCw } from 'lucide-react';
import { useApp } from '../context/AppContext';
import { defaultItemImage } from '../data/seed';
import { describeMyItemsError, listMyItems, type MyItems } from '../services/itemApi';
import type { Item } from '../types';
import ItemImage from './ItemImage';
import { formatRegistrationTime } from '../services/dateTime';

type State = { status: 'loading' } | { status: 'error'; message: string } | { status: 'ready'; items: MyItems };

function MyItemCard({ item }: { item: Item }) {
  const registeredAt = formatRegistrationTime(item.createdAt);
  return <Link className="card profile-item" to={`/items/${item.id}`} aria-label={`${item.title} 상세 보기`}>
    <span className="profile-item-photo"><ItemImage src={item.image} fallbackSrc={defaultItemImage(item.category, item.title)} alt={item.title} loading="lazy" /></span>
    <div>
      <div className="profile-item-badges"><span className={`badge ${item.type === 'lost' ? 'badge-orange' : 'badge-blue'}`}>{item.type === 'lost' ? '분실물' : '습득물'}</span>{item.status === 'returned' && <span className="badge badge-green">반환 완료</span>}</div>
      <h3>{item.title}</h3>
      <p>{item.region || item.location}</p>
      <time className="muted" dateTime={item.date}>{item.type === 'lost' ? '분실' : '습득'} {item.date}</time>
      {registeredAt && <p className="item-registration-time">글 등록 <time dateTime={item.createdAt}>{registeredAt}</time> (한국 시간)</p>}
    </div>
    <ChevronRight size={17} aria-hidden="true" />
  </Link>;
}

/**
 * The signed-in user's own registrations from the server (GET /api/me/items). Failures are shown as errors;
 * nothing falls back to the browser demo items.
 */
export default function MyItemList() {
  const { authUser } = useApp();
  const userId = authUser?.id ?? null;
  const [state, setState] = useState<State>({ status: 'loading' });
  // Only the newest request may update the view (retry, user switch, unmount).
  const requestRef = useRef(0);

  const load = useCallback(async () => {
    const request = ++requestRef.current;
    setState({ status: 'loading' });
    try {
      const items = await listMyItems();
      if (request === requestRef.current) setState({ status: 'ready', items });
    } catch (error) {
      if (request === requestRef.current) setState({ status: 'error', message: describeMyItemsError(error) });
    }
  }, []);

  useEffect(() => {
    void load();
    return () => { requestRef.current += 1; };
  }, [load, userId]);

  const total = state.status === 'ready' ? state.items.lostItems.length + state.items.foundItems.length : null;
  const groups = state.status === 'ready' ? [
    { label: '분실물', items: state.items.lostItems },
    { label: '습득물', items: state.items.foundItems },
  ].filter((group) => group.items.length > 0) : [];

  return <section aria-labelledby="my-items-title" className="my-items-section">
    <div className="workflow-section-heading"><h2 id="my-items-title">내가 등록한 물품{total !== null && <span>{total}</span>}</h2><Link className="button button-secondary" to="/register?type=lost"><Plus size={16} aria-hidden="true" /> 물품 등록</Link></div>
    {state.status === 'loading' ? <div className="card empty-state" role="status"><Package size={35} aria-hidden="true" /><h3>등록 내역을 불러오고 있어요…</h3></div>
      : state.status === 'error' ? <div className="card empty-state" role="alert"><AlertTriangle size={35} aria-hidden="true" /><h3>등록 내역을 불러오지 못했어요</h3><p>{state.message}</p><button type="button" className="button button-secondary" onClick={() => void load()}><RefreshCw size={15} aria-hidden="true" /> 다시 시도</button></div>
        : total === 0 ? <div className="card empty-state"><Package size={37} aria-hidden="true" /><h3>아직 등록한 물품이 없어요</h3><p>분실물이나 습득물을 등록하면 이곳에서 모아 볼 수 있어요.</p><div className="my-items-empty-actions"><Link className="button button-primary" to="/register?type=lost">분실물 등록하기 <ArrowRight size={16} aria-hidden="true" /></Link><Link className="button button-secondary" to="/register?type=found">습득물 등록하기</Link></div></div>
          : groups.map((group) => <div className="my-item-group" key={group.label}>
            <h3 className="my-item-group-title">{group.label} <span>{group.items.length}</span></h3>
            <ul className="profile-item-grid my-item-list" aria-label={`내 ${group.label} 등록 내역`}>{group.items.map((item) => <li key={item.id}><MyItemCard item={item} /></li>)}</ul>
          </div>)}
  </section>;
}
