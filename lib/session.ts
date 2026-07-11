import {
  MATCH_VISIBLE_CARD_COUNT,
  createMatchingCards,
  createQuizQuestions,
  shuffle,
} from "./game.ts";
import type {
  HanjaEntry,
  MatchCard,
  QuizQuestion,
  RandomSource,
  StudySetId,
} from "./types.ts";
import { DEFAULT_STUDY_SET } from "./types.ts";

/** 짝맞추기 라운드의 진행 단계입니다. */
export type MatchPhase = "playing" | "checking" | "complete";

export interface MatchSession {
  studySet: StudySetId;
  /** 현재 화면에 보이는 카드입니다. 정상 구간에서는 항상 열 장입니다. */
  cards: MatchCard[];
  /** 아직 화면에 공급되지 않은 카드입니다. */
  pendingCards: MatchCard[];
  /** 같은 카드 다시 하기를 위한 최초 카드 배치입니다. */
  initialCards: MatchCard[];
  initialPendingCards: MatchCard[];
  /** 현재 선택한 카드 ID이며 비교 중에는 두 개입니다. */
  faceUpIds: string[];
  matchedPairIds: string[];
  /** 두 번째 카드를 선택한 횟수입니다. */
  attempts: number;
  wrongAttempts: number;
  /** 한 번이라도 잘못 고른 항목을 첫 발생 순서로 보관합니다. */
  wrongEntryIds: string[];
  totalPairs: number;
  phase: MatchPhase;
}

export interface MatchSessionOptions {
  studySet?: StudySetId;
  rng?: RandomSource;
}

export interface MatchSummary {
  score: number;
  total: number;
  wrongAttempts: number;
  wrongEntryIds: string[];
}

/** 4지선다 한 문제에 대한 정답 기록입니다. */
export interface QuizAnswer {
  questionId: string;
  selected: string;
  correct: true;
}

export type QuizPhase = "asking" | "feedback" | "complete";

export interface QuizFeedback {
  selected: string;
  correct: boolean;
}

export interface QuizSession {
  studySet: StudySetId;
  questions: QuizQuestion[];
  currentIndex: number;
  /** 정답을 맞힌 문제만 순서대로 쌓습니다. */
  answers: QuizAnswer[];
  /** 1초 동안 보여 줄 직전 선택의 피드백입니다. */
  feedback: QuizFeedback | null;
  /** 한 번이라도 오답을 고른 항목입니다. */
  wrongEntryIds: string[];
  phase: QuizPhase;
}

export interface QuizSessionOptions {
  studySet?: StudySetId;
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
  const { studySet = DEFAULT_STUDY_SET, rng = Math.random } = options;
  const deck = createMatchingCards(entries, { studySet, rng });
  const { cards, pendingCards } = createInitialMatchLayout(deck, rng);

  return {
    studySet,
    cards,
    pendingCards,
    initialCards: cards,
    initialPendingCards: pendingCards,
    faceUpIds: [],
    matchedPairIds: [],
    attempts: 0,
    wrongAttempts: 0,
    wrongEntryIds: [],
    totalPairs: deck.length / 2,
    phase: deck.length === 0 ? "complete" : "playing",
  };
}

/** 같은 카드 구성과 최초 배치로 진행 상태만 초기화해 다시 시작합니다. */
export function restartMatchSession(session: MatchSession): MatchSession {
  return {
    ...session,
    cards: [...session.initialCards],
    pendingCards: [...session.initialPendingCards],
    faceUpIds: [],
    matchedPairIds: [],
    attempts: 0,
    wrongAttempts: 0,
    wrongEntryIds: [],
    phase: session.totalPairs === 0 ? "complete" : "playing",
  };
}

/**
 * 카드 선택 전이입니다. 모든 카드는 앞면으로 보이며, 선택한 두 카드만 비교합니다.
 * `checking` 중에는 추가 입력을 무시합니다.
 */
export function selectMatchCard(
  session: MatchSession,
  cardId: string,
): MatchSession {
  if (session.phase !== "playing") {
    return session;
  }

  const card = session.cards.find((item) => item.id === cardId);
  if (!card || session.faceUpIds.includes(card.id)) {
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

/** `checking` 상태에서 선택한 두 카드가 짝인지 판정합니다. */
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
 * 비교를 완료합니다.
 * - 오답은 두 항목을 복습 목록에 보관하고 선택만 해제합니다.
 * - 정답은 두 카드를 제거한 뒤, 대기 풀이 다섯 장 이상이면 3쌍+4장 구성을
 *   복원하고, 네 장 이하면 한자·음훈 한 장씩 임의 공급합니다.
 */
export function resolveMatchCheck(
  session: MatchSession,
  rng: RandomSource = Math.random,
): MatchSession {
  if (session.phase !== "checking") {
    return session;
  }

  if (!isCheckingPairMatched(session)) {
    const selectedEntries = session.faceUpIds
      .map((id) => session.cards.find((card) => card.id === id)?.entryId)
      .filter((entryId): entryId is string => entryId !== undefined);
    return {
      ...session,
      faceUpIds: [],
      wrongAttempts: session.wrongAttempts + 1,
      wrongEntryIds: appendUnique(session.wrongEntryIds, selectedEntries),
      phase: "playing",
    };
  }

  const matchedPairId = session.cards.find(
    (card) => card.id === session.faceUpIds[0],
  )?.pairId;
  const remainingCards = session.cards.filter(
    (card) => !session.faceUpIds.includes(card.id),
  );
  const { cards, pendingCards } = replenishMatchCards(
    remainingCards,
    session.pendingCards,
    rng,
  );
  const matchedPairIds = matchedPairId
    ? [...session.matchedPairIds, matchedPairId]
    : session.matchedPairIds;

  return {
    ...session,
    cards,
    pendingCards,
    faceUpIds: [],
    matchedPairIds,
    phase: cards.length === 0 && pendingCards.length === 0 ? "complete" : "playing",
  };
}

export function summarizeMatch(session: MatchSession): MatchSummary {
  return {
    score: session.matchedPairIds.length,
    total: session.totalPairs,
    wrongAttempts: session.wrongAttempts,
    wrongEntryIds: session.wrongEntryIds,
  };
}

export function createQuizSession(
  entries: readonly HanjaEntry[],
  options: QuizSessionOptions = {},
): QuizSession {
  const { studySet = DEFAULT_STUDY_SET } = options;
  const questions = createQuizQuestions(entries, options);
  return {
    studySet,
    questions,
    currentIndex: 0,
    answers: [],
    feedback: null,
    wrongEntryIds: [],
    phase: questions.length === 0 ? "complete" : "asking",
  };
}

/** 같은 문제와 보기 구성을 유지한 채 답안과 오답 기록만 초기화합니다. */
export function restartQuizSession(session: QuizSession): QuizSession {
  return {
    ...session,
    currentIndex: 0,
    answers: [],
    feedback: null,
    wrongEntryIds: [],
    phase: session.questions.length === 0 ? "complete" : "asking",
  };
}

/** 현재 문제의 보기를 고르고, 1초 피드백 상태로 이동합니다. */
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

  const correct = selected === question.correctAnswer;
  return {
    ...session,
    answers: correct
      ? [
          ...session.answers,
          { questionId: question.id, selected, correct: true },
        ]
      : session.answers,
    feedback: { selected, correct },
    wrongEntryIds: correct
      ? session.wrongEntryIds
      : appendUnique(session.wrongEntryIds, [question.entryId]),
    phase: "feedback",
  };
}

/**
 * 1초 피드백 뒤 상태를 정리합니다. 오답은 같은 문제를 다시 풀고,
 * 정답은 별도 클릭 없이 다음 문제 또는 결과로 이동합니다.
 */
export function resolveQuizFeedback(session: QuizSession): QuizSession {
  if (session.phase !== "feedback" || !session.feedback) {
    return session;
  }

  if (!session.feedback.correct) {
    return { ...session, feedback: null, phase: "asking" };
  }

  if (session.currentIndex >= session.questions.length - 1) {
    return { ...session, feedback: null, phase: "complete" };
  }

  return {
    ...session,
    currentIndex: session.currentIndex + 1,
    feedback: null,
    phase: "asking",
  };
}

/** 호환을 위한 별칭입니다. 정답 피드백 상태에서만 다음으로 이동합니다. */
export const advanceQuiz = resolveQuizFeedback;

/** 점수·정답률·오답 복습 목록을 세션 기록에서 파생합니다. */
export function summarizeQuiz(session: QuizSession): QuizSummary {
  const score = session.answers.length;
  const total = session.questions.length;
  const questionByEntryId = new Map(
    session.questions.map((question) => [question.entryId, question.entry]),
  );
  const wrongEntries = session.wrongEntryIds
    .map((entryId) => questionByEntryId.get(entryId))
    .filter((entry): entry is HanjaEntry => entry !== undefined);

  return {
    score,
    total,
    percentage: total ? Math.round((score / total) * 100) : 0,
    wrongEntries,
  };
}

function createInitialMatchLayout(
  deck: readonly MatchCard[],
  rng: RandomSource,
): { cards: MatchCard[]; pendingCards: MatchCard[] } {
  const pairIds = [...new Set(deck.map((card) => card.pairId))];
  if (deck.length < MATCH_VISIBLE_CARD_COUNT || pairIds.length < 7) {
    return { cards: shuffle(deck, rng), pendingCards: [] };
  }

  const initialCards = [
    ...cardsForPair(deck, pairIds[0]),
    ...cardsForPair(deck, pairIds[1]),
    ...cardsForPair(deck, pairIds[2]),
    cardForPair(deck, pairIds[3], "hanja"),
    cardForPair(deck, pairIds[4], "hanja"),
    cardForPair(deck, pairIds[5], "eumhun"),
    cardForPair(deck, pairIds[6], "eumhun"),
  ];
  const initialIds = new Set(initialCards.map((card) => card.id));

  return {
    cards: shuffle(initialCards, rng),
    pendingCards: deck.filter((card) => !initialIds.has(card.id)),
  };
}

function replenishMatchCards(
  remainingCards: readonly MatchCard[],
  pendingCards: readonly MatchCard[],
  rng: RandomSource,
): { cards: MatchCard[]; pendingCards: MatchCard[] } {
  if (pendingCards.length === 0) {
    return { cards: [...remainingCards], pendingCards: [] };
  }

  if (pendingCards.length <= 4) {
    const additions = takeBalancedCards(pendingCards, rng);
    return {
      cards: shuffle([...remainingCards, ...additions], rng),
      pendingCards: pendingCards.filter(
        (card) => !additions.some((addition) => addition.id === card.id),
      ),
    };
  }

  const orphanCards = remainingCards.filter(
    (card) =>
      remainingCards.filter((candidate) => candidate.pairId === card.pairId)
        .length === 1 &&
      pendingCards.some(
        (candidate) =>
          candidate.pairId === card.pairId && candidate.kind !== card.kind,
      ),
  );
  const target = shuffle(orphanCards, rng)[0];
  const matchingCard = target
    ? pendingCards.find(
        (card) => card.pairId === target.pairId && card.kind !== target.kind,
      )
    : undefined;

  if (!target || !matchingCard) {
    const additions = takeBalancedCards(pendingCards, rng);
    return {
      cards: shuffle([...remainingCards, ...additions], rng),
      pendingCards: pendingCards.filter(
        (card) => !additions.some((addition) => addition.id === card.id),
      ),
    };
  }

  const afterPair = [...remainingCards, matchingCard];
  const freshCard = shuffle(
    pendingCards.filter(
      (card) =>
        card.id !== matchingCard.id &&
        card.kind === target.kind &&
        !afterPair.some((visible) => visible.pairId === card.pairId),
    ),
    rng,
  )[0];

  if (!freshCard) {
    const additions = takeBalancedCards(pendingCards, rng);
    return {
      cards: shuffle([...remainingCards, ...additions], rng),
      pendingCards: pendingCards.filter(
        (card) => !additions.some((addition) => addition.id === card.id),
      ),
    };
  }

  const additions = [matchingCard, freshCard];
  return {
    cards: shuffle([...remainingCards, ...additions], rng),
    pendingCards: pendingCards.filter(
      (card) => !additions.some((addition) => addition.id === card.id),
    ),
  };
}

function takeBalancedCards(
  cards: readonly MatchCard[],
  rng: RandomSource,
): MatchCard[] {
  const hanja = shuffle(cards.filter((card) => card.kind === "hanja"), rng)[0];
  const eumhun = shuffle(cards.filter((card) => card.kind === "eumhun"), rng)[0];
  const balanced = [hanja, eumhun].filter(
    (card): card is MatchCard => card !== undefined,
  );
  return balanced.length === 2 ? balanced : shuffle(cards, rng).slice(0, 2);
}

function cardsForPair(
  cards: readonly MatchCard[],
  pairId: string,
): MatchCard[] {
  return cards.filter((card) => card.pairId === pairId);
}

function cardForPair(
  cards: readonly MatchCard[],
  pairId: string,
  kind: MatchCard["kind"],
): MatchCard {
  const card = cards.find((candidate) => candidate.pairId === pairId && candidate.kind === kind);
  if (!card) {
    throw new Error("매칭 카드 쌍이 완전하지 않습니다.");
  }
  return card;
}

function appendUnique(current: readonly string[], additions: readonly string[]): string[] {
  const next = [...current];
  additions.forEach((item) => {
    if (!next.includes(item)) {
      next.push(item);
    }
  });
  return next;
}
