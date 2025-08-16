# DSANDSL API Reference

## Core Classes

### DSLEngine

The main class for filtering data based on role-based access control.

#### Constructor

```javascript
new DSLEngine(config, options = {})
```

**Parameters:**
- `config` (Object): DSL configuration object
- `options` (Object): Optional engine settings

**Example:**
```javascript
const dsl = new DSLEngine(config, {
  chunkSize: 1000,
  parallel: true,
  cacheEnabled: true
})
```

#### Methods

##### `filter(data, userRole, options = {})`

Filters data based on user role and configured access rules.

**Parameters:**
- `data` (Object|Array): Data to filter
- `userRole` (string): User's role
- `options` (Object): Filtering options

**Returns:** Filtered data or object with data and metadata

**Example:**
```javascript
const result = dsl.filter(userData, 'user', { 
  includeMetadata: true,
  strict: false 
})

// Returns:
// {
//   data: { name: "John", email: "john@example.com" },
//   metadata: {
//     totalFields: 5,
//     allowedFields: 2,
//     filteredFields: [
//       { field: 'salary', reason: 'insufficient_role', requires: 'admin' }
//     ]
//   }
// }
```

**Options:**
- `includeMetadata` (boolean): Include filtering metadata
- `strict` (boolean): Strict mode filtering
- `preserveStructure` (boolean): Preserve object structure
- `chunkSize` (number): Override default chunk size for arrays

##### `checkAccess(fieldName, userRole, context = {})`

Checks if a user role has access to a specific field.

**Parameters:**
- `fieldName` (string): Field to check
- `userRole` (string): User's role
- `context` (Object): Additional context

**Returns:** Access result object

**Example:**
```javascript
const access = dsl.checkAccess('user.salary', 'manager')
// Returns:
// {
//   allowed: false,
//   reason: 'insufficient_role',
//   requires: 'admin',
//   userRole: 'manager'
// }
```

##### `getAllowedFields(userRole, category = null)`

Gets all fields accessible to a role, optionally filtered by category.

**Parameters:**
- `userRole` (string): User's role
- `category` (string): Optional category filter

**Returns:** Array of allowed field names

**Example:**
```javascript
const fields = dsl.getAllowedFields('manager', 'financial')
// Returns: ['budget', 'expenses'] (salary excluded)
```

##### `getFieldsByCategory(category, userRole)`

Gets fields in a specific category accessible to a role.

**Parameters:**
- `category` (string): Field category
- `userRole` (string): User's role

**Returns:** Array of field names in category

##### `buildQuery(queryOptions)`

Builds a database query with automatic role-based field filtering.

**Parameters:**
- `queryOptions` (Object): Query configuration

**Returns:** Safe query object

**Example:**
```javascript
const query = dsl.buildQuery({
  select: ['name', 'email', 'salary'], // salary auto-filtered for non-admin
  from: 'users',
  where: { active: true },
  userRole: 'user'
})

// Returns:
// {
//   sql: "SELECT name, email FROM users WHERE active = true",
//   allowedFields: ['name', 'email'],
//   filteredFields: ['salary']
// }
```

##### `validateConfig()`

Validates the current configuration and returns validation results.

**Returns:** Validation result object

**Example:**
```javascript
const validation = dsl.validateConfig()
if (!validation.valid) {
  console.error('Config errors:', validation.errors)
}
```

##### `analyzeConfig()`

Analyzes configuration for optimization and security recommendations.

**Returns:** Analysis result object

**Example:**
```javascript
const analysis = dsl.analyzeConfig()
console.log('Recommendations:', analysis.recommendations)
console.log('Security issues:', analysis.securityIssues)
console.log('Performance suggestions:', analysis.performance)
```

##### `getStats()`

Returns filtering statistics and performance metrics.

**Returns:** Statistics object

**Example:**
```javascript
const stats = dsl.getStats()
// Returns:
// {
//   totalFilterOperations: 1500,
//   averageFilterTime: 2.3,
//   cacheHitRate: 85.2,
//   mostFilteredFields: ['salary', 'ssn', 'password']
// }
```

### DSLConfig

Configuration helper for creating and validating DSL configurations.

#### `createConfig(config)`

Creates and validates a DSL configuration.

**Parameters:**
- `config` (Object): Raw configuration object

**Returns:** Validated configuration object

**Example:**
```javascript
const { createConfig } = require('dsandsl')

const config = createConfig({
  roles: {
    admin: { level: 100 },
    user: { level: 10 }
  },
  fields: {
    'sensitive': { minRole: 'admin' }
  }
})
```

## Framework Adapters

### NextJSAdapter

Provides Next.js integration for API routes and middleware.

#### `createHandler(dsl, options = {})`

Creates a Next.js API route handler with automatic DSL filtering.

**Parameters:**
- `dsl` (DSLEngine): DSL engine instance
- `options` (Object): Handler options

**Returns:** Next.js API route handler function

**Example:**
```javascript
import { NextJSAdapter } from 'dsandsl/adapters/nextjs'
import { getServerSession } from 'next-auth'

export default NextJSAdapter.createHandler(dsl, {
  roleExtractor: async (req, res) => {
    const session = await getServerSession(req, res, authOptions)
    return session?.user?.role || 'guest'
  },
  
  dataProvider: async (req) => {
    const { id } = req.query
    return await getUserById(id)
  },
  
  errorHandler: (error, req, res) => {
    res.status(403).json({ error: 'Access denied' })
  }
})
```

#### `createMiddleware(dsl, options = {})`

Creates Next.js middleware with DSL integration.

**Parameters:**
- `dsl` (DSLEngine): DSL engine instance  
- `options` (Object): Middleware options

**Returns:** Next.js middleware function

### ExpressAdapter

Provides Express.js integration.

#### `middleware(dsl, options = {})`

Creates Express middleware with DSL filtering.

**Parameters:**
- `dsl` (DSLEngine): DSL engine instance
- `options` (Object): Middleware options

**Returns:** Express middleware function

**Example:**
```javascript
const { ExpressAdapter } = require('dsandsl/adapters/express')

app.use('/api/users', ExpressAdapter.middleware(dsl, {
  roleExtractor: (req) => req.user?.role || 'guest',
  autoFilter: true,
  attachTo: 'dsl' // Attaches DSL to req.dsl
}))

app.get('/api/users/:id', (req, res) => {
  const user = getUserById(req.params.id)
  res.json(req.dsl.filter(user)) // Automatically filtered
})
```

#### `createRoute(dsl, handler, options = {})`

Creates an Express route with automatic DSL filtering.

**Parameters:**
- `dsl` (DSLEngine): DSL engine instance
- `handler` (Function): Route handler function
- `options` (Object): Route options

**Returns:** Express route handler

## Utility Functions

### Field Matching

#### `matchField(fieldName, pattern)`

Tests if a field name matches a pattern.

**Parameters:**
- `fieldName` (string): Field name to test
- `pattern` (string): Pattern to match against

**Returns:** Boolean

**Example:**
```javascript
const { matchField } = require('dsandsl/utils')

matchField('user.salary', 'user.*') // true
matchField('admin.password', '*.password') // true
matchField('public.name', 'private.*') // false
```

#### `extractFields(data, pattern)`

Extracts field names from data that match a pattern.

**Parameters:**
- `data` (Object): Data object
- `pattern` (string): Pattern to match

**Returns:** Array of matching field names

### Role Utilities

#### `compareRoles(role1, role2, roleHierarchy)`

Compares two roles based on hierarchy levels.

**Parameters:**
- `role1` (string): First role
- `role2` (string): Second role  
- `roleHierarchy` (Object): Role hierarchy configuration

**Returns:** Number (-1, 0, 1)

#### `hasPermission(userRole, requiredRole, roleHierarchy)`

Checks if user role has required permission level.

**Parameters:**
- `userRole` (string): User's role
- `requiredRole` (string): Required role level
- `roleHierarchy` (Object): Role hierarchy

**Returns:** Boolean

## Error Classes

### DSLError

Base error class for DSL-related errors.

```javascript
class DSLError extends Error {
  constructor(message, code, context = {}) {
    super(message)
    this.name = 'DSLError'
    this.code = code
    this.context = context
  }
}
```

### ConfigurationError

Thrown when configuration is invalid.

```javascript
try {
  const dsl = new DSLEngine(invalidConfig)
} catch (error) {
  if (error instanceof ConfigurationError) {
    console.log('Config errors:', error.validationErrors)
  }
}
```

### AccessDeniedError

Thrown when access is denied to a resource.

```javascript
try {
  const result = dsl.filter(sensitiveData, 'guest', { strict: true })
} catch (error) {
  if (error instanceof AccessDeniedError) {
    console.log('Access denied:', error.resource, error.reason)
  }
}
```

### ValidationError

Thrown when data validation fails.

## Type Definitions

### Configuration Types

```typescript
interface DSLConfig {
  roles: {
    [roleName: string]: {
      level: number
      inherits?: string[]
      description?: string
      customPermissions?: string[]
    }
  }
  
  fields: {
    [fieldPattern: string]: {
      minRole: string
      category?: string
      deny?: boolean
      condition?: (fieldName: string, value: any, userRole: string, context: any) => boolean
    }
  }
  
  database?: {
    type?: string
    connection?: string
    tables?: { [tableName: string]: { minRole: string } }
    views?: { [viewName: string]: { minRole: string } }
    queries?: { [queryName: string]: { minRole: string, template: string } }
  }
  
  security?: {
    includeMetadata?: boolean
    includeFieldNames?: boolean
    logFiltering?: boolean
    auditEnabled?: boolean
  }
  
  performance?: {
    chunkSize?: number
    parallel?: boolean
    cacheEnabled?: boolean
    cacheTTL?: number
  }
}
```

### Filter Result Types

```typescript
interface FilterResult {
  data: any
  metadata?: {
    totalFields: number
    allowedFields: number
    filteredFields: FilteredField[]
    userRole: string
    performance: {
      filteringTime: string
      itemsProcessed: number
    }
  }
}

interface FilteredField {
  field: string
  reason: 'insufficient_role' | 'denied' | 'condition_failed'
  requires?: string
  userRole?: string
}
```

### Access Check Types

```typescript
interface AccessResult {
  allowed: boolean
  reason?: string
  requires?: string
  userRole: string
  context?: any
}
```

## Performance Considerations

### Large Datasets

For large arrays, use chunked processing:

```javascript
const dsl = new DSLEngine(config, { 
  chunkSize: 5000,
  parallel: true 
})

// Processes arrays in 5000-item chunks using worker threads
const filtered = dsl.filter(largeArray, userRole)
```

### Caching

Enable caching for repeated field access checks:

```javascript
const dsl = new DSLEngine(config, {
  cacheEnabled: true,
  cacheTTL: 300000 // 5 minutes
})
```

### Memory Management

For very large operations, use streaming:

```javascript
const stream = dsl.createFilterStream(userRole)
largeDataStream
  .pipe(stream)
  .pipe(outputStream)
```

## Migration Guide

### From v1.x to v2.x

```javascript
// v1.x
const dsl = new DSL({ roles: {...}, fields: {...} })

// v2.x  
const config = createConfig({ roles: {...}, fields: {...} })
const dsl = new DSLEngine(config)
```

### Breaking Changes

- `DSL` class renamed to `DSLEngine`
- Configuration now requires `createConfig()` wrapper
- Metadata structure changed
- Some method signatures updated

See [MIGRATION.md](MIGRATION.md) for complete migration guide.