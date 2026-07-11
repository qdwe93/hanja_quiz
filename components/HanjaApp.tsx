"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import {
  createMatchingCards,
  createQuizQuestions,
  filterByGrade,
} from "../lib/game";
import {
  addRecentRecord,
  createDefaultProgress,
  loadProgress,
  saveProgress,
  setSelectedGrade,
} from "../lib/storage";
import type {
  GradeFilter,
  HanjaEntry,
  MatchCard,
  ProgressState,
  QuizQuestion,
  StudyMode,
} from "../lib/types";

type AppScreen =
  | "home"
  | "matching"
  | "matching-result"
  | "quiz"
  | "quiz-result";

const GRADE_OPTIONS: GradeFilter[] = ["전체", "7급", "준6급", "6급"];

interface HanjaAppProps {
  entries: HanjaEntry[];
}

export function HanjaApp({ entries }: HanjaAppProps) {
  const [screen, setScreen] = useState<AppScreen>("home");
  const [selectedGrade, setGrade] = useState<GradeFilter>("전체");
  const [progress, setProgress] = useState<ProgressState>(createDefaultProgress);
  const [isProgressReady, setIsProgressReady] = useState(false);

  const [matchCards, setMatchCards] = useState<MatchCard[]>([]);
  const [openCardIds, setOpenCardIds] = useState<string[]>([]);
  const [matchedPairIds, setMatchedPairIds] = useState<Set<string>>(new Set());
  const [matchAttempts, setMatchAttempts] = useState(0);
  const [matchLocked, setMatchLocked] = useState(false);

  const [quizQuestions, setQuizQuestions] = useState<QuizQuestion[]>([]);
  const [quizIndex, setQuizIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<string | null>(null);
  const [quizScore, setQuizScore] = useState(0);
  const [wrongEntries, setWrongEntries] = useState<HanjaEntry[]>([]);

  const timersRef = useRef<number[]>([]);
  const selectedEntries = useMemo(
    () => filterByGrade(entries, selectedGrade),
    [entries, selectedGrade],
  );
  const sampleEntry = selectedEntries[0] ?? entries[0];

  useEffect(() => {
    const restoreTimer = window.setTimeout(() => {
      const stored = loadProgress();
      setProgress(stored);
      setGrade(stored.selectedGrade);
      setIsProgressReady(true);
    }, 0);

    return () => window.clearTimeout(restoreTimer);
  }, []);

  useEffect(() => {
    return () => {
      timersRef.current.forEach((timer) => window.clearTimeout(timer));
    };
  }, []);

  function schedule(callback: () => void, delay: number) {
    const timer = window.setTimeout(callback, delay);
    timersRef.current.push(timer);
  }

  function goHome() {
    timersRef.current.forEach((timer) => window.clearTimeout(timer));
    timersRef.current = [];
    setMatchLocked(false);
    setScreen("home");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function chooseGrade(grade: GradeFilter) {
    setGrade(grade);
    setProgress((current) => {
      const next = setSelectedGrade(current, grade);
      saveProgress(next);
      return next;
    });
  }

  function recordCompletion(
    mode: StudyMode,
    correct: number,
    total: number,
  ) {
    setProgress((current) => {
      const next = addRecentRecord(current, {
        id: makeRecordId(mode),
        mode,
        grade: selectedGrade,
        completedAt: new Date().toISOString(),
        correct,
        total,
      });
      saveProgress(next);
      return next;
    });
  }

  function startMatching() {
    const cards = createMatchingCards(entries, {
      grade: selectedGrade,
      pairCount: 6,
    });
    setMatchCards(cards);
    setOpenCardIds([]);
    setMatchedPairIds(new Set());
    setMatchAttempts(0);
    setMatchLocked(false);
    setScreen("matching");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function selectMatchCard(card: MatchCard) {
    if (
      matchLocked ||
      matchedPairIds.has(card.pairId) ||
      openCardIds.includes(card.id)
    ) {
      return;
    }

    if (openCardIds.length === 0) {
      setOpenCardIds([card.id]);
      return;
    }

    const firstCard = matchCards.find((item) => item.id === openCardIds[0]);
    if (!firstCard) {
      setOpenCardIds([card.id]);
      return;
    }

    setMatchAttempts((attempts) => attempts + 1);
    setOpenCardIds([firstCard.id, card.id]);
    setMatchLocked(true);

    if (firstCard.pairId === card.pairId) {
      const nextMatched = new Set(matchedPairIds);
      nextMatched.add(card.pairId);
      setMatchedPairIds(nextMatched);

      schedule(() => {
        setOpenCardIds([]);
        if (nextMatched.size === matchCards.length / 2) {
          recordCompletion("matching", nextMatched.size, nextMatched.size);
          setScreen("matching-result");
        } else {
          setMatchLocked(false);
        }
      }, 420);
      return;
    }

    schedule(() => {
      setOpenCardIds([]);
      setMatchLocked(false);
    }, 760);
  }

  function startQuiz() {
    const questions = createQuizQuestions(entries, {
      grade: selectedGrade,
      count: 10,
    });
    setQuizQuestions(questions);
    setQuizIndex(0);
    setSelectedAnswer(null);
    setQuizScore(0);
    setWrongEntries([]);
    setScreen("quiz");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function chooseQuizAnswer(answer: string) {
    if (selectedAnswer !== null) {
      return;
    }

    const question = quizQuestions[quizIndex];
    if (!question) {
      return;
    }

    setSelectedAnswer(answer);
    if (answer === question.correctAnswer) {
      setQuizScore((score) => score + 1);
    } else {
      setWrongEntries((current) => [...current, question.entry]);
    }
  }

  function goToNextQuestion() {
    const isLast = quizIndex >= quizQuestions.length - 1;
    if (isLast) {
      recordCompletion("quiz", quizScore, quizQuestions.length);
      setScreen("quiz-result");
      return;
    }

    setQuizIndex((index) => index + 1);
    setSelectedAnswer(null);
  }

  const completedGames =
    progress.matching.completedGames + progress.quiz.completedGames;
  const quizAccuracy = progress.quiz.totalQuestions
    ? Math.round(
        (progress.quiz.correctAnswers / progress.quiz.totalQuestions) * 100,
      )
    : 0;

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
            <span className="brand-mark" aria-hidden="true">
              한
            </span>
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
            selectedGrade={selectedGrade}
            selectedCount={selectedEntries.length}
            progress={progress}
            quizAccuracy={quizAccuracy}
            onChooseGrade={chooseGrade}
            onStartMatching={startMatching}
            onStartQuiz={startQuiz}
          />
        )}

        {screen === "matching" && (
          <MatchingScreen
            grade={selectedGrade}
            cards={matchCards}
            openCardIds={openCardIds}
            matchedPairIds={matchedPairIds}
            attempts={matchAttempts}
            onBack={goHome}
            onSelect={selectMatchCard}
          />
        )}

        {screen === "quiz" && (
          <QuizScreen
            grade={selectedGrade}
            questions={quizQuestions}
            questionIndex={quizIndex}
            score={quizScore}
            selectedAnswer={selectedAnswer}
            onBack={goHome}
            onChoose={chooseQuizAnswer}
            onNext={goToNextQuestion}
          />
        )}

        {screen === "matching-result" && (
          <ResultScreen
            mode="matching"
            score={matchCards.length / 2}
            total={matchCards.length / 2}
            wrongEntries={[]}
            onRetry={startMatching}
            onSwitchMode={startQuiz}
            onHome={goHome}
          />
        )}

        {screen === "quiz-result" && (
          <ResultScreen
            mode="quiz"
            score={quizScore}
            total={quizQuestions.length}
            wrongEntries={wrongEntries}
            onRetry={startQuiz}
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
  selectedGrade: GradeFilter;
  selectedCount: number;
  progress: ProgressState;
  quizAccuracy: number;
  onChooseGrade: (grade: GradeFilter) => void;
  onStartMatching: () => void;
  onStartQuiz: () => void;
}

function HomeScreen({
  sampleEntry,
  selectedGrade,
  selectedCount,
  progress,
  quizAccuracy,
  onChooseGrade,
  onStartMatching,
  onStartQuiz,
}: HomeScreenProps) {
  return (
    <div data-testid="app-home">
      <section className="home-hero" aria-labelledby="home-title">
        <div className="container home-hero__grid">
          <div>
            <p className="eyebrow">초등 한자 · 7급부터 6급까지</p>
            <h1 className="hero-title" id="home-title">
              보고, 고르고, 맞추며 익히는 <em>200자</em>
            </h1>
            <p className="hero-description">
              외우기만 하는 카드 대신, 한자와 음훈의 짝을 찾고 네 개의
              보기에서 답을 골라 보세요. 한 번에 짧게, 기억에는 오래 남게
              학습합니다.
            </p>
            <fieldset className="grade-picker">
              <legend>오늘 학습할 급수를 선택하세요</legend>
              <div className="grade-options">
                {GRADE_OPTIONS.map((grade) => (
                  <button
                    key={grade}
                    className="grade-option"
                    type="button"
                    aria-pressed={selectedGrade === grade}
                    data-testid={`grade-${grade}`}
                    onClick={() => onChooseGrade(grade)}
                  >
                    {grade}
                  </button>
                ))}
              </div>
            </fieldset>
            <p className="scope-summary" aria-live="polite">
              선택한 범위: <strong>{selectedGrade}</strong> · {selectedCount}자
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
              선택한 {selectedGrade} 범위에서 매번 새로운 문제가 나옵니다.
              원하는 방식부터 시작하세요.
            </p>
          </div>

          <div className="mode-grid">
            <article className="mode-card">
              <div>
                <div className="mode-card__number">1</div>
                <h3>짝맞추기</h3>
                <p>
                  뒤집힌 열두 장 중 한자와 알맞은 음훈을 찾아 여섯 쌍을
                  완성해요.
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
                  제시된 한자를 보고 네 개의 음훈 중 정답을 골라 열 문제에
                  도전해요.
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
            <p>
              결과는 이 브라우저에 안전하게 저장됩니다. 로그인은 필요하지
              않아요.
            </p>
          </div>
          <div className="progress-stats">
            <div className="progress-stat">
              <strong>{progress.matching.completedGames}</strong>
              <span>짝맞추기 완료</span>
            </div>
            <div className="progress-stat">
              <strong>{progress.quiz.completedGames}</strong>
              <span>퀴즈 완료</span>
            </div>
            <div className="progress-stat">
              <strong>{quizAccuracy}%</strong>
              <span>누적 정답률</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

interface MatchingScreenProps {
  grade: GradeFilter;
  cards: MatchCard[];
  openCardIds: string[];
  matchedPairIds: Set<string>;
  attempts: number;
  onBack: () => void;
  onSelect: (card: MatchCard) => void;
}

function MatchingScreen({
  grade,
  cards,
  openCardIds,
  matchedPairIds,
  attempts,
  onBack,
  onSelect,
}: MatchingScreenProps) {
  const totalPairs = cards.length / 2;
  const progressPercent = totalPairs
    ? (matchedPairIds.size / totalPairs) * 100
    : 0;

  return (
    <section className="learning-page" data-testid="matching-screen">
      <div className="learning-container">
        <button className="back-button" type="button" onClick={onBack}>
          <span aria-hidden="true">←</span> 학습 선택으로
        </button>
        <header className="session-header">
          <div className="session-header__main">
            <div>
              <p className="eyebrow">{grade} · 여섯 쌍</p>
              <h1 className="session-title">한자와 음훈의 짝을 찾아요</h1>
              <p className="session-subtitle">
                카드 두 장을 차례로 열어 같은 한자의 짝을 맞춰 보세요.
              </p>
            </div>
            <div className="session-stats" aria-live="polite">
              <div className="session-stat">
                <strong>
                  {matchedPairIds.size}/{totalPairs}
                </strong>
                <span>맞춘 쌍</span>
              </div>
              <div className="session-stat">
                <strong>{attempts}</strong>
                <span>시도</span>
              </div>
            </div>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-label="짝맞추기 진행률"
            aria-valuemin={0}
            aria-valuemax={totalPairs}
            aria-valuenow={matchedPairIds.size}
          >
            <div
              className="progress-track__bar"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </header>

        {cards.length ? (
          <div className="game-panel">
            <div className="match-grid">
              {cards.map((card) => {
                const isOpen = openCardIds.includes(card.id);
                const isMatched = matchedPairIds.has(card.pairId);
                const label = isMatched
                  ? `짝 맞춤: ${card.content}`
                  : isOpen
                    ? `열린 카드: ${card.content}`
                    : "뒤집지 않은 카드";

                return (
                  <button
                    key={card.id}
                    className="match-card"
                    type="button"
                    aria-label={label}
                    aria-pressed={isOpen || isMatched}
                    data-matched={isMatched}
                    data-testid={`match-card-${card.id}`}
                    disabled={isMatched}
                    onClick={() => onSelect(card)}
                  >
                    <span className="match-card__inner" aria-hidden="true">
                      <span className="match-card__face match-card__back" />
                      <span
                        className={`match-card__face match-card__front match-card__front--${card.kind === "hanja" ? "hanja" : "meaning"}`}
                      >
                        {card.content}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="game-help">
              한자 카드와 ‘뜻 음’ 카드는 서로 한 쌍입니다. 키보드의 Tab과
              Enter로도 플레이할 수 있어요.
            </p>
          </div>
        ) : (
          <EmptyState onHome={onBack} />
        )}
      </div>
    </section>
  );
}

interface QuizScreenProps {
  grade: GradeFilter;
  questions: QuizQuestion[];
  questionIndex: number;
  score: number;
  selectedAnswer: string | null;
  onBack: () => void;
  onChoose: (answer: string) => void;
  onNext: () => void;
}

function QuizScreen({
  grade,
  questions,
  questionIndex,
  score,
  selectedAnswer,
  onBack,
  onChoose,
  onNext,
}: QuizScreenProps) {
  const question = questions[questionIndex];
  const isLast = questionIndex === questions.length - 1;

  if (!question) {
    return (
      <section className="learning-page">
        <div className="learning-container">
          <EmptyState onHome={onBack} />
        </div>
      </section>
    );
  }

  const isCorrect = selectedAnswer === question.correctAnswer;

  return (
    <section className="learning-page" data-testid="quiz-screen">
      <div className="learning-container">
        <button className="back-button" type="button" onClick={onBack}>
          <span aria-hidden="true">←</span> 학습 선택으로
        </button>
        <header className="session-header">
          <div className="session-header__main">
            <div>
              <p className="eyebrow">{grade} · 열 문제</p>
              <h1 className="session-title">알맞은 음훈을 골라요</h1>
              <p className="session-subtitle">
                한자를 보고 네 개의 보기 중 정답 하나를 선택하세요.
              </p>
            </div>
            <div className="session-stats" aria-live="polite">
              <div className="session-stat">
                <strong>
                  {questionIndex + 1}/{questions.length}
                </strong>
                <span>현재 문제</span>
              </div>
              <div className="session-stat">
                <strong>{score}</strong>
                <span>맞힌 문제</span>
              </div>
            </div>
          </div>
          <div
            className="progress-track"
            role="progressbar"
            aria-label="퀴즈 진행률"
            aria-valuemin={1}
            aria-valuemax={questions.length}
            aria-valuenow={questionIndex + 1}
          >
            <div
              className="progress-track__bar"
              style={{
                width: `${((questionIndex + 1) / questions.length) * 100}%`,
              }}
            />
          </div>
        </header>

        <div className="game-panel quiz-panel">
          <div className="quiz-question">
            <p className="quiz-question__label">이 한자의 음훈은 무엇일까요?</p>
            <p className="quiz-question__hanja" data-testid="quiz-hanja">
              {question.hanja}
            </p>
          </div>
          <div className="quiz-answers">
            <h2>정답을 하나 선택하세요</h2>
            <div className="choice-list">
              {question.choices.map((choice, index) => {
                const isAnswer = choice === question.correctAnswer;
                const isSelected = choice === selectedAnswer;
                const state =
                  selectedAnswer === null
                    ? "idle"
                    : isAnswer
                      ? "correct"
                      : isSelected
                        ? "wrong"
                        : "idle";

                return (
                  <button
                    key={choice}
                    className="choice-button"
                    type="button"
                    data-state={state}
                    data-testid={`quiz-choice-${index}`}
                    disabled={selectedAnswer !== null}
                    onClick={() => onChoose(choice)}
                  >
                    <span className="choice-index" aria-hidden="true">
                      {index + 1}
                    </span>
                    <span>{choice}</span>
                    {selectedAnswer !== null && isAnswer && (
                      <span className="choice-state">✓ 정답</span>
                    )}
                    {selectedAnswer !== null && isSelected && !isAnswer && (
                      <span className="choice-state">× 선택</span>
                    )}
                  </button>
                );
              })}
            </div>

            {selectedAnswer !== null && (
              <div className="answer-feedback" role="status">
                {isCorrect ? "잘했어요! " : "아쉬워요. 정답은 "}
                <strong>{question.correctAnswer}</strong>입니다.
                {question.entry.sourceLabel !== question.entry.eumhun && (
                  <> 원문 음훈은 ‘{question.entry.sourceLabel}’입니다.</>
                )}
              </div>
            )}

            <div className="quiz-actions">
              <button
                className="primary-button"
                type="button"
                data-testid="quiz-next"
                disabled={selectedAnswer === null}
                onClick={onNext}
              >
                {isLast ? "결과 보기" : "다음 문제"}
                <span aria-hidden="true">→</span>
              </button>
            </div>
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
  wrongEntries: HanjaEntry[];
  onRetry: () => void;
  onSwitchMode: () => void;
  onHome: () => void;
}

function ResultScreen({
  mode,
  score,
  total,
  wrongEntries,
  onRetry,
  onSwitchMode,
  onHome,
}: ResultScreenProps) {
  const percentage = total ? Math.round((score / total) * 100) : 0;
  const isMatching = mode === "matching";

  return (
    <section className="learning-page" data-testid={`${mode}-result`}>
      <div className="learning-container">
        <button className="back-button" type="button" onClick={onHome}>
          <span aria-hidden="true">←</span> 학습 선택으로
        </button>
        <div className="game-panel result-panel">
          <div className="result-score" aria-label={`정답률 ${percentage}%`}>
            <div>
              <strong>{isMatching ? "완료" : `${percentage}%`}</strong>
              <span>
                {score}/{total} {isMatching ? "쌍" : "문제"}
              </span>
            </div>
          </div>
          <div>
            <p className="eyebrow">학습을 마쳤어요</p>
            <h1 className="result-title">
              {isMatching
                ? "여섯 쌍을 모두 찾았어요!"
                : score === total
                  ? "모든 문제를 맞혔어요!"
                  : "틀린 글자만 다시 보면 더 좋아요."}
            </h1>
            <p className="result-copy">
              {isMatching
                ? "한자와 음훈을 연결한 기억이 오래 남도록 한 번 더 도전해 보세요."
                : `열 문제 중 ${score}문제를 맞혔습니다. 결과가 이 기기의 학습 기록에 저장됐어요.`}
            </p>
            <div className="result-actions">
              <button
                className="primary-button"
                type="button"
                data-testid="result-retry"
                onClick={onRetry}
              >
                새 문제로 다시 하기
              </button>
              <button
                className="secondary-button"
                type="button"
                onClick={onSwitchMode}
              >
                {isMatching ? "퀴즈 풀기" : "짝맞추기 하기"}
              </button>
              <button className="text-button" type="button" onClick={onHome}>
                급수 바꾸기
              </button>
            </div>

            {!isMatching && wrongEntries.length > 0 && (
              <div className="review-list">
                <h3>다시 볼 글자</h3>
                <div className="review-chips">
                  {wrongEntries.map((entry) => (
                    <span className="review-chip" key={entry.id}>
                      <strong>{entry.hanja}</strong> {entry.eumhun}
                    </span>
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
      <p>학습 데이터를 다시 확인하고 급수를 선택해 주세요.</p>
      <button className="primary-button" type="button" onClick={onHome}>
        학습 선택으로 돌아가기
      </button>
    </div>
  );
}

function makeRecordId(mode: StudyMode): string {
  const suffix =
    typeof globalThis.crypto?.randomUUID === "function"
      ? globalThis.crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${mode}:${suffix}`;
}
