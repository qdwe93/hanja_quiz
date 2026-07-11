import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test } from "vitest";

import { HanjaApp } from "../components/HanjaApp";
import { PROGRESS_STORAGE_KEY } from "../lib/storage";
import type { HanjaEntry, HanjaGrade } from "../lib/types";

function makeEntries(): HanjaEntry[] {
  const counts: Array<[HanjaGrade, number]> = [
    ["7급", 50],
    ["준6급", 75],
    ["6급", 75],
  ];
  let index = 0;
  return counts.flatMap(([grade, count]) =>
    Array.from({ length: count }, () => {
      index += 1;
      return {
        id: `hanja-${index}`,
        hanja: String.fromCodePoint(0x4e00 + index),
        eum: [`음${index}`],
        hun: [`뜻${index}`],
        eumhun: `뜻${index} 음${index}`,
        grade,
        source: "https://example.com/source",
        sourceLabel: `원문${index}`,
      };
    }),
  );
}

const entries = makeEntries();
const entryByHanja = new Map(entries.map((entry) => [entry.hanja, entry]));

function activeMatchGroups(): Map<string, HTMLButtonElement[]> {
  const groups = new Map<string, HTMLButtonElement[]>();
  screen.getAllByTestId(/^match-card-/).forEach((element) => {
    const button = element as HTMLButtonElement;
    const entryId = button.dataset.testid?.replace(/^match-card-/, "").replace(/:(hanja|eumhun)$/, "");
    if (!entryId) throw new Error("카드 ID가 없습니다.");
    groups.set(entryId, [...(groups.get(entryId) ?? []), button]);
  });
  return groups;
}

beforeEach(() => {
  window.localStorage.clear();
});

test("홈은 여덟 개의 25자 세트 선택기를 제공하고 선택한 세트를 저장한다", async () => {
  const user = userEvent.setup();
  render(<HanjaApp entries={entries} />);

  expect(screen.getAllByTestId(/^study-set-/)).toHaveLength(8);
  expect(screen.getByText(/선택한 범위/).textContent).toContain("7급 1세트");
  expect(screen.getByText(/선택한 범위/).textContent).toContain("25자");

  const setButton = screen.getByTestId("study-set-6급-3");
  await user.click(setButton);
  expect(setButton.getAttribute("aria-pressed")).toBe("true");
  expect(screen.getByText(/선택한 범위/).textContent).toContain("6급 3세트");

  const stored = JSON.parse(window.localStorage.getItem(PROGRESS_STORAGE_KEY) ?? "{}");
  expect(stored.selectedStudySet).toBe("6급-3");
});

test("짝맞추기는 앞면 열 장을 보여 주고 오답 흔들기와 정답 카드 교체를 수행한다", async () => {
  const user = userEvent.setup();
  render(<HanjaApp entries={entries} />);
  await user.click(screen.getByTestId("start-matching"));
  await screen.findByTestId("matching-screen");

  const initialCards = screen.getAllByTestId(/^match-card-/) as HTMLButtonElement[];
  expect(initialCards).toHaveLength(10);
  expect(initialCards.every((card) => card.getAttribute("aria-label")?.startsWith("카드: "))).toBe(true);
  const groups = activeMatchGroups();
  const pair = [...groups.values()].find((cards) => cards.length === 2);
  const outsider = [...groups.entries()].find(([entryId]) => entryId !== [...groups.entries()].find(([, cards]) => cards === pair)?.[0])?.[1][0];
  expect(pair).toBeTruthy();
  expect(outsider).toBeTruthy();

  await user.click(pair?.[0] as HTMLButtonElement);
  await user.click(outsider as HTMLButtonElement);
  expect(pair?.[0].getAttribute("data-state")).toBe("wrong");
  expect(pair?.[0].className).toContain("shake-effect");
  await waitFor(() => expect(pair?.[0].getAttribute("data-state")).toBe("idle"), { timeout: 1500 });

  const freshGroups = activeMatchGroups();
  const correctPair = [...freshGroups.values()].find((cards) => cards.length === 2);
  expect(correctPair).toBeTruthy();
  const removedId = correctPair?.[0].dataset.testid;
  await user.click(correctPair?.[0] as HTMLButtonElement);
  await user.click(correctPair?.[1] as HTMLButtonElement);
  expect(correctPair?.[0].getAttribute("data-state")).toBe("correct");
  await waitFor(() => {
    expect(screen.getAllByTestId(/^match-card-/)).toHaveLength(10);
    expect(screen.queryByTestId(removedId ?? "")).toBeNull();
  }, { timeout: 1500 });
});

test("퀴즈는 숫자 1~4 키로 응답하고 오답은 재선택, 정답은 자동 다음 문제로 처리한다", async () => {
  const user = userEvent.setup();
  render(<HanjaApp entries={entries} />);
  await user.click(screen.getByTestId("start-quiz"));
  await screen.findByTestId("quiz-screen");

  const firstHanja = screen.getByTestId("quiz-hanja").textContent ?? "";
  const entry = entryByHanja.get(firstHanja);
  expect(entry).toBeTruthy();
  const choices = [0, 1, 2, 3].map((index) => screen.getByTestId(`quiz-choice-${index}`) as HTMLButtonElement);
  const correctIndex = choices.findIndex((button) => button.textContent?.includes(entry?.eumhun ?? ""));
  const wrongIndex = [0, 1, 2, 3].find((index) => index !== correctIndex);
  expect(correctIndex).toBeGreaterThanOrEqual(0);
  expect(wrongIndex).toBeDefined();

  await user.keyboard(String((wrongIndex ?? 0) + 1));
  expect(choices[wrongIndex ?? 0].getAttribute("data-state")).toBe("wrong");
  expect(screen.getByRole("status").textContent).toContain("다시 골라");
  await waitFor(() => expect(choices[wrongIndex ?? 0].getAttribute("data-state")).toBe("idle"), { timeout: 1500 });
  expect(screen.getByTestId("quiz-hanja").textContent).toBe(firstHanja);

  await user.keyboard(String(correctIndex + 1));
  expect(choices[correctIndex].getAttribute("data-state")).toBe("correct");
  await waitFor(() => expect(screen.getByText("2/25")).toBeTruthy(), { timeout: 1500 });
});

test("손상된 저장값에서도 홈이 기본 상태로 렌더된다", async () => {
  window.localStorage.setItem(PROGRESS_STORAGE_KEY, "{잘못된 JSON");
  render(<HanjaApp entries={entries} />);
  expect(await screen.findByTestId("progress-empty")).toBeTruthy();
  expect(await screen.findByText("완료한 학습 0회")).toBeTruthy();
});

test("이전 급수 선택은 첫 세트로 이관된다", async () => {
  window.localStorage.setItem(
    PROGRESS_STORAGE_KEY,
    JSON.stringify({
      version: 1,
      selectedGrade: "준6급",
      matching: { completedGames: 3, matchedPairs: 18 },
      quiz: { completedGames: 2, correctAnswers: 15, totalQuestions: 20 },
      recentRecords: [],
    }),
  );
  render(<HanjaApp entries={entries} />);
  await waitFor(() => expect(screen.getByTestId("study-set-준6급-1").getAttribute("aria-pressed")).toBe("true"));
});
