import type {
  HanjaEntry,
  MatchCard,
  QuizQuestion,
  RandomSource,
  StudySet,
  StudySetId,
} from "./types.ts";
import { DEFAULT_STUDY_SET, STUDY_SETS } from "./types.ts";

export const MATCH_VISIBLE_CARD_COUNT = 12;
export const QUIZ_QUESTION_COUNT = 25;

export interface MatchingOptions {
  studySet?: StudySetId;
  rng?: RandomSource;
}

export interface QuizOptions {
  studySet?: StudySetId;
  count?: number;
  rng?: RandomSource;
}

/** 25자 세트 정의를 반환합니다. */
export function getStudySet(studySet: StudySetId): StudySet {
  const definition = STUDY_SETS.find((item) => item.id === studySet);
  if (!definition) {
    throw new RangeError(`알 수 없는 학습 세트입니다: ${studySet}`);
  }
  return definition;
}

/**
 * 원본 데이터 순서를 유지한 채 선택 세트의 25자만 반환합니다.
 * 인덱스는 각 급수 안에서 계산하므로 급수 경계를 넘지 않습니다.
 */
export function filterByStudySet(
  entries: readonly HanjaEntry[],
  studySet: StudySetId = DEFAULT_STUDY_SET,
): HanjaEntry[] {
  const definition = getStudySet(studySet);
  return entries
    .filter((entry) => entry.grade === definition.grade)
    .slice(definition.startIndex, definition.endIndex);
}

/** 이전 호출부의 이름을 유지한 세트 필터 별칭입니다. */
export const filterByGrade = filterByStudySet;

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

/** 선택 세트의 모든 한자와 음훈으로 50장의 매칭 카드 덱을 만듭니다. */
export function createMatchingCards(
  entries: readonly HanjaEntry[],
  options: MatchingOptions = {},
): MatchCard[] {
  const { studySet = DEFAULT_STUDY_SET, rng = Math.random } = options;
  const selectedEntries = uniqueEntries(filterByStudySet(entries, studySet));

  return shuffle(
    selectedEntries.flatMap<MatchCard>((entry) => [
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
    ]),
    rng,
  );
}

/**
 * 중복 문제와 중복 보기가 없는 4지선다 세트를 만듭니다.
 * 기본값은 현재 학습 세트의 25문제 전체입니다.
 */
export function createQuizQuestions(
  entries: readonly HanjaEntry[],
  options: QuizOptions = {},
): QuizQuestion[] {
  const {
    studySet = DEFAULT_STUDY_SET,
    count = QUIZ_QUESTION_COUNT,
    rng = Math.random,
  } = options;

  assertPositiveInteger(count, "count");

  const availableEntries = uniqueEntries(filterByStudySet(entries, studySet));
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

  const questionCount = Math.min(count, eligibleEntries.length);
  const selectedEntries = shuffle(eligibleEntries, rng).slice(0, questionCount);

  const questions = selectedEntries.map((entry) => {
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

  return preventRepeatedCorrectIndexes(questions, rng);
}

/** 바로 앞 문제와 같은 번호에 정답이 오지 않도록 보기 순서만 바꿉니다. */
function preventRepeatedCorrectIndexes(
  questions: readonly QuizQuestion[],
  rng: RandomSource,
): QuizQuestion[] {
  return questions.reduce<QuizQuestion[]>((result, question) => {
    const previous = result.at(-1);
    if (!previous || previous.correctIndex !== question.correctIndex) {
      return [...result, question];
    }

    const nextCorrectIndex = shuffle(
      [0, 1, 2, 3].filter((index) => index !== previous.correctIndex),
      rng,
    )[0];
    const choices = [...question.choices];
    [choices[question.correctIndex], choices[nextCorrectIndex]] = [
      choices[nextCorrectIndex],
      choices[question.correctIndex],
    ];

    return [
      ...result,
      {
        ...question,
        choices,
        correctIndex: nextCorrectIndex,
      },
    ];
  }, []);
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
