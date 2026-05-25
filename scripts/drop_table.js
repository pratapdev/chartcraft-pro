import { createClient } from "@libsql/client";

async function migrate() {
  const client = createClient({ url: "file:local.db" });
  console.log('Dropping old tracker_watchlist table...');
  try {
    await client.execute("DROP TABLE IF EXISTS tracker_watchlist");
    console.log('Success.');
  } catch (e) {
    console.error('Failed to drop table:', e);
  }
}
migrate();
