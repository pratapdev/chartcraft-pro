import { createClient } from "@libsql/client";

async function checkDb() {
  const client = createClient({
    url: "file:../../local.db",
  });

  try {
    const trendlines = await client.execute("SELECT * FROM trendlines");
    const alerts = await client.execute("SELECT * FROM chart_alerts");
    const state = await client.execute("SELECT * FROM chart_state");

    const layouts = await client.execute("SELECT * FROM chart_layouts");
    const watchlist = await client.execute("SELECT * FROM tracker_watchlist");
    const entries = await client.execute("SELECT * FROM tracker_entries");
    
    console.log("--- DATABASE CONTENT ---");
    console.log("Trendlines:", trendlines.rows.length);
    trendlines.rows.forEach(r => console.log(` - ID: ${r.id}, Symbol: ${r.symbol}`));
    
    console.log("Alerts:", alerts.rows.length);
    alerts.rows.forEach(r => console.log(` - ID: ${r.id}, Condition: ${r.condition}`));

    console.log("Layouts:", layouts.rows.length);
    layouts.rows.forEach(r => console.log(` - ID: ${r.id}, Name: ${r.name}`));

    console.log("Current State:", state.rows[0]?.symbol || "Empty");
    console.log("------------------------");

  } catch (err) {
    console.error("Error reading database:", err);
  }
}

checkDb();
