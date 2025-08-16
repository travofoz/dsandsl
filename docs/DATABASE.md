# Database Integration Guide

DSANDSL provides comprehensive database adapters with role-based field filtering, table access control, and secure query building for PostgreSQL, MySQL, and SQLite.

## Features

- 🔒 **Role-based field filtering** - Automatically filter query results based on user permissions
- 🛡️ **Table access control** - Restrict database operations by user role
- 🏗️ **Query builder** - Type-safe SQL generation with built-in security
- 📊 **Connection pooling** - High-performance connection management
- 🔄 **Transactions** - ACID-compliant transaction support with security context
- 📈 **Performance monitoring** - Built-in query performance tracking
- 🎯 **Zero caching** - No cache invalidation security risks

## Quick Start

### PostgreSQL

```javascript
const { DSLEngine, createConfig, PostgreSQLAdapter } = require('dsandsl')

// Create DSL configuration
const config = createConfig({
  roles: {
    admin: { level: 100 },
    user: { level: 10 }
  },
  fields: {
    'salary': { minRole: 'admin' },
    'email': { minRole: 'user' },
    'password': { deny: true }
  },
  database: {
    tables: {
      users: { minRole: 'user', operations: ['SELECT', 'UPDATE'] }
    }
  }
})

// Initialize DSL and adapter
const dsl = new DSLEngine(config)
const adapter = new PostgreSQLAdapter(dsl, {
  connection: {
    host: 'localhost',
    port: 5432,
    database: 'myapp',
    user: 'dbuser',
    password: 'password'
  }
})

await adapter.initialize()

// Role-based queries
const users = await adapter.select('users', 'user', {
  where: { active: true },
  limit: 10
})
// Returns users with email but NOT salary (filtered by role)

const adminUsers = await adapter.select('users', 'admin', {
  where: { department: 'Engineering' }
})
// Returns users with ALL fields including salary
```

### MySQL

```javascript
const { MySQLAdapter } = require('dsandsl')

const adapter = new MySQLAdapter(dsl, {
  connection: {
    host: 'localhost',
    port: 3306,
    database: 'myapp',
    user: 'dbuser',
    password: 'password'
  }
})

await adapter.initialize()

// MySQL automatically simulates RETURNING clause for compatibility
const result = await adapter.insert('users', {
  name: 'John Doe',
  email: 'john@company.com'
}, 'user', {
  returning: ['id', 'name', 'created_at']
})
```

### SQLite

```javascript
const { SQLiteAdapter } = require('dsandsl')

const adapter = new SQLiteAdapter(dsl, {
  connection: {
    filename: './app.db',
    enableWAL: true,
    pragmas: {
      journal_mode: 'WAL',
      synchronous: 'NORMAL'
    }
  }
})

await adapter.initialize()

// SQLite supports full RETURNING syntax
const newUser = await adapter.insert('users', userData, 'admin', {
  returning: ['*']
})
```

## Configuration

### Connection Options

#### PostgreSQL
```javascript
{
  connection: {
    // Basic connection
    host: 'localhost',
    port: 5432,
    database: 'myapp',
    user: 'username',
    password: 'password',
    
    // Or connection string
    connectionString: 'postgresql://user:pass@host:port/db',
    
    // Pool settings
    max: 20,                    // Max connections
    min: 5,                     // Min connections
    acquireTimeoutMillis: 5000, // Connection timeout
    idleTimeoutMillis: 30000,   // Idle timeout
    
    // SSL settings
    ssl: {
      rejectUnauthorized: false
    }
  }
}
```

#### MySQL
```javascript
{
  connection: {
    host: 'localhost',
    port: 3306,
    database: 'myapp',
    user: 'username',
    password: 'password',
    
    // Pool settings
    connectionLimit: 20,
    acquireTimeout: 5000,
    timeout: 60000,
    
    // MySQL specific
    charset: 'utf8mb4',
    timezone: '+00:00'
  }
}
```

#### SQLite
```javascript
{
  connection: {
    filename: './app.db',     // Or ':memory:' for in-memory
    enableWAL: true,          // Enable WAL mode for concurrency
    busyTimeout: 10000,       // Busy timeout in ms
    
    // SQLite pragmas
    pragmas: {
      journal_mode: 'WAL',
      synchronous: 'NORMAL',
      cache_size: 10000,
      foreign_keys: 'ON'
    }
  }
}
```

### Adapter Options

```javascript
const adapter = new PostgreSQLAdapter(dsl, {
  // Security options
  validateTableAccess: true,    // Validate table permissions
  validateFieldAccess: true,    // Validate field permissions  
  autoFilter: true,             // Auto-filter query results
  
  // Performance options
  logQueries: false,            // Log SQL queries for debugging
  
  // Connection options
  connection: { /* ... */ }
})
```

## Database Operations

### SELECT Queries

```javascript
// Basic select with role filtering
const users = await adapter.select('users', userRole, {
  fields: ['id', 'name', 'email', 'salary'], // Filtered by role
  where: { active: true },
  orderBy: 'created_at',
  orderDirection: 'DESC',
  limit: 50,
  offset: 0
})

// Complex queries with joins
const results = await adapter.select('users', userRole, {
  fields: ['users.name', 'departments.name as dept_name'],
  join: [
    {
      table: 'departments',
      condition: 'users.department_id = departments.id',
      type: 'LEFT'
    }
  ],
  where: { 'users.active': true },
  groupBy: ['departments.id'],
  having: 'COUNT(*) > 5'
})
```

### INSERT Operations

```javascript
// Role-based field filtering applies to INSERTs
const result = await adapter.insert('users', {
  name: 'Alice Smith',
  email: 'alice@company.com',
  salary: 85000,        // Filtered if user lacks permission
  password: 'secret123' // Always filtered (deny: true)
}, userRole, {
  returning: ['id', 'name', 'created_at']
})

console.log('New user ID:', result.lastInsertId || result.rows[0].id)
```

### UPDATE Operations

```javascript
// Updates respect field-level permissions
const result = await adapter.update('users', {
  name: 'Alice Johnson',
  salary: 90000  // Only allowed for admin role
}, {
  id: 123
}, userRole, {
  returning: ['id', 'name', 'updated_at']
})

console.log('Updated rows:', result.affectedRows)
```

### DELETE Operations

```javascript
// Deletes require table-level permissions
const result = await adapter.delete('users', {
  id: 123,
  active: false
}, userRole, {
  returning: ['id', 'name'] // Return deleted record info
})
```

## Query Builder

For complex queries, use the role-aware query builder:

```javascript
const qb = adapter.createQueryBuilder(userRole)

const { sql, params } = qb
  .select(['id', 'name', 'email', 'department'])
  .from('users')
  .where({ active: true })
  .whereCondition('salary', '>', 50000)
  .orderBy('created_at', 'DESC')
  .limit(25)
  .build()

// Execute with role validation
const results = await adapter.query(sql, params, userRole, {
  operation: 'SELECT',
  table: 'users'
})
```

### Query Builder Methods

```javascript
qb.select(['field1', 'field2'])     // SELECT fields (auto-filtered)
  .from('table')                    // FROM table
  .insert('table')                  // INSERT INTO table
  .update('table')                  // UPDATE table
  .delete()                         // DELETE
  .values({ field: 'value' })       // INSERT/UPDATE values (auto-filtered)
  .set({ field: 'value' })          // UPDATE SET (auto-filtered)
  .where({ field: 'value' })        // WHERE conditions
  .whereCondition('field', '>', 10) // WHERE with operator
  .orWhere({ field: 'value' })      // OR WHERE
  .join('table', 'condition')       // INNER JOIN
  .leftJoin('table', 'condition')   // LEFT JOIN
  .orderBy('field', 'ASC')          // ORDER BY
  .groupBy(['field1', 'field2'])    // GROUP BY
  .having('COUNT(*) > 5')           // HAVING
  .limit(50)                        // LIMIT
  .offset(100)                      // OFFSET
  .returning(['id', 'name'])        // RETURNING (PostgreSQL/SQLite)
```

## Transactions

Execute multiple operations atomically with role-based security:

```javascript
const result = await adapter.transaction(async (tx) => {
  // All operations maintain role-based filtering
  const user = await tx.insert('users', {
    name: 'Bob Wilson',
    email: 'bob@company.com'
  }, userRole, { returning: ['id'] })
  
  await tx.insert('user_permissions', {
    user_id: user.rows[0].id,
    permission: 'read_reports'
  }, userRole)
  
  // For computed values, handle at application level
  const currentDept = await tx.select('departments', userRole, { 
    where: { id: departmentId },
    fields: ['user_count']
  })
  
  await tx.update('departments', {
    user_count: (currentDept[0]?.user_count || 0) + 1
  }, {
    id: departmentId
  }, userRole)
  
  return { userId: user.rows[0].id }
})

console.log('Transaction completed:', result.userId)
```

## Performance Monitoring

Get detailed performance metrics:

```javascript
// Adapter statistics
const stats = adapter.getStats()
console.log('Adapter stats:', {
  type: stats.adapter,
  initialized: stats.initialized,
  connection: {
    status: stats.connection.status,
    totalQueries: stats.connection.metrics.totalQueries,
    avgQueryTime: stats.connection.metrics.avgQueryTimeMs,
    successRate: stats.connection.metrics.successRate
  }
})

// Connection manager stats
const connStats = adapter.connectionManager.getStats()
console.log('Connection pool:', {
  totalCount: connStats.pool?.totalCount,
  idleCount: connStats.pool?.idleCount,
  slowQueries: connStats.metrics.slowQueries
})
```

## Health Checks

Monitor database connectivity:

```javascript
// Simple health check
const isHealthy = await adapter.healthCheck()
console.log('Database healthy:', isHealthy)

// Detailed database info
const info = await adapter.getInfo()
console.log('Database info:', {
  version: info.version.full,
  adapter: info.adapter,
  features: info.features,
  tableCount: info.tables
})
```

## Security Best Practices

### 1. Field-Level Security

```javascript
const config = createConfig({
  fields: {
    // Always deny sensitive fields
    'password': { deny: true },
    'password_hash': { deny: true },
    'api_key': { deny: true },
    'ssn': { deny: true },
    
    // Role-based access
    'salary': { minRole: 'manager' },
    'personal_notes': { minRole: 'hr' },
    
    // Conditional access
    'user_id': { 
      condition: (field, value, userRole, context) => {
        return context.ownUserId === value || userRole === 'admin'
      }
    }
  }
})
```

### 2. Table-Level Security

```javascript
const config = createConfig({
  database: {
    // Deny unknown tables by default
    denyUnknownTables: true,
    
    tables: {
      // Read-only access for reports
      'financial_reports': {
        minRole: 'manager',
        operations: ['SELECT']
      },
      
      // Admin-only tables
      'audit_logs': {
        minRole: 'admin',
        operations: ['SELECT', 'INSERT']
      },
      
      // User data with restrictions
      'user_profiles': {
        minRole: 'user',
        operations: ['SELECT', 'UPDATE']
      }
    }
  }
})
```

### 3. Context-Aware Security

```javascript
// Pass user context for field-level decisions
const results = await adapter.select('user_profiles', userRole, {
  where: { department_id: userDeptId },
  context: {
    userId: currentUserId,
    departmentId: userDeptId,
    ipAddress: request.ip
  }
})
```

## Error Handling

```javascript
try {
  const results = await adapter.select('sensitive_table', 'user')
} catch (error) {
  if (error.code === 'table_access_denied') {
    console.log('User lacks table access:', error.details)
  } else if (error.code === 'query_failed') {
    console.log('Database error:', error.message)
  } else {
    console.log('Unknown error:', error)
  }
}
```

## Integration with Frameworks

### Express.js

```javascript
const { ExpressAdapter } = require('dsandsl')

app.use('/api', ExpressAdapter.middleware(dsl, {
  roleExtractor: (req) => req.user?.role || 'guest'
}))

app.get('/api/users', async (req, res) => {
  const users = await adapter.select('users', req.dsl.userRole, {
    limit: parseInt(req.query.limit) || 20
  })
  res.json(users)
})
```

### Next.js

```javascript
const { NextJSAdapter } = require('dsandsl')

export default NextJSAdapter.createHandler(dsl, {
  roleExtractor: async (req) => {
    const session = await getServerSession(req, res, authOptions)
    return session?.user?.role || 'guest'
  },
  dataProvider: async (req) => {
    const userId = req.query.id
    return await adapter.select('users', req.dsl.userRole, {
      where: { id: userId }
    })
  },
  autoFilter: true
})
```

## Performance Tips

1. **Use connection pooling** for high-traffic applications
2. **Specify explicit fields** instead of SELECT * for better performance
3. **Use transactions** for multi-operation consistency
4. **Monitor slow queries** with built-in performance tracking
5. **Index frequently filtered fields** in your database schema
6. **Use LIMIT/OFFSET** for large result sets

## Migration from Other ORMs

### From Prisma

```javascript
// Before (Prisma)
const users = await prisma.user.findMany({
  where: { active: true },
  select: userRole === 'admin' ? adminFields : userFields
})

// After (DSANDSL)
const users = await adapter.select('users', userRole, {
  where: { active: true }
  // Fields automatically filtered by role
})
```

### From Sequelize

```javascript
// Before (Sequelize)
const attributes = getAttributesForRole(userRole)
const users = await User.findAll({
  where: { active: true },
  attributes
})

// After (DSANDSL)
const users = await adapter.select('users', userRole, {
  where: { active: true }
  // Role-based filtering handled automatically
})
```

## Troubleshooting

### Common Issues

1. **"Table access denied"** - Check table configuration in DSL config
2. **"No fields allowed"** - Verify field permissions for user role
3. **"Connection failed"** - Verify database credentials and network access
4. **"Query timeout"** - Increase timeout settings or optimize query

### Debug Mode

```javascript
const adapter = new PostgreSQLAdapter(dsl, {
  logQueries: true,
  connection: { /* ... */ }
})

// Enable debug logging
DEBUG=dsandsl:* node app.js
```

This will provide detailed logging of all database operations, query generation, and security decisions.