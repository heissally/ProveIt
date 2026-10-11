import path from "node:path";
import type { NextConfig } from "next";

// The website imports ../shared (the same signature check the tests use), so the
// build's root is the whole repo, not just web/. Next runs with web/ as its cwd.
const repoRoot = path.resolve(process.cwd(), "..");

const nextConfig: NextConfig = {
  turbopack: { root: repoRoot },
  outputFileTracingRoot: repoRoot,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" }, // never leak ?code= or challenge links
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
        ],
      },
    ];
  },
};

export default nextConfig;
