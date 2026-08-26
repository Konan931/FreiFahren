import { z } from 'zod'

/**
 * Validation schema for geographic bounds
 */
export const boundsSchema = z.object({
    north: z.number().min(-90).max(90),
    south: z.number().min(-90).max(90),
    east: z.number().min(-180).max(180),
    west: z.number().min(-180).max(180),
})

/**
 * Validation schema for creating a new city
 */
export const createCitySchema = z.object({
    code: z
        .string()
        .toLowerCase()
        .min(2, 'City code must be at least 2 characters')
        .max(50, 'City code must not exceed 50 characters')
        .regex(/^[a-z0-9_-]+$/, 'City code must only contain lowercase letters, numbers, underscores, and hyphens'),
    name: z
        .string()
        .min(1, 'City name is required')
        .max(100, 'City name must not exceed 100 characters'),
    country: z
        .string()
        .length(2, 'Country code must be exactly 2 characters')
        .regex(/^[A-Z]{2}$/, 'Country code must be ISO 3166-1 alpha-2 format'),
    language: z
        .string()
        .length(2, 'Language code must be exactly 2 characters')
        .regex(/^[a-z]{2}$/, 'Language code must be ISO 639-1 format')
        .default('de'),
    timezone: z
        .string()
        .min(1, 'Timezone is required')
        .refine(
            (tz) => {
                try {
                    Intl.DateTimeFormat(undefined, { timeZone: tz })
                    return true
                } catch {
                    return false
                }
            },
            'Invalid timezone identifier'
        ),
    transitProvider: z
        .string()
        .min(1, 'Transit provider is required')
        .max(200, 'Transit provider must not exceed 200 characters'),
    osmLineRelations: z
        .record(z.string(), z.number())
        .min(1, 'At least one OSM line relation is required'),
    bounds: boundsSchema.refine(
        (b) => b.south < b.north,
        'South boundary must be less than north boundary'
    ).refine(
        (b) => b.west < b.east,
        'West boundary must be less than east boundary'
    ),
    telegramGroupUrl: z.string().url('Invalid Telegram URL').optional(),
    redditUrl: z.string().url('Invalid Reddit URL').optional(),
    whatsappGroupUrl: z.string().url('Invalid WhatsApp URL').optional(),
    description: z.string().max(500, 'Description must not exceed 500 characters').optional(),
})

export type CreateCityInput = z.infer<typeof createCitySchema>

/**
 * Validation schema for updating a city (partial)
 */
export const updateCitySchema = createCitySchema.partial()

export type UpdateCityInput = z.infer<typeof updateCitySchema>

/**
 * Response schema for city API
 */
export const cityResponseSchema = z.object({
    id: z.number(),
    code: z.string(),
    name: z.string(),
    country: z.string(),
    language: z.string(),
    timezone: z.string(),
    transitProvider: z.string(),
    osmLineRelations: z.record(z.string(), z.number()),
    bounds: boundsSchema,
    telegramGroupUrl: z.string().optional(),
    redditUrl: z.string().optional(),
    whatsappGroupUrl: z.string().optional(),
    isActive: z.boolean(),
    enableReports: z.boolean(),
    enableNlp: z.boolean(),
    description: z.string().optional(),
    createdAt: z.date(),
    updatedAt: z.date(),
})

export type CityResponse = z.infer<typeof cityResponseSchema>
