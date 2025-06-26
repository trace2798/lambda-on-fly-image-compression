
import 'dotenv/config';      
import { createClient } from '@libsql/client/web';
import { drizzle } from 'drizzle-orm/libsql/web';
import * as schema from './schema';

if (!process.env.TURSO_DATABASE_URL || !process.env.TURSO_AUTH_TOKEN) {
  throw new Error('TURSO_DATABASE_URL or TURSO_AUTH_TOKEN is not defined');
}
console.log("TURSO DB:", process.env.TURSO_DATABASE_URL, "TURSO UTH:", process.env.TURSO_AUTH_TOKEN)

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

export const db = drizzle(client, { schema });
