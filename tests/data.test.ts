import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createQuizQuestions } from "../lib/game.ts";
import type { GradeFilter, HanjaEntry } from "../lib/types.ts";

const entries = JSON.parse(
  readFileSync(new URL("../data/hanja.json", import.meta.url), "utf8"),
) as HanjaEntry[];

const expectedCounts = new Map([
  ["7급", 50],
  ["준6급", 75],
  ["6급", 75],
]);

test("배정한자 데이터는 원문 기준 200자와 등급별 수량을 만족한다", () => {
  assert.equal(entries.length, 200);
  for (const [grade, count] of expectedCounts) {
    assert.equal(
      entries.filter((entry) => entry.grade === grade).length,
      count,
    );
  }
});

test("ID·한자·대표 음훈은 고유하고 필수 값은 정상이다", () => {
  assert.equal(new Set(entries.map((entry) => entry.id)).size, entries.length);
  assert.equal(
    new Set(entries.map((entry) => entry.hanja)).size,
    entries.length,
  );
  assert.equal(
    new Set(entries.map((entry) => entry.eumhun)).size,
    entries.length,
  );

  for (const entry of entries) {
    assert.match(entry.id, /^(g7|g6p|g6)-\d{3}$/);
    assert.equal([...entry.hanja].length, 1);
    assert.ok(entry.eumhun.trim().length > 0);
    assert.ok(entry.source.startsWith("https://"));
    assert.ok(entry.sourceLabel.trim().length > 0);
    assert.ok(entry.eum.length > 0);
    assert.equal(entry.eum.length, entry.hun.length);
    assert.doesNotMatch(
      `${entry.hanja}${entry.eumhun}${entry.sourceLabel}`,
      /\uFFFD|Ã|Â|â€|ï¿½/,
    );
  }
});

test("모든 선택 범위에서 모호하지 않은 4지선다 열 문제를 생성한다", () => {
  const grades: GradeFilter[] = ["전체", "7급", "준6급", "6급"];

  for (const grade of grades) {
    const questions = createQuizQuestions(entries, {
      grade,
      count: 10,
      rng: seededRng(20260711),
    });
    assert.equal(questions.length, 10);
    assert.equal(
      new Set(questions.map((question) => question.entryId)).size,
      10,
    );
    for (const question of questions) {
      assert.equal(question.choices.length, 4);
      assert.equal(new Set(question.choices).size, 4);
      assert.equal(
        question.choices.filter(
          (choice) => choice === question.correctAnswer,
        ).length,
        1,
      );
    }
  }
});

function seededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}
