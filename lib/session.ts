import { createMatchingCards, createQuizQuestions } from "./game.ts";
import type {
  GradeFilter,
  HanjaEntry,
  MatchCard,
  QuizQuestion,
  RandomSource,
} from "./types";

/** 짝맞추기 라운드의 진행 단계입니다. */
export type MatchPhase = "playing" | "checking" | "complete";

export interface MatchSession {
  grade: GradeFilter;
  cards: MatchCard[];
  /** 현재 앞면으로 공개된 카드 ID이며 최대 두 개입니다. */
  faceUpIds: string[];
  matchedPairIds: string[];
  /** 두 번째 카드를 공개해 비교를 시작할 때마다 1씩 증가합니다. */
  attempts: number;
  phase: MatchPhase;
}

export interface MatchSessionOptions {
  grade?: GradeFilter;
  pairCount?: number;
  rng?: RandomSource;
}

/** 4지선다 한 문제에 대한 응답 기록입니다. */
export interface QuizAnswer {
  questionId: string;
  selected: string;
  correct: boolean;
}

export type QuizPhase = "asking" | "answered" | "complete";

export interface QuizSession {
  grade: GradeFilter;
  questions: QuizQuestion[];
  currentIndex: number;
  /** 응답 순서대로 쌓이며 문제당 최대 한 개입니다. */
  answers: QuizAnswer[];
  phase: QuizPhase;
}

export interface QuizSessionOptions {
  grade?: GradeFilter;
  count?: number;
  rng?: RandomSource;
}

/** 답안 배열에서 파생한 퀴즈 결과 요약입니다. */
export interface QuizSummary {
  score: number;
  total: number;
  /** 0~100 반올림 정답률입니다. */
  percentage: number;
  wrongEntries: HanjaEntry[];
}

export function createMatchSession(
  entries: readonly HanjaEntry[],
  options: MatchSessionOptions = {},
): MatchSession {
  const { grade = "전체" } = options;
  return {
    grade,
    cards: createMatchingCards(entries, options),
    faceUpIds: [],
    matchedPairIds: [],
    attempts: 0,
    phase: "playing",
  };
}

/** 같은 카드 구성으로 진행 상태만 초기화해 다시 시작합니다. */
export function restartMatchSession(session: MatchSession): MatchSession {
  return {
    ...session,
    faceUpIds: [],
    matchedPairIds: [],
    attempts: 0,
    phase: "playing",
  };
}

/**
 * 카드 선택 전이입니다. 유효하지 않은 선택은 입력 상태를 그대로 반환합니다.
 * - `checking`(비교 중)에는 모든 추가 선택을 무시합니다.
 * - 이미 맞춘 카드와 이미 공개된 카드는 무시합니다.
 * - 두 번째 카드를 공개하면 시도를 1 올리고 `checking`으로 이동합니다.
 */
export function selectMatchCard(
  session: MatchSession,
  cardId: string,
): MatchSession {
  if (session.phase !== "playing") {
    return session;
  }

  const card = session.cards.find((item) => item.id === cardId);
  if (
    !card ||
    session.matchedPairIds.includes(card.pairId) ||
    session.faceUpIds.includes(card.id)
  ) {
    return session;
  }

  if (session.faceUpIds.length === 0) {
    return { ...session, faceUpIds: [card.id] };
  }

  return {
    ...session,
    faceUpIds: [...session.faceUpIds, card.id],
    attempts: session.attempts + 1,
    phase: "checking",
  };
}

/** `checking` 상태에서 공개된 두 카드가 짝인지 판정합니다. */
export function isCheckingPairMatched(session: MatchSession): boolean {
  if (session.phase !== "checking" || session.faceUpIds.length !== 2) {
    return false;
  }

  const [first, second] = session.faceUpIds.map((id) =>
    session.cards.find((card) => card.id === id),
  );
  return (
    first !== undefined &&
    second !== undefined &&
    first.pairId === second.pairId &&
    first.kind !== second.kind
  );
}

/**
 * 비교를 완료합니다. 짝이면 matched에 추가하고, 아니면 두 카드를 다시 가립니다.
 * 모든 쌍을 맞추면 `complete`, 아니면 `playing`으로 돌아갑니다.
 */
export function resolveMatchCheck(session: MatchSession): MatchSession {
  if (session.phase !== "checking") {
    return session;
  }

  if (!isCheckingPairMatched(session)) {
    return { ...session, faceUpIds: [], phase: "playing" };
  }

  const [firstId] = session.faceUpIds;
  const matchedCard = session.cards.find((card) => card.id === firstId);
  const matchedPairIds = matchedCard
    ? [...session.matchedPairIds, matchedCard.pairId]
    : session.matchedPairIds;
  const totalPairs = session.cards.length / 2;

  return {
    ...session,
    faceUpIds: [],
    matchedPairIds,
    phase: matchedPairIds.length === totalPairs ? "complete" : "playing",
  };
}

export function createQuizSession(
  entries: readonly HanjaEntry[],
  options: QuizSessionOptions = {},
): QuizSession {
  const { grade = "전체" } = options;
  return {
    grade,
    questions: createQuizQuestions(entries, options),
    currentIndex: 0,
    answers: [],
    phase: "asking",
  };
}

/** 같은 문제와 보기 구성을 유지한 채 답안만 초기화합니다. */
export function restartQuizSession(session: QuizSession): QuizSession {
  return {
    ...session,
    currentIndex: 0,
    answers: [],
    phase: "asking",
  };
}

/**
 * 현재 문제에 응답합니다. `asking`이 아닐 때와 보기에 없는 값은 무시하므로
 * 문제당 응답은 한 번만 기록됩니다.
 */
export function answerQuizQuestion(
  session: QuizSession,
  selected: string,
): QuizSession {
  const question = session.questions[session.currentIndex];
  if (
    session.phase !== "asking" ||
    !question ||
    !question.choices.includes(selected)
  ) {
    return session;
  }

  return {
    ...session,
    answers: [
      ...session.answers,
      {
        questionId: question.id,
        selected,
        correct: selected === question.correctAnswer,
      },
    ],
    phase: "answered",
  };
}

/**
 * 응답한 문제에서 다음으로 이동합니다.
 * 마지막 문제였다면 `complete`로 전환합니다.
 */
export function advanceQuiz(session: QuizSession): QuizSession {
  if (session.phase !== "answered") {
    return session;
  }

  if (session.currentIndex >= session.questions.length - 1) {
    return { ...session, phase: "complete" };
  }

  return {
    ...session,
    currentIndex: session.currentIndex + 1,
    phase: "asking",
  };
}

/** 점수·정답률·오답 목록을 별도 카운터 없이 답안 배열에서 파생합니다. */
export function summarizeQuiz(session: QuizSession): QuizSummary {
  const score = session.answers.filter((answer) => answer.correct).length;
  const total = session.questions.length;
  const questionById = new Map(
    session.questions.map((question) => [question.id, question]),
  );
  const wrongEntries = session.answers
    .filter((answer) => !answer.correct)
    .map((answer) => questionById.get(answer.questionId)?.entry)
    .filter((entry): entry is HanjaEntry => entry !== undefined);

  return {
    score,
    total,
    percentage: total ? Math.round((score / total) * 100) : 0,
    wrongEntries,
  };
}
