import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  Backpack, Camera, Check, Crown, Flame, Glasses, Headphones, Heart, KeyRound, MapPin, Play, RefreshCw, Search,
  Smartphone, Sparkles, Timer, Trophy, ListOrdered, Volume2, VolumeX, Wallet, Watch, X, type LucideIcon,
} from 'lucide-react';
import {
  addRankingEntry,
  cleanNickname,
  loadLastNickname,
  loadRanking,
  NICKNAME_MAX,
  qualifiesForRanking,
  RANKING_SIZE,
  saveLastNickname,
  gameSfx,
  generateSimpleRound,
  getSimpleGrade,
  levelFor,
  loadSimpleRecord,
  saveSimpleRecord,
  type GameRound,
  type ItemIconKey,
  type RankingEntry,
  type SimpleGameRecord,
  type SimpleItemCard,
} from '../services/questGameData';
import './QuestGamePage.css';

const GAME_TIME_SEC = 60;
const MAX_HEARTS = 3;

const ITEM_ICONS: Record<ItemIconKey, LucideIcon> = {
  wallet: Wallet, earbuds: Headphones, phone: Smartphone, backpack: Backpack,
  camera: Camera, watch: Watch, glasses: Glasses, key: KeyRound,
};

/** A new random question order for every game, so each visit and replay plays differently. */
const randomSeed = () => 1 + Math.floor(Math.random() * 997);

type Phase = 'ready' | 'playing' | 'over';

const playedDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}.${d.getDate()}`;
};

/** Local top-10 table; `highlight` marks the entry just saved. */
function RankingBoard({ ranking, highlight }: { ranking: RankingEntry[]; highlight?: string }) {
  return <section className="quest-ranking" aria-label="랭킹">
    <div className="quest-ranking-head"><h3><ListOrdered size={17} /> 랭킹 TOP {RANKING_SIZE}</h3><small>이 기기에서 플레이한 기록</small></div>
    {ranking.length === 0
      ? <p className="quest-ranking-empty">아직 기록이 없어요. 첫 번째 탐정이 되어 보세요!</p>
      : <ol className="quest-ranking-list">
        {ranking.map((entry, index) => <li key={`${entry.playedAt}-${index}`} className={`${index < 3 ? `top-${index + 1}` : ''} ${entry.playedAt === highlight ? 'is-mine' : ''}`}>
          <span className="quest-rank">{index === 0 ? <Crown size={15} aria-label="1위" /> : index + 1}</span>
          <span className="quest-rank-name">{entry.nickname}</span>
          <span className="quest-rank-meta">{entry.solved}건 · {playedDate(entry.playedAt)}</span>
          <strong>{entry.score.toLocaleString()}</strong>
        </li>)}
      </ol>}
  </section>;
}

export default function QuestGamePage() {
  const [record, setRecord] = useState<SimpleGameRecord>(() => loadSimpleRecord());
  const [phase, setPhase] = useState<Phase>('ready');
  const [seedOffset, setSeedOffset] = useState<number>(0);
  const [roundNum, setRoundNum] = useState<number>(1);
  const [currentRound, setCurrentRound] = useState<GameRound>(() => generateSimpleRound(1, 0));

  const [score, setScore] = useState<number>(0);
  const [combo, setCombo] = useState<number>(0);
  const [maxComboThisRun, setMaxComboThisRun] = useState<number>(0);
  const [solvedThisRun, setSolvedThisRun] = useState<number>(0);
  const [hearts, setHearts] = useState<number>(MAX_HEARTS);
  const [timeLeft, setTimeLeft] = useState<number>(GAME_TIME_SEC);
  const [muted, setMuted] = useState<boolean>(false);
  const [ranking, setRanking] = useState<RankingEntry[]>(() => loadRanking());
  const [nickname, setNickname] = useState<string>(() => loadLastNickname());
  const [nicknameError, setNicknameError] = useState('');
  // The finished game's result, and where it landed once saved (one save per game).
  const [lastResult, setLastResult] = useState<{ score: number; solved: number; bestCombo: number } | null>(null);
  const [saved, setSaved] = useState<{ rank: number | null; playedAt: string } | null>(null);
  const [feedback, setFeedback] = useState<{ tone: 'ok' | 'bad' | 'info'; text: string }>({
    tone: 'info',
    text: '품목 · 색상 · 특징 세 가지가 모두 같은 물건을 고르세요.',
  });

  // One finish per game: the record is saved exactly once, outside any state updater (StrictMode may re-run those).
  const finished = useRef(false);
  const finishGame = useCallback(
    (finalScore: number, finalBestCombo: number, finalSolved: number) => {
      if (finished.current) return;
      finished.current = true;
      setPhase('over');
      setLastResult({ score: finalScore, solved: finalSolved, bestCombo: finalBestCombo });
      setSaved(null);
      setNicknameError('');
      gameSfx.playFinish();
      const next: SimpleGameRecord = {
        bestScore: Math.max(record.bestScore, finalScore),
        bestCombo: Math.max(record.bestCombo, finalBestCombo),
        totalSolved: record.totalSolved + finalSolved,
      };
      saveSimpleRecord(next);
      setRecord(next);
    },
    [record],
  );

  // 60-second countdown, only while playing. The interval depends only on the phase, so answering does not
  // restart (and therefore never pauses) the clock.
  useEffect(() => {
    if (phase !== 'playing') return;
    const timer = window.setInterval(() => setTimeLeft(prev => Math.max(0, prev - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  useEffect(() => {
    if (timeLeft === 0 && phase === 'playing') finishGame(score, maxComboThisRun, solvedThisRun);
  }, [finishGame, maxComboThisRun, phase, score, solvedThisRun, timeLeft]);

  const startGame = () => {
    const nextSeed = randomSeed();
    setSeedOffset(nextSeed);
    setRoundNum(1);
    setCurrentRound(generateSimpleRound(1, nextSeed));
    setScore(0);
    setCombo(0);
    setMaxComboThisRun(0);
    setSolvedThisRun(0);
    setHearts(MAX_HEARTS);
    setTimeLeft(GAME_TIME_SEC);
    finished.current = false;
    setPhase('playing');
    setFeedback({ tone: 'info', text: '품목 · 색상 · 특징 세 가지가 모두 같은 물건을 고르세요.' });
  };

  const handlePickCard = useCallback(
    (card: SimpleItemCard) => {
      if (phase !== 'playing') return;

      if (card.isMatch) {
        gameSfx.playCorrect();
        const nextCombo = combo + 1;
        // Harder levels are worth more: +30 per level above 쉬움, plus the combo bonus.
        const gained = 100 + (levelFor(roundNum).level - 1) * 30 + Math.min(nextCombo - 1, 5) * 20;
        const nextRoundNum = roundNum + 1;
        const nextLevel = levelFor(nextRoundNum);
        const levelUp = nextLevel.level !== levelFor(roundNum).level;
        setScore(score + gained);
        setCombo(nextCombo);
        setMaxComboThisRun(Math.max(maxComboThisRun, nextCombo));
        setSolvedThisRun(solvedThisRun + 1);
        setRoundNum(nextRoundNum);
        setCurrentRound(generateSimpleRound(nextRoundNum, seedOffset));
        const praise = nextCombo >= 2 ? `정답! ${nextCombo}연속 콤보 +${gained}점` : `정답! 주인에게 돌려주었어요 +${gained}점`;
        setFeedback({ tone: 'ok', text: levelUp ? `${praise} · 난이도 ‘${nextLevel.name}’ — ${nextLevel.hint}` : praise });
        return;
      }

      gameSfx.playWrong();
      const nextHearts = hearts - 1;
      setCombo(0);
      setHearts(nextHearts);
      const reason = card.category !== currentRound.targetCategory ? `품목이 달라요 (${card.category})`
        : card.colorName !== currentRound.targetColorName ? `색상이 달라요 (${card.colorName})` : `특징이 달라요 (${card.feature})`;
      if (nextHearts <= 0) {
        setFeedback({ tone: 'bad', text: `${reason} — 기회를 모두 사용했어요.` });
        finishGame(score, maxComboThisRun, solvedThisRun);
      } else {
        setFeedback({ tone: 'bad', text: `다른 사람의 물건이에요. ${reason}` });
      }
    },
    [combo, currentRound.targetCategory, currentRound.targetColorName, finishGame, hearts, maxComboThisRun, phase, roundNum, score, seedOffset, solvedThisRun],
  );

  // Number keys 1–4 pick a card. A held key repeats; typing in a field or using shortcuts must not pick a card.
  useEffect(() => {
    if (phase !== 'playing') return;
    const onKeyDown = (e: KeyboardEvent) => {
      const typing = e.target instanceof Element && e.target.closest('input, textarea, select, [contenteditable="true"]');
      if (e.repeat || e.ctrlKey || e.metaKey || e.altKey || typing) return;
      if (['1', '2', '3', '4'].includes(e.key)) {
        const choice = currentRound.choices[Number(e.key) - 1];
        if (choice) handlePickCard(choice);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentRound.choices, handlePickCard, phase]);

  const canRank = phase === 'over' && lastResult !== null && !saved && qualifiesForRanking(lastResult.score, ranking);
  const saveRanking = (event: FormEvent) => {
    event.preventDefault();
    if (!lastResult || saved) return;
    const name = cleanNickname(nickname);
    if (!name) { setNicknameError('닉네임을 1~12자로 입력해 주세요.'); return; }
    const entry: RankingEntry = { nickname: name, score: lastResult.score, solved: lastResult.solved, bestCombo: lastResult.bestCombo, playedAt: new Date().toISOString() };
    const result = addRankingEntry(entry);
    saveLastNickname(name);
    setNickname(name);
    setRanking(result.ranking);
    setSaved({ rank: result.rank, playedAt: entry.playedAt });
  };

  const toggleSound = () => {
    const next = !muted;
    setMuted(next);
    gameSfx.muted = next;
  };

  const TargetIcon = ITEM_ICONS[currentRound.targetIcon];
  const timePercent = (timeLeft / GAME_TIME_SEC) * 100;
  const grade = getSimpleGrade(score);
  const level = levelFor(currentRound.roundNumber);

  return (
    <div className={`page-container quest-game is-${phase}`}>
      <header className="quest-head">
        <div>
          <span className="eyebrow"><Sparkles size={15} /> LOST QUEST 미니게임</span>
          <h1>분실물 탐정: 진짜 주인을 찾아라</h1>
          <p>의뢰인이 말한 단서 세 가지와 똑같은 물건을 60초 안에 최대한 많이 찾아 주세요.</p>
        </div>
        <div className="quest-head-actions">
          <button type="button" className="quest-icon-button" onClick={toggleSound} aria-label={muted ? '효과음 켜기' : '효과음 끄기'} title={muted ? '효과음 켜기' : '효과음 끄기'}>
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          {phase === 'playing' && (
            <button type="button" className="button button-secondary quest-restart" onClick={startGame}>
              <RefreshCw size={16} />처음부터
            </button>
          )}
        </div>
      </header>

      {phase !== 'ready' && <div className="quest-hud" aria-label="게임 상태 표시줄">
        <div className={`simple-hud-box quest-stat quest-stat-time ${timeLeft <= 10 && phase === 'playing' ? 'is-urgent' : ''}`}>
          <small><Timer size={14} /> 남은 시간</small>
          <strong>{timeLeft}초</strong>
          <span className="quest-time-track" aria-hidden="true"><span style={{ width: `${timePercent}%` }} /></span>
        </div>
        <div className="simple-hud-box quest-stat">
          <small><Trophy size={14} /> 점수 · 최고 {record.bestScore.toLocaleString()}</small>
          <strong>{score.toLocaleString()}점</strong>
        </div>
        <div className={`simple-hud-box quest-stat ${combo >= 2 ? 'is-combo' : ''}`}>
          <small><Flame size={14} /> 연속 콤보</small>
          <strong>{combo}</strong>
        </div>
        <div className="simple-hud-box quest-stat">
          <small><Heart size={14} /> 남은 기회</small>
          <strong className="quest-hearts" aria-label={`남은 기회 ${hearts}개`}>
            {Array.from({ length: MAX_HEARTS }, (_, i) => <Heart key={i} size={19} className={i < hearts ? 'is-full' : ''} aria-hidden="true" />)}
          </strong>
        </div>
      </div>}

      <section className="card quest-board" aria-label="잃어버린 물건 매칭 게임 보드">
        {phase === 'ready' && (
          <div className="quest-ready">
          <div className="quest-intro">
            <span className="quest-intro-icon"><Search size={28} /></span>
            <h2>의뢰인의 잃어버린 물건을 찾아 주세요</h2>
            <ol className="quest-steps">
              <li><b>1</b><span>위에 나오는 단서 <strong>품목 · 색상 · 특징</strong>을 확인해요.</span></li>
              <li><b>2</b><span>네 개의 후보 중 세 가지가 모두 같은 물건을 골라요. 키보드 1~4로도 고를 수 있어요.</span></li>
              <li><b>3</b><span>라운드가 지날수록 비슷한 색과 특징이 섞여 어려워져요. 연속 정답은 보너스, 세 번 틀리면 끝나요.</span></li>
            </ol>
            <button type="button" className="button button-primary quest-start" onClick={startGame}><Play size={17} />게임 시작</button>
            {record.bestScore > 0 && <small className="quest-best">내 최고 기록 {record.bestScore.toLocaleString()}점 · 최고 콤보 {record.bestCombo} · 지금까지 {record.totalSolved}건 해결</small>}
          </div>
          <RankingBoard ranking={ranking} highlight={saved?.playedAt} />
          </div>
        )}

        {phase === 'playing' && (
          <>
            <div className="quest-request">
              <div className="quest-request-top">
                <span className="quest-client"><span className="quest-avatar" aria-hidden="true">{currentRound.clientName.slice(0, 1)}</span>ROUND {currentRound.roundNumber} · {currentRound.clientName} 님의 의뢰</span>
                <span className="quest-request-meta"><span className={`quest-level level-${level.level}`} title={level.hint}>난이도 {level.name}</span><span className="quest-place"><MapPin size={14} /> {currentRound.targetLocation}</span></span>
              </div>
              <div className="quest-clues">
                <div className="simple-clue-pill quest-clue"><small>품목</small><strong><TargetIcon size={17} aria-hidden="true" />{currentRound.targetCategory}</strong></div>
                <div className="simple-clue-pill quest-clue"><small>색상</small><strong><span className="quest-swatch" style={{ backgroundColor: currentRound.targetColorHex }} aria-hidden="true" />{currentRound.targetColorName}</strong></div>
                <div className="simple-clue-pill quest-clue"><small>특징</small><strong>{currentRound.targetFeature}</strong></div>
              </div>
            </div>

            <div role="status" className={`quest-feedback is-${feedback.tone}`}>
              {feedback.tone === 'ok' ? <Check size={16} /> : feedback.tone === 'bad' ? <X size={16} /> : <Search size={16} />}
              <span>{feedback.text}</span>
            </div>

            <div className="quest-choices" role="group" aria-label="주운 물건 후보 4개">
              {currentRound.choices.map((card, idx) => {
                const Icon = ITEM_ICONS[card.icon];
                return (
                  <button key={card.id} type="button" className="simple-choice-btn quest-choice" onClick={() => handlePickCard(card)}>
                    <span className="quest-choice-key" aria-hidden="true">{idx + 1}</span>
                    <span className="quest-choice-icon" style={{ color: card.colorHex, backgroundColor: `${card.colorHex}1a` }} aria-hidden="true"><Icon size={24} /></span>
                    <span className="quest-choice-info">
                      <strong>{card.colorName} {card.category}</strong>
                      <span className="simple-choice-feature">{card.feature}</span>
                      <small><MapPin size={12} /> {card.location} 습득</small>
                    </span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {phase === 'over' && (
          <div className="simple-gameover quest-over" role="region" aria-label="게임 결과">
            <span className={`quest-grade grade-${grade.toLowerCase()}`}>{grade}</span>
            <h2>반환 미션 종료! 총 {solvedThisRun}건의 주인을 찾아주었어요.</h2>
            <dl className="quest-result">
              <div><dt>최종 점수</dt><dd>{score.toLocaleString()}점</dd></div>
              <div><dt>최고 콤보</dt><dd>{maxComboThisRun}</dd></div>
              <div><dt>역대 최고</dt><dd>{record.bestScore.toLocaleString()}점</dd></div>
            </dl>
            {canRank && <form className="quest-nickname" onSubmit={saveRanking} noValidate>
              <label htmlFor="quest-nickname"><Trophy size={16} /> 랭킹에 오를 수 있는 기록이에요! 닉네임을 남겨 주세요.</label>
              <div className="quest-nickname-row">
                <input id="quest-nickname" value={nickname} maxLength={NICKNAME_MAX} autoComplete="nickname" placeholder={`닉네임 (최대 ${NICKNAME_MAX}자)`}
                  onChange={(event) => { setNickname(event.target.value); setNicknameError(''); }} aria-invalid={nicknameError ? true : undefined} aria-describedby={nicknameError ? 'quest-nickname-error' : undefined} />
                <button type="submit" className="button button-primary">랭킹 등록</button>
              </div>
              {nicknameError && <small id="quest-nickname-error" role="alert">{nicknameError}</small>}
            </form>}
            {saved && <p className="quest-saved" role="status">{saved.rank ? <><Crown size={16} /> <strong>{nickname}</strong> 님이 <strong>{saved.rank}위</strong>에 올랐어요!</> : '랭킹에 저장했어요.'}</p>}
            {!canRank && !saved && lastResult && lastResult.score > 0 && ranking.length >= RANKING_SIZE && <p className="quest-saved is-muted">{RANKING_SIZE}위 기록({ranking[ranking.length - 1].score.toLocaleString()}점)을 넘기면 랭킹에 오를 수 있어요.</p>}
            <div className="button-row quest-over-actions">
              <button type="button" className="button button-primary" onClick={startGame}><RefreshCw size={16} />다시 플레이하기</button>
              <button type="button" className="button button-secondary" onClick={() => setPhase('ready')}><ListOrdered size={16} />랭킹 보기</button>
              <Link to="/search" className="button button-secondary">실제 물건 검색하기</Link>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
