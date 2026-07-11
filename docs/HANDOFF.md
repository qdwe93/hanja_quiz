# 다른 PC 작업 인수인계

> 기준 커밋: 이 문서가 포함된 `main` 브랜치의 초기 MVP 커밋
>
> 마지막 갱신: 2026-07-11

## 1. 가장 먼저 할 일

다른 PC에서 아래 순서대로 실행한다.

```bash
git clone https://github.com/qdwe93/hanja_quiz.git
cd hanja_quiz
npm ci
npm run validate
npm run dev
```

브라우저에서 `http://localhost:3000`을 열어 홈, 짝맞추기, 퀴즈 흐름을 확인한다. Node.js는 `22.13` 이상이 필요하며, 이 커밋은 Node.js 24에서 검증한다. `.env` 파일, API 키, 데이터베이스는 필요하지 않다.

`npm ci`가 끝난 뒤에는 `package-lock.json`을 기준으로 의존성이 고정된다. 의존성을 바꾸지 않는 한 `npm install` 대신 `npm ci`를 사용한다.

## 2. 현재 완성된 기능

| 영역 | 현재 상태 | 핵심 파일 |
|---|---|---|
| 한자 데이터 | 완료 | `data/hanja.json`, `docs/DATA_SPEC.md` |
| 등급 선택·홈 | 완료 | `components/HanjaApp.tsx` |
| 카드 짝맞추기 | 완료 | `components/HanjaApp.tsx`, `lib/game.ts` |
| 4지선다·결과·오답 복습 | 완료 | `components/HanjaApp.tsx`, `lib/game.ts` |
| 로컬 학습 기록 | 완료 | `lib/storage.ts` |
| 디자인 토큰·반응형 | 완료 | `app/globals.css`, `docs/DESIGN_SYSTEM.md` |
| 자동 검증 | 완료 | `tests/`, `package.json` |
| GitHub CI | 완료 | `.github/workflows/ci.yml` |

앱은 별도 라우팅 없이 하나의 클라이언트 화면에서 홈 → 게임 → 결과 상태를 전환한다. 이 구조를 바꿀 경우 새로고침과 정적 호스팅의 동작도 함께 검증한다.

## 3. 반드시 유지할 데이터 결정

초기 프롬프트에는 `7급 50 + 준6급 50 + 6급 100`으로 적혀 있지만, 원문과 한국어문회 공식 누적 수치에 따른 실제 신규 학습 수량은 다음과 같다.

| 등급 | 글자 수 |
|---|---:|
| 7급 | 50 |
| 준6급 | 75 |
| 6급 | 75 |
| 합계 | 200 |

따라서 이 저장소의 유일한 기준은 **50·75·75**다. 급수 경계를 임의로 바꾸지 말고, 데이터 수정 전에는 [DATA_SPEC.md](./DATA_SPEC.md)의 출처·정규화·복수 음훈 규칙을 먼저 확인한다.

`eum`과 `hun`은 복수 음훈 보존을 위한 평행 배열이며, 화면의 기본 답은 `eumhun`이다. 퀴즈 오답은 모든 복수 음훈을 고려해 모호한 후보를 제외한다. 이 규칙은 `lib/game.ts`와 테스트를 함께 바꾸지 않고 수정하면 안 된다.

## 4. 작업 재개 권장 순서

1. `npm run validate`를 먼저 통과시킨다.
2. [TASKS.md](./TASKS.md)의 남은 P0 항목 중 하나만 선택한다.
3. 요구·설계·타입 계약이 바뀌면 PRD/TRD/디자인 문서를 같은 커밋에서 갱신한다.
4. 데이터·게임·저장소 변경에는 해당 단위 테스트를 추가한다.
5. `npm run validate`와 브라우저 수동 점검을 완료한 뒤 커밋한다.

권장 우선순위는 다음과 같다.

- 실제 모바일·키보드·저장소 손상 상황의 브라우저 QA 결과를 `TASKS.md`에 반영
- 완성된 앱의 Open Graph 이미지와 메타데이터 검토
- 배포가 필요해질 때 `.openai/hosting.json`을 유지한 Sites 배포 절차 진행
- 실제 학생 사용성 피드백을 토대로 문구·난이도 조정

위 항목은 현재 MVP의 작동을 막지 않으며, 요청이 있을 때만 진행한다.

## 5. 품질 확인 방법

| 확인 대상 | 명령 또는 방법 |
|---|---|
| 코드 형식·규칙 | `npm run lint` |
| 타입 | `npm run typecheck` |
| 데이터·게임·저장 | `npm run test` |
| 배포용 빌드 | `npm run build` |
| HTML 렌더링 | `npm run test:render` (먼저 build 필요) |
| 전체 | `npm run validate` |
| 화면 | `npm run dev` 후 홈, 두 게임, 결과, 새로고침을 수동 확인 |

저장소 키는 `hanja-learning:progress:v1`이다. 브라우저 개발자 도구에서 이 키에 깨진 JSON을 넣어도 앱이 기본 상태로 복구되어야 한다.

## 6. Git 작업 원칙

```bash
git status
git pull --ff-only origin main
git checkout -b 작업-이름
# 수정 및 검증
git add <변경 파일>
git commit -m "feat: 변경 요약"
git push -u origin 작업-이름
```

혼자 `main`에서 이어갈 경우에도 먼저 `git pull --ff-only origin main`을 실행한다. 강제 푸시나 `git reset --hard`는 사용하지 않는다. 원격 CI가 통과한 뒤 병합 또는 `main` 반영을 진행한다.

## 7. 빠른 문제 해결

| 증상 | 먼저 시도할 방법 |
|---|---|
| 의존성 또는 빌드 오류 | `node --version`이 22.13 이상인지 확인 후 `node_modules`를 삭제하고 `npm ci` 재실행 |
| 포트 3000 사용 중 | 기존 개발 서버를 종료하거나 Vinext가 출력한 다른 로컬 URL 사용 |
| 퀴즈 보기가 이상함 | `npm run test`를 실행하고 `data/hanja.json`과 `lib/game.ts`를 함께 확인 |
| 기록이 사라짐 | 이 앱의 기록은 브라우저·기기별 localStorage이므로 다른 PC로 자동 이전되지 않음 |
| 등급별 수량이 기대와 다름 | `50/75/75`가 의도된 원문 기준인지 `DATA_SPEC.md`를 확인 |

## 8. 문서별 역할

- `PRD.md`: 사용자 문제, 범위, 수용 기준
- `TRD.md`: 아키텍처, 데이터·저장·테스트 계약
- `IMPLEMENTATION_PLAN.md`: 개발 순서와 위험 관리
- `TASKS.md`: 현재 완료 여부와 다음 작업 단위
- `DATA_SPEC.md`: 200자 수집·정규화·출처
- `DESIGN_SYSTEM.md`: 토큰과 컴포넌트 시각 규칙

작업을 시작하기 전에 이 문서와 `TASKS.md`를 읽고, 작업 중에 실제 구현과 문서가 달라지지 않게 유지한다.
