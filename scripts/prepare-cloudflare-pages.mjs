import {
  cp,
  copyFile,
  mkdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";

const distDir = new URL("../dist/", import.meta.url);
const clientDir = new URL("client/", distDir);
const serverDir = new URL("server/", distDir);
const workerDir = new URL("_worker.js/", distDir);
const wranglerPath = new URL("wrangler.json", serverDir);

await cp(clientDir, distDir, { recursive: true, force: true });
await rm(workerDir, { recursive: true, force: true });
await mkdir(workerDir, { recursive: true });
await copyFile(new URL("entry.mjs", serverDir), new URL("entry.mjs", workerDir));
await copyFile(
  new URL("virtual_astro_middleware.mjs", serverDir),
  new URL("virtual_astro_middleware.mjs", workerDir),
);
await cp(new URL("chunks/", serverDir), new URL("chunks/", workerDir), {
  recursive: true,
});
await writeFile(
  new URL("index.js", workerDir),
  'export { default } from "./entry.mjs";\n',
  "utf8",
);

const wranglerConfig = JSON.parse(await readFile(wranglerPath, "utf8"));

// Pages provides ASSETS itself and rejects an explicit binding with that name.
delete wranglerConfig.assets;
delete wranglerConfig.no_bundle;

if (Array.isArray(wranglerConfig.kv_namespaces)) {
  wranglerConfig.kv_namespaces = wranglerConfig.kv_namespaces.filter(
    ({ binding }) => binding !== "SESSION",
  );
}

if (Array.isArray(wranglerConfig.previews?.kv_namespaces)) {
  wranglerConfig.previews.kv_namespaces =
    wranglerConfig.previews.kv_namespaces.filter(
      ({ binding }) => binding !== "SESSION",
    );
}

await writeFile(wranglerPath, JSON.stringify(wranglerConfig), "utf8");
