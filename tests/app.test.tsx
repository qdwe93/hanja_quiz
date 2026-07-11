import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test } from "vitest";

import { HanjaApp } from "../components/HanjaApp";
import { PROGRESS_STORAGE_KEY } from "../lib/storage";
import type { HanjaEntry, HanjaGrade } from "../lib/types";

function makeEntries(count = 6): HanjaEntry[] {
  const grades: HanjaGrade[] = ["7급", "준6급", "6급"];
  return Array.from({ length: count }, (_, index) => ({
    id: `hanja-${index + 1}`,
    hanja: String.fromCodePoint(0x4e00 + index),
    eum: [`음${index + 1}`],
    hun: [`뜻${index + 1}`],
    eumhun: `뜻${index + 1} 음${index + 1}`,
    grade: grades[index % grades.length],
    source: "https://example.com/source",
    sourceLabel: `원문${index + 1}`,
  }));
}

const entries = makeEntries();

function eumhunOf(hanja: string): string {
  const entry = entries.find((item) => item.hanja === hanja);
  if (!entry) {
    throw new Error(`알 수 없는 한자: ${hanja}`);
  }
  return entry.eumhun;
}

function cardButton(entryId: string, kind: "hanja" | "eumhun"): HTMLButtonElement {
  return screen.getByTestId(`match-card-${entryId}:${kind}`) as HTMLButtonElement;
}

async function completeMatchedPair(
  user: ReturnType<typeof userEvent.setup>,
  entryId: string,
) {
  const hanjaCard = cardButton(entryId, "hanja");
  const eumhunCard = cardButton(entryId, "eumhun");
  await user.click(hanjaCard);
  await user.click(eumhunCard);
  await waitFor(
    () => {
      expect(hanjaCard.getAttribute("aria-label")).toMatch(/^짝 맞춤: /);
    },
    { timeout: 2000 },
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

test("등급을 선택하면 실제 수량이 갱신되고 선택 상태가 표시된다", async () => {
  const user = userEvent.setup();
  render(<HanjaApp entries={entries} />);

  expect(screen.getByText(/6자/).textContent).toContain("전체");

  const gradeButton = screen.getByRole("button", { name: "7급" });
  await user.click(gradeButton);

  expect(gradeButton.getAttribute("aria-pressed")).toBe("true");
  const summary = screen.getByText(/선택한 범위/);
  expect(summary.textContent).toContain("7급");
  expect(summary.textContent).toContain("2자");
});

test("선택한 등급이 짝맞추기 카드 구성에 유지된다", async () => {
  const user = userEvent.setup();
  render(<HanjaApp entries={entries} />);

  await user.click(screen.getByRole("button", { name: "7급" }));
  await user.click(screen.getByTestId("start-matching"));

  // 7급 항목은 두 개뿐이므로 두 쌍 네 장만 나온다.
  const hidden = screen.getAllByRole("button", { name: "뒤집지 않은 카드" });
  expect(hidden.length).toBe(4);
});

test("짝맞추기: 일치·불일치·세 번째 입력 잠금이 동작하고 시작 시 제목에 포커스가 온다", async () => {
  const user = userEvent.setup();
  render(<HanjaApp entries={entries} />);

  await user.click(screen.getByTestId("start-matching"));

  // 게임 시작 시 세션 제목으로 포커스가 이동한다.
  await waitFor(() => {
    expect(document.activeElement?.textContent).toContain(
      "한자와 음훈의 짝을 찾아요",
    );
  });

  expect(
    screen.getAllByRole("button", { name: "뒤집지 않은 카드" }).length,
  ).toBe(12);

  const first = cardButton("hanja-1", "hanja");
  const outsider = cardButton("hanja-2", "hanja");
  const third = cardButton("hanja-3", "hanja");

  // 불일치: 두 카드가 잠시 공개된다.
  await user.click(first);
  expect(first.getAttribute("aria-label")).toBe(`열린 카드: ${entries[0].hanja}`);
  await user.click(outsider);
  expect(outsider.getAttribute("aria-label")).toBe(
    `열린 카드: ${entries[1].hanja}`,
  );

  // 비교 중 세 번째 카드는 무시된다.
  await user.click(third);
  expect(third.getAttribute("aria-label")).toBe("뒤집지 않은 카드");

  // 불일치한 두 카드는 다시 가려진다.
  await waitFor(
    () => {
      expect(first.getAttribute("aria-label")).toBe("뒤집지 않은 카드");
      expect(outsider.getAttribute("aria-label")).toBe("뒤집지 않은 카드");
    },
    { timeout: 2000 },
  );

  // 일치: 같은 항목의 한자·음훈 카드는 맞춘 상태로 유지되고 비활성화된다.
  await completeMatchedPair(user, "hanja-1");
  const partner = cardButton("hanja-1", "eumhun");
  expect(first.disabled).toBe(true);
  expect(partner.disabled).toBe(true);
  expect(partner.getAttribute("aria-label")).toBe(
    `짝 맞춤: ${entries[0].eumhun}`,
  );
});

test("짝맞추기 완료 후 결과 화면과 같은 카드 재시작이 동작한다", async () => {
  const user = userEvent.setup();
  render(<HanjaApp entries={entries} />);

  await user.click(screen.getByTestId("start-matching"));
  for (const entry of entries.slice(0, -1)) {
    await completeMatchedPair(user, entry.id);
  }

  // 마지막 쌍을 맞추면 카드 화면을 거치지 않고 결과로 전환된다.
  const lastEntry = entries[entries.length - 1];
  await user.click(cardButton(lastEntry.id, "hanja"));
  await user.click(cardButton(lastEntry.id, "eumhun"));

  await screen.findByTestId("matching-result", undefined, { timeout: 2000 });
  expect(
    screen.getByRole("heading", { name: "여섯 쌍을 모두 찾았어요!" }),
  ).toBeTruthy();
  screen.getByRole("button", { name: "새 카드로 하기" });
  screen.getByRole("button", { name: "4지선다로 가기" });
  screen.getByRole("button", { name: "처음으로" });

  // 완료 횟수가 저장된다.
  const stored = JSON.parse(
    window.localStorage.getItem(PROGRESS_STORAGE_KEY) ?? "{}",
  );
  expect(stored.matching.completedGames).toBe(1);
  expect(await screen.findByText("완료한 학습 1회")).toBeTruthy();

  // 같은 카드 다시 하기: 같은 카드 구성으로 진행만 초기화된다.
  await user.click(screen.getByRole("button", { name: "같은 카드 다시 하기" }));
  await screen.findByTestId("matching-screen");
  expect(
    screen.getAllByRole("button", { name: "뒤집지 않은 카드" }).length,
  ).toBe(12);
  expect(cardButton("hanja-1", "hanja").disabled).toBe(false);
});

test("퀴즈: 1회 응답 잠금, 피드백, 결과와 오답 복습, 같은 문제 다시 풀기가 동작한다", async () => {
  const user = userEvent.setup();
  render(<HanjaApp entries={entries} />);

  await user.click(screen.getByTestId("start-quiz"));
  await screen.findByTestId("quiz-screen");

  const totalQuestions = entries.length;
  let firstHanja = "";
  let missedHanja = "";

  for (let index = 0; index < totalQuestions; index += 1) {
    const hanja = screen.getByTestId("quiz-hanja").textContent ?? "";
    if (index === 0) {
      firstHanja = hanja;
    }
    const correctAnswer = eumhunOf(hanja);
    const choices = [0, 1, 2, 3].map(
      (i) => screen.getByTestId(`quiz-choice-${i}`) as HTMLButtonElement,
    );

    // 첫 문제는 일부러 틀리고 나머지는 정답을 고른다.
    const shouldMiss = index === 0;
    if (shouldMiss) {
      missedHanja = hanja;
    }
    const target = choices.find((button) =>
      shouldMiss
        ? !button.textContent?.includes(correctAnswer)
        : button.textContent?.includes(correctAnswer),
    );
    expect(target).toBeTruthy();
    await user.click(target as HTMLButtonElement);

    // 응답 후에는 모든 보기가 잠기고 피드백이 유지된다.
    for (const button of choices) {
      expect(button.disabled).toBe(true);
    }
    const feedback = screen.getByRole("status");
    expect(feedback.textContent).toContain(
      shouldMiss ? "아쉬워요" : "잘했어요",
    );
    expect(feedback.textContent).toContain(correctAnswer);

    // 유일하게 활성화된 다음 동작으로 포커스가 이동한다.
    const nextButton = screen.getByTestId("quiz-next") as HTMLButtonElement;
    await waitFor(() => {
      expect(document.activeElement).toBe(nextButton);
    });
    expect(nextButton.textContent).toContain(
      index === totalQuestions - 1 ? "결과 보기" : "다음 문제",
    );
    await user.click(nextButton);
  }

  // 결과: 점수·정답률·오답 복습 목록이 표시된다.
  await screen.findByTestId("quiz-result");
  const score = totalQuestions - 1;
  const percentage = Math.round((score / totalQuestions) * 100);
  expect(screen.getByText(`${percentage}%`)).toBeTruthy();
  expect(
    screen.getByText(`${score}/${totalQuestions} 문제`),
  ).toBeTruthy();
  const reviewChip = screen.getByText(missedHanja);
  expect(reviewChip.parentElement?.textContent).toContain(
    eumhunOf(missedHanja),
  );

  const stored = JSON.parse(
    window.localStorage.getItem(PROGRESS_STORAGE_KEY) ?? "{}",
  );
  expect(stored.quiz.completedGames).toBe(1);
  expect(stored.quiz.correctAnswers).toBe(score);
  expect(stored.quiz.totalQuestions).toBe(totalQuestions);

  // 같은 문제 다시 풀기: 문제 세트가 보존된 채 처음부터 다시 시작한다.
  await user.click(
    screen.getByRole("button", { name: "같은 문제 다시 풀기" }),
  );
  await screen.findByTestId("quiz-screen");
  expect(screen.getByTestId("quiz-hanja").textContent).toBe(firstHanja);
});

test("키보드만으로 카드 공개와 퀴즈 응답·다음 이동이 가능하다", async () => {
  const user = userEvent.setup();
  render(<HanjaApp entries={entries} />);

  // 짝맞추기: Enter로 시작하고 Tab으로 카드에 도달해 Enter/Space로 연다.
  screen.getByTestId("start-matching").focus();
  await user.keyboard("{Enter}");
  await waitFor(() => {
    expect(document.activeElement?.textContent).toContain(
      "한자와 음훈의 짝을 찾아요",
    );
  });

  await user.tab();
  const firstCard = document.activeElement as HTMLButtonElement;
  expect(firstCard.getAttribute("aria-label")).toBe("뒤집지 않은 카드");
  await user.keyboard("{Enter}");
  expect(firstCard.getAttribute("aria-label")).toMatch(/^열린 카드: /);

  await user.tab();
  const secondCard = document.activeElement as HTMLButtonElement;
  await user.keyboard(" ");
  expect(secondCard.getAttribute("aria-label")).toMatch(/^열린 카드: /);

  // 비교가 끝나면 두 카드는 맞춤 유지 또는 다시 가려진 상태가 된다.
  await waitFor(
    () => {
      expect(
        /^짝 맞춤: |^뒤집지 않은 카드$/.test(
          secondCard.getAttribute("aria-label") ?? "",
        ),
      ).toBe(true);
    },
    { timeout: 2000 },
  );

  // 퀴즈: 홈으로 돌아가 Enter로 시작, Tab으로 보기 선택, Enter로 다음 문제.
  await user.click(screen.getByRole("button", { name: "학습 선택" }));
  screen.getByTestId("start-quiz").focus();
  await user.keyboard("{Enter}");
  await waitFor(() => {
    expect(document.activeElement?.textContent).toContain(
      "알맞은 음훈을 골라요",
    );
  });

  await user.tab();
  const firstChoice = document.activeElement as HTMLButtonElement;
  expect(firstChoice.getAttribute("data-testid")).toBe("quiz-choice-0");
  await user.keyboard("{Enter}");

  // 응답 후 포커스는 다음 버튼으로 이동하고 Enter로 다음 문제로 넘어간다.
  const nextButton = screen.getByTestId("quiz-next") as HTMLButtonElement;
  await waitFor(() => {
    expect(document.activeElement).toBe(nextButton);
  });
  await user.keyboard("{Enter}");
  await waitFor(() => {
    expect(screen.getByText("2/6")).toBeTruthy();
  });
});

test("손상된 저장값에서도 홈이 기본 상태로 렌더된다", async () => {
  window.localStorage.setItem(PROGRESS_STORAGE_KEY, "{잘못된 JSON");
  render(<HanjaApp entries={entries} />);

  expect(await screen.findByTestId("progress-empty")).toBeTruthy();
  expect(await screen.findByText("완료한 학습 0회")).toBeTruthy();
  expect(screen.getByTestId("app-home")).toBeTruthy();
});

test("재방문 시 최근 점수·마지막 범위·완료 횟수가 표시되고 범위가 복원된다", async () => {
  window.localStorage.setItem(
    PROGRESS_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      selectedGrade: "준6급",
      matching: { completedGames: 3, matchedPairs: 18 },
      quiz: { completedGames: 2, correctAnswers: 15, totalQuestions: 20 },
      recentRecords: [
        {
          id: "quiz:demo-1",
          mode: "quiz",
          grade: "준6급",
          completedAt: "2026-07-10T09:00:00.000Z",
          correct: 8,
          total: 10,
        },
      ],
    }),
  );
  render(<HanjaApp entries={entries} />);

  const summary = await screen.findByTestId("recent-summary");
  expect(summary.textContent).toContain("4지선다 8/10");
  expect(summary.textContent).toContain("마지막 학습 범위");
  expect(summary.textContent).toContain("준6급");
  expect(await screen.findByText("완료한 학습 5회")).toBeTruthy();

  // 마지막에 선택한 범위가 복원된다.
  await waitFor(() => {
    expect(
      screen
        .getByRole("button", { name: "준6급" })
        .getAttribute("aria-pressed"),
    ).toBe("true");
  });
});
