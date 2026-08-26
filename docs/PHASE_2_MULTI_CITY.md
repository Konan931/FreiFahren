# Phase 2: Multi-City Configuration System

## Overview

This guide walks you through implementing multi-city support in FreiFahren. By the end, you'll be able to:

- ✅ Add new cities through a configuration system
- ✅ Support multiple transit networks with different line/station data
- ✅ Switch between cities in the frontend
- ✅ Scale to Germany, then Europe, then the world

**Estimated Effort:** 12-16 hours (can be split across 3-4 PRs)

**Impact:** Enables expansion to every major city on Earth

---

## Architecture Overview

### Current State (Berlin-Only)

```
Frontend → Backend API (hardcoded Berlin data) → PostgreSQL
                ↓
          NLP Service (German only)
          Moderation Service
          Risk Model
```

**Problem:** All city data is hardcoded. Adding a new city requires code changes in multiple places.

### Target State (Multi-City)

```
Frontend (with city selector) 
    ↓
Backend API (reads city config) ← Database (stores configs)
    ↓
Transit Data Service (loads OSM data per city)
    ↓
NLP Service (multilingual, city-aware)
Moderation Service
Risk Model (per-city risk calculations)
```

**Solution:** Cities are configured in the database and can be managed without code changes.

---

## Phase 2 Implementation Plan

### Task 1: Create City Configuration Schema (2-3 hours)

**Goal:** Add database tables and TypeScript types for cities

#### 1.1 Create City Schema

```bash
cd packages/hono-backend
```

Create `src/db/schema/cities.ts`:

```typescript
import { pgTable, text, jsonb, boolean, timestamp, serial, unique } from 'drizzle-orm/pg-core'

export const cities = pgTable(
    'cities',
    {
        id: serial().primaryKey(),
        code: text().notNull().unique(), // 'berlin', 'munich', 'paris'
        name: text().notNull(), // 'Berlin', 'München', 'Paris'
        country: text().notNull(), // 'DE', 'DE', 'FR'
        language: text().notNull().default('de'), // Primary language
        timezone: text().notNull(), // 'Europe/Berlin'
        
        // Transit metadata
        transitProvider: text().notNull(), // 'BVG', 'MVG', 'SNCF'
        osmLineRelations: jsonb().notNull(), // { "U6": 2227744, "S1": 1929070 }
        
        // Geographic bounds (for validation)
        bounds: jsonb().notNull(), // { north: 52.67, south: 52.34, east: 13.76, west: 13.04 }
        
        // Reporting channels
        telegramGroupUrl: text(),
        redditUrl: text(),
        whatsappGroupUrl: text(),
        
        // Feature flags
        isActive: boolean().default(true),
        enableReports: boolean().default(true),
        enableNlp: boolean().default(true),
        
        // Metadata
        createdAt: timestamp().defaultNow(),
        updatedAt: timestamp().defaultNow(),
    },
    (table) => ({
        cityCodeIdx: unique().on(table.code), // Ensure unique city code
    })
)

export type City = typeof cities.$inferSelect
export type CreateCity = typeof cities.$inferInsert
```

#### 1.2 Update Database Index

In `src/db/index.ts`, add the new schema:

```typescript
import { cities } from './schema/cities'

export const db = drizzle(client, {
    schema: { reports, stations, lines, lineStations, feedback, cities }, // Add cities
    casing: 'snake_case',
})
```

#### 1.3 Generate Migration

```bash
bun run db:generate -- --name add_cities_table
bun run db:push
```

**Verify:** Check your database:
```bash
psql $DATABASE_URL -c "\dt" # Should see 'cities' table
```

---

### Task 2: Create City Service (2-3 hours)

**Goal:** Add business logic for city management

Create `src/modules/cities/cities-service.ts`:

```typescript
import { eq } from 'drizzle-orm'
import { DbConnection, cities } from '../../db'
import type { City, CreateCity } from '../../db/schema/cities'

export class CitiesService {
    constructor(private db: DbConnection) {}

    /**
     * Get all active cities
     */
    async getAllCities(): Promise<City[]> {
        return this.db
            .select()
            .from(cities)
            .where(sql`${cities.isActive} = true`)
    }

    /**
     * Get city by code (e.g., 'berlin')
     */
    async getCityByCode(code: string): Promise<City | null> {
        const result = await this.db
            .select()
            .from(cities)
            .where(eq(cities.code, code.toLowerCase()))
            .limit(1)

        return result[0] || null
    }

    /**
     * Create a new city
     */
    async createCity(cityData: CreateCity): Promise<City> {
        const result = await this.db.insert(cities).values(cityData).returning()
        return result[0]
    }

    /**
     * Update city configuration
     */
    async updateCity(code: string, updates: Partial<CreateCity>): Promise<City> {
        const result = await this.db
            .update(cities)
            .set({ ...updates, updatedAt: new Date() })
            .where(eq(cities.code, code.toLowerCase()))
            .returning()

        if (!result[0]) throw new Error(`City ${code} not found`)
        return result[0]
    }

    /**
     * Validate city bounds (check if coordinates are within city)
     */
    validateCoordinatesInBounds(cityCode: string, lat: number, lng: number): boolean {
        // Implementation in next section
        return true
    }

    /**
     * Get OSM line relation ID for a line in a city
     */
    getOsmLineRelationId(city: City, lineId: string): number | null {
        const relations = city.osmLineRelations as Record<string, number>
        return relations[lineId] || null
    }
}
```

Create `src/modules/cities/index.ts`:

```typescript
export * from './cities-service'
export * from './cities-routes'
export * from './cities-types'
```

Create `src/modules/cities/cities-types.ts`:

```typescript
import { z } from 'zod'

// Validation schema for creating a city
export const createCitySchema = z.object({
    code: z.string().toLowerCase().min(2).max(50),
    name: z.string().min(1).max(100),
    country: z.string().length(2), // ISO 3166-1 alpha-2
    language: z.string().default('de'),
    timezone: z.string(),
    transitProvider: z.string(),
    osmLineRelations: z.record(z.string(), z.number()),
    bounds: z.object({
        north: z.number(),
        south: z.number(),
        east: z.number(),
        west: z.number(),
    }),
    telegramGroupUrl: z.string().url().optional(),
    redditUrl: z.string().url().optional(),
    whatsappGroupUrl: z.string().url().optional(),
})

export type CreateCityInput = z.infer<typeof createCitySchema>
```

---

### Task 3: Create City API Routes (2-3 hours)

**Goal:** Expose city management via REST API

Create `src/modules/cities/cities-routes.ts`:

```typescript
import { createRoute, z } from '@hono/zod-validator'
import { Hono } from 'hono'
import type { Env } from '../../app-env'
import { CitiesService } from './cities-service'
import { createCitySchema } from './cities-types'

export const citiesRouter = new Hono<Env>()

/**
 * GET /api/cities
 * List all active cities
 */
export const getCities = createRoute({
    method: 'get',
    path: '/api/cities',
    responses: {
        200: {
            description: 'List of all active cities',
            content: {
                'application/json': {
                    schema: z.array(z.object({
                        id: z.number(),
                        code: z.string(),
                        name: z.string(),
                        country: z.string(),
                        language: z.string(),
                        timezone: z.string(),
                        transitProvider: z.string(),
                    })),
                },
            },
        },
    },
})

citiesRouter.get('/api/cities', async (c) => {
    const citiesService = new CitiesService(c.var.db)
    const allCities = await citiesService.getAllCities()
    
    return c.json(allCities.map(city => ({
        id: city.id,
        code: city.code,
        name: city.name,
        country: city.country,
        language: city.language,
        timezone: city.timezone,
        transitProvider: city.transitProvider,
    })))
})

/**
 * GET /api/cities/:code
 * Get a specific city by code
 */
export const getCityByCode = createRoute({
    method: 'get',
    path: '/api/cities/:code',
    responses: {
        200: {
            description: 'City details',
            content: {
                'application/json': {
                    schema: z.object({
                        id: z.number(),
                        code: z.string(),
                        name: z.string(),
                        // ... full city object
                    }),
                },
            },
        },
        404: {
            description: 'City not found',
        },
    },
})

citiesRouter.get('/api/cities/:code', async (c) => {
    const code = c.req.param('code')
    const citiesService = new CitiesService(c.var.db)
    const city = await citiesService.getCityByCode(code)

    if (!city) {
        return c.json({ error: `City ${code} not found` }, 404)
    }

    return c.json(city)
})

/**
 * POST /api/cities
 * Create a new city (admin only)
 */
export const createCity = createRoute({
    method: 'post',
    path: '/api/cities',
    request: {
        body: {
            content: {
                'application/json': {
                    schema: createCitySchema,
                },
            },
        },
    },
    responses: {
        201: {
            description: 'City created',
            content: {
                'application/json': {
                    schema: z.object({
                        id: z.number(),
                        code: z.string(),
                    }),
                },
            },
        },
        400: {
            description: 'Invalid city data',
        },
    },
})

citiesRouter.post('/api/cities', async (c) => {
    const citiesService = new CitiesService(c.var.db)
    const body = await c.req.json()

    // Validate request
    const validation = createCitySchema.safeParse(body)
    if (!validation.success) {
        return c.json({ error: 'Invalid city data', details: validation.error }, 400)
    }

    const city = await citiesService.createCity(validation.data)
    return c.json({ id: city.id, code: city.code }, 201)
})

/**
 * PUT /api/cities/:code
 * Update city configuration (admin only)
 */
citiesRouter.put('/api/cities/:code', async (c) => {
    const code = c.req.param('code')
    const citiesService = new CitiesService(c.var.db)
    const updates = await c.req.json()

    // Partial validation (allow partial updates)
    const city = await citiesService.updateCity(code, updates)
    return c.json({ success: true, city })
})
```

Update `src/index.ts` to register the cities router:

```typescript
import { citiesRouter } from './modules/cities/cities-routes'

registerRoutes(app, [
    getCities,
    getCityByCode,
    createCity,
    // ... existing routes
])

app.route('/', citiesRouter)
```

---

### Task 4: Add City Context to Reports (2-3 hours)

**Goal:** Tie reports to cities; ensure NLP respects city boundaries

Update `src/db/schema/reports.ts` to add city reference:

```typescript
export const reports = pgTable(
    'reports',
    {
        id: serial().primaryKey(),
        cityId: integer()
            .notNull()
            .references(() => cities.id), // Link to city
        lineId: text().notNull(),
        stationId: text(),
        // ... rest of schema
    }
)
```

Create migration:

```bash
bun run db:generate -- --name add_city_id_to_reports
bun run db:push
```

Update `src/modules/reports/reports-service.ts`:

```typescript
export class ReportsService {
    constructor(private db: DbConnection, private citiesService: CitiesService) {}

    /**
     * Create a new report for a specific city
     */
    async createReport(cityCode: string, reportData: CreateReportInput): Promise<Report> {
        // Get city
        const city = await this.citiesService.getCityByCode(cityCode)
        if (!city) throw new Error(`City ${cityCode} not found`)

        // Validate coordinates are in city bounds
        if (reportData.coordinates) {
            const inBounds = this.validateCoordinatesInBounds(
                city.bounds,
                reportData.coordinates.lat,
                reportData.coordinates.lng
            )
            if (!inBounds) {
                throw new Error('Coordinates outside city bounds')
            }
        }

        // Create report tied to city
        const report = await this.db.insert(reports).values({
            ...reportData,
            cityId: city.id,
        }).returning()

        return report[0]
    }

    /**
     * Get reports for a specific city
     */
    async getReportsByCity(cityCode: string, limit = 50): Promise<Report[]> {
        const city = await this.citiesService.getCityByCode(cityCode)
        if (!city) return []

        return this.db
            .select()
            .from(reports)
            .where(eq(reports.cityId, city.id))
            .limit(limit)
    }

    private validateCoordinatesInBounds(
        bounds: { north: number; south: number; east: number; west: number },
        lat: number,
        lng: number
    ): boolean {
        return (
            lat >= bounds.south &&
            lat <= bounds.north &&
            lng >= bounds.west &&
            lng <= bounds.east
        )
    }
}
```

---

### Task 5: Seed Initial Cities (1-2 hours)

**Goal:** Add Berlin and other German cities to the database

Create `src/db/seed/cities.ts`:

```typescript
import { cities } from '../schema/cities'
import { db } from '../index'

export const seedCities = async () => {
    const citiesToInsert = [
        {
            code: 'berlin',
            name: 'Berlin',
            country: 'DE',
            language: 'de',
            timezone: 'Europe/Berlin',
            transitProvider: 'BVG, S-Bahn Berlin',
            osmLineRelations: {
                'U1': 2669205, 'U2': 2669184, 'U3': 2669208, 'U4': 2676945,
                'U5': 2227744, 'U6': 2679164, 'U7': 2678986, 'U8': 2679014,
                'U9': 2679017, 'S1': 1929070, 'S2': 2269238, 'S3': 2343465,
                'S5': 2015959, 'S7': 2017023, 'S8': 2269252, 'S9': 2389946,
                'S25': 2422951, 'S26': 7794031, 'S41': 14981, 'S42': 14983,
                'S46': 2422929, 'S47': 2413846, 'S75': 2174798, 'S85': 2979451,
            },
            bounds: {
                north: 52.67,
                south: 52.34,
                east: 13.76,
                west: 13.04,
            },
            telegramGroupUrl: 'https://t.me/freifahren_BE',
            isActive: true,
            enableReports: true,
            enableNlp: true,
        },
        {
            code: 'munich',
            name: 'München',
            country: 'DE',
            language: 'de',
            timezone: 'Europe/Berlin',
            transitProvider: 'MVG',
            osmLineRelations: {
                'U1': 3140640, 'U2': 3140641, 'U3': 3140642, 'U4': 3140643,
                'U5': 3140644, 'U6': 3140645, 'S1': 5681, 'S2': 5682,
                // ... add more Munich lines
            },
            bounds: {
                north: 48.27,
                south: 48.08,
                east: 11.73,
                west: 11.39,
            },
            telegramGroupUrl: 'https://t.me/freifahren_MUC', // hypothetical
            isActive: true,
            enableReports: true,
            enableNlp: true,
        },
    ]

    for (const cityData of citiesToInsert) {
        await db.insert(cities).values(cityData).onConflictDoNothing()
    }

    console.log('✅ Cities seeded successfully')
}
```

Update `src/db/seed/index.ts`:

```typescript
import { seedCities } from './cities'

async function seed() {
    console.log('Starting seed...')
    await seedCities()
    console.log('✅ Seed completed!')
    process.exit(0)
}

seed().catch((err) => {
    console.error('❌ Seed failed:', err)
    process.exit(1)
})
```

Run seed:

```bash
bun run db:seed
```

---

### Task 6: Update Frontend to Support City Selection (3-4 hours)

**Goal:** Add city selector and update API calls

Create `packages/frontend/src/hooks/useCities.ts`:

```typescript
import { useQuery } from '@tanstack/react-query'
import type { City } from '../types/city'

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080'

export function useCities() {
    return useQuery<City[]>({
        queryKey: ['cities'],
        queryFn: async () => {
            const response = await fetch(`${API_BASE}/api/cities`)
            if (!response.ok) throw new Error('Failed to fetch cities')
            return response.json()
        },
        staleTime: 1000 * 60 * 60, // 1 hour
    })
}

export function useCity(code: string) {
    return useQuery<City>({
        queryKey: ['city', code],
        queryFn: async () => {
            const response = await fetch(`${API_BASE}/api/cities/${code}`)
            if (!response.ok) throw new Error(`City ${code} not found`)
            return response.json()
        },
        enabled: !!code,
    })
}
```

Create `packages/frontend/src/types/city.ts`:

```typescript
export interface City {
    id: number
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
}
```

Create `packages/frontend/src/components/CitySelector.tsx`:

```typescript
import React, { useState, useEffect } from 'react'
import { useCities } from '../hooks/useCities'
import type { City } from '../types/city'

interface CitySelectorProps {
    selectedCity: string | null
    onCityChange: (cityCode: string) => void
}

export const CitySelector: React.FC<CitySelectorProps> = ({
    selectedCity,
    onCityChange,
}) => {
    const { data: cities, isLoading, error } = useCities()

    if (isLoading) return <div>Loading cities...</div>
    if (error) return <div>Error loading cities</div>

    return (
        <div className="city-selector">
            <label htmlFor="city-select">Select City:</label>
            <select
                id="city-select"
                value={selectedCity || ''}
                onChange={(e) => onCityChange(e.target.value)}
                className="border rounded px-3 py-2"
            >
                <option value="">-- Choose a city --</option>
                {cities?.map((city) => (
                    <option key={city.code} value={city.code}>
                        {city.name} ({city.country})
                    </option>
                ))}
            </select>
        </div>
    )
}
```

Update `packages/frontend/src/App.tsx` to use city selector:

```typescript
import { useEffect, useState } from 'react'
import { CitySelector } from './components/CitySelector'
import { MapContainer } from './components/MapContainer'

function App() {
    const [selectedCity, setSelectedCity] = useState<string | null>(
        localStorage.getItem('selectedCity') || 'berlin'
    )

    useEffect(() => {
        if (selectedCity) {
            localStorage.setItem('selectedCity', selectedCity)
        }
    }, [selectedCity])

    return (
        <div className="app">
            <header className="bg-blue-600 text-white p-4">
                <h1>FreiFahren - Ticket Inspector Map</h1>
                <CitySelector
                    selectedCity={selectedCity}
                    onCityChange={setSelectedCity}
                />
            </header>
            
            {selectedCity && (
                <main className="flex-1">
                    <MapContainer cityCode={selectedCity} />
                </main>
            )}
        </div>
    )
}

export default App
```

Update `packages/frontend/src/components/MapContainer.tsx`:

```typescript
import { useEffect, useState } from 'react'
import { useCity } from '../hooks/useCities'
import type { City } from '../types/city'

interface MapContainerProps {
    cityCode: string
}

export const MapContainer: React.FC<MapContainerProps> = ({ cityCode }) => {
    const { data: city, isLoading } = useCity(cityCode)

    useEffect(() => {
        if (city) {
            // Update map center to city bounds
            const center = {
                lat: (city.bounds.north + city.bounds.south) / 2,
                lng: (city.bounds.east + city.bounds.west) / 2,
            }
            console.log(`Centering map on ${city.name}:`, center)
            // Update Mapbox/Leaflet center
        }
    }, [city])

    if (isLoading) return <div>Loading map...</div>

    return (
        <div className="map-container">
            {/* Map will be rendered here */}
            {city && <p>Viewing {city.name}</p>}
        </div>
    )
}
```

---

## Testing Phase 2 Implementation

### 1. Database Tests

```bash
# Verify cities table was created
bun run db:studio
# Navigate to 'cities' table → should see Berlin and Munich
```

### 2. API Tests

```bash
# Test GET /api/cities
curl http://localhost:8080/api/cities

# Response should be:
# [
#   { "id": 1, "code": "berlin", "name": "Berlin", ... },
#   { "id": 2, "code": "munich", "name": "München", ... }
# ]

# Test GET /api/cities/:code
curl http://localhost:8080/api/cities/berlin

# Test POST /api/cities (add a new city)
curl -X POST http://localhost:8080/api/cities \
  -H "Content-Type: application/json" \
  -d '{
    "code": "hamburg",
    "name": "Hamburg",
    "country": "DE",
    "language": "de",
    "timezone": "Europe/Berlin",
    "transitProvider": "HHA",
    "osmLineRelations": { "U1": 123456, "U2": 123457 },
    "bounds": { "north": 53.67, "south": 53.4, "east": 10.3, "west": 9.7 }
  }'
```

### 3. Frontend Tests

```bash
cd packages/frontend
npm run dev

# Open http://localhost:5173
# Should see city dropdown with Berlin, Munich, Hamburg
# Selecting a city should update the map view and persist in localStorage
```

---

## Checklist for Phase 2 Completion

- [ ] **Task 1:** City schema created and migration applied
- [ ] **Task 2:** CitiesService implemented with CRUD operations
- [ ] **Task 3:** API routes created and tested
- [ ] **Task 4:** Reports linked to cities
- [ ] **Task 5:** Initial cities seeded (Berlin, Munich, Hamburg, Cologne)
- [ ] **Task 6:** Frontend city selector implemented
- [ ] **Tests:** All endpoints tested with curl
- [ ] **Documentation:** README updated with city setup guide

---

## What's Next (Phase 3)?

Once Phase 2 is complete:

1. **Multilingual NLP** — Support German, French, Spanish, Italian, Dutch
2. **GTFS Integration** — Auto-populate transit data from GTFS feeds
3. **Risk Model per City** — Separate risk calculations per city
4. **City Admin Panel** — Web UI to manage cities without database access

---

## Common Issues & Solutions

### Issue: Migration fails with "table already exists"

**Solution:** The cities table might already exist. Check with:
```bash
bun run db:studio
```

If it exists, create a new migration to handle the existing state:
```bash
bun run db:generate -- --name fix_cities_table
```

### Issue: OSM line relations are wrong for a city

**Solution:** 
1. Find the correct OSM relation ID using [Overpass Turbo](https://overpass-turbo.eu/)
2. Update the city:
   ```bash
   curl -X PUT http://localhost:8080/api/cities/berlin \
     -H "Content-Type: application/json" \
     -d '{ "osmLineRelations": { "U6": 2679164 } }'
   ```

### Issue: Frontend city selector doesn't show cities

**Solution:**
1. Check API is running: `curl http://localhost:8080/api/cities`
2. Check CORS headers are correct in backend
3. Check browser console for errors
4. Verify `VITE_API_BASE_URL` in `.env.local`

---

## Additional Resources

- [Drizzle ORM Documentation](https://orm.drizzle.team/)
- [Hono Framework Guide](https://hono.dev/)
- [OpenStreetMap Relation Types](https://wiki.openstreetmap.org/wiki/Relation)
- [Overpass Turbo Query Builder](https://overpass-turbo.eu/)

---

Ready to contribute? Start with **Task 1** and create a PR for each task!

Questions? Open an issue or discussion.
