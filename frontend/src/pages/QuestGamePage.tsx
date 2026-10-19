import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { RefreshCw, Sparkles, Volume2, VolumeX } from 'lucide-react';
import {
  gameSfx,
  generateSimpleRound,
  getSimpleGrade,
  loadSimpleRecord,
  saveSimpleRecord,
  type GameRound,
  type SimpleGameRecord,
  type SimpleItemCard,
} from '../services/questGameData';
import './QuestGamePage.css';

const GAME_TIME_SEC = 60;
const MAX_HEARTS = 3;

export default function QuestGamePage() {
  const [record, setRecord] = useState<SimpleGameRecord>(() => loadSimpleRecord());
  const [seedOffset, setSeedOffset] = useState<number>(0);
  const [roundNum, setRoundNum] = useState<number>(1);
  const [currentRound, setCurrentRound] = useState<GameRound>(() => generateSimpleRound(1, 0));

  const [score, setScore] = useState<number>(0);
  const [combo, setCombo] = useState<number>(0);
  const [maxComboThisRun, setMaxComboThisRun] = useState<number>(0);
  const [solvedThisRun, setSolvedThisRun] = useState<number>(0);
  const [hearts, setHearts] = useState<number>(MAX_HEARTS);
  const [timeLeft, setTimeLeft] = useState<number>(GAME_TIME_SEC);
  const [isGameOver, setIsGameOver] = useState<boolean>(false);
  const [muted, setMuted] = useState<boolean>(false);

  const [feedback, setFeedback] = useState<{
    tone: 'ok' | 'bad' | 'info';
    text: string;
  }>({
    tone: 'info',
    text: '위의 [품목 · 색상 · 특징] 3가지가 모두 일치하는 물건을 아래에서 골라 클릭하세요!',
  });

  const finishGame = useCallback(
    (finalScore: number, finalBestCombo: number, finalSolved: number) => {
      setIsGameOver(true);
      gameSfx.playFinish();
      setRecord(prev => {
        const next: SimpleGameRecord = {
          bestScore: Math.max(prev.bestScore, finalScore),
          bestCombo: Math.max(prev.bestCombo, finalBestCombo),
          totalSolved: prev.totalSolved + finalSolved,
        };
        saveSimpleRecord(next);
        return next;
      });
    },
    [],
  );

  // 60-second countdown timer
  useEffect(() => {
    if (isGameOver) return;
    const timer = window.setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          window.clearInterval(timer);
          finishGame(score, maxComboThisRun, solvedThisRun);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [finishGame, isGameOver, maxComboThisRun, score, solvedThisRun]);

  const handleRestart = () => {
    const nextSeed = seedOffset + 1;
    setSeedOffset(nextSeed);
    setRoundNum(1);
    setCurrentRound(generateSimpleRound(1, nextSeed));
    setScore(0);
    setCombo(0);
    setMaxComboThisRun(0);
    setSolvedThisRun(0);
    setHearts(MAX_HEARTS);
    setTimeLeft(GAME_TIME_SEC);
    setIsGameOver(false);
    setFeedback({
      tone: 'info',
      text: '새 게임이 시작됐어요! 3가지 단서가 모두 맞는 물건을 빠르게 찾아보세요.',
    });
  };

  const handlePickCard = useCallback(
    (card: SimpleItemCard) => {
      if (isGameOver) return;

      if (card.isMatch) {
        gameSfx.playCorrect();
        const nextCombo = combo + 1;
        const gained = 100 + Math.min(nextCombo - 1, 5) * 20;
        const nextScore = score + gained;
        const nextSolved = solvedThisRun + 1;
        const nextMaxCombo = Math.max(maxComboThisRun, nextCombo);
        const nextRoundNum = roundNum + 1;

        setScore(nextScore);
        setCombo(nextCombo);
        setMaxComboThisRun(nextMaxCombo);
        setSolvedThisRun(nextSolved);
        setRoundNum(nextRoundNum);
        setCurrentRound(generateSimpleRound(nextRoundNum, seedOffset));
        setFeedback({
          tone: 'ok',
          text:
            nextCombo >= 2
              ? `정답! 🔥 ${nextCombo}콤보 보너스 (+${gained}점)`
              : `정답! 주인에게 무사히 돌려주었어요 (+${gained}점)`,
        });
      } else {
        gameSfx.playWrong();
        const nextHearts = hearts - 1;
        setCombo(0);
        setHearts(nextHearts);

        const reason =
          card.colorName !== currentRound.targetColorName
            ? `색상이 달라요 (${card.colorName} ✕)`
            : `특징이 달라요 (${card.feature} ✕)`;

        if (nextHearts <= 0) {
          setFeedback({
            tone: 'bad',
            text: `아쉬워요! ${reason} — 기회를 모두 사용했습니다.`,
          });
          finishGame(score, maxComboThisRun, solvedThisRun);
        } else {
          setFeedback({
            tone: 'bad',
            text: `앗, 다른 사람의 물건이에요! ${reason}`,
          });
        }
      }
    },
    [
      combo,
      currentRound.targetColorName,
      finishGame,
      hearts,
      isGameOver,
      maxComboThisRun,
      roundNum,
      score,
      seedOffset,
      solvedThisRun,
    ],
  );

  // Allow 1, 2, 3, 4 number keys for quick selection
  useEffect(() => {
    if (isGameOver) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (['1', '2', '3', '4'].includes(e.key)) {
        const idx = Number(e.key) - 1;
        const choice = currentRound.choices[idx];
        if (choice) handlePickCard(choice);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [currentRound.choices, handlePickCard, isGameOver]);

  const toggleSound = () => {
    const next = !muted;
    setMuted(next);
    gameSfx.muted = next;
  };

  const finalGrade = getSimpleGrade(score);

  return (
    <div className="page-container simple-game-page">
      <div className="simple-game-header">
        <div className="simple-game-title">
          <span className="eyebrow">
            <Sparkles size={15} />
            LOST QUEST 스피드 미니게임
          </span>
          <h1>진짜 주인을 찾아라!</h1>
          <p>의뢰인의 분실물 단서 3가지와 똑같은 물건을 4개 중에서 빠르게 골라주세요.</p>
        </div>

        <div className="button-row">
          <button
            type="button"
            className="button button-secondary"
            onClick={toggleSound}
            aria-label={muted ? '효과음 켜기' : '효과음 끄기'}
          >
            {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
            {muted ? '음소거' : '효과음'}
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={handleRestart}
          >
            <RefreshCw size={16} />
            처음부터
          </button>
        </div>
      </div>

      {/* Simple 4-Box HUD */}
      <div className="simple-hud-bar" aria-label="게임 상태 표시줄">
        <div className={`simple-hud-box ${timeLeft <= 10 && !isGameOver ? 'is-urgent' : ''}`}>
          <small>남은 시간</small>
          <strong>{timeLeft}초</strong>
        </div>
        <div className="simple-hud-box">
          <small>현재 점수 (최고 {record.bestScore})</small>
          <strong>{score.toLocaleString()}점</strong>
        </div>
        <div className="simple-hud-box">
          <small>연속 콤보</small>
          <strong>{combo > 0 ? `🔥 ${combo}` : '0'}</strong>
        </div>
        <div className="simple-hud-box">
          <small>남은 기회</small>
          <strong aria-label={`남은 기회 ${hearts}개`}>
            {'❤️'.repeat(hearts)}
            {'🤍'.repeat(Math.max(0, MAX_HEARTS - hearts))}
          </strong>
        </div>
      </div>

      {/* Main Single-Screen Game Board */}
      <section className="simple-board" aria-label="분실물 매칭 게임 보드">
        {!isGameOver ? (
          <>
            {/* Top Request Card */}
            <div className="simple-request-card">
              <div className="simple-request-top">
                <div className="simple-request-client">
                  <span aria-hidden="true">{currentRound.clientEmoji}</span>
                  <span>
                    ROUND {currentRound.roundNumber} · {currentRound.clientName} 님의 찾는 물건
                  </span>
                </div>
                <span>분실 장소: {currentRound.targetLocation}</span>
              </div>

              <div className="simple-clue-badges">
                <div className="simple-clue-pill">
                  <small>1. 품목</small>
                  <strong>
                    <span aria-hidden="true">{currentRound.targetIcon}</span>
                    {currentRound.targetCategory}
                  </strong>
                </div>
                <div className="simple-clue-pill">
                  <small>2. 색상</small>
                  <strong>
                    <span
                      className="simple-color-dot"
                      style={{ backgroundColor: currentRound.targetColorHex }}
                      aria-hidden="true"
                    />
                    {currentRound.targetColorName}
                  </strong>
                </div>
                <div className="simple-clue-pill">
                  <small>3. 핵심 특징</small>
                  <strong>{currentRound.targetFeature}</strong>
                </div>
              </div>
            </div>

            {/* Instant 1-line Feedback */}
            <div
              role="status"
              className={`simple-feedback ${
                feedback.tone === 'ok' ? 'is-ok' : feedback.tone === 'bad' ? 'is-bad' : 'is-info'
              }`}
            >
              {feedback.text}
            </div>

            {/* Bottom 4 Choices */}
            <div className="simple-choices-grid" role="group" aria-label="습득물 후보 4개">
              {currentRound.choices.map((card, idx) => (
                <button
                  key={card.id}
                  type="button"
                  className="simple-choice-btn"
                  onClick={() => handlePickCard(card)}
                >
                  <div
                    className="simple-choice-icon"
                    style={{ backgroundColor: card.colorHex }}
                    aria-hidden="true"
                  >
                    {card.icon}
                  </div>
                  <div className="simple-choice-info">
                    <small style={{ fontSize: '0.75rem', color: '#7b8d9e', fontWeight: 700 }}>
                      후보 {idx + 1} · {card.location} 발견
                    </small>
                    <strong>
                      {card.colorName} {card.category}
                    </strong>
                    <span className="simple-choice-feature">{card.feature}</span>
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          /* Clean Game Over Summary */
          <div className="simple-gameover" role="region" aria-label="게임 결과">
            <div className="simple-grade-circle">{finalGrade}</div>
            <h2 style={{ fontSize: '1.6rem', color: '#15364e' }}>
              반환 미션 종료! 총 {solvedThisRun}건의 주인을 찾아주었어요.
            </h2>
            <p style={{ color: '#647b8d', marginTop: 8 }}>
              최종 점수 <strong>{score.toLocaleString()}점</strong> · 최고 연속 콤보{' '}
              <strong>{maxComboThisRun}콤보</strong> (역대 최고 기록: {record.bestScore.toLocaleString()}점)
            </p>

            <div className="button-row" style={{ justifyContent: 'center', marginTop: 22 }}>
              <button
                type="button"
                className="button button-primary"
                onClick={handleRestart}
              >
                <RefreshCw size={16} />
                다시 플레이하기
              </button>
              <Link to="/search" className="button button-secondary">
                실제 분실물 찾으러 가기
              </Link>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
