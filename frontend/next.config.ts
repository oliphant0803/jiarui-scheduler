import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pin the project root so Next doesn't mistake a parent-directory lockfile
  // for the workspace root.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
