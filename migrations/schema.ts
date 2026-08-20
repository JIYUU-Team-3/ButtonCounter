import * as p from 'drizzle-orm/sqlite-core';

export const counts = p.sqliteTable('counts', {
	id: p.integer().primaryKey({ autoIncrement: true }),
	count: p.integer().notNull().default(0)
});

export type InsertCount = typeof counts.$inferInsert;
export type SelectCount = typeof counts.$inferSelect;
