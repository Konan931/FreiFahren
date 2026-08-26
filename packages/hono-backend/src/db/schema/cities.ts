import { pgTable, text, jsonb, boolean, timestamp, serial, unique, index, integer } from 'drizzle-orm/pg-core'

/**
 * Cities table - Stores configuration for each supported city
 * Each city has its own transit network, reporting channels, and preferences
 */
export const cities = pgTable(
    'cities',
    {
        id: serial().primaryKey(),
        
        // Unique identifier for the city (e.g., 'berlin', 'munich')
        code: text().notNull().unique(),
        
        // Display name (e.g., 'Berlin', 'München')
        name: text().notNull(),
        
        // ISO 3166-1 alpha-2 country code (e.g., 'DE', 'FR', 'ES')
        country: text().notNull(),
        
        // Primary language for this city (e.g., 'de', 'fr', 'es')
        language: text().notNull().default('de'),
        
        // IANA timezone identifier (e.g., 'Europe/Berlin')
        timezone: text().notNull(),
        
        // Transit authority/provider name(s)
        transitProvider: text().notNull(),
        
        // OpenStreetMap line relation IDs
        // Format: { "U1": 2669205, "U2": 2669184, ... }
        // Used for fetching transit line geometry from OSM
        osmLineRelations: jsonb().notNull(),
        
        // Geographic boundaries for the city
        // Used to validate report coordinates
        bounds: jsonb().notNull().$type<{
            north: number
            south: number
            east: number
            west: number
        }>(),
        
        // Community communication channels
        telegramGroupUrl: text(),
        redditUrl: text(),
        whatsappGroupUrl: text(),
        
        // Feature flags
        isActive: boolean().default(true),
        enableReports: boolean().default(true),
        enableNlp: boolean().default(true),
        
        // Metadata for city management
        description: text(),
        
        // Timestamps
        createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
        updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    },
    (table) => ({
        codeIdx: unique('cities_code_unique').on(table.code),
        countryIdx: index('cities_country_idx').on(table.country),
        activeIdx: index('cities_active_idx').on(table.isActive),
    })
)

export type City = typeof cities.$inferSelect
export type CreateCity = typeof cities.$inferInsert

/**
 * Type for city configuration sent from API
 * Used for validation and type safety
 */
export interface CityConfig {
    code: string
    name: string
    country: string
    language: string
    timezone: string
    transitProvider: string
    osmLineRelations: Record<string, number>
    bounds: {
        north: number
        south: number
        east: number
        west: number
    }
    telegramGroupUrl?: string
    redditUrl?: string
    whatsappGroupUrl?: string
    description?: string
}

/**
 * Type for coordinates in geographic space
 */
export interface Coordinates {
    lat: number
    lng: number
}

/**
 * Type for city bounds
 */
export interface CityBounds {
    north: number
    south: number
    east: number
    west: number
}
