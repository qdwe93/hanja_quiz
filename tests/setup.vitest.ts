import { vi } from "vitest";

// jsdom은 스크롤을 구현하지 않으므로 화면 전환 시 호출되는
// window.scrollTo를 무해한 스텁으로 바꿉니다.
Object.defineProperty(window, "scrollTo", {
  value: vi.fn(),
  writable: true,
});

Object.defineProperty(HTMLMediaElement.prototype, "play", {
  configurable: true,
  value: vi.fn().mockResolvedValue(undefined),
});

Object.defineProperty(HTMLMediaElement.prototype, "pause", {
  configurable: true,
  value: vi.fn(),
});
