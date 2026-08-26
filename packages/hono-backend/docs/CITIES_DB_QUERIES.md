# Cities Database Query Helpers

This document provides SQL queries and patterns for working with the cities table.

## Basic Queries

### Get all active cities

```sql
SELECT * FROM cities WHERE is_active = true ORDER BY name;
```

### Get specific city by code

```sql
SELECT * FROM cities WHERE code = 'berlin';
```

### Get cities by country

```sql
SELECT * FROM cities WHERE country = 'DE' ORDER BY name;
```

### Get cities by language

```sql
SELECT * FROM cities WHERE language = 'de';
```

### Search cities by name

```sql
SELECT * FROM cities
WHERE name ILIKE '%berlin%' AND is_active = true;
```

## Aggregation Queries

### Count cities by country

```sql
SELECT country, COUNT(*) as city_count
FROM cities
WHERE is_active = true
GROUP BY country
ORDER BY city_count DESC;
```

### Count active vs inactive cities

```sql
SELECT is_active, COUNT(*) as count
FROM cities
GROUP BY is_active;
```

### List all transit providers

```sql
SELECT DISTINCT transit_provider
FROM cities
WHERE is_active = true
ORDER BY transit_provider;
```

## Cities with Features

### Cities with reports enabled

```sql
SELECT code, name FROM cities
WHERE is_active = true AND enable_reports = true;
```

### Cities with NLP enabled

```sql
SELECT code, name FROM cities
WHERE is_active = true AND enable_nlp = true;
```

### Cities with Telegram integration

```sql
SELECT code, name, telegram_group_url
FROM cities
WHERE is_active = true AND telegram_group_url IS NOT NULL;
```

## Maintenance Queries

### Update city information

```sql
UPDATE cities
SET name = 'New Name', updated_at = NOW()
WHERE code = 'berlin';
```

### Deactivate a city

```sql
UPDATE cities
SET is_active = false, updated_at = NOW()
WHERE code = 'berlin';
```

### Toggle feature for a city

```sql
UPDATE cities
SET enable_reports = NOT enable_reports, updated_at = NOW()
WHERE code = 'berlin';
```

### Update OSM line relations

```sql
UPDATE cities
SET osm_line_relations = jsonb_set(
    osm_line_relations,
    '{U1}',
    '2669205'
)
WHERE code = 'berlin';
```

## Reporting Queries

### Get recently updated cities

```sql
SELECT code, name, updated_at
FROM cities
ORDER BY updated_at DESC
LIMIT 10;
```

### Get cities with complete configuration

```sql
SELECT code, name, country, language
FROM cities
WHERE is_active = true
  AND osm_line_relations != 'null'::jsonb
  AND bounds != 'null'::jsonb
  AND transit_provider != '';
```

### Get cities by region (example: Europe)

```sql
SELECT code, name, country
FROM cities
WHERE country IN ('DE', 'FR', 'ES', 'IT', 'NL', 'BE', 'AT', 'CH')
  AND is_active = true
ORDER BY country, name;
```

## JSONB Operations

### Extract line count for each city

```sql
SELECT code, name,
       jsonb_object_keys(osm_line_relations) as line_count
FROM cities
WHERE is_active = true;
```

### Find cities with specific transit line

```sql
SELECT code, name
FROM cities
WHERE osm_line_relations ? 'U6';
```

### Get bounds for a city

```sql
SELECT code, name,
       bounds->>'north' as north,
       bounds->>'south' as south,
       bounds->>'east' as east,
       bounds->>'west' as west
FROM cities
WHERE code = 'berlin';
```

## Performance Tips

1. **Always use indexed columns** - `code`, `country`, `is_active`
2. **Use ILIKE for case-insensitive search** instead of LIKE
3. **For JSONB queries**, consider creating indexes:
   ```sql
   CREATE INDEX cities_osm_lines_gin ON cities USING gin (osm_line_relations);
   ```

4. **Pagination example**:
   ```sql
   SELECT * FROM cities
   WHERE is_active = true
   ORDER BY name
   LIMIT 10 OFFSET 20;  -- Page 3, 10 items per page
   ```

## Testing Queries

### Verify city was created

```sql
SELECT * FROM cities WHERE code = 'berlin';
```

### Check indexes are working

```sql
EXPLAIN ANALYZE
SELECT * FROM cities WHERE code = 'berlin';
```

### View table structure

```sql
\d cities
```

### Check constraints

```sql
SELECT constraint_name, table_name
FROM information_schema.table_constraints
WHERE table_name = 'cities';
```
