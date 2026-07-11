import assert from "node:assert/strict";
import test from "node:test";

import {
  createMatchingCards,
  createQuizQuestions,
  filterByStudySet,
  shuffle,
} from "../lib/game.ts";
import type { HanjaEntry, HanjaGrade } from "../lib/types";

function makeEntries(): HanjaEntry[] {
  const counts: Array<[HanjaGrade, number]> = [
    ["7급", 50],
    ["준6급", 75],
    ["6급", 75],
  ];
  let index = 0;
  return counts.flatMap(([grade, count]) =>
    Array.from({ length: count }, () => {
      index += 1;
      return {
        id: `hanja-${index}`,
        hanja: String.fromCodePoint(0x4e00 + index),
        eum: [`음${index}`],
        hun: [`뜻${index}`],
        eumhun: `뜻${index} 음${index}`,
        grade,
        source: "https://example.com/source",
        sourceLabel: `원문${index}`,
      };
    }),
  );
}

function seededRng(seed = 123456789): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

test("세트 필터는 급수 안의 25자 인덱스 범위를 정확히 반환한다", () => {
  const entries = makeEntries();

  assert.deepEqual(
    filterByStudySet(entries, "7급-2").map((entry) => entry.id),
    entries.slice(25, 50).map((entry) => entry.id),
  );
  assert.deepEqual(
    filterByStudySet(entries, "준6급-3").map((entry) => entry.id),
    entries.slice(100, 125).map((entry) => entry.id),
  );
  assert.deepEqual(
    filterByStudySet(entries, "6급-1").map((entry) => entry.id),
    entries.slice(125, 150).map((entry) => entry.id),
  );
  assert.equal(filterByStudySet(entries, "6급-3").length, 25);
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

test("매칭 덱은 선택 세트의 25쌍 50장만 만든다", () => {
  const entries = makeEntries();
  const cards = createMatchingCards(entries, {
    studySet: "준6급-2",
    rng: seededRng(7),
  });
  const entryById = new Map(entries.map((entry) => [entry.id, entry]));

  assert.equal(cards.length, 50);
  assert.equal(new Set(cards.map((card) => card.id)).size, 50);
  assert.equal(new Set(cards.map((card) => card.pairId)).size, 25);
  assert.ok(cards.every((card) => entryById.get(card.entryId)?.grade === "준6급"));

  for (const pairId of new Set(cards.map((card) => card.pairId))) {
    const pair = cards.filter((card) => card.pairId === pairId);
    assert.deepEqual(new Set(pair.map((card) => card.kind)), new Set(["hanja", "eumhun"]));
  }
});

test("퀴즈는 세트의 25문제를 만들고 보기 네 개 중 정답이 정확히 하나다", () => {
  const questions = createQuizQuestions(makeEntries(), {
    studySet: "6급-3",
    count: 25,
    rng: seededRng(99),
  });

  assert.equal(questions.length, 25);
  assert.equal(new Set(questions.map((question) => question.entryId)).size, 25);
  for (const question of questions) {
    assert.equal(question.choices.length, 4);
    assert.equal(new Set(question.choices).size, 4);
    assert.equal(question.choices.filter((choice) => choice === question.correctAnswer).length, 1);
    assert.equal(question.choices[question.correctIndex], question.correctAnswer);
  }
  assert.ok(new Set(questions.map((question) => question.correctIndex)).size > 1);
  questions.slice(1).forEach((question, index) => {
    assert.notEqual(question.correctIndex, questions[index].correctIndex);
  });
});

test("복수 훈음 중 하나라도 정답과 겹치는 후보는 오답에서 제외한다", () => {
  const entries = makeEntries();
  entries[0] = { ...entries[0], eum: ["동", "통"], hun: ["마을", "골목"], eumhun: "마을 동" };
  entries[1] = { ...entries[1], eum: ["통"], hun: ["골목"], eumhun: "골목 통" };

  const questions = createQuizQuestions(entries, { studySet: "7급-1", count: 25, rng: seededRng(321) });
  const multipleReadingQuestion = questions.find((question) => question.entryId === entries[0].id);

  assert.ok(multipleReadingQuestion);
  assert.equal(multipleReadingQuestion.choices.includes("골목 통"), false);
});

test("서로 다른 음훈이 네 개보다 적으면 4지선다 생성을 거부한다", () => {
  const entries = makeEntries().slice(0, 3);
  assert.throws(
    () => createQuizQuestions(entries, { studySet: "7급-1", rng: seededRng() }),
    /최소 4개/,
  );
});
