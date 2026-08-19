import * as t from 'drizzle-orm/sqlite-core';

export const counts = t.sqliteTable('counts', {
	id: t.integer().primaryKey({ autoIncrement: true }),
	count: t.integer().notNull().default(0)
});

export type InsertCount = typeof counts.$inferInsert;
export type SelectCount = typeof counts.$inferSelect;
