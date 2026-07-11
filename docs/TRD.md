# 한자랑 기술 요구사항 정의서(TRD)

> 문서 상태: 초기 MVP 구현 기준 및 현재 상태
> 작성일: 2026-07-11
> 기준 제품 요구사항: [PRD.md](./PRD.md)

## 1. 기술 목표

- 검증된 정적 한자 데이터와 게임 로직을 분리해 독립적으로 시험한다.
- 회원가입·백엔드 없이 브라우저에서 모든 학습 기능을 수행한다.
- Sites의 vinext 구조와 Cloudflare 호환 빌드를 유지한다.
- 새로고침, 저장소 접근 실패, 빠른 연속 입력에서도 복구 가능한 상태 머신을 사용한다.
- 모바일, 키보드, 화면 읽기 프로그램, 감소된 모션 설정을 구현 단계의 필수 계약으로 다룬다.

## 2. 현재 기반과 목표 스택

저장소는 빈 Vite SPA가 아니라 Sites가 준비한 **vinext 기반 프로젝트**다. 따라서 기존 `vite.config.ts`, `vinext()` 및 `sites()` 플러그인, Cloudflare Worker 호환 구성을 보존한다.

| 영역 | 기준 |
|---|---|
| 앱 프레임워크 | vinext `0.0.50`, Next App Router 호환 구조 |
| UI | React `19.2.6`, React DOM `19.2.6` |
| 언어 | TypeScript `5.9.3`, 엄격 모드 |
| 빌드 | Vite `8.0.13`, Sites Vite 플러그인, Cloudflare Vite 플러그인 |
| 런타임 | Node.js `>=22.13.0`; 배포 산출물은 Cloudflare Worker 호환 ESM |
| 스타일 | `app/globals.css`의 CSS 사용자 정의 속성과 컴포넌트 클래스 |
| 데이터 | 저장소에 포함된 검증된 `data/hanja.json` 정적 스냅샷 |
| 영속화 | 브라우저 `localStorage`; D1/R2 사용 안 함 |
| 테스트 | 순수 로직·데이터·저장소 단위 테스트, 빌드 결과 스모크 테스트, 브라우저 수동 점검 |

패키지의 정확한 버전은 `package-lock.json`을 진실의 원천으로 삼는다. 제품 코드에 사용하지 않는 starter의 D1 예제와 로딩 스켈레톤은 완성 단계에서 앱 진입 경로와 의존 관계에서 제거한다. `.openai/hosting.json`의 `d1`과 `r2`는 `null`을 유지한다.

## 3. 아키텍처

### 3.1 실행 구조

```text
브라우저
  └─ / (vinext App Router 진입점)
      └─ HanjaApp 클라이언트 경계
          ├─ 시작 화면
          ├─ 짝맞추기 화면/완료 화면
          ├─ 4지선다 화면/결과 화면
          ├─ 순수 게임 로직
          ├─ 정적 한자 데이터
          └─ 버전이 있는 localStorage 어댑터
```

- `app/layout.tsx`는 `lang="ko"`, 사이트 메타데이터, 전역 스타일만 담당한다.
- `app/page.tsx`는 정적인 페이지 설명과 클라이언트 앱 경계를 렌더링한다.
- 상호작용 상태와 `window` 접근이 필요한 최상위 앱은 명시적인 클라이언트 컴포넌트로 둔다.
- 데이터 필터링·셔플·문제 생성·상태 전이는 React 컴포넌트 밖의 순수 함수로 둔다.
- 게임 화면 전환은 `/` 안의 판별 가능한 상태로 처리한다. 별도 라우터 의존성을 추가하지 않으며 새로고침은 안전하게 시작 화면으로 복귀한다.

### 3.2 구현 모듈 경계

구현 결과에 맞춰 파일명은 조정할 수 있지만 책임 경계는 유지한다.

```text
app/
  layout.tsx                 # 한국어 문서, 메타데이터
  page.tsx                   # 루트 페이지
  globals.css                # 토큰, 리셋, 반응형 스타일
components/
  HanjaApp.tsx               # 클라이언트 화면과 세션 오케스트레이션
data/
  hanja.json                 # 검증된 200자
lib/
  types.ts                   # 데이터·게임·저장 타입
  game.ts                    # 필터, 셔플, 매칭·퀴즈 생성
  storage.ts                 # 저장 스키마 검증과 안전한 I/O
tests/
  game.test.ts
  storage.test.ts
  rendered-html.test.mjs
```

## 4. 데이터 계약

### 4.1 항목 타입

`data/hanja.json`의 한 항목은 다음 계약을 따른다.

```ts
type HanjaGrade = "7급" | "준6급" | "6급";

interface HanjaEntry {
  id: string;
  hanja: string;
  eum: string[];
  hun: string[];
  eumhun: string;
  grade: HanjaGrade;
  source: string;
  sourceLabel: string;
}
```

- `eum[n]`과 `hun[n]`은 같은 원문 훈음 쌍이다. 두 배열의 길이는 같아야 한다.
- `eumhun`은 첫 번째 원문 훈음에서 장단음 기호를 제거한 앱 대표 표시값 `훈 음`이다.
- `sourceLabel`은 복수 훈음을 ` | `로 연결하고 장단음 기호를 보존한 원문 대표값이다.
- `source`는 검증한 원문 URL이다.
- ID는 등급과 원문 순서를 반영한 `g7-001`, `g6p-001`, `g6-001` 형식을 사용한다.
- 데이터 수량은 7급 50자, 준6급 75자, 6급 75자, 합계 200자다.

수집·정규화·예외의 상세 규칙은 [DATA_SPEC.md](./DATA_SPEC.md)가 우선한다.

### 4.2 범위 타입

```ts
type GradeFilter = HanjaGrade | "전체";
```

`전체`는 데이터에 저장하는 등급이 아니라 UI 필터 값이다. `filterByGrade(entries, "전체")`는 200자를 반환하고, 나머지는 `entry.grade`의 정확한 문자열 비교로 반환한다.

### 4.3 데이터 검증

검증은 개발 중 명령과 자동 테스트 양쪽에서 실행할 수 있어야 한다.

1. JSON 파싱과 배열 여부
2. 전체 200개 및 등급별 `50/75/75`
3. `id`, `hanja` 전역 고유성
4. 허용 등급과 ID 패턴
5. 필수 문자열의 공백 제거 후 비어 있지 않음
6. 한자 한 글자 여부(Unicode 코드 포인트 기준)
7. `eum.length === hun.length`이고 길이가 1 이상
8. 대표 `eumhun`이 `훈 음` 규칙과 일치하고 대체 문자 `�`가 없음
9. `source`가 허용된 HTTPS 원문이고 `sourceLabel`이 비어 있지 않음
10. 등급 범위마다 4지선다를 만들 수 있는 고유 표시값이 충분함

## 5. 게임 도메인과 상태 전이

### 5.1 공통 앱 상태

```ts
type AppView =
  | { name: "home" }
  | { name: "match"; session: MatchSession }
  | { name: "quiz"; session: QuizSession }
  | { name: "quiz-result"; result: QuizResult };
```

최상위 상태는 `view`, `selectedGrade`, `progress`만 소유한다. 게임별 세부 상태는 해당 세션 안에 둔다. 전역 상태 라이브러리는 사용하지 않고 React의 지역 상태로 충분히 처리한다.

### 5.2 짝맞추기 모델

```ts
type MatchCardKind = "hanja" | "eumhun";
type MatchPhase = "playing" | "checking" | "complete";

interface MatchCard {
  id: string;       // `${entryId}:hanja` 또는 `${entryId}:eumhun`
  pairId: string;   // HanjaEntry.id
  entryId: string;
  kind: MatchCardKind;
  content: string;
}

interface MatchSession {
  grade: GradeFilter;
  seedEntryIds: string[];
  cards: MatchCard[];
  faceUpIds: string[];
  matchedPairIds: string[];
  attempts: number;
  phase: MatchPhase;
}
```

전이 규칙은 다음과 같다.

| 현재 상태 | 입력 | 다음 상태/효과 |
|---|---|---|
| `playing`, 공개 0장 | 유효 카드 선택 | 해당 카드 공개 |
| `playing`, 공개 1장 | 다른 유효 카드 선택 | 두 번째 카드 공개, 시도 +1, `checking` |
| `checking` | 추가 카드 선택 | 무시 |
| `checking`, 같은 `pairId` + 다른 `kind` | 비교 완료 | 쌍을 matched에 추가, 공개 목록 비움, `playing` 또는 `complete` |
| `checking`, 불일치 | 지연 완료 | 공개 목록 비움, `playing` |
| 모든 상태 | 같은 카드·matched 카드 선택 | 무시 |

비교 지연은 UI 타이머 효과에서만 처리하고 일치 여부 판정은 순수 함수로 반환한다. 컴포넌트가 사라질 때 타이머를 정리해 이전 라운드에 상태를 쓰지 않게 한다.

### 5.3 퀴즈 모델

```ts
interface QuizQuestion {
  id: string;
  entryId: string;
  hanja: string;
  correctAnswer: string;
  choices: string[]; // 길이 4, 고유값 4개
  correctIndex: number;
  entry: HanjaEntry;
}

interface QuizAnswer {
  questionId: string;
  selected: string;
  correct: boolean;
}

type QuizPhase = "asking" | "answered" | "complete";

interface QuizSession {
  grade: GradeFilter;
  questionIds: string[];
  questions: QuizQuestion[];
  currentIndex: number;
  answers: QuizAnswer[];
  phase: QuizPhase;
}
```

보기 생성 규칙:

1. 정답 항목을 제외한 선택 범위 항목을 후보로 만든다.
2. 후보의 `eumhun`이 정답 또는 이미 뽑은 보기와 같으면 제외한다.
3. `(hun[i], eum[i])`로 만든 모든 정규화 음훈 집합이 정답 또는 기존 후보의 집합과 교차하면 모호한 후보로 보고 제외한다.
4. 세 후보를 뽑은 뒤 정답과 함께 다시 섞는다.
5. 조건을 만족하지 못하면 무리하게 채우지 않고 질문 생성을 실패로 반환한다. 세트 생성기는 다른 정답 항목을 시도한다.

`answerQuestion`은 `asking`에서만 한 번 동작한다. 정답 수는 `answers.filter(answer => answer.correct).length`에서 계산해 별도 카운터 불일치를 피한다.

### 5.4 난수와 재현성

- 셔플은 편향을 줄인 Fisher–Yates를 사용한다.
- 기본 난수 공급자는 `Math.random`이면 충분하다. 보안용 난수가 필요한 기능이 아니다.
- 모든 생성 함수는 선택적 `rng: () => number`를 받아 테스트에서 고정 순서를 재현한다.
- 같은 문제 세트를 다시 풀 때는 `questionIds`와 각 보기 구성을 보존하고 답안만 초기화한다.
- 새 문제는 같은 범위에서 새로 생성한다.

## 6. 로컬 저장 전략

### 6.1 저장 계약

키는 `hanja-learning:progress:v1`로 고정한다.

```ts
interface ProgressState {
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
  recentRecords: Array<{
    id: string;
    mode: "matching" | "quiz";
    grade: GradeFilter;
    completedAt: string;
    correct: number;
    total: number;
  }>;
}
```

- `recentRecords`는 최신 10회만 보존한다.
- 진행 중 게임은 저장하지 않는다. 새로고침하면 홈으로 돌아가되 마지막 범위와 완료 요약은 유지한다.
- 숫자는 유한한 0 이상의 정수인지, 범위와 모드는 허용된 값인지 읽을 때 검증한다.
- 각 기록은 `correct <= total`이어야 하며 모드별 누계는 유효한 완료 기록에서만 증가한다. 오답 ID 목록은 현재 결과 화면의 세션 상태로만 유지하고 영속화하지 않는다.

### 6.2 안전한 접근

- 서버 렌더 중 `window`나 `localStorage`를 접근하지 않는다.
- 첫 클라이언트 렌더는 안전한 기본값으로 만들고 마운트 후 저장 값을 복원해 hydration 불일치를 피한다.
- `getItem`, `JSON.parse`, 검증, `setItem`은 모두 예외를 잡는다.
- 파싱 또는 스키마 검증 실패 시 해당 값을 사용하지 않고 기본값을 반환한다. 가능하면 손상 키를 제거하되 앱 동작을 막지 않는다.
- 저장 실패는 현재 세션을 중단하지 않으며 사용자에게 필요한 경우에만 비차단 안내를 보인다.
- 다음 스키마에서는 새 키 또는 명시적인 마이그레이션 함수를 사용한다.

## 7. 렌더링과 스타일 전략

- 게임은 클라이언트 상태가 필요하지만 첫 페이지 골격과 메타데이터는 vinext App Router 규칙을 따른다.
- 외부 이미지와 웹 폰트 요청은 하지 않는다. 시작 화면 장식은 CSS 도형으로만 제한한다.
- CSS 사용자 정의 속성을 [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md)의 이름·값과 일치시킨다.
- Tailwind 유틸리티에 제품 토큰을 중복 정의하지 않는다. 단일 전역 스타일 계층을 우선한다.
- 모바일 우선 스타일을 작성하고 `480px`, `768px`, `1024px`, `1280px`에서 필요한 변화만 추가한다.
- 다크 모드는 MVP 범위가 아니다. 운영체제 다크 모드 때문에 임의로 색이 뒤집히지 않게 명시적인 밝은 테마를 유지한다.

## 8. 오류와 빈 상태

| 상황 | 처리 |
|---|---|
| 한자 데이터 파싱/검증 실패 | 게임 시작을 막고 `학습 자료를 불러오지 못했어요`와 홈 복구 동작 표시 |
| 선택 범위가 비어 있음 | 해당 범위 수량 0과 다시 선택 동작 표시 |
| 퀴즈 보기 생성 실패 | 다른 문제 후보를 시도; 세트 전체를 못 만들면 오류 상태로 복귀 |
| 로컬 저장 읽기 실패 | 기본 진행 기록으로 계속 |
| 로컬 저장 쓰기 실패 | 현재 결과는 화면에 유지하고 저장 실패만 비차단 안내 |
| 렌더 오류 | 앱 오류 경계 또는 App Router 오류 화면에서 다시 시작 제공 |

오류 세부 스택, 저장 내용, 브라우저 환경 정보는 사용자 화면에 노출하지 않는다.

## 9. 접근성 구현 계약

### 구조와 이름

- `<html lang="ko">`, `<header>`, `<main>`, `<nav>` 등 의미 구조를 사용한다.
- 페이지마다 하나의 명확한 `h1`을 두고 게임 제목·결과 제목은 순서에 맞는 제목 요소를 사용한다.
- 등급 선택 그룹에는 보이는 범례를 제공한다.
- 모든 아이콘은 보조 문구이며 장식 아이콘은 `aria-hidden="true"`로 처리한다.

### 키보드와 포커스

- 조작 요소는 모두 네이티브 버튼 또는 적합한 폼 요소다. 클릭 가능한 `div`를 만들지 않는다.
- 새 게임 시작 시 게임 제목이나 첫 조작 요소로 예측 가능한 포커스를 옮긴다.
- 정답 선택 후 피드백은 읽히되 사용자가 `다음 문제`를 명시적으로 선택한다.
- 완료 시 결과 제목에 프로그램 방식 포커스를 옮겨 상태 변화를 알린다.
- 맞춘 카드가 비활성화돼 탭 순서에서 빠져도 다음 사용 가능한 카드로 포커스가 이어져야 한다.

### 상태 전달

- 정답·오답은 색 + `✓`/`!` 기호 + `정답`/`아쉬워요` 문구 + 테두리로 전달한다.
- 진행률은 보이는 `현재/전체` 텍스트를 함께 제공한다.
- 반복 선택 과정은 과도한 assertive 알림을 피하고 결과 피드백만 `aria-live="polite"`로 알린다.
- 카드 뒷면의 접근 가능한 이름에는 한자나 음훈을 넣지 않는다.

### 움직임과 크기

- 조작 영역은 최소 44×44px, 본문 기본 크기는 16px 이상이다.
- `prefers-reduced-motion: reduce`에서 전환 시간을 사실상 0으로 줄이고 3D 회전을 제거한다.
- 200% 확대, 320 CSS px 너비, 고대비 설정에서 핵심 상태를 확인한다.

## 10. 테스트 전략

### 10.1 단위 테스트

- 데이터 수량, 스키마, 중복, 문자열 정규화, 훈음 배열 대응
- 등급 필터의 `50/75/75/200` 결과
- 셔플 결과가 원소를 잃거나 복제하지 않음
- 짝맞추기: 동일 카드 무시, 같은 종류 불일치, 정확한 쌍 일치, 세 번째 입력 잠금, 시도 횟수, 완료 전이
- 퀴즈: 보기 4개 고유성, 정답 1개, 모호한 후보 제외, 정답 위치 변화, 문제 중복 방지
- 저장소: 정상 복원, 잘못된 JSON, 다른 버전, 범위 밖 숫자, 쓰기 예외

### 10.2 컴포넌트/사용자 흐름 테스트

Vitest와 jsdom 기반 React Testing Library를 목표 구성으로 사용한다.

- 등급 선택 시 수량과 시작 컨텍스트 변경
- 키보드로 카드 두 장 선택 후 일치/불일치 피드백
- 빠른 세 번째 카드 입력이 무시됨
- 퀴즈 응답 후 재응답 방지와 다음 문제 전환
- 마지막 문제 뒤 점수·오답 목록 표시
- 손상된 저장값에서 홈이 렌더됨

테스트는 구현 세부 클래스보다 역할, 이름, 상태 문구를 기준으로 질의한다.

### 10.3 빌드와 스모크 테스트

- 기존 `tests/rendered-html.test.mjs`는 배포 빌드가 실제 한국어 앱 제목과 핵심 콘텐츠를 반환하는지 확인하도록 갱신한다.
- 프로덕션 빌드에서 starter 제목, `codex-preview` 메타데이터, 스켈레톤 import가 남지 않았는지 검사한다.
- 브라우저 수동 점검은 모바일·태블릿·데스크톱 대표 너비와 키보드 전용 흐름을 포함한다.

### 10.4 완료 전 명령 계약

`package.json`은 최종적으로 다음 역할의 명령을 제공해야 한다. 정확한 도구명은 구현과 함께 고정한다.

```text
npm run lint
npm run typecheck
npm run test
npm run build
```

데이터 검증이 별도 명령이면 `test` 또는 `build`의 선행 단계에도 연결해 검증되지 않은 데이터가 배포되지 않게 한다.

## 11. 성능 고려사항

- 200개 정적 데이터는 한 번만 import하고 렌더마다 JSON을 다시 파싱하지 않는다.
- 파생 범위 목록은 데이터가 바뀔 때만 계산한다.
- 라운드는 필요한 6개 또는 10개 항목만 상태에 복사한다.
- 장식 이미지, 오디오, 대형 애니메이션 라이브러리를 추가하지 않는다.
- 타이머와 이벤트 리스너를 정리해 화면 전환 후 상태 갱신과 메모리 누수를 막는다.
- 초기 화면은 JavaScript 로딩 중에도 앱 이름과 목적을 알 수 있는 간단한 구조를 유지한다.

## 12. 보안과 개인정보

- 이름, 계정, 이메일, 자유 입력 텍스트를 수집하지 않는다.
- 학습 기록은 현재 브라우저에만 저장되며 외부로 전송되지 않는다고 표현한다.
- `dangerouslySetInnerHTML`, 사용자 제공 HTML, 동적 코드 실행을 사용하지 않는다.
- 원문 URL은 고정된 HTTPS 링크만 사용하고 새 창 링크에는 적합한 `rel`을 설정한다.
- 의존성 버전은 잠금 파일로 고정하고 CI에서 깨끗한 `npm ci`를 사용한다.
- `.env*`, 인증 정보, Cloudflare 식별자를 클라이언트 번들에 넣지 않는다.
- D1/R2가 필요하지 않으므로 논리 바인딩도 선언하지 않는다.

## 13. 배포와 호환성

- 기존 `vinext()`, `sites()`, Cloudflare 플러그인 순서를 보존한다.
- 배포 빌드는 Cloudflare Worker 호환 ESM이어야 한다.
- 앱이 `/`에서 완전한 흐름을 제공하므로 정적 호스팅의 경로 fallback에 의존하지 않는다.
- 지원 기준은 최근 두 버전의 Chrome, Edge, Firefox, Safari와 iOS/Android의 최신 안정 브라우저다.
- JavaScript, `localStorage`, CSS Grid를 사용할 수 없는 오래된 브라우저는 지원 대상이 아니다. 저장소만 사용할 수 없어도 세션 학습은 계속 가능해야 한다.

## 14. 기술 완료 정의

- 데이터 검증과 모든 품질 명령이 성공한다.
- 원문 수량과 데이터 타입이 [DATA_SPEC.md](./DATA_SPEC.md)와 일치한다.
- 순수 게임 로직이 UI에서 분리되어 단위 테스트된다.
- 저장소 오류와 hydration 불일치 없이 새로고침된다.
- starter 화면, starter 메타데이터, 사용하지 않는 스켈레톤 의존성이 제품 경로에 남지 않는다.
- 접근성·반응형 수용 기준을 수동 또는 자동 점검으로 확인한다.
- [TASKS.md](./TASKS.md)의 P0 항목이 모두 완료되고 문서가 구현과 동기화된다.
