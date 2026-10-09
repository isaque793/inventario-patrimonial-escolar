import "dotenv/config";
import mysql from "mysql2/promise";
import { connectionOptionsFromUrl } from "../../server/schemaUpgrades";

/**
 * Abre uma conexão com o banco do DATABASE_URL (local sem SSL, Aiven com SSL).
 * Para usar outro arquivo de ambiente sem mexer no .env:
 *   PowerShell:  $env:DOTENV_CONFIG_PATH=".env.production"; pnpm tsx scripts/...
 */
export async function connectFromEnv() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL não está definido no .env.");
  const options = connectionOptionsFromUrl(databaseUrl);
  const connection = await mysql.createConnection(options);
  return { connection, database: options.database, host: options.host };
}

export type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
