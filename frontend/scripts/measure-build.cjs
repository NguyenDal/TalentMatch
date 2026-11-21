// Measure the production entry assets, not source files or rounded build output.
// Run after `GENERATE_SOURCEMAP=false npm run build` from frontend/.
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const buildDirectory = path.resolve(__dirname, "../build");
const manifest = JSON.parse(fs.readFileSync(path.join(buildDirectory, "asset-manifest.json"), "utf8"));
const gzipLevel = 5; // Match the API server's GZipMiddleware configuration.
const assets = manifest.entrypoints.filter(file => /\.(js|css)$/.test(file)).map(file => {
  const bytes = fs.readFileSync(path.join(buildDirectory, file));
  return {
    file,
    type: file.endsWith(".js") ? "javascript" : "stylesheet",
    bytes: bytes.length,
    gzipBytes: zlib.gzipSync(bytes, { level: gzipLevel }).length,
  };
});
const total = files => files.reduce((sum, file) => ({
  bytes: sum.bytes + file.bytes,
  gzipBytes: sum.gzipBytes + file.gzipBytes,
}), { bytes: 0, gzipBytes: 0 });

console.log(JSON.stringify({
  nodeVersion: process.version,
  gzipLevel,
  sourceMaps: Object.keys(manifest.files).some(file => file.endsWith(".map")),
  assets,
  javascript: total(assets.filter(file => file.type === "javascript")),
  stylesheets: total(assets.filter(file => file.type === "stylesheet")),
  total: total(assets),
}, null, 2));
