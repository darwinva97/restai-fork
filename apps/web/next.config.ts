import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  reactCompiler: false,
  transpilePackages: ["@restai/ui", "@restai/validators", "@restai/types", "@restai/config"],
};

export default nextConfig;

// Habilita el contexto de Cloudflare (bindings, env) durante `next dev`.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
