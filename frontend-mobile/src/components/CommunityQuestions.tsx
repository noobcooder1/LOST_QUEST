import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { describeActivityError } from '../services/activityApi';
import { answerCommunityQuestion, askCommunityQuestion, listCommunityQuestions, type CommunityPage, type CommunityQuestion } from '../services/communityApi';
import type { Item } from '../types';
import './community.css';

export default function CommunityQuestions({ item }: { item?: Item }) {
  const { authUser } = useApp();
  const [result, setResult] = useState<CommunityPage<CommunityQuestion>>({ items: [], page: 0, hasNext: false });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [question, setQuestion] = useState('');
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const version = useRef(0);
  const load = useCallback(async (page = 0) => {
    const request = ++version.current; setLoading(true); setError('');
    try { const next = await listCommunityQuestions(item?.id, page); if (request === version.current) setResult(next); }
    catch (cause) { if (request === version.current) setError(describeActivityError(cause)); }
    finally { if (request === version.current) setLoading(false); }
  }, [item?.id]);
  useEffect(() => { void load(); return () => { version.current += 1; }; }, [load]);
  const submit = async (event: FormEvent, id?: number) => {
    event.preventDefault(); if (busy) return;
    const request = version.current; setBusy(true); setError(''); setNotice('');
    try {
      if (id !== undefined) await answerCommunityQuestion(id, answers[id] ?? '');
      else if (item) await askCommunityQuestion(item.id, question);
      if (request !== version.current) return;
      setQuestion(''); setAnswers({}); setNotice(id === undefined ? '질문을 보냈어요. 질문함에서 답변을 확인해 주세요.' : '답변을 저장했어요.');
      await load(id === undefined ? 0 : result.page);
    } catch (cause) { if (request === version.current) setError(describeActivityError(cause)); }
    finally { setBusy(false); }
  };
  return <section className="community-section card" aria-label="비공개 질문과 답변">
    <div className="community-heading"><h2>비공개 질문·답변</h2><Link className="text-link" to="/community-inbox">내 질문함</Link></div>
    <p className="muted">질문자와 물품글 작성자만 볼 수 있어요. 연락처·주소·신분증 정보를 불필요하게 보내지 마세요. 답변만으로 소유자 인증이 완료되지는 않습니다.</p>
    {item && item.status === 'open' && item.ownerId !== authUser?.id && <form onSubmit={event => { void submit(event); }}>
      <label className="form-field"><span>작성자에게 보낼 질문</span><textarea required maxLength={1000} rows={3} value={question} onChange={event => setQuestion(event.target.value)} placeholder="물품 특징이나 발견 상황을 확인해 보세요." /></label>
      <button className="button button-primary" disabled={busy || loading}>{busy ? '저장 중…' : '비공개 질문 보내기'}</button>
    </form>}
    {notice && <p role="status">{notice}</p>}
    {error && <div role="alert"><p className="field-error">{error}</p><button className="text-link" disabled={loading || busy} onClick={() => { void load(result.page); }}>목록 다시 조회</button><p className="muted">질문·답변 저장은 자동으로 재전송하지 않습니다. 재작성 전 목록을 확인해 주세요.</p></div>}
    {loading ? <p role="status">질문을 불러오고 있어요…</p> : <>
      {result.items.length === 0 && !error && <p className="community-empty">아직 주고받은 질문이 없어요.</p>}
      {result.items.map(entry => <article className="community-question" key={entry.id}>
        <div className="community-heading"><Link to={`/items/api-${entry.itemType}-${entry.itemId}`}>{entry.itemTitle}</Link><span className={`badge ${entry.answer ? 'badge-green' : 'badge-blue'}`}>{entry.answer ? '답변 완료' : '답변 대기'}</span></div>
        <small>{entry.canAnswer ? '받은 질문' : '보낸 질문'} · {new Date(entry.createdAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}</small>
        <p className="community-message"><strong>질문</strong> {entry.question}</p>
        {entry.answer !== null ? <p className="community-message"><strong>작성자 답변</strong> {entry.answer}</p> : entry.canAnswer && <form onSubmit={event => { void submit(event, entry.id); }}>
          <label className="form-field"><span>{entry.itemTitle} 질문 답변</span><textarea required maxLength={1000} rows={3} value={answers[entry.id] ?? ''} onChange={event => setAnswers(previous => ({ ...previous, [entry.id]: event.target.value }))} /></label>
          <button className="button button-secondary" disabled={busy}>답변 저장</button>
        </form>}
        {entry.answer && <p className="community-next">{entry.itemType === 'found' ? <Link className="text-link" to={`/items/api-found-${entry.itemId}`}>물품 확인·기존 반환 절차로 이동</Link> : <><span>습득했다면 주운 물건 글과 소유자 확인 질문을 등록하고 분실자에게 알려 주세요.</span><Link className="text-link" to="/register?type=found">주인 찾기 등록하기</Link></>}</p>}
      </article>)}
      <div className="button-row"><button className="button button-secondary" disabled={busy || result.page === 0} onClick={() => { void load(result.page - 1); }}>이전 질문</button><span>{result.page + 1}페이지</span><button className="button button-secondary" disabled={busy || !result.hasNext} onClick={() => { void load(result.page + 1); }}>다음 질문</button><button className="text-link" disabled={busy} onClick={() => { void load(result.page); }}>새로고침</button></div>
    </>}
  </section>;
}
