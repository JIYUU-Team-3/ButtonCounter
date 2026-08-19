import * as p from 'drizzle-orm/pg-core';

export const counts = p.pgTable('count', {
	id: p.serial().primaryKey(),
	count: p.integer()
});

export type InsertCount = typeof counts.$inferInsert;
export type SelectCount = typeof counts.$inferSelect;
