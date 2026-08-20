import { defineConfig } from 'drizzle-kit';

import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

export default defineConfig({
	dialect: 'turso',
	schema: './migrations/schema.ts',
	out: './migrations-folder',
	dbCredentials: {
		url: process.env.TURSO_DATABASE_URL!,
		authToken: process.env.TURSO_AUTH_TOKEN!
	}
});
