import assert from "node:assert/strict";
import test from "node:test";

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
} from "../lib/session.ts";
import type { MatchSession } from "../lib/session.ts";
import type { HanjaEntry } from "../lib/types";

function makeEntries(count = 25): HanjaEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `hanja-${index + 1}`,
    hanja: String.fromCodePoint(0x4e00 + index),
    eum: [`음${index + 1}`],
    hun: [`뜻${index + 1}`],
    eumhun: `뜻${index + 1} 음${index + 1}`,
    grade: "7급",
    source: "https://example.com/source",
    sourceLabel: `원문${index + 1}`,
  }));
}

function seededRng(seed = 123456789): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

function findVisiblePair(session: MatchSession) {
  const first = session.cards.find((card) =>
    session.cards.some((candidate) => candidate.pairId === card.pairId && candidate.id !== card.id),
  );
  assert.ok(first);
  const partner = session.cards.find((card) => card.pairId === first.pairId && card.id !== first.id);
  assert.ok(partner);
  return { first, partner };
}

function countVisiblePairs(session: MatchSession): number {
  return new Set(
    session.cards
      .filter((card) => session.cards.filter((candidate) => candidate.pairId === card.pairId).length === 2)
      .map((card) => card.pairId),
  ).size;
}

test("짝맞추기 세션은 앞면 12장, 맞는 4쌍과 짝 없는 4장으로 시작한다", () => {
  const session = createMatchSession(makeEntries(), { studySet: "7급-1", rng: seededRng(7) });

  assert.equal(session.cards.length, 12);
  assert.equal(session.slots.length, 12);
  assert.equal(session.pendingCards.length, 38);
  assert.equal(session.cards.filter((card) => card.kind === "hanja").length, 6);
  assert.equal(session.cards.filter((card) => card.kind === "eumhun").length, 6);
  assert.equal(countVisiblePairs(session), 4);
  assert.equal(new Set(session.cards.map((card) => card.pairId)).size, 8);
  assert.equal(session.totalPairs, 25);
  assert.equal(session.phase, "playing");
});

test("첫 카드는 선택만 하고 다시 누르면 선택을 취소하며, 두 번째 선택 중에는 입력을 잠근다", () => {
  const session = createMatchSession(makeEntries(), { rng: seededRng(7) });
  const [first, second, third] = session.cards;

  const opened = selectMatchCard(session, first.id);
  assert.deepEqual(opened.faceUpIds, [first.id]);
  assert.equal(opened.attempts, 0);

  const cancelled = selectMatchCard(opened, first.id);
  assert.deepEqual(cancelled.faceUpIds, []);
  assert.equal(cancelled.attempts, 0);

  const checking = selectMatchCard(selectMatchCard(cancelled, first.id), second.id);
  assert.equal(checking.phase, "checking");
  assert.equal(checking.attempts, 1);
  assert.equal(selectMatchCard(checking, third.id), checking);
});

test("오답은 1회로 누적하고 두 카드의 한자를 복습 목록에 한 번만 남긴다", () => {
  const session = createMatchSession(makeEntries(), { rng: seededRng(7) });
  const first = session.cards[0];
  const outsider = session.cards.find((card) => card.pairId !== first.pairId);
  assert.ok(outsider);

  const checking = selectMatchCard(selectMatchCard(session, first.id), outsider.id);
  assert.equal(isCheckingPairMatched(checking), false);
  const resolved = resolveMatchCheck(checking, seededRng(8));

  assert.equal(resolved.phase, "playing");
  assert.equal(resolved.wrongAttempts, 1);
  assert.deepEqual(resolved.wrongEntryIds, [first.entryId, outsider.entryId]);
  assert.equal(resolved.cards.length, 12);
});

test("정답은 제거한 두 슬롯만 채우고 12장 4쌍+4장 구성을 복원한다", () => {
  const session = createMatchSession(makeEntries(), { rng: seededRng(7) });
  const { first, partner } = findVisiblePair(session);
  const firstSlot = session.slots.findIndex((card) => card?.id === first.id);
  const partnerSlot = session.slots.findIndex((card) => card?.id === partner.id);
  const stableSlots = session.slots
    .map((card, index) => ({ card, index }))
    .filter(({ card }) => card?.id !== first.id && card?.id !== partner.id);

  const checking = selectMatchCard(selectMatchCard(session, first.id), partner.id);
  assert.equal(isCheckingPairMatched(checking), true);
  const resolved = resolveMatchCheck(checking, seededRng(8));

  assert.equal(resolved.matchedPairIds.length, 1);
  assert.equal(resolved.cards.length, 12);
  assert.equal(resolved.pendingCards.length, 36);
  assert.equal(resolved.cards.filter((card) => card.kind === "hanja").length, 6);
  assert.equal(resolved.cards.filter((card) => card.kind === "eumhun").length, 6);
  assert.equal(countVisiblePairs(resolved), 4);
  assert.equal(new Set(resolved.cards.map((card) => card.pairId)).size, 8);
  assert.equal(resolved.cards.some((card) => card.pairId === first.pairId), false);
  assert.notEqual(resolved.slots[firstSlot]?.id, first.id);
  assert.notEqual(resolved.slots[partnerSlot]?.id, partner.id);
  stableSlots.forEach(({ card, index }) => {
    assert.equal(resolved.slots[index]?.id, card?.id);
  });
});

test("대기 풀이 네 장 이하이면 두 장만 공급하고, 모두 공개되면 추가 공급을 멈춘다", () => {
  let session = createMatchSession(makeEntries(), { rng: seededRng(7) });
  const rng = seededRng(8);

  while (session.pendingCards.length > 4) {
    const { first, partner } = findVisiblePair(session);
    session = resolveMatchCheck(selectMatchCard(selectMatchCard(session, first.id), partner.id), rng);
    assert.equal(session.cards.length, 12);
    assert.equal(session.cards.filter((card) => card.kind === "hanja").length, 6);
    assert.equal(session.cards.filter((card) => card.kind === "eumhun").length, 6);
    assert.equal(countVisiblePairs(session), 4);
  }

  assert.equal(session.pendingCards.length, 4);
  let pair = findVisiblePair(session);
  session = resolveMatchCheck(selectMatchCard(selectMatchCard(session, pair.first.id), pair.partner.id), rng);
  assert.equal(session.cards.length, 12);
  assert.equal(session.pendingCards.length, 2);

  pair = findVisiblePair(session);
  session = resolveMatchCheck(selectMatchCard(selectMatchCard(session, pair.first.id), pair.partner.id), rng);
  assert.equal(session.cards.length, 12);
  assert.equal(session.pendingCards.length, 0);

  pair = findVisiblePair(session);
  session = resolveMatchCheck(selectMatchCard(selectMatchCard(session, pair.first.id), pair.partner.id), rng);
  assert.equal(session.cards.length, 10);
  assert.equal(session.pendingCards.length, 0);
});

test("25쌍을 모두 맞추면 완료로 전환하고 같은 카드 다시 하기는 초기 배치를 복원한다", () => {
  let session = createMatchSession(makeEntries(), { rng: seededRng(7) });
  const initialCards = session.cards;
  const rng = seededRng(9);

  while (session.cards.length > 0) {
    const { first, partner } = findVisiblePair(session);
    session = resolveMatchCheck(selectMatchCard(selectMatchCard(session, first.id), partner.id), rng);
  }

  assert.equal(session.phase, "complete");
  assert.equal(session.matchedPairIds.length, 25);
  assert.deepEqual(summarizeMatch(session), {
    score: 25,
    total: 25,
    wrongAttempts: 0,
    wrongEntryIds: [],
  });

  const restarted = restartMatchSession(session);
  assert.deepEqual(restarted.cards, initialCards);
  assert.equal(restarted.pendingCards.length, 38);
  assert.equal(restarted.matchedPairIds.length, 0);
  assert.equal(restarted.phase, "playing");
});

test("퀴즈 오답은 1초 피드백 뒤 같은 문제를 다시 열고, 정답은 자동으로 다음 문제로 간다", () => {
  const session = createQuizSession(makeEntries(), { count: 3, rng: seededRng(11) });
  const question = session.questions[0];
  const wrongChoice = question.choices.find((choice) => choice !== question.correctAnswer);
  assert.ok(wrongChoice);

  const wrongFeedback = answerQuizQuestion(session, wrongChoice);
  assert.equal(wrongFeedback.phase, "feedback");
  assert.deepEqual(wrongFeedback.feedback, { selected: wrongChoice, correct: false });
  assert.equal(wrongFeedback.answers.length, 0);
  assert.deepEqual(wrongFeedback.wrongEntryIds, [question.entryId]);

  const retry = resolveQuizFeedback(wrongFeedback);
  assert.equal(retry.phase, "asking");
  assert.equal(retry.currentIndex, 0);

  const correctFeedback = answerQuizQuestion(retry, question.correctAnswer);
  assert.equal(correctFeedback.feedback?.correct, true);
  const afterFirst = resolveQuizFeedback(correctFeedback);
  assert.equal(afterFirst.phase, "asking");
  assert.equal(afterFirst.currentIndex, 1);
  assert.equal(afterFirst.answers.length, 1);
});

test("퀴즈 결과는 25자 세트의 정답 수와 한 번이라도 틀린 글자를 보존한다", () => {
  let session = createQuizSession(makeEntries(), { count: 4, rng: seededRng(31) });
  const wrongEntryIds: string[] = [];

  while (session.phase !== "complete") {
    const question = session.questions[session.currentIndex];
    if (session.currentIndex % 2 === 1 && !session.wrongEntryIds.includes(question.entryId)) {
      const wrong = question.choices.find((choice) => choice !== question.correctAnswer);
      assert.ok(wrong);
      session = resolveQuizFeedback(answerQuizQuestion(session, wrong));
      wrongEntryIds.push(question.entryId);
    }
    session = resolveQuizFeedback(answerQuizQuestion(session, question.correctAnswer));
  }

  const summary = summarizeQuiz(session);
  assert.equal(summary.total, 4);
  assert.equal(summary.score, 4);
  assert.equal(summary.percentage, 100);
  assert.deepEqual(summary.wrongEntries.map((entry) => entry.id), wrongEntryIds);

  const restarted = restartQuizSession(session);
  assert.deepEqual(restarted.questions, session.questions);
  assert.equal(restarted.answers.length, 0);
  assert.equal(restarted.wrongEntryIds.length, 0);
  assert.equal(restarted.currentIndex, 0);
  assert.equal(restarted.phase, "asking");
});
