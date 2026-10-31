import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // 샘플 시연(/api/demo)이 samples/ 폴더 파일을 읽는다. 배포할 때도 함께 올라가게 한다.
  outputFileTracingIncludes: {
    "/api/demo": ["./samples/**/*"],
  },
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
