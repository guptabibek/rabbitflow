import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  experimental: {
    cpus: 1,
  },
  reactStrictMode: true,
  turbopack: {
    root: process.cwd(),
    resolveExtensions: ['.tsx', '.ts', '.jsx', '.js', '.json'],
  },
};

export default nextConfig;
