# 한자랑

초등학생이 전국한자능력검정시험 배정한자 200자를 짝맞추기와 4지선다 퀴즈로 익히는 한국어 웹앱입니다.

## 현재 구현 범위

- 7급 50자, 준6급 75자, 6급 75자 — 총 200자 데이터와 자동 검증
- 급수별 또는 전체 범위 선택
- 한자 카드와 한글 음훈 카드 6쌍을 맞추는 짝맞추기
- 중복·모호한 보기를 막는 10문제 4지선다 퀴즈와 오답 복습
- 최근 선택과 학습 결과를 기기 내 `localStorage`에 저장
- 키보드 조작, 색 이외의 정답·오답 표시, 작은 화면과 감소된 모션 대응

데이터 수량의 근거와 정규화 규칙은 [데이터 명세](./docs/DATA_SPEC.md)를 참고하세요.

## 다른 PC에서 이어서 시작하기

가장 빠른 절차는 다음과 같습니다.

```bash
git clone https://github.com/qdwe93/hanja_quiz.git
cd hanja_quiz
npm ci
npm run validate
npm run dev
```

개발 서버를 실행하면 `http://localhost:3000`에서 확인할 수 있습니다. 상세한 작업 현황, 다음 작업 우선순위, 검증 및 Git 절차는 [인수인계 문서](./docs/HANDOFF.md)에 정리되어 있습니다.

## 요구 사항

- Node.js 22.13 이상 — 현재 개발·검증 기준은 Node.js 24
- npm 11 이상 권장

별도의 환경 변수, 데이터베이스, 로그인 설정은 필요하지 않습니다.

## 명령어

| 명령어 | 용도 |
|---|---|
| `npm run dev` | 로컬 개발 서버 실행 |
| `npm run lint` | ESLint 검사 |
| `npm run typecheck` | TypeScript 타입 검사 |
| `npm run test` | 데이터·게임 로직·세션 전이·저장소 단위 테스트 |
| `npm run test:ui` | Vitest + React Testing Library 사용자 흐름 테스트 |
| `npm run build` | Vinext/Cloudflare 호환 프로덕션 빌드 |
| `npm run test:render` | 빌드 결과의 서버 렌더링 스모크 테스트 |
| `npm run validate` | lint → typecheck → test → test:ui → build → 렌더 스모크 테스트 |

## 기술 구성

- React 19 + TypeScript + Vinext/Vite
- CSS 사용자 정의 속성을 이용한 디자인 토큰
- 브라우저 `localStorage` 기반의 로컬 학습 기록
- Node 내장 테스트 러너 + Vitest/RTL, GitHub Actions CI

## 주요 디렉터리

```text
app/           페이지 셸과 전역 스타일
components/    화면 상태와 게임 UI
data/          검증된 한자 200자 JSON
lib/           타입, 게임 생성·검증, 세션 전이, 저장소 로직
tests/         데이터·로직·세션·저장소·사용자 흐름·렌더링 테스트
docs/          PRD, TRD, 디자인, 데이터, 인수인계 문서
```

## 문서

- [PRD](./docs/PRD.md)
- [TRD](./docs/TRD.md)
- [구현 계획](./docs/IMPLEMENTATION_PLAN.md)
- [작업 목록](./docs/TASKS.md)
- [데이터 명세](./docs/DATA_SPEC.md)
- [디자인 시스템](./docs/DESIGN_SYSTEM.md)
- [다른 PC 인수인계](./docs/HANDOFF.md)

## 데이터 출처

- [전국한자능력검정시험 배정한자](https://namu.wiki/w/%EC%A0%84%EA%B5%AD%ED%95%9C%EC%9E%90%EB%8A%A5%EB%A0%A5%EA%B2%80%EC%A0%95%EC%8B%9C%ED%97%98/%EB%B0%B0%EC%A0%95%ED%95%9C%EC%9E%90)
- [한국어문회 급수배정 안내](https://www.hanja.re.kr/kccpt/exam/levelConfirm.do)

원문과 공식 누적 수치에 따라 실제 신규 학습 범위는 `50 + 75 + 75`이며, 초기 프롬프트의 `50 + 50 + 100` 예상값을 사용하지 않습니다.
