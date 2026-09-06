import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  // ProjectQR lives inside the parent Portfolio repo, which carries its own
  // lockfile. Pin file tracing to this directory so the build does not walk up.
  outputFileTracingRoot: path.join(__dirname),
};

export default nextConfig;
