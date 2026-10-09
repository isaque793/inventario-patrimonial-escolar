import "dotenv/config";
import mysql from "mysql2/promise";

/** Abre uma conexão com o banco do DATABASE_URL (local sem SSL, Aiven com SSL). */
export async function connectFromEnv() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL não está definido no .env.");
  const url = new URL(databaseUrl);
  const database = url.pathname.replace(/^\//, "");
  const isLocal = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  const connection = await mysql.createConnection({
    host: url.hostname,
    port: Number(url.port || 3306),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    ...(isLocal ? {} : { ssl: { rejectUnauthorized: false } }),
  });
  return { connection, database, host: url.hostname };
}

export type { RowDataPacket, ResultSetHeader } from "mysql2/promise";
