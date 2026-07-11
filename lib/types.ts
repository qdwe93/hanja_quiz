/** 학습 데이터에서 사용할 수 있는 급수입니다. */
export type HanjaGrade = "7급" | "준6급" | "6급";

/** 시작 화면에서 선택할 수 있는 학습 범위입니다. */
export type GradeFilter = HanjaGrade | "전체";

export const HANJA_GRADES = ["7급", "준6급", "6급"] as const;
export const GRADE_FILTERS = ["전체", ...HANJA_GRADES] as const;

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

export interface ProgressRecord {
  id: string;
  mode: StudyMode;
  grade: GradeFilter;
  /** ISO 8601 형식의 완료 시각입니다. */
  completedAt: string;
  correct: number;
  total: number;
}

export interface ProgressState {
  version: 1;
  selectedGrade: GradeFilter;
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
