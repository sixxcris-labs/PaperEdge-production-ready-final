import path from "node:path";
import { fileURLToPath } from "node:url";

const appDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(appDir, "../..");

/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@paperedge/core", "@paperedge/database"],
  turbopack: {
    root: repoRoot,
  },
};

export default nextConfig;
