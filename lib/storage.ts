import type {
  ProgressRecord,
  ProgressState,
  StudyMode,
  StudySetId,
} from "./types.ts";
import { DEFAULT_STUDY_SET, STUDY_SETS } from "./types.ts";

export const PROGRESS_STORAGE_KEY = "hanja-learning:progress:v1";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function createDefaultProgress(): ProgressState {
  return {
    version: 1,
    selectedStudySet: DEFAULT_STUDY_SET,
    matching: {
      completedGames: 0,
      matchedPairs: 0,
    },
    quiz: {
      completedGames: 0,
      correctAnswers: 0,
      totalQuestions: 0,
    },
    recentRecords: [],
  };
}

/**
 * JSON 문자열 또는 알 수 없는 값을 version=1 진행 상태로 안전하게 정규화합니다.
 * JSON이 깨졌거나 다른 버전이면 항상 새 기본 상태를 반환합니다.
 */
export function parseProgress(input: unknown): ProgressState {
  let candidate: unknown = input;

  if (typeof input === "string") {
    try {
      candidate = JSON.parse(input) as unknown;
    } catch {
      return createDefaultProgress();
    }
  }

  if (!isObject(candidate) || candidate.version !== 1) {
    return createDefaultProgress();
  }

  const defaults = createDefaultProgress();
  const matching = isObject(candidate.matching) ? candidate.matching : {};
  const quiz = isObject(candidate.quiz) ? candidate.quiz : {};
  const totalQuestions = readNonNegativeInteger(
    quiz.totalQuestions,
    defaults.quiz.totalQuestions,
  );
  const parsedCorrectAnswers = readNonNegativeInteger(
    quiz.correctAnswers,
    defaults.quiz.correctAnswers,
  );

  return {
    version: 1,
    selectedStudySet:
      studySetFromValue(candidate.selectedStudySet) ??
      legacyGradeToStudySet(candidate.selectedGrade) ??
      defaults.selectedStudySet,
    matching: {
      completedGames: readNonNegativeInteger(
        matching.completedGames,
        defaults.matching.completedGames,
      ),
      matchedPairs: readNonNegativeInteger(
        matching.matchedPairs,
        defaults.matching.matchedPairs,
      ),
    },
    quiz: {
      completedGames: readNonNegativeInteger(
        quiz.completedGames,
        defaults.quiz.completedGames,
      ),
      correctAnswers: Math.min(parsedCorrectAnswers, totalQuestions),
      totalQuestions,
    },
    recentRecords: Array.isArray(candidate.recentRecords)
      ? candidate.recentRecords
          .map(parseRecord)
          .filter((record): record is ProgressRecord => record !== null)
          .slice(0, 10)
      : [],
  };
}

export function loadProgress(storage?: StorageLike | null): ProgressState {
  const target = resolveStorage(storage);
  if (!target) {
    return createDefaultProgress();
  }

  try {
    return parseProgress(target.getItem(PROGRESS_STORAGE_KEY));
  } catch {
    return createDefaultProgress();
  }
}

/** 저장 실패 여부와 관계없이 정규화된 상태를 반환합니다. */
export function saveProgress(
  progress: ProgressState,
  storage?: StorageLike | null,
): ProgressState {
  const normalized = parseProgress(progress);
  const target = resolveStorage(storage);

  if (target) {
    try {
      target.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(normalized));
    } catch {
      // 저장 공간 차단·용량 초과 상황에서도 학습 화면은 계속 동작해야 합니다.
    }
  }

  return normalized;
}

export function setSelectedStudySet(
  progress: ProgressState,
  selectedStudySet: StudySetId,
): ProgressState {
  const normalized = parseProgress(progress);
  return { ...normalized, selectedStudySet };
}

/**
 * 완료 기록을 최신순으로 추가하고 모드별 누계를 함께 갱신합니다.
 * 입력 상태와 기록은 변경하지 않습니다.
 */
export function addRecentRecord(
  progress: ProgressState,
  record: ProgressRecord,
): ProgressState {
  const normalized = parseProgress(progress);
  const validRecord = parseRecord(record);
  if (!validRecord) {
    throw new TypeError("유효하지 않은 학습 완료 기록입니다.");
  }

  const recentRecords = [validRecord, ...normalized.recentRecords].slice(0, 10);

  if (validRecord.mode === "matching") {
    return {
      ...normalized,
      matching: {
        completedGames: normalized.matching.completedGames + 1,
        matchedPairs: normalized.matching.matchedPairs + validRecord.correct,
      },
      recentRecords,
    };
  }

  return {
    ...normalized,
    quiz: {
      completedGames: normalized.quiz.completedGames + 1,
      correctAnswers: normalized.quiz.correctAnswers + validRecord.correct,
      totalQuestions: normalized.quiz.totalQuestions + validRecord.total,
    },
    recentRecords,
  };
}

function parseRecord(value: unknown): ProgressRecord | null {
  if (
    !isObject(value) ||
    typeof value.id !== "string" ||
    value.id.trim() === "" ||
    !isStudyMode(value.mode) ||
    !(studySetFromValue(value.studySet) ?? legacyGradeToStudySet(value.grade)) ||
    typeof value.completedAt !== "string" ||
    !Number.isFinite(Date.parse(value.completedAt)) ||
    !isNonNegativeInteger(value.correct) ||
    !isNonNegativeInteger(value.total) ||
    value.correct > value.total
  ) {
    return null;
  }

  return {
    id: value.id,
    mode: value.mode,
    studySet:
      studySetFromValue(value.studySet) ??
      legacyGradeToStudySet(value.grade) ??
      DEFAULT_STUDY_SET,
    completedAt: value.completedAt,
    correct: value.correct,
    total: value.total,
  };
}

function resolveStorage(storage?: StorageLike | null): StorageLike | null {
  if (storage !== undefined) {
    return storage;
  }

  try {
    return typeof globalThis.localStorage === "undefined"
      ? null
      : globalThis.localStorage;
  } catch {
    return null;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function studySetFromValue(value: unknown): StudySetId | null {
  return typeof value === "string" && STUDY_SETS.some((item) => item.id === value)
    ? (value as StudySetId)
    : null;
}

function legacyGradeToStudySet(value: unknown): StudySetId | null {
  if (value === "7급") return "7급-1";
  if (value === "준6급") return "준6급-1";
  if (value === "6급") return "6급-1";
  return null;
}

function isStudyMode(value: unknown): value is StudyMode {
  return value === "matching" || value === "quiz";
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function readNonNegativeInteger(value: unknown, fallback: number): number {
  return isNonNegativeInteger(value) ? value : fallback;
}
