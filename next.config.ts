import type { NextConfig } from "next";

// Cache Components is off on purpose: almost every page is per-household,
// session-scoped data that changes live, so there is little to prerender.
const nextConfig: NextConfig = {
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
