/** 학습 데이터에서 사용할 수 있는 급수입니다. */
export type HanjaGrade = "7급" | "준6급" | "6급";

export const HANJA_GRADES = ["7급", "준6급", "6급"] as const;

/** 25자 단위로 나눈 학습 세트의 식별자입니다. */
export type StudySetId =
  | "7급-1"
  | "7급-2"
  | "준6급-1"
  | "준6급-2"
  | "준6급-3"
  | "6급-1"
  | "6급-2"
  | "6급-3";

export interface StudySet {
  id: StudySetId;
  grade: HanjaGrade;
  setNumber: number;
  /** 해당 급수 안에서의 0부터 시작하는 인덱스입니다. */
  startIndex: number;
  /** 끝 인덱스는 포함하지 않습니다. */
  endIndex: number;
  label: string;
}

export const STUDY_SETS: readonly StudySet[] = [
  { id: "7급-1", grade: "7급", setNumber: 1, startIndex: 0, endIndex: 25, label: "7급 1세트" },
  { id: "7급-2", grade: "7급", setNumber: 2, startIndex: 25, endIndex: 50, label: "7급 2세트" },
  { id: "준6급-1", grade: "준6급", setNumber: 1, startIndex: 0, endIndex: 25, label: "준6급 1세트" },
  { id: "준6급-2", grade: "준6급", setNumber: 2, startIndex: 25, endIndex: 50, label: "준6급 2세트" },
  { id: "준6급-3", grade: "준6급", setNumber: 3, startIndex: 50, endIndex: 75, label: "준6급 3세트" },
  { id: "6급-1", grade: "6급", setNumber: 1, startIndex: 0, endIndex: 25, label: "6급 1세트" },
  { id: "6급-2", grade: "6급", setNumber: 2, startIndex: 25, endIndex: 50, label: "6급 2세트" },
  { id: "6급-3", grade: "6급", setNumber: 3, startIndex: 50, endIndex: 75, label: "6급 3세트" },
] as const;

export const DEFAULT_STUDY_SET: StudySetId = "7급-1";

/** data/hanja.json 한 항목의 정규화된 형태입니다. */
export interface HanjaEntry {
  id: string;
  hanja: string;
  eum: string[];
  hun: string[];
  /** 학습 카드와 퀴즈 보기에 표시하는 대표 `훈 음` 문자열입니다. */
  eumhun: string;
  grade: HanjaGrade;
  /** 검증 가능한 출처 주소입니다. */
  source: string;
  /** 원문에 적힌 훈·음 표기를 그대로 보존한 값입니다. */
  sourceLabel: string;
}

export type RandomSource = () => number;

export type MatchCardKind = "hanja" | "eumhun";

export interface MatchCard {
  /** 같은 라운드 안에서 카드 하나를 식별하는 ID입니다. */
  id: string;
  /** 서로 맞는 두 카드는 같은 pairId를 가집니다. */
  pairId: string;
  entryId: string;
  kind: MatchCardKind;
  content: string;
}

export interface QuizQuestion {
  id: string;
  entryId: string;
  hanja: string;
  /** 중복 없는 네 개의 음훈 보기입니다. */
  choices: string[];
  correctAnswer: string;
  correctIndex: number;
  /** 정답 확인 뒤 훈·음 등 상세 정보를 보여 주기 위한 원본 항목입니다. */
  entry: HanjaEntry;
}

export type StudyMode = "matching" | "quiz";

export interface AudioPreferences {
  musicEnabled: boolean;
  effectsEnabled: boolean;
}

export interface ProgressRecord {
  id: string;
  mode: StudyMode;
  studySet: StudySetId;
  /** ISO 8601 형식의 완료 시각입니다. */
  completedAt: string;
  correct: number;
  total: number;
}

export interface ProgressState {
  version: 1;
  selectedStudySet: StudySetId;
  audio: AudioPreferences;
  matching: {
    completedGames: number;
    matchedPairs: number;
  };
  quiz: {
    completedGames: number;
    correctAnswers: number;
    totalQuestions: number;
  };
  /** 최신 기록이 앞에 오며 최대 열 개입니다. */
  recentRecords: ProgressRecord[];
}
