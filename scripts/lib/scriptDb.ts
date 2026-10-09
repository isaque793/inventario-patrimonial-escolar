import "dotenv/config";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import mysql from "mysql2/promise";
import { connectionOptionsFromUrl } from "../../server/schemaUpgrades";

/**
 * Abre uma conexão com o banco do DATABASE_URL (local sem SSL, Aiven com SSL).
 * Para usar outro arquivo de ambiente sem mexer no .env:
 *   PowerShell:  $env:DOTENV_CONFIG_PATH=".env.production"; pnpm tsx scripts/...
 */
export async function connectFromEnv() {
  const envFile = process.env.DOTENV_CONFIG_PATH;
  if (envFile && !existsSync(resolve(envFile))) {
    throw new Error(
      `O arquivo ${envFile} (indicado em DOTENV_CONFIG_PATH) não existe em ${process.cwd()}. ` +
        `Crie-o com a linha DATABASE_URL=... ou rode "Remove-Item Env:DOTENV_CONFIG_PATH" para usar o .env.`,
    );
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error(`DATABASE_URL não está definido em ${envFile ?? ".env"}.`);
  const options = connectionOptionsFromUrl(databaseUrl);
  const connection = await mysql.createConnection(options);
  return { connection, database: options.database, host: options.host };
}

export type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
