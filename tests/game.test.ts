import assert from "node:assert/strict";
import test from "node:test";

import { createMatchingCards, createQuizQuestions, filterByGrade, shuffle } from "../lib/game.ts";
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

test("급수 필터는 전체와 개별 급수를 지원한다", () => {
  const entries = makeEntries(9);

  assert.equal(filterByGrade(entries, "전체").length, 9);
  assert.deepEqual(
    filterByGrade(entries, "준6급").map((entry) => entry.grade),
    ["준6급", "준6급", "준6급"],
  );
});

test("Fisher-Yates 셔플은 RNG를 주입할 수 있고 입력을 변경하지 않는다", () => {
  const original = [1, 2, 3, 4, 5];
  const shuffledOnce = shuffle(original, seededRng(42));
  const shuffledTwice = shuffle(original, seededRng(42));

  assert.deepEqual(original, [1, 2, 3, 4, 5]);
  assert.deepEqual(shuffledOnce, shuffledTwice);
  assert.notDeepEqual(shuffledOnce, original);
  assert.deepEqual([...shuffledOnce].sort(), original);
});

test("매칭 라운드는 기본 여섯 쌍을 서로 구별되는 카드 열두 장으로 만든다", () => {
  const cards = createMatchingCards(makeEntries(), { rng: seededRng(7) });

  assert.equal(cards.length, 12);
  assert.equal(new Set(cards.map((card) => card.id)).size, 12);

  const pairIds = [...new Set(cards.map((card) => card.pairId))];
  assert.equal(pairIds.length, 6);
  for (const pairId of pairIds) {
    const pair = cards.filter((card) => card.pairId === pairId);
    assert.equal(pair.length, 2);
    assert.deepEqual(
      new Set(pair.map((card) => card.kind)),
      new Set(["hanja", "eumhun"]),
    );
  }
});

test("매칭과 퀴즈 생성에는 선택한 급수만 반영된다", () => {
  const entries = makeEntries(15);
  const cards = createMatchingCards(entries, {
    grade: "6급",
    pairCount: 4,
    rng: seededRng(10),
  });
  const gradeById = new Map(entries.map((entry) => [entry.id, entry.grade]));

  assert.ok(cards.every((card) => gradeById.get(card.entryId) === "6급"));

  const questions = createQuizQuestions(entries, {
    grade: "7급",
    rng: seededRng(11),
  });
  assert.ok(questions.every((question) => question.entry.grade === "7급"));
});

test("퀴즈는 최대 열 문제이며 보기 네 개 중 정답이 정확히 하나다", () => {
  const questions = createQuizQuestions(makeEntries(15), {
    count: 99,
    rng: seededRng(99),
  });

  assert.equal(questions.length, 10);
  assert.equal(new Set(questions.map((question) => question.entryId)).size, 10);

  for (const question of questions) {
    assert.equal(question.choices.length, 4);
    assert.equal(new Set(question.choices).size, 4);
    assert.equal(
      question.choices.filter((choice) => choice === question.correctAnswer).length,
      1,
    );
    assert.equal(question.choices[question.correctIndex], question.correctAnswer);
  }

  assert.ok(new Set(questions.map((question) => question.correctIndex)).size > 1);
});

test("음훈이 같은 항목이 있어도 중복·복수 정답 보기를 만들지 않는다", () => {
  const entries = makeEntries(8);
  entries[1] = { ...entries[1], eumhun: entries[0].eumhun };

  const questions = createQuizQuestions(entries, {
    count: 8,
    rng: seededRng(123),
  });

  for (const question of questions) {
    assert.equal(new Set(question.choices).size, 4);
    assert.equal(
      question.choices.filter((choice) => choice === question.correctAnswer).length,
      1,
    );
  }
});

test("복수 훈음 중 하나라도 정답과 겹치는 후보는 오답에서 제외한다", () => {
  const entries = makeEntries(8);
  entries[0] = {
    ...entries[0],
    eum: ["동", "통"],
    hun: ["마을", "골목"],
    eumhun: "마을 동",
  };
  entries[1] = {
    ...entries[1],
    eum: ["통"],
    hun: ["골목"],
    eumhun: "골목 통",
  };

  const questions = createQuizQuestions(entries, {
    count: 8,
    rng: seededRng(321),
  });
  const multipleReadingQuestion = questions.find(
    (question) => question.entryId === entries[0].id,
  );

  assert.ok(multipleReadingQuestion);
  assert.equal(multipleReadingQuestion.choices.includes("골목 통"), false);
});

test("서로 다른 음훈이 네 개보다 적으면 4지선다 생성을 거부한다", () => {
  assert.throws(
    () => createQuizQuestions(makeEntries(3), { rng: seededRng() }),
    /최소 4개/,
  );
});
