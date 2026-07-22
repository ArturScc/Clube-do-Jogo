import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep `next build` isolated from the long-running local preview. The dev
  // directory stays standard so Tailwind's automatic scanner ignores it.
  distDir: process.env.NODE_ENV === "production" ? ".next-build" : ".next",
};

export default nextConfig;
