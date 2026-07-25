import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Ships a self-contained server bundle with only the deps it actually uses,
  // so the runtime image does not need node_modules or a package install.
  output: "standalone",
};

export default nextConfig;
