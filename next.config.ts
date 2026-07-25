import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ships a self-contained server bundle with only the deps it actually uses,
  // so the runtime image does not need node_modules or a package install.
  output: "standalone",

  // A stray package-lock.json in the home directory makes Next infer the wrong
  // workspace root and warn on every build. Pin it to this project instead.
  turbopack: { root: path.resolve(process.cwd()) },
};

export default nextConfig;
