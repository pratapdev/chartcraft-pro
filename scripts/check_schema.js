import { createClient } from "@libsql/client";

async function check() {
  const client = createClient({ url: "file:local.db" });
  const res = await client.execute("SELECT sql FROM sqlite_master WHERE name='tracker_watchlist'");
  console.log('Schema:', res.rows[0]?.sql);
}
check();
