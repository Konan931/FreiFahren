import { pgTable, serial, varchar } from 'drizzle-orm/pg-core'

/**
 * Stable city identity used by future city-scoped records.
 *
 * The numeric primary key is internal. `code` is the stable public key used by
 * configuration, URLs, and API payloads.
 */
export const cities = pgTable('cities', {
    id: serial().primaryKey(),
    code: varchar({ length: 50 }).notNull().unique('cities_code_unique'),
    name: varchar({ length: 100 }).notNull(),
})

export type City = typeof cities.$inferSelect
export type InsertCity = typeof cities.$inferInsert
