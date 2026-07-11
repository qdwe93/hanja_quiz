/** 빌드 도구가 GitHub Pages의 base 경로까지 반영하는 음원 URL입니다. */
export const GAMEPLAYING_AUDIO_URL = new URL(
  "../asset/gameplaying.wav",
  import.meta.url,
).href;

export const ENDING_AUDIO_URL = new URL("../asset/ending.wav", import.meta.url)
  .href;

const RIGHT_AUDIO_URLS = [
  new URL("../asset/right1.wav", import.meta.url).href,
  new URL("../asset/right2.wav", import.meta.url).href,
  new URL("../asset/right3.wav", import.meta.url).href,
] as const;

const WRONG_AUDIO_URLS = [
  new URL("../asset/wrong1.wav", import.meta.url).href,
  new URL("../asset/wrong2.wav", import.meta.url).href,
] as const;

export function randomRightAudioUrl(rng: () => number = Math.random): string {
  return randomAudioUrl(RIGHT_AUDIO_URLS, rng);
}

export function randomWrongAudioUrl(rng: () => number = Math.random): string {
  return randomAudioUrl(WRONG_AUDIO_URLS, rng);
}

function randomAudioUrl(
  urls: readonly string[],
  rng: () => number,
): string {
  const value = rng();
  if (!Number.isFinite(value) || value < 0 || value >= 1) {
    return urls[0];
  }
  return urls[Math.floor(value * urls.length)] ?? urls[0];
}
