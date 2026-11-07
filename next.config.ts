import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Preserve the team's shared instructions when starting the dev server.
  agentRules: false,
};

export default nextConfig;
