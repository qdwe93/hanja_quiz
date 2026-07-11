import type {
  GradeFilter,
  HanjaEntry,
  MatchCard,
  QuizQuestion,
  RandomSource,
} from "./types";

export interface MatchingOptions {
  grade?: GradeFilter;
  pairCount?: number;
  rng?: RandomSource;
}

export interface QuizOptions {
  grade?: GradeFilter;
  /** 한 세트에서 최대 10문제까지만 생성합니다. */
  count?: number;
  rng?: RandomSource;
}

const DEFAULT_MATCH_PAIR_COUNT = 6;
const DEFAULT_QUIZ_COUNT = 10;
const MAX_QUIZ_COUNT = 10;

/**
 * 선택한 급수에 해당하는 한자만 반환합니다.
 * `전체`는 원래 배열의 얕은 복사본을 반환해 호출자가 입력을 바꾸지 못하게 합니다.
 */
export function filterByGrade(
  entries: readonly HanjaEntry[],
  grade: GradeFilter = "전체",
): HanjaEntry[] {
  return grade === "전체"
    ? [...entries]
    : entries.filter((entry) => entry.grade === grade);
}

/** 입력 배열을 변경하지 않는 Fisher-Yates 셔플입니다. */
export function shuffle<T>(
  items: readonly T[],
  rng: RandomSource = Math.random,
): T[] {
  const result = [...items];

  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomValue = rng();
    if (!Number.isFinite(randomValue) || randomValue < 0 || randomValue >= 1) {
      throw new RangeError("RNG는 0 이상 1 미만의 유한한 수를 반환해야 합니다.");
    }

    const swapIndex = Math.floor(randomValue * (index + 1));
    [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
  }

  return result;
}

/** 선택 범위에서 기본 여섯 쌍(열두 장)의 매칭 카드를 만듭니다. */
export function createMatchingCards(
  entries: readonly HanjaEntry[],
  options: MatchingOptions = {},
): MatchCard[] {
  const {
    grade = "전체",
    pairCount = DEFAULT_MATCH_PAIR_COUNT,
    rng = Math.random,
  } = options;

  assertPositiveInteger(pairCount, "pairCount");

  const availableEntries = uniqueEntries(filterByGrade(entries, grade));
  const selectedEntries = shuffle(availableEntries, rng).slice(0, pairCount);
  const cards = selectedEntries.flatMap<MatchCard>((entry) => [
    {
      id: `${entry.id}:hanja`,
      pairId: entry.id,
      entryId: entry.id,
      kind: "hanja",
      content: entry.hanja,
    },
    {
      id: `${entry.id}:eumhun`,
      pairId: entry.id,
      entryId: entry.id,
      kind: "eumhun",
      content: entry.eumhun,
    },
  ]);

  return shuffle(cards, rng);
}

/**
 * 중복 문제와 중복 보기가 없는 4지선다 세트를 만듭니다.
 * 요청 개수가 10보다 커도 한 세트에는 최대 10문제만 반환합니다.
 */
export function createQuizQuestions(
  entries: readonly HanjaEntry[],
  options: QuizOptions = {},
): QuizQuestion[] {
  const {
    grade = "전체",
    count = DEFAULT_QUIZ_COUNT,
    rng = Math.random,
  } = options;

  assertPositiveInteger(count, "count");

  const availableEntries = uniqueEntries(filterByGrade(entries, grade));
  if (availableEntries.length === 0) {
    return [];
  }

  const answerPool = [...new Set(availableEntries.map((entry) => entry.eumhun))];
  if (answerPool.length < 4) {
    throw new RangeError(
      "4지선다 문제를 만들려면 서로 다른 음훈이 최소 4개 필요합니다.",
    );
  }

  const eligibleEntries = availableEntries.filter(
    (entry) => findDistractorEntries(entry, availableEntries).length >= 3,
  );
  if (eligibleEntries.length === 0) {
    throw new RangeError(
      "모호하지 않은 오답 보기 세 개를 만들 수 있는 한자가 없습니다.",
    );
  }

  const questionCount = Math.min(count, MAX_QUIZ_COUNT, eligibleEntries.length);
  const selectedEntries = shuffle(eligibleEntries, rng).slice(0, questionCount);

  return selectedEntries.map((entry) => {
    const distractors = shuffle(
      findDistractorEntries(entry, availableEntries),
      rng,
    )
      .slice(0, 3)
      .map((candidate) => candidate.eumhun);
    const choices = shuffle([entry.eumhun, ...distractors], rng);

    return {
      id: `question:${entry.id}`,
      entryId: entry.id,
      hanja: entry.hanja,
      choices,
      correctAnswer: entry.eumhun,
      correctIndex: choices.indexOf(entry.eumhun),
      entry,
    };
  });
}

function uniqueEntries(entries: readonly HanjaEntry[]): HanjaEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (seen.has(entry.id)) {
      return false;
    }
    seen.add(entry.id);
    return true;
  });
}

/** 복수 훈·음 중 하나라도 정답과 겹치는 후보는 모호한 오답이므로 제외합니다. */
function findDistractorEntries(
  answer: HanjaEntry,
  entries: readonly HanjaEntry[],
): HanjaEntry[] {
  const answerReadings = readingLabels(answer);
  const seenLabels = new Set<string>();

  return entries.filter((candidate) => {
    if (candidate.id === answer.id || seenLabels.has(candidate.eumhun)) {
      return false;
    }

    const hasAmbiguousReading = [...readingLabels(candidate)].some((reading) =>
      answerReadings.has(reading),
    );
    if (hasAmbiguousReading) {
      return false;
    }

    seenLabels.add(candidate.eumhun);
    return true;
  });
}

function readingLabels(entry: HanjaEntry): Set<string> {
  const labels = new Set<string>([normalizeLabel(entry.eumhun)]);
  const pairCount = Math.max(entry.eum.length, entry.hun.length);

  for (let index = 0; index < pairCount; index += 1) {
    const eum = entry.eum[index] ?? entry.eum[0] ?? "";
    const hun = entry.hun[index] ?? entry.hun[0] ?? "";
    const label = normalizeLabel(`${hun} ${eum}`);
    if (label !== "") {
      labels.add(label);
    }
  }

  return labels;
}

function normalizeLabel(label: string): string {
  return label.trim().replace(/\s+/g, " ");
}

function assertPositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name}는 1 이상의 정수여야 합니다.`);
  }
}
