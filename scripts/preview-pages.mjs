// GitHub Pages 정적 산출물(dist/client)을 PAGES_BASE 하위 경로로 서빙하는
// 로컬 미리보기 서버입니다. 실제 Pages 경로와 같은 조건에서 확인할 때 씁니다.
//   PAGES_BASE=/hanja_quiz/ npm run build:pages
//   PAGES_BASE=/hanja_quiz/ npm run preview:pages
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../dist/client/", import.meta.url));
const base = (process.env.PAGES_BASE ?? "/").replace(/\/?$/, "/");
const port = Number(process.env.PORT ?? 4178);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (base !== "/" && !path.startsWith(base)) {
    res.writeHead(302, { location: base }).end();
    return;
  }
  let rel = path.slice(base.length);
  if (rel === "" || rel.endsWith("/")) rel += "index.html";
  const filePath = join(root, normalize(rel));
  try {
    const info = await stat(filePath);
    if (info.isDirectory()) throw new Error("dir");
    res.writeHead(200, {
      "content-type": TYPES[extname(filePath)] ?? "application/octet-stream",
    });
    createReadStream(filePath).pipe(res);
  } catch {
    res.writeHead(404, { "content-type": "text/html; charset=utf-8" });
    createReadStream(join(root, "404.html")).pipe(res);
  }
});

server.listen(port, () => {
  console.log(`Pages 미리보기: http://localhost:${port}${base}`);
});
