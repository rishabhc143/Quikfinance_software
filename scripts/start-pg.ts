import EmbeddedPostgres from "embedded-postgres";
import path from "node:path";
import fs from "node:fs";

const DATA_DIR = path.resolve(process.cwd(), ".pgdata");
const PORT = 54329;
const USER = "qf";
const PASSWORD = "qf";
const DB = "quikfinance";

async function main() {
  const fresh = !fs.existsSync(DATA_DIR);
  const pg = new EmbeddedPostgres({
    databaseDir: DATA_DIR,
    user: USER,
    password: PASSWORD,
    port: PORT,
    persistent: true,
  });

  if (fresh) {
    console.log("[pg] initializing fresh cluster at", DATA_DIR);
    await pg.initialise();
  }

  await pg.start();
  console.log(`[pg] running on 127.0.0.1:${PORT}`);

  if (fresh) {
    await pg.createDatabase(DB);
    console.log("[pg] database created:", DB);
  }

  // Block forever; this script is run via tsx in the background.
  process.stdin.resume();
  process.on("SIGINT", async () => { await pg.stop(); process.exit(0); });
  process.on("SIGTERM", async () => { await pg.stop(); process.exit(0); });
}

main().catch((e) => {
  console.error("[pg] failed:", e);
  process.exit(1);
});
