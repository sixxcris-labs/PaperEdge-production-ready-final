/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@paperedge/core", "@paperedge/database"],
  turbopack: {
    root: process.cwd(),
  },
};

export default nextConfig;
