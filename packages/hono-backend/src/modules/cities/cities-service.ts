import { eq, and, ilike, desc } from 'drizzle-orm'
import { DbConnection, cities } from '../../db'
import type { City, CreateCity, Coordinates, CityBounds } from '../../db/schema/cities'
import type { CreateCityInput, UpdateCityInput } from './cities-types'

/**
 * Service layer for city management
 * Handles all business logic related to cities
 */
export class CitiesService {
    constructor(private db: DbConnection) {}

    /**
     * Get all active cities, optionally filtered and sorted
     */
    async getAllCities(options?: {
        includeInactive?: boolean
        country?: string
        language?: string
        sortBy?: 'name' | 'createdAt' | 'country'
    }): Promise<City[]> {
        let query = this.db.select().from(cities)

        // Filter by active status
        if (!options?.includeInactive) {
            query = query.where(eq(cities.isActive, true))
        }

        // Filter by country
        if (options?.country) {
            query = query.where(eq(cities.country, options.country.toUpperCase()))
        }

        // Filter by language
        if (options?.language) {
            query = query.where(eq(cities.language, options.language.toLowerCase()))
        }

        // Sort
        if (options?.sortBy === 'createdAt') {
            query = query.orderBy(desc(cities.createdAt))
        } else if (options?.sortBy === 'country') {
            query = query.orderBy(cities.country, cities.name)
        } else {
            query = query.orderBy(cities.name)
        }

        return query
    }

    /**
     * Get a city by its code (e.g., 'berlin')
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
     * Get a city by ID
     */
    async getCityById(id: number): Promise<City | null> {
        const result = await this.db
            .select()
            .from(cities)
            .where(eq(cities.id, id))
            .limit(1)

        return result[0] || null
    }

    /**
     * Search cities by name or code
     */
    async searchCities(query: string, limit = 10): Promise<City[]> {
        const searchTerm = `%${query.toLowerCase()}%`
        return this.db
            .select()
            .from(cities)
            .where(
                and(
                    eq(cities.isActive, true),
                    ilike(cities.name, searchTerm)
                )
            )
            .limit(limit)
    }

    /**
     * Create a new city
     */
    async createCity(cityData: CreateCityInput): Promise<City> {
        const result = await this.db
            .insert(cities)
            .values({
                code: cityData.code.toLowerCase(),
                name: cityData.name,
                country: cityData.country.toUpperCase(),
                language: cityData.language.toLowerCase(),
                timezone: cityData.timezone,
                transitProvider: cityData.transitProvider,
                osmLineRelations: cityData.osmLineRelations,
                bounds: cityData.bounds,
                telegramGroupUrl: cityData.telegramGroupUrl,
                redditUrl: cityData.redditUrl,
                whatsappGroupUrl: cityData.whatsappGroupUrl,
                description: cityData.description,
            })
            .returning()

        if (!result[0]) {
            throw new Error('Failed to create city')
        }

        return result[0]
    }

    /**
     * Update a city's configuration
     */
    async updateCity(code: string, updates: UpdateCityInput): Promise<City> {
        const updateData: Partial<CreateCity> = {}

        if (updates.name) updateData.name = updates.name
        if (updates.language) updateData.language = updates.language.toLowerCase()
        if (updates.timezone) updateData.timezone = updates.timezone
        if (updates.transitProvider) updateData.transitProvider = updates.transitProvider
        if (updates.osmLineRelations) updateData.osmLineRelations = updates.osmLineRelations
        if (updates.bounds) updateData.bounds = updates.bounds
        if (updates.telegramGroupUrl) updateData.telegramGroupUrl = updates.telegramGroupUrl
        if (updates.redditUrl) updateData.redditUrl = updates.redditUrl
        if (updates.whatsappGroupUrl) updateData.whatsappGroupUrl = updates.whatsappGroupUrl
        if (updates.description) updateData.description = updates.description

        updateData.updatedAt = new Date()

        const result = await this.db
            .update(cities)
            .set(updateData)
            .where(eq(cities.code, code.toLowerCase()))
            .returning()

        if (!result[0]) {
            throw new Error(`City with code '${code}' not found`)
        }

        return result[0]
    }

    /**
     * Activate or deactivate a city
     */
    async toggleCity(code: string, isActive: boolean): Promise<City> {
        const result = await this.db
            .update(cities)
            .set({ isActive, updatedAt: new Date() })
            .where(eq(cities.code, code.toLowerCase()))
            .returning()

        if (!result[0]) {
            throw new Error(`City with code '${code}' not found`)
        }

        return result[0]
    }

    /**
     * Delete a city (soft delete via deactivation)
     */
    async deleteCity(code: string): Promise<void> {
        const result = await this.db
            .update(cities)
            .set({ isActive: false, updatedAt: new Date() })
            .where(eq(cities.code, code.toLowerCase()))
            .returning()

        if (!result[0]) {
            throw new Error(`City with code '${code}' not found`)
        }
    }

    /**
     * Get OSM line relation ID for a specific line in a city
     */
    getOsmLineRelationId(city: City, lineId: string): number | null {
        const relations = city.osmLineRelations as Record<string, number>
        return relations[lineId.toUpperCase()] || null
    }

    /**
     * Check if coordinates are within city bounds
     */
    isCoordinatesInBounds(city: City, coordinates: Coordinates): boolean {
        const bounds = city.bounds as CityBounds
        return (
            coordinates.lat >= bounds.south &&
            coordinates.lat <= bounds.north &&
            coordinates.lng >= bounds.west &&
            coordinates.lng <= bounds.east
        )
    }

    /**
     * Get a formatted city name with country code
     */
    getFormattedCityName(city: City): string {
        return `${city.name} (${city.country})`
    }

    /**
     * Calculate city center coordinates from bounds
     */
    getCityCenter(city: City): Coordinates {
        const bounds = city.bounds as CityBounds
        return {
            lat: (bounds.north + bounds.south) / 2,
            lng: (bounds.east + bounds.west) / 2,
        }
    }

    /**
     * Get all transit lines configured for a city
     */
    getCityLines(city: City): string[] {
        const relations = city.osmLineRelations as Record<string, number>
        return Object.keys(relations).sort()
    }

    /**
     * Check if a city has a specific feature enabled
     */
    hasFeatureEnabled(city: City, feature: 'reports' | 'nlp'): boolean {
        if (feature === 'reports') {
            return city.enableReports && city.isActive
        }
        if (feature === 'nlp') {
            return city.enableNlp && city.isActive
        }
        return false
    }

    /**
     * Get cities by country code
     */
    async getCitiesByCountry(countryCode: string): Promise<City[]> {
        return this.db
            .select()
            .from(cities)
            .where(
                and(
                    eq(cities.country, countryCode.toUpperCase()),
                    eq(cities.isActive, true)
                )
            )
            .orderBy(cities.name)
    }
}
