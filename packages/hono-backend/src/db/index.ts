import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { cities } from './schema/cities'
import { feedback } from './schema/feedback'
import { lines, lineStations } from './schema/lines'
import { reports } from './schema/reports'
import { stations } from './schema/stations'

const connectionString = process.env.DATABASE_URL!

if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set')
}

export const client = postgres(connectionString, { prepare: false })

export const db = drizzle(client, {
    schema: { reports, stations, lines, lineStations, feedback, cities },
    casing: 'snake_case',
})

export type DbConnection = typeof db

// Export all schemas
export * from './schema/feedback'
export * from './schema/reports'
export * from './schema/lines'
export * from './schema/stations'
export * from './schema/cities'
