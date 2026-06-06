import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import database from "../config/database.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function migrate() {
  const schemaPath = path.join(__dirname, "schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");
  await database.exec(schema);

  const columns = await database.all("PRAGMA table_info(analyses)");
  const hasMarketAuthority = columns.some((col) => col.name === "market_authority_score");
  if (!hasMarketAuthority) {
    await database.run("ALTER TABLE analyses ADD COLUMN market_authority_score INTEGER NOT NULL DEFAULT 0");
  }

  await database.exec(`
    CREATE TABLE IF NOT EXISTS leads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      analysis_id INTEGER,
      domain TEXT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      role TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at);
  `);

  const leadCols = await database.all("PRAGMA table_info(leads)");
  if (!leadCols.some((c) => c.name === "email")) {
    await database.run("ALTER TABLE leads ADD COLUMN email TEXT");
  }
}

const argPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
const isMain = argPath && (path.resolve(__filename) === argPath || argPath.endsWith('migrate.js'));
if (isMain) {
  migrate()
    .then(() => {
      console.log("Migratia SQLite a fost rulata cu succes.");
      process.exit(0);
    })
    .catch((error) => {
      console.error("Migratia SQLite a esuat:", error);
      process.exit(1);
    });
}

export default migrate;
