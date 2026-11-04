import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  // The add-item API reads the sheet copy to keep barcodes and item numbers unique; bundle it with that function.
  outputFileTracingIncludes: {
    "/api/items": ["./public/data/items.json"],
  },
  partialPrefetching: true,
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
