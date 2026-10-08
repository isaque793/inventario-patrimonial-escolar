/**
 * Compara o banco apontado pelo DATABASE_URL com o drizzle/schema.ts e lista
 * tabelas e colunas que estão faltando. Só lê, não altera nada.
 *
 *   pnpm tsx scripts/checkDatabase.ts
 *
 * Para criar o que falta: pnpm drizzle-kit push
 */
import "dotenv/config";
import { is } from "drizzle-orm";
import { MySqlTable, getTableConfig } from "drizzle-orm/mysql-core";
import mysql from "mysql2/promise";
import * as schema from "../drizzle/schema";

async function main() {
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

  try {
    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT TABLE_NAME AS tableName, COLUMN_NAME AS columnName FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ?",
      [database],
    );
    const existing = new Map<string, Set<string>>();
    for (const row of rows) {
      if (!existing.has(row.tableName)) existing.set(row.tableName, new Set());
      existing.get(row.tableName)!.add(row.columnName);
    }

    console.log(`\nBanco: ${database} em ${url.hostname}\n`);
    let problems = 0;
    for (const value of Object.values(schema)) {
      if (!is(value, MySqlTable)) continue;
      const config = getTableConfig(value);
      const columns = existing.get(config.name);
      if (!columns) {
        console.log(`✖ ${config.name}: TABELA NÃO EXISTE`);
        problems += 1;
        continue;
      }
      const missing = config.columns.map(column => column.name).filter(name => !columns.has(name));
      if (missing.length) {
        console.log(`✖ ${config.name}: faltam colunas ${missing.join(", ")}`);
        problems += 1;
      } else {
        console.log(`✔ ${config.name}`);
      }
    }

    console.log(problems ? `\n${problems} tabela(s) com problema. Rode: pnpm drizzle-kit push\n` : "\nTudo certo: o banco tem todas as tabelas e colunas do schema.\n");
  } finally {
    await connection.end();
  }
}

main().catch(error => {
  console.error("\n✖ Erro ao verificar o banco:", error instanceof Error ? error.message : error);
  process.exit(1);
});
