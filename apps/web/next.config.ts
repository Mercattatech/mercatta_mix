import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { NextConfig } from "next";

// Um único .env na raiz do repositório serve ao site, ao worker e aos comandos de banco. Não sobrescreve variáveis já definidas (produção usa o ambiente).
const rootEnv = resolve(__dirname, "../../.env");
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

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
