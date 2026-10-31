import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // PGlite는 WASM 파일을 런타임에 읽으므로 번들하지 않고 Node.js require로 불러온다
  serverExternalPackages: ["@electric-sql/pglite"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
