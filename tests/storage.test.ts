import assert from "node:assert/strict";
import test from "node:test";

import { PROGRESS_STORAGE_KEY, addRecentRecord, createDefaultProgress, loadProgress, parseProgress, saveProgress, setSelectedGrade } from "../lib/storage.ts";
import type { StorageLike } from "../lib/storage";
import type { ProgressRecord } from "../lib/types";

class MemoryStorage {
  values = new Map<string, string>();

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value);
  }
}

function makeRecord(index: number, mode: "matching" | "quiz" = "quiz"): ProgressRecord {
  return {
    id: `record-${index}`,
    mode,
    grade: "7급",
    completedAt: new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString(),
    correct: mode === "matching" ? 6 : 7,
    total: mode === "matching" ? 6 : 10,
  };
}

test("깨진 JSON, 빈 값, 다른 버전은 안전한 version=1 기본 상태가 된다", () => {
  assert.deepEqual(parseProgress("{not-json"), createDefaultProgress());
  assert.deepEqual(parseProgress(null), createDefaultProgress());
  assert.deepEqual(parseProgress('{"version":2}'), createDefaultProgress());
});

test("부분적으로 손상된 필드는 기본값으로 복구하고 유효한 기록만 열 개 남긴다", () => {
  const records = Array.from({ length: 12 }, (_, index) => makeRecord(index));
  const parsed = parseProgress({
    version: 1,
    selectedGrade: "없는 급수",
    matching: { completedGames: -1, matchedPairs: 12 },
    quiz: { completedGames: 3, correctAnswers: 999, totalQuestions: 30 },
    recentRecords: [
      ...records,
      { ...makeRecord(99), correct: 11, total: 10 },
      "손상된 기록",
    ],
  });

  assert.equal(parsed.selectedGrade, "전체");
  assert.deepEqual(parsed.matching, { completedGames: 0, matchedPairs: 12 });
  assert.deepEqual(parsed.quiz, {
    completedGames: 3,
    correctAnswers: 30,
    totalQuestions: 30,
  });
  assert.equal(parsed.recentRecords.length, 10);
  assert.deepEqual(
    parsed.recentRecords.map((record) => record.id),
    records.slice(0, 10).map((record) => record.id),
  );
});

test("최근 기록 추가는 원본을 바꾸지 않고 최신순 10개와 누계를 반환한다", () => {
  let progress = createDefaultProgress();
  const initial = progress;

  for (let index = 0; index < 11; index += 1) {
    progress = addRecentRecord(progress, makeRecord(index, "quiz"));
  }
  progress = addRecentRecord(progress, makeRecord(50, "matching"));

  assert.deepEqual(initial, createDefaultProgress());
  assert.equal(progress.recentRecords.length, 10);
  assert.equal(progress.recentRecords[0].id, "record-50");
  assert.equal(progress.quiz.completedGames, 11);
  assert.equal(progress.quiz.correctAnswers, 77);
  assert.equal(progress.quiz.totalQuestions, 110);
  assert.deepEqual(progress.matching, { completedGames: 1, matchedPairs: 6 });
});

test("선택 급수와 진행 상태를 지정된 키로 저장하고 다시 불러온다", () => {
  const storage = new MemoryStorage();
  const progress = addRecentRecord(
    setSelectedGrade(createDefaultProgress(), "준6급"),
    makeRecord(1),
  );

  const saved = saveProgress(progress, storage);
  assert.equal(storage.values.has(PROGRESS_STORAGE_KEY), true);
  assert.deepEqual(loadProgress(storage), saved);
});

test("localStorage 접근이 예외를 내도 로딩과 저장은 학습 흐름을 중단하지 않는다", () => {
  const throwingStorage: StorageLike = {
    getItem() {
      throw new Error("차단됨");
    },
    setItem() {
      throw new Error("용량 초과");
    },
  };

  assert.deepEqual(loadProgress(throwingStorage), createDefaultProgress());
  assert.doesNotThrow(() => saveProgress(createDefaultProgress(), throwingStorage));
});
