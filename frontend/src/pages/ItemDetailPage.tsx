import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Building2, CalendarDays, CheckCircle2, Clock3, ChevronRight, ExternalLink, MapPin, ShieldCheck, Sparkles, Tag, UserRound, Wallet } from 'lucide-react';
import { useApp } from '../context/AppContext';
import ItemCard from '../components/ItemCard';
import ItemPhoto from '../components/ItemPhoto';
import { describeActivityError, setupOwnership } from '../services/activityApi';
import { ApiClientError } from '../services/apiClient';
import { getServerItem, parseServerRouteId } from '../services/itemApi';
import { getPoliceItem, parsePoliceRouteId } from '../services/publicItemApi';
import type { Item } from '../types';
import { formatRegistrationTime } from '../services/dateTime';

export default function ItemDetailPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { items, requests, isLoggedIn, authUser, createRequest } = useApp();
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [question,setQuestion]=useState('');
  const [answer,setAnswer]=useState('');
  const [tab,setTab]=useState<'info'|'location'>('info');
  // Server items (`api-lost-12`) and 경찰청 items (`police-lost-L…`) are fetched from their detail APIs;
  // only server and police items are used.
  const [remote,setRemote]=useState<{id?:string;item?:Item;error?:string;notFound?:boolean}>({});
  const [reload,setReload]=useState(0);
  useEffect(()=>{
    const ref=parseServerRouteId(id);
    const policeRef=parsePoliceRouteId(id);
    if(!ref&&!policeRef) return;
    let cancelled=false;
    setRemote({id});
    (ref?getServerItem(ref.type,ref.serverId):getPoliceItem(id!)).then(loaded=>{ if(!cancelled) setRemote({id,item:loaded}); }).catch((cause:unknown)=>{
      if(cancelled) return;
      const notFound=cause instanceof ApiClientError&&cause.status===404;
      setRemote({id,notFound,error:cause instanceof ApiClientError?cause.message:'물품 정보를 불러오지 못했어요.'});
    });
    return ()=>{cancelled=true;};
  },[id,reload]);
  const isServerRoute=parseServerRouteId(id)!==null||parsePoliceRouteId(id)!==null;
  const remoteCurrent=remote.id===id?remote:{};
  const item=isServerRoute?remoteCurrent.item:items.find(i=>i.id===id);
  if(isServerRoute&&!item&&!remoteCurrent.error) return <div className="page-container empty-state" role="status"><span className="loading-dot"/>물품 정보를 불러오고 있어요.</div>;
  if(isServerRoute&&!item&&!remoteCurrent.notFound) return <div className="page-container empty-state"><Wallet size={36}/><h1>물품 정보를 불러오지 못했어요.</h1><p>{remoteCurrent.error}</p><div className="button-row"><button className="button button-secondary" onClick={()=>setReload(value=>value+1)}>다시 시도</button><Link to="/search" className="button button-primary">물품 목록으로</Link></div></div>;
  if(!item) return <div className="page-container empty-state"><Wallet size={36}/><h1>이 물품을 찾을 수 없어요.</h1><p>삭제되었거나 잘못된 물품 주소예요.</p><Link to="/search" className="button button-primary">물품 목록으로</Link></div>;
  const registeredAt = formatRegistrationTime(item.createdAt);
  // Matching is offered for the signed-in user's own server lost items; the server re-checks ownership.
  const isMyServerLost=item.type==='lost'&&item.createdBy==='server'&&authUser!==null&&item.ownerId===authUser.id;
  const existing=requests.find(r=>r.itemId===item.id && r.status!=='rejected');
  const related=items.filter(i=>i.id!==item.id && i.category===item.category).slice(0,4);
  const requestReturn=async ()=>{
    if(busy) return;
    if(!isLoggedIn){navigate(`/login?returnTo=${encodeURIComponent(`/items/${item.id}${params.size?'?'+params.toString():''}`)}`);return;}
    setBusy(true);
    try { const request=existing??await createRequest(item.id,params.get('lostItem')??undefined);navigate(`/returns/${request.id}`); } catch(e) {setError(describeActivityError(e));} finally {setBusy(false);}
  };
  return <div className="page-container detail-page"><div className="breadcrumbs"><Link to="/">홈</Link><ChevronRight size={13}/><Link to="/search">전국 통합 검색</Link><ChevronRight size={13}/><span>물품 상세</span></div><div className="detail-layout"><ItemPhoto item={item}/><div className="detail-info"><div className="detail-badges"><span className={`badge ${item.type==='found'?'badge-green':'badge-blue'}`}>{item.type==='found'?'주인을 찾아요':'찾고 있어요'}</span><span className="badge badge-neutral">{item.source==='public'?'경찰청 공공데이터':'자체 등록'}</span>{item.status==='returned'&&<span className="badge badge-green"><CheckCircle2 size={12}/>반환 완료</span>}</div><h1>{item.title}</h1><p className="detail-subtitle"><MapPin size={16}/>{(item.location.startsWith(item.region) ? item.location : [item.region, item.location].join(' ')).trim() || '장소 정보 없음'}</p><dl className="detail-facts"><div><dt><Tag size={17}/>카테고리</dt><dd>{item.category}</dd></div><div><dt><Wallet size={17}/>색상</dt><dd>{item.color || '정보 없음'}</dd></div><div><dt><CalendarDays size={17}/>{item.type==='found'?'습득 날짜':'분실 날짜'}</dt><dd>{item.date ? item.date.replaceAll('-','. ') : '정보 없음'}</dd></div>{registeredAt && <div><dt><Clock3 size={17}/>글 등록일시</dt><dd><time dateTime={item.createdAt}>{registeredAt}</time><small className="registration-zone">한국 시간</small></dd></div>}<div><dt><UserRound size={17}/>등록 출처</dt><dd>{item.source==='public'?'경찰청 유실물 공공데이터':item.createdBy==='server'?'LOST QUEST 회원':'LOST QUEST 이웃 (테스트)'}</dd></div></dl>{item.facts&&item.facts.length>0&&<dl className="detail-extra-facts">{item.facts.map(fact=><div key={fact.label}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>)}</dl>}
      {item.source==='public'?<div className="agency-card"><Building2 size={22}/><div><strong>{item.agency??'담당 경찰관서'}</strong>{item.phone&&<p>문의 {item.phone}</p>}<p>경찰청 유실물 공공데이터에서 실시간으로 가져온 정보예요. 수령·반환은 LOST QUEST가 아닌 담당 기관과 경찰청 LOST112에서 진행해 주세요.</p><a href="https://www.lost112.go.kr/" target="_blank" rel="noopener noreferrer" className="button button-primary">경찰청 LOST112 안내<ExternalLink size={15}/></a><small>외부 사이트로 이동합니다.</small></div></div>:item.type==='found'?<><div className="detail-security"><ShieldCheck size={19}/><p>소유자 확인과 QR 인증 후 반환을 진행해요.<br/>승인·최종 확인은 습득자 또는 관리자가 진행합니다.</p></div>{item.ownerId===authUser?.id ? <><Link to="/admin" className="button button-primary detail-cta">내 습득물 반환 관리<ArrowRight size={17}/></Link>{item.status==='open' && <form onSubmit={async event=>{event.preventDefault(); if(busy || !item.serverId) return; setBusy(true); try {const updated=await setupOwnership(item.serverId,question,answer);setRemote({id,item:updated});setAnswer('');setError('');}catch(e){setError(describeActivityError(e));}finally{setBusy(false);}}}><h3>소유자 확인 질문 {item.ownershipConfigured ? '변경' : '설정'}</h3><label className="form-field"><span>확인 질문</span><input required maxLength={200} value={question} onChange={e=>setQuestion(e.target.value)}/></label><label className="form-field"><span>비공개 답변</span><input required maxLength={100} autoComplete="off" value={answer} onChange={e=>setAnswer(e.target.value)}/></label><button className="button button-secondary" disabled={busy}>질문 저장</button><p className="muted">진행 중인 반환 요청이 있으면 변경할 수 없어요.</p></form>}</> : <button onClick={()=>{void requestReturn();}} disabled={busy||(item.status==='returned'&&!existing)} className="button button-primary detail-cta">{busy?'처리 중…':existing?'반환 진행 상황 보기':item.status==='returned'?'반환이 완료된 물품':'내 물건이라면, 반환 요청하기'}<ArrowRight size={17}/></button>}{error&&<p className="field-error" role="alert">{error}</p>}</>:<div className="detail-security detail-lost-message"><Sparkles size={23}/><div><strong>{item.status === 'returned' ? '소중한 물건이 돌아왔어요.' : isMyServerLost ? '닮은 습득물을 함께 찾아볼까요?' : '이웃이 찾고 있는 물건이에요.'}</strong><p>{item.status === 'returned' ? '마이페이지에서 반환 내역을 확인할 수 있어요.' : isMyServerLost ? '등록한 정보를 바탕으로 LOST QUEST·경찰청 습득물을 비교해 보세요.' : '습득한 물품을 등록하면 함께 찾아볼 수 있어요.'}</p>{item.status === 'open' && isMyServerLost && <Link className="button button-primary" to={`/matches?item=${item.id}`}>매칭 추천 보기<ArrowRight size={16}/></Link>}</div></div>}
    </div></div><section className="detail-description card"><div className="detail-tabs" role="tablist" aria-label="물품 상세 정보"><button role="tab" aria-selected={tab==='info'} aria-controls="detail-panel" id="detail-tab-info" className={tab==='info'?'active':''} onClick={()=>setTab('info')}>상세 정보</button><button role="tab" aria-selected={tab==='location'} aria-controls="detail-panel" id="detail-tab-location" className={tab==='location'?'active':''} onClick={()=>setTab('location')}>위치 정보</button></div><div id="detail-panel" role="tabpanel" aria-labelledby={`detail-tab-${tab}`} className="detail-tab-body">{tab==='info'?<><h2>이런 물건이에요</h2><p>{item.description}</p><div className="info-note"><ShieldCheck size={17}/><p>안전한 소유 확인을 위해 일부 특징은 공개되지 않아요. 반환 요청 단계에서 확인해 주세요.</p></div></>:<><div className="location-placeholder"><MapPin size={34}/><strong>{item.location.startsWith(item.region) ? item.location : [item.region, item.location].join(' ')}</strong><span>위치 텍스트 예시 · 실제 지도 API는 연결하지 않았어요</span></div><p>정확한 수령 장소는 실제 서비스에서 반환 요청 승인 후 안내됩니다.</p></>}</div></section><Link to="/search" className="text-link detail-back"><ArrowLeft size={16}/>물품 목록으로 돌아가기</Link>{related.length>0&&<section className="detail-related"><div className="section-heading"><div><span className="section-kicker">다른 물건도 살펴보세요</span><h2>비슷한 카테고리의 물품</h2></div></div><div className="items-grid">{related.map(i=><ItemCard key={i.id} item={i}/>)}</div></section>}</div>;
}
