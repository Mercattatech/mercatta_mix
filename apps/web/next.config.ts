import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pacotes do monorepo são TypeScript puro: o Next precisa compilá-los.
  transpilePackages: ["@mercatta/core", "@mercatta/server"],
  // Bibliotecas de servidor que não devem ser empacotadas.
  serverExternalPackages: ["pg", "pg-boss"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
