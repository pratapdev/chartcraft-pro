import { drizzle } from "drizzle-orm/libsql";
import { createClient } from "@libsql/client";
import * as schema from "./schema";

// Initialize local SQLite database file via libsql
const client = createClient({
  url: process.env.DATABASE_URL || "file:local.db",
});

export const db = drizzle(client, { schema });

export * from "./schema";
