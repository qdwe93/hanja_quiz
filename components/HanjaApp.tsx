"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { filterByStudySet, getStudySet } from "../lib/game";
import {
  answerQuizQuestion,
  createMatchSession,
  createQuizSession,
  isCheckingPairMatched,
  resolveMatchCheck,
  resolveQuizFeedback,
  restartMatchSession,
  restartQuizSession,
  selectMatchCard,
  summarizeMatch,
  summarizeQuiz,
} from "../lib/session";
import type { MatchSession, QuizSession } from "../lib/session";
import {
  addRecentRecord,
  createDefaultProgress,
  loadProgress,
  saveProgress,
  setSelectedStudySet,
} from "../lib/storage";
import type {
  HanjaEntry,
  MatchCard,
  ProgressState,
  StudyMode,
  StudySetId,
} from "../lib/types";
import { DEFAULT_STUDY_SET, STUDY_SETS } from "../lib/types";

type AppScreen =
  | "home"
  | "matching"
  | "matching-result"
  | "quiz"
  | "quiz-result";

const MATCH_FEEDBACK_DELAY_MS = 1000;
const QUIZ_FEEDBACK_DELAY_MS = 1000;

interface HanjaAppProps {
  entries: HanjaEntry[];
}

export function HanjaApp({ entries }: HanjaAppProps) {
  const [screen, setScreen] = useState<AppScreen>("home");
  const [selectedStudySet, setStudySet] = useState<StudySetId>(
    DEFAULT_STUDY_SET,
  );
  const [progress, setProgress] = useState<ProgressState>(createDefaultProgress);
  const [isProgressReady, setIsProgressReady] = useState(false);
  const [matchSession, setMatchSession] = useState<MatchSession | null>(null);
  const [quizSession, setQuizSession] = useState<QuizSession | null>(null);

  const timersRef = useRef<number[]>([]);
  const quizAnswerHandlerRef = useRef<(choice: string) => void>(() => {});
  const previousScreenRef = useRef<AppScreen | null>(null);
  const selectedEntries = useMemo(
    () => filterByStudySet(entries, selectedStudySet),
    [entries, selectedStudySet],
  );
  const sampleEntry = selectedEntries[0] ?? entries[0];

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      const stored = loadProgress();
      setProgress(stored);
      setStudySet(stored.selectedStudySet);
      setIsProgressReady(true);
    }, 0);

    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  useEffect(() => {
    if (previousScreenRef.current === null) {
      previousScreenRef.current = screen;
      return;
    }
    if (previousScreenRef.current === screen) {
      return;
    }
    previousScreenRef.current = screen;
    document.querySelector<HTMLElement>("#main-content h1")?.focus();
  }, [screen]);

  function schedule(callback: () => void, delay: number) {
    const timer = window.setTimeout(callback, delay);
    timersRef.current.push(timer);
  }

  function clearScheduledTimers() {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
  }

  function goHome() {
    clearScheduledTimers();
    setScreen("home");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function chooseStudySet(studySet: StudySetId) {
    setStudySet(studySet);
    setProgress((current) => {
      const next = setSelectedStudySet(current, studySet);
      saveProgress(next);
      return next;
    });
  }

  function recordCompletion(
    mode: StudyMode,
    studySet: StudySetId,
    correct: number,
    total: number,
  ) {
    setProgress((current) => {
      const next = addRecentRecord(current, {
        id: makeRecordId(mode),
        mode,
        studySet,
        completedAt: new Date().toISOString(),
        correct,
        total,
      });
      saveProgress(next);
      return next;
    });
  }

  function startMatching() {
    clearScheduledTimers();
    setMatchSession(createMatchSession(entries, { studySet: selectedStudySet }));
    setScreen("matching");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function retrySameMatching() {
    if (!matchSession) {
      startMatching();
      return;
    }
    clearScheduledTimers();
    setMatchSession(restartMatchSession(matchSession));
    setScreen("matching");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleSelectMatchCard(card: MatchCard) {
    if (!matchSession) {
      return;
    }

    const next = selectMatchCard(matchSession, card.id);
    if (next === matchSession) {
      return;
    }
    setMatchSession(next);

    if (next.phase !== "checking") {
      return;
    }

    schedule(() => {
      const resolved = resolveMatchCheck(next);
      setMatchSession(resolved);
      if (resolved.phase === "complete") {
        const summary = summarizeMatch(resolved);
        recordCompletion("matching", resolved.studySet, summary.score, summary.total);
        setScreen("matching-result");
      }
    }, MATCH_FEEDBACK_DELAY_MS);
  }

  function startQuiz() {
    clearScheduledTimers();
    let session: QuizSession;
    try {
      session = createQuizSession(entries, { studySet: selectedStudySet, count: 25 });
    } catch {
      session = {
        studySet: selectedStudySet,
        questions: [],
        currentIndex: 0,
        answers: [],
        feedback: null,
        wrongEntryIds: [],
        phase: "complete",
      };
    }
    setQuizSession(session);
    setScreen("quiz");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function retrySameQuiz() {
    if (!quizSession) {
      startQuiz();
      return;
    }
    clearScheduledTimers();
    setQuizSession(restartQuizSession(quizSession));
    setScreen("quiz");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleChooseQuizAnswer(choice: string) {
    if (!quizSession) {
      return;
    }

    const next = answerQuizQuestion(quizSession, choice);
    if (next === quizSession) {
      return;
    }
    setQuizSession(next);

    schedule(() => {
      const resolved = resolveQuizFeedback(next);
      setQuizSession(resolved);
      if (resolved.phase === "complete") {
        const summary = summarizeQuiz(resolved);
        recordCompletion("quiz", resolved.studySet, summary.score, summary.total);
        setScreen("quiz-result");
      }
    }, QUIZ_FEEDBACK_DELAY_MS);
  }

  useEffect(() => {
    quizAnswerHandlerRef.current = handleChooseQuizAnswer;
  });

  useEffect(() => {
    if (screen !== "quiz" || quizSession?.phase !== "asking") {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const index = Number(event.key) - 1;
      const choice = quizSession?.questions[quizSession.currentIndex]?.choices[index];
      if (index < 0 || index > 3 || !choice) {
        return;
      }
      event.preventDefault();
      quizAnswerHandlerRef.current(choice);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [screen, quizSession]);

  const completedGames =
    progress.matching.completedGames + progress.quiz.completedGames;
  const quizAccuracy = progress.quiz.totalQuestions
    ? Math.round(
        (progress.quiz.correctAnswers / progress.quiz.totalQuestions) * 100,
      )
    : 0;
  const quizSummary = quizSession ? summarizeQuiz(quizSession) : null;
  const matchSummary = matchSession ? summarizeMatch(matchSession) : null;

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        본문으로 바로 가기
      </a>
      <div className="utility-bar">
        <div className="container utility-bar__inner">
          <p>오늘도 한 글자씩, 차근차근 익혀요.</p>
          <p className="utility-bar__scope">7급 · 준6급 · 6급 배정한자</p>
        </div>
      </div>

      <header className="site-header">
        <div className="container site-header__inner">
          <button className="brand-button" type="button" onClick={goHome}>
            <span className="brand-mark" aria-hidden="true">한</span>
            <span className="brand-copy">
              <strong>한자랑</strong>
              <small>200자 학습</small>
            </span>
          </button>
          <div className="header-actions">
            <span className="header-progress" aria-live="polite">
              {isProgressReady
                ? `완료한 학습 ${completedGames}회`
                : "학습 기록 불러오는 중"}
            </span>
            <button className="text-button" type="button" onClick={goHome}>
              학습 선택
            </button>
          </div>
        </div>
      </header>

      <main id="main-content">
        {screen === "home" && (
          <HomeScreen
            sampleEntry={sampleEntry}
            selectedStudySet={selectedStudySet}
            selectedCount={selectedEntries.length}
            progress={progress}
            quizAccuracy={quizAccuracy}
            onChooseStudySet={chooseStudySet}
            onStartMatching={startMatching}
            onStartQuiz={startQuiz}
          />
        )}

        {screen === "matching" && matchSession && (
          <MatchingScreen
            session={matchSession}
            onBack={goHome}
            onSelect={handleSelectMatchCard}
          />
        )}

        {screen === "quiz" && quizSession && (
          <QuizScreen
            session={quizSession}
            onBack={goHome}
            onChoose={handleChooseQuizAnswer}
          />
        )}

        {screen === "matching-result" && matchSession && matchSummary && (
          <ResultScreen
            mode="matching"
            score={matchSummary.score}
            total={matchSummary.total}
            wrongAttempts={matchSummary.wrongAttempts}
            wrongEntries={entriesForIds(entries, matchSummary.wrongEntryIds)}
            onRetrySame={retrySameMatching}
            onRetryNew={startMatching}
            onSwitchMode={startQuiz}
            onHome={goHome}
          />
        )}

        {screen === "quiz-result" && quizSession && quizSummary && (
          <ResultScreen
            mode="quiz"
            score={quizSummary.score}
            total={quizSummary.total}
            wrongEntries={quizSummary.wrongEntries}
            onRetrySame={retrySameQuiz}
            onRetryNew={startQuiz}
            onSwitchMode={startMatching}
            onHome={goHome}
          />
        )}
      </main>

      <footer className="site-footer">
        <div className="container site-footer__inner">
          <p>
            <strong>한자랑</strong> · 초등 한자 학습을 위한 개인용 웹앱
          </p>
          <p>한국어문회 배정한자 기준 · 학습 기록은 이 기기에만 저장됩니다.</p>
        </div>
      </footer>
    </div>
  );
}

interface HomeScreenProps {
  sampleEntry: HanjaEntry | undefined;
  selectedStudySet: StudySetId;
  selectedCount: number;
  progress: ProgressState;
  quizAccuracy: number;
  onChooseStudySet: (studySet: StudySetId) => void;
  onStartMatching: () => void;
  onStartQuiz: () => void;
}

function HomeScreen({
  sampleEntry,
  selectedStudySet,
  selectedCount,
  progress,
  quizAccuracy,
  onChooseStudySet,
  onStartMatching,
  onStartQuiz,
}: HomeScreenProps) {
  const latestRecord = progress.recentRecords[0];
  const latestQuizRecord = progress.recentRecords.find(
    (record) => record.mode === "quiz",
  );
  const hasHistory =
    progress.matching.completedGames + progress.quiz.completedGames > 0 ||
    progress.recentRecords.length > 0;
  const selectedSet = getStudySet(selectedStudySet);

  return (
    <div data-testid="app-home">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="container home-hero__grid">
          <div>
            <p className="eyebrow">초등 한자 · 7급부터 6급까지</p>
            <h1 className="hero-title" id="home-title" tabIndex={-1}>
              보고, 고르고, 맞추며 익히는 <em>200자</em>
            </h1>
            <p className="hero-description">
              한자와 음훈의 짝을 찾고 네 개의 보기에서 답을 골라 보세요.
              한 세트 25자를 차근차근 익힐 수 있어요.
            </p>
            <fieldset className="grade-picker">
              <legend>오늘 학습할 급수와 세트를 선택하세요</legend>
              <div className="grade-options">
                {STUDY_SETS.map((studySet) => (
                  <button
                    key={studySet.id}
                    className="grade-option"
                    type="button"
                    aria-pressed={selectedStudySet === studySet.id}
                    data-testid={`study-set-${studySet.id}`}
                    onClick={() => onChooseStudySet(studySet.id)}
                  >
                    {studySet.id}
                  </button>
                ))}
              </div>
            </fieldset>
            <p className="scope-summary" aria-live="polite">
              선택한 범위: <strong>{selectedSet.label}</strong> · {selectedCount}자
            </p>
          </div>

          <div className="hero-sample-wrap" aria-hidden="true">
            <div className="hero-sample">
              <div className="hero-sample__topline">
                <span className="hero-sample__dot" /> 오늘의 한자 미리보기
              </div>
              <div className="hero-sample__hanja">
                {sampleEntry?.hanja ?? "學"}
              </div>
              <p className="hero-sample__answer">
                {sampleEntry?.eumhun ?? "배울 학"}
              </p>
              <p className="hero-sample__hint">한자와 음훈을 함께 기억해요</p>
            </div>
          </div>
        </div>
      </section>

      <section className="modes-section" id="modes" aria-labelledby="modes-title">
        <div className="container">
          <div className="section-heading">
            <div>
              <p className="eyebrow">두 가지 학습 방식</p>
              <h2 className="section-title" id="modes-title">
                오늘은 어떻게 익혀 볼까요?
              </h2>
            </div>
            <p className="section-description">
              선택한 {selectedSet.label}의 25자로 학습합니다. 원하는 방식부터
              시작하세요.
            </p>
          </div>

          <div className="mode-grid">
            <article className="mode-card">
              <div>
                <div className="mode-card__number">1</div>
                <h3>짝맞추기</h3>
                <p>
                  앞면으로 보이는 카드 열두 장에서 한자와 알맞은 음훈을 찾아
                  25쌍을 완성해요.
                </p>
                <button
                  className="primary-button"
                  type="button"
                  data-testid="start-matching"
                  onClick={onStartMatching}
                >
                  짝맞추기 시작 <span aria-hidden="true">→</span>
                </button>
              </div>
              <div className="mode-visual" aria-hidden="true">
                <div className="mode-visual__cards">
                  <span className="mini-card mini-card--hanja">歌</span>
                  <span className="mini-card mini-card--meaning">노래 가</span>
                  <span className="mini-card mini-card--meaning">입 구</span>
                  <span className="mini-card mini-card--hanja">口</span>
                </div>
              </div>
            </article>

            <article className="mode-card">
              <div>
                <div className="mode-card__number">2</div>
                <h3>4지선다 퀴즈</h3>
                <p>
                  제시된 한자를 보고 네 개의 음훈 중 정답을 골라 25문제를
                  연속으로 풀어요.
                </p>
                <button
                  className="dark-button"
                  type="button"
                  data-testid="start-quiz"
                  onClick={onStartQuiz}
                >
                  퀴즈 시작 <span aria-hidden="true">→</span>
                </button>
              </div>
              <div className="mode-visual" aria-hidden="true">
                <div className="mode-visual__quiz">
                  <div className="mini-question">同</div>
                  <span className="mini-choice">① 노래 가</span>
                  <span className="mini-choice mini-choice--active">
                    ② 한가지 동
                  </span>
                  <span className="mini-choice">③ 입 구</span>
                </div>
              </div>
            </article>
          </div>
        </div>
      </section>

      <section className="progress-section" aria-labelledby="progress-title">
        <div className="container progress-card">
          <div>
            <p className="eyebrow">나의 학습 기록</p>
            <h2 id="progress-title">조금씩 쌓인 기록이 실력이 돼요.</h2>
            <p>결과는 이 브라우저에 안전하게 저장됩니다. 로그인은 필요하지 않아요.</p>
            {hasHistory && (
              <div className="progress-recent" data-testid="recent-summary">
                {latestRecord && (
                  <p>
                    최근 학습: <strong>{latestRecord.mode === "quiz" ? "4지선다" : "짝맞추기"} {latestRecord.correct}/{latestRecord.total}</strong> ({getStudySet(latestRecord.studySet).label})
                  </p>
                )}
                {latestQuizRecord && latestQuizRecord !== latestRecord && (
                  <p>
                    최근 퀴즈 점수: <strong>{latestQuizRecord.correct}/{latestQuizRecord.total}</strong> ({getStudySet(latestQuizRecord.studySet).label})
                  </p>
                )}
                <p>
                  마지막 학습 범위: <strong>{getStudySet(progress.selectedStudySet).label}</strong>
                </p>
              </div>
            )}
          </div>
          {hasHistory ? (
            <div className="progress-stats">
              <div className="progress-stat"><strong>{progress.matching.completedGames}</strong><span>짝맞추기 완료</span></div>
              <div className="progress-stat"><strong>{progress.quiz.completedGames}</strong><span>퀴즈 완료</span></div>
              <div className="progress-stat"><strong>{quizAccuracy}%</strong><span>누적 정답률</span></div>
            </div>
          ) : (
            <p className="progress-empty" data-testid="progress-empty">
              아직 완료한 학습이 없어요. 첫 라운드를 마치면 기록이 여기에 쌓여요.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

interface MatchingScreenProps {
  session: MatchSession;
  onBack: () => void;
  onSelect: (card: MatchCard) => void;
}

function MatchingScreen({ session, onBack, onSelect }: MatchingScreenProps) {
  const { cards, slots, faceUpIds, matchedPairIds, attempts, totalPairs, studySet, phase } = session;
  const gridRef = useRef<HTMLDivElement | null>(null);
  const matchedCount = matchedPairIds.length;
  const progressPercent = totalPairs ? (matchedCount / totalPairs) * 100 : 0;
  const checkingMatched = isCheckingPairMatched(session);

  useEffect(() => {
    if (matchedCount === 0 || document.activeElement !== document.body) {
      return;
    }
    gridRef.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
  }, [cards, matchedCount]);

  return (
    <section className="learning-page" data-testid="matching-screen">
      <div className="learning-container">
        <button className="back-button" type="button" onClick={onBack}>
          <span aria-hidden="true">←</span> 학습 선택으로
        </button>
        <header className="session-header">
          <div className="session-header__main">
            <div>
              <p className="eyebrow">{getStudySet(studySet).label} · 25쌍</p>
              <h1 className="session-title" tabIndex={-1}>한자와 음훈의 짝을 찾아요</h1>
              <p className="session-subtitle">모든 카드가 앞면으로 보입니다. 두 장을 골라 같은 한자의 짝을 맞춰 보세요.</p>
            </div>
            <div className="session-stats" aria-live="polite">
              <div className="session-stat"><strong>{matchedCount}/{totalPairs}</strong><span>맞춘 쌍</span></div>
              <div className="session-stat"><strong>{attempts}</strong><span>시도</span></div>
            </div>
          </div>
          <div className="progress-track" role="progressbar" aria-label="짝맞추기 진행률" aria-valuemin={0} aria-valuemax={totalPairs} aria-valuenow={matchedCount}>
            <div className="progress-track__bar" style={{ width: `${progressPercent}%` }} />
          </div>
        </header>

        {cards.length ? (
          <div className="game-panel">
            <div className="match-grid" ref={gridRef}>
              {slots.map((card, slotIndex) => {
                if (!card) {
                  return <div className="match-card match-card--empty" data-testid={`match-slot-${slotIndex}`} key={`slot-${slotIndex}`} aria-hidden="true" />;
                }
                const isSelected = faceUpIds.includes(card.id);
                const state = isSelected && phase === "checking"
                  ? checkingMatched ? "correct" : "wrong"
                  : isSelected ? "selected" : "idle";
                const label = isSelected ? `선택한 카드: ${card.content}` : `카드: ${card.content}`;

                return (
                  <button
                    key={`slot-${slotIndex}`}
                    className={`match-card ${state === "wrong" ? "shake-effect" : ""}`}
                    type="button"
                    aria-label={label}
                    aria-pressed={isSelected}
                    data-state={state}
                    data-slot={slotIndex}
                    data-testid={`match-card-${card.id}`}
                    disabled={phase === "checking"}
                    onClick={() => onSelect(card)}
                  >
                    <span className={`match-card__content match-card__content--${card.kind === "hanja" ? "hanja" : "meaning"}`}>
                      {card.content}
                    </span>
                    {state === "correct" && <span className="match-card__state">✓ 맞춤</span>}
                    {state === "wrong" && <span className="match-card__state">× 다시 골라요</span>}
                  </button>
                );
              })}
            </div>
            <p className="game-help">화면에는 한자 6장과 음훈 6장이 보입니다. 첫 번째로 고른 카드를 다시 누르면 선택을 취소할 수 있어요.</p>
          </div>
        ) : (
          <EmptyState onHome={onBack} />
        )}
      </div>
    </section>
  );
}

interface QuizScreenProps {
  session: QuizSession;
  onBack: () => void;
  onChoose: (answer: string) => void;
}

function QuizScreen({ session, onBack, onChoose }: QuizScreenProps) {
  const { questions, currentIndex, answers, studySet, feedback } = session;
  const question = questions[currentIndex];
  const score = answers.length;
  const questionRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (currentIndex > 0 && feedback === null) {
      questionRef.current?.focus();
    }
  }, [currentIndex, feedback]);

  if (!question) {
    return <section className="learning-page"><div className="learning-container"><EmptyState onHome={onBack} /></div></section>;
  }

  return (
    <section className="learning-page" data-testid="quiz-screen">
      <div className="learning-container">
        <button className="back-button" type="button" onClick={onBack}>
          <span aria-hidden="true">←</span> 학습 선택으로
        </button>
        <header className="session-header">
          <div className="session-header__main">
            <div>
              <p className="eyebrow">{getStudySet(studySet).label} · 25문제</p>
              <h1 className="session-title" tabIndex={-1}>알맞은 음훈을 골라요</h1>
              <p className="session-subtitle">한자를 보고 네 개의 보기 중 정답 하나를 선택하세요. 숫자 1~4 키도 사용할 수 있어요.</p>
            </div>
            <div className="session-stats" aria-live="polite">
              <div className="session-stat"><strong>{currentIndex + 1}/{questions.length}</strong><span>현재 문제</span></div>
              <div className="session-stat"><strong>{score}</strong><span>맞힌 문제</span></div>
            </div>
          </div>
          <div className="progress-track" role="progressbar" aria-label="퀴즈 진행률" aria-valuemin={1} aria-valuemax={questions.length} aria-valuenow={currentIndex + 1}>
            <div className="progress-track__bar" style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }} />
          </div>
        </header>

        <div className="game-panel quiz-panel">
          <div className="quiz-question" ref={questionRef} tabIndex={-1}>
            <p className="quiz-question__label">이 한자의 음훈은 무엇일까요?</p>
            <p className="quiz-question__hanja" data-testid="quiz-hanja">{question.hanja}</p>
          </div>
          <div className="quiz-answers">
            <h2>정답을 하나 선택하세요</h2>
            <div className="choice-list">
              {question.choices.map((choice, index) => {
                const isSelected = feedback?.selected === choice;
                const state = isSelected ? feedback?.correct ? "correct" : "wrong" : "idle";
                return (
                  <button
                    key={choice}
                    className={`choice-button ${state === "wrong" ? "shake-effect" : ""}`}
                    type="button"
                    data-state={state}
                    data-testid={`quiz-choice-${index}`}
                    disabled={feedback !== null}
                    onClick={() => onChoose(choice)}
                  >
                    <span className="choice-index" aria-hidden="true">{index + 1}</span>
                    <span>{choice}</span>
                    {state === "correct" && <span className="choice-state">✓ 정답</span>}
                    {state === "wrong" && <span className="choice-state">× 다시 선택</span>}
                  </button>
                );
              })}
            </div>

            {feedback && (
              <div className={`answer-feedback answer-feedback--${feedback.correct ? "correct" : "wrong"}`} role="status">
                {feedback.correct ? "잘했어요! 다음 문제로 넘어갑니다." : "아쉬워요. 정답을 다시 골라보세요."}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

interface ResultScreenProps {
  mode: StudyMode;
  score: number;
  total: number;
  wrongAttempts?: number;
  wrongEntries: HanjaEntry[];
  onRetrySame: () => void;
  onRetryNew: () => void;
  onSwitchMode: () => void;
  onHome: () => void;
}

function ResultScreen({
  mode,
  score,
  total,
  wrongAttempts,
  wrongEntries,
  onRetrySame,
  onRetryNew,
  onSwitchMode,
  onHome,
}: ResultScreenProps) {
  const percentage = total ? Math.round((score / total) * 100) : 0;
  const isMatching = mode === "matching";

  return (
    <section className="learning-page" data-testid={`${mode}-result`}>
      <div className="learning-container">
        <button className="back-button" type="button" onClick={onHome}><span aria-hidden="true">←</span> 학습 선택으로</button>
        <div className="game-panel result-panel">
          <div className="result-score" aria-label={`정답률 ${percentage}%`}>
            <div><strong>{isMatching ? "완료" : `${percentage}%`}</strong><span>{score}/{total} {isMatching ? "쌍" : "문제"}</span></div>
          </div>
          <div>
            <p className="eyebrow">학습을 마쳤어요</p>
            <h1 className="result-title" tabIndex={-1}>
              {isMatching ? "스물다섯 쌍을 모두 찾았어요!" : "스물다섯 문제를 모두 풀었어요!"}
            </h1>
            <p className="result-copy">
              {isMatching
                ? `전체 오답 시도는 ${wrongAttempts ?? 0}번이에요. 다시 볼 글자를 확인하고 한 번 더 도전해 보세요.`
                : "정답을 모두 고를 때까지 풀었어요. 다시 볼 글자를 확인해 보세요."}
            </p>
            <div className="result-actions">
              <button className="primary-button" type="button" data-testid="result-retry" onClick={onRetryNew}>{isMatching ? "새 카드로 하기" : "새 문제 풀기"}</button>
              <button className="secondary-button" type="button" data-testid="result-retry-same" onClick={onRetrySame}>{isMatching ? "같은 카드 다시 하기" : "같은 문제 다시 풀기"}</button>
              <button className="secondary-button" type="button" onClick={onSwitchMode}>{isMatching ? "4지선다로 가기" : "짝맞추기로 가기"}</button>
              <button className="text-button" type="button" onClick={onHome}>처음으로</button>
            </div>

            {wrongEntries.length > 0 && (
              <div className="review-list">
                <h3>{isMatching ? "한 번이라도 틀린 글자" : "다시 볼 글자"}</h3>
                <div className="review-chips">
                  {wrongEntries.map((entry) => (
                    <span className="review-chip" key={entry.id}><strong>{entry.hanja}</strong> {entry.eumhun}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function EmptyState({ onHome }: { onHome: () => void }) {
  return (
    <div className="empty-state" role="alert">
      <h2>문제를 준비하지 못했어요.</h2>
      <p>학습 데이터를 다시 확인하고 세트를 선택해 주세요.</p>
      <button className="primary-button" type="button" onClick={onHome}>학습 선택으로 돌아가기</button>
    </div>
  );
}

function entriesForIds(entries: readonly HanjaEntry[], ids: readonly string[]): HanjaEntry[] {
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));
  return ids.map((id) => entryById.get(id)).filter((entry): entry is HanjaEntry => entry !== undefined);
}

function makeRecordId(mode: StudyMode): string {
  const suffix =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${mode}:${suffix}`;
}
