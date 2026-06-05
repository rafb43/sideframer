import { defineConfig } from "vite";

// The b3nd npm packages are dnt-built (deno-to-node) and ship a node-only
// polyfills module (`_dnt.polyfills.js`) that imports `node:module` /
// `node:url` / `node:path`. None of those are needed in the browser:
// `import.meta.url` is native there, and we only consume the HTTP transport
// (no grpc / proto generation). Alias the polyfill to a no-op shim.

export default defineConfig({
  server: {
    port: 5173,
    // The b3nd-* packages are linked via `file:../b3nd-*` in package.json,
    // so their source lives outside this project root. Allow Vite to serve
    // from the parent workspace dir.
    fs: { allow: ["..", "."] },
  },
  resolve: {
    alias: [
      {
        find: /.*\/_dnt\.polyfills\.js$/,
        replacement: new URL("./src/shims/empty.js", import.meta.url).pathname,
      },
    ],
  },
});
