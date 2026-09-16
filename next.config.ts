import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // Pin the project root explicitly: a stray package.json/package-lock.json
  // in the user's home directory (an ancestor of this repo on this machine)
  // otherwise makes Turbopack's root inference ambiguous.
  turbopack: {
    root: path.join(__dirname),
  },
};

export default nextConfig;
