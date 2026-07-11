import assert from "node:assert/strict";
import test from "node:test";

import {
  advanceQuiz,
  answerQuizQuestion,
  createMatchSession,
  createQuizSession,
  isCheckingPairMatched,
  restartMatchSession,
  restartQuizSession,
  resolveMatchCheck,
  selectMatchCard,
  summarizeQuiz,
} from "../lib/session.ts";
import type { MatchSession } from "../lib/session.ts";
import type { HanjaEntry, HanjaGrade } from "../lib/types";

function makeEntries(count = 15): HanjaEntry[] {
  const grades: HanjaGrade[] = ["7급", "준6급", "6급"];
  return Array.from({ length: count }, (_, index) => ({
    id: `hanja-${index + 1}`,
    hanja: String.fromCodePoint(0x4e00 + index),
    eum: [`음${index + 1}`],
    hun: [`뜻${index + 1}`],
    eumhun: `뜻${index + 1} 음${index + 1}`,
    grade: grades[index % grades.length],
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

/** 카드 배열에서 서로 짝인 두 카드와 짝이 아닌 카드 하나를 찾습니다. */
function findPairAndOutsider(session: MatchSession) {
  const [first] = session.cards;
  const partner = session.cards.find(
    (card) => card.pairId === first.pairId && card.id !== first.id,
  );
  const outsider = session.cards.find((card) => card.pairId !== first.pairId);
  assert.ok(partner);
  assert.ok(outsider);
  return { first, partner, outsider };
}

test("짝맞추기 세션은 여섯 쌍 열두 장과 초기 상태로 시작한다", () => {
  const session = createMatchSession(makeEntries(), { rng: seededRng(7) });

  assert.equal(session.cards.length, 12);
  assert.equal(new Set(session.cards.map((card) => card.pairId)).size, 6);
  assert.deepEqual(session.faceUpIds, []);
  assert.deepEqual(session.matchedPairIds, []);
  assert.equal(session.attempts, 0);
  assert.equal(session.phase, "playing");
});

test("첫 카드는 공개만 하고, 같은 카드 재선택은 무시한다", () => {
  const session = createMatchSession(makeEntries(), { rng: seededRng(7) });
  const [first] = session.cards;

  const opened = selectMatchCard(session, first.id);
  assert.deepEqual(opened.faceUpIds, [first.id]);
  assert.equal(opened.attempts, 0);
  assert.equal(opened.phase, "playing");

  assert.equal(selectMatchCard(opened, first.id), opened);
});

test("두 번째 카드 공개는 시도를 1 올리고 checking으로 잠근다", () => {
  const session = createMatchSession(makeEntries(), { rng: seededRng(7) });
  const { first, outsider } = findPairAndOutsider(session);

  const checking = selectMatchCard(
    selectMatchCard(session, first.id),
    outsider.id,
  );

  assert.deepEqual(checking.faceUpIds, [first.id, outsider.id]);
  assert.equal(checking.attempts, 1);
  assert.equal(checking.phase, "checking");

  // 비교 중 세 번째 카드 선택은 무시된다.
  const third = session.cards.find(
    (card) => card.id !== first.id && card.id !== outsider.id,
  );
  assert.ok(third);
  assert.equal(selectMatchCard(checking, third.id), checking);
});

test("짝이 맞으면 matched에 추가하고 다시 playing으로 돌아간다", () => {
  const session = createMatchSession(makeEntries(), { rng: seededRng(7) });
  const { first, partner } = findPairAndOutsider(session);

  const checking = selectMatchCard(
    selectMatchCard(session, first.id),
    partner.id,
  );
  assert.equal(isCheckingPairMatched(checking), true);

  const resolved = resolveMatchCheck(checking);
  assert.deepEqual(resolved.matchedPairIds, [first.pairId]);
  assert.deepEqual(resolved.faceUpIds, []);
  assert.equal(resolved.phase, "playing");

  // 이미 맞춘 카드는 다시 선택할 수 없다.
  assert.equal(selectMatchCard(resolved, first.id), resolved);
  assert.equal(selectMatchCard(resolved, partner.id), resolved);
});

test("짝이 아니면 두 카드를 다시 가리고 matched는 그대로다", () => {
  const session = createMatchSession(makeEntries(), { rng: seededRng(7) });
  const { first, outsider } = findPairAndOutsider(session);

  const checking = selectMatchCard(
    selectMatchCard(session, first.id),
    outsider.id,
  );
  assert.equal(isCheckingPairMatched(checking), false);

  const resolved = resolveMatchCheck(checking);
  assert.deepEqual(resolved.faceUpIds, []);
  assert.deepEqual(resolved.matchedPairIds, []);
  assert.equal(resolved.attempts, 1);
  assert.equal(resolved.phase, "playing");
});

test("playing 상태의 resolveMatchCheck는 아무것도 바꾸지 않는다", () => {
  const session = createMatchSession(makeEntries(), { rng: seededRng(7) });
  assert.equal(resolveMatchCheck(session), session);
});

test("여섯 쌍을 모두 맞추면 complete로 전환한다", () => {
  let session = createMatchSession(makeEntries(), { rng: seededRng(7) });
  const pairIds = [...new Set(session.cards.map((card) => card.pairId))];

  for (const pairId of pairIds) {
    const pair = session.cards.filter((card) => card.pairId === pairId);
    session = resolveMatchCheck(
      selectMatchCard(selectMatchCard(session, pair[0].id), pair[1].id),
    );
  }

  assert.equal(session.phase, "complete");
  assert.equal(session.matchedPairIds.length, 6);
  assert.equal(session.attempts, 6);

  // 완료 뒤에는 어떤 카드 선택도 무시된다.
  assert.equal(selectMatchCard(session, session.cards[0].id), session);
});

test("같은 카드 다시 하기는 카드 구성을 유지하고 진행만 초기화한다", () => {
  let session = createMatchSession(makeEntries(), { rng: seededRng(7) });
  const { first, partner } = findPairAndOutsider(session);
  session = resolveMatchCheck(
    selectMatchCard(selectMatchCard(session, first.id), partner.id),
  );

  const restarted = restartMatchSession(session);
  assert.deepEqual(restarted.cards, session.cards);
  assert.deepEqual(restarted.faceUpIds, []);
  assert.deepEqual(restarted.matchedPairIds, []);
  assert.equal(restarted.attempts, 0);
  assert.equal(restarted.phase, "playing");
});

test("퀴즈 응답은 asking에서 한 번만 기록된다", () => {
  const session = createQuizSession(makeEntries(), {
    count: 3,
    rng: seededRng(11),
  });
  const question = session.questions[0];

  const answered = answerQuizQuestion(session, question.correctAnswer);
  assert.equal(answered.phase, "answered");
  assert.equal(answered.answers.length, 1);
  assert.deepEqual(answered.answers[0], {
    questionId: question.id,
    selected: question.correctAnswer,
    correct: true,
  });

  // 재응답과 보기에 없는 값은 모두 무시된다.
  assert.equal(answerQuizQuestion(answered, question.choices[1]), answered);
  assert.equal(answerQuizQuestion(session, "보기에 없는 답"), session);
});

test("advanceQuiz는 answered에서만 다음 문제 또는 완료로 이동한다", () => {
  const session = createQuizSession(makeEntries(), {
    count: 2,
    rng: seededRng(21),
  });

  // asking에서는 이동할 수 없다.
  assert.equal(advanceQuiz(session), session);

  const afterFirst = advanceQuiz(
    answerQuizQuestion(session, session.questions[0].correctAnswer),
  );
  assert.equal(afterFirst.currentIndex, 1);
  assert.equal(afterFirst.phase, "asking");

  const wrongChoice = afterFirst.questions[1].choices.find(
    (choice) => choice !== afterFirst.questions[1].correctAnswer,
  );
  assert.ok(wrongChoice);
  const complete = advanceQuiz(answerQuizQuestion(afterFirst, wrongChoice));
  assert.equal(complete.phase, "complete");
  assert.equal(complete.currentIndex, 1);
});

test("점수·정답률·오답 목록은 답안 배열에서 파생된다", () => {
  const session = createQuizSession(makeEntries(), {
    count: 4,
    rng: seededRng(31),
  });

  let current = session;
  const wrongQuestionIds: string[] = [];
  session.questions.forEach((question, index) => {
    const shouldMiss = index % 2 === 1;
    const choice = shouldMiss
      ? question.choices.find((item) => item !== question.correctAnswer)
      : question.correctAnswer;
    assert.ok(choice);
    if (shouldMiss) {
      wrongQuestionIds.push(question.entryId);
    }
    current = advanceQuiz(answerQuizQuestion(current, choice));
  });

  assert.equal(current.phase, "complete");
  const summary = summarizeQuiz(current);
  assert.equal(summary.total, 4);
  assert.equal(summary.score, 2);
  assert.equal(summary.percentage, 50);
  assert.deepEqual(
    summary.wrongEntries.map((entry) => entry.id),
    wrongQuestionIds,
  );
});

test("같은 문제 다시 풀기는 문제와 보기 구성을 보존하고 답안만 비운다", () => {
  const session = createQuizSession(makeEntries(), {
    count: 3,
    rng: seededRng(41),
  });
  const finished = advanceQuiz(
    answerQuizQuestion(session, session.questions[0].correctAnswer),
  );

  const restarted = restartQuizSession(finished);
  assert.deepEqual(restarted.questions, session.questions);
  assert.deepEqual(restarted.answers, []);
  assert.equal(restarted.currentIndex, 0);
  assert.equal(restarted.phase, "asking");
});
