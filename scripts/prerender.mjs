// vinext 빌드가 만든 Worker의 SSR 결과로 정적 index.html을 생성합니다.
// GitHub Pages 프로젝트 사이트는 `/<repo>/` 하위 경로에서 서비스되므로
// 빌드 시 PAGES_BASE로 에셋 기준 경로(base)를 지정하고, 프리렌더는 그 결과를
// 그대로 저장합니다. 에셋 경로는 HTML·부트스트랩·RSC 주입 preload가 모두
// 같은 base를 쓰도록 빌드에서 baked-in 되므로 사후 치환이 필요 없습니다.
import { copyFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const clientDir = new URL("../dist/client/", import.meta.url);
const workerUrl = new URL("../dist/server/index.js", import.meta.url);
const base = process.env.PAGES_BASE ?? "/";

const { default: worker } = await import(workerUrl.href);

const response = await worker.fetch(
  new Request("http://localhost/", { headers: { accept: "text/html" } }),
  { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
  { waitUntil() {}, passThroughOnException() {} },
);

if (response.status !== 200) {
  throw new Error(`프리렌더 실패: 예상치 못한 상태 코드 ${response.status}`);
}

const html = await response.text();

// 하이드레이션 payload가 인라인에 없으면 정적 호스팅에서 서버를 다시 호출하며 깨진다.
if (!html.includes("self.__VINEXT_RSC_DONE__=true")) {
  throw new Error("인라인 RSC 페이로드가 없어 하이드레이션이 실패할 수 있습니다.");
}

// base가 지정됐다면 모든 에셋 참조가 그 base 아래에 있어야 한다.
// (base가 적용되지 않아 루트 절대 `/assets/`가 남으면 하위 경로에서 404가 난다.)
if (base !== "/" && /["'(]\/assets\//.test(html)) {
  throw new Error(
    `에셋 경로가 base(${base})를 따르지 않습니다. PAGES_BASE로 빌드했는지 확인하세요.`,
  );
}

const indexPath = new URL("index.html", clientDir);
await writeFile(indexPath, html, "utf8");

// 앱은 단일 경로지만, 잘못된 하위 경로 접근 시에도 앱 셸로 복귀하도록 404 폴백을 둔다.
await copyFile(indexPath, new URL("404.html", clientDir));

// Jekyll 처리를 비활성화해 `_headers` 등 밑줄 파일이 사라지지 않게 한다.
await writeFile(new URL(".nojekyll", clientDir), "", "utf8");

console.log(
  `정적 산출물 생성 완료 (base=${base}): ${fileURLToPath(indexPath)} (${html.length} bytes)`,
);
