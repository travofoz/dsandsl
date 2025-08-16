# Service Provider Pattern

**Advanced DSANDSL Architecture - Centralized Security Services**

The service provider pattern centralizes all DSANDSL logic in dedicated service classes, keeping your API endpoints clean and maintaining separation of concerns. This is the recommended architecture for production applications.

## 🏗️ Architecture Overview

Instead of scattering DSL code throughout your API endpoints:

```javascript
// ❌ BAD: DSL logic in every endpoint
app.get('/api/users', async (req, res) => {
  const dsl = new DSLEngine(config) // Repeated everywhere
  const adapter = new PostgreSQLAdapter(dsl, dbConfig) // Repeated everywhere
  const users = await adapter.select('users', req.user.role, options)
  res.json(users)
})
```

Use a centralized service provider:

```javascript
// ✅ GOOD: Clean API endpoints
app.get('/api/users', async (req, res) => {
  const users = await UserService.getUsers(req.user.role, req.query)
  res.json(users)
})
```

## 🔧 Core Service Provider

Create a base service provider that all your domain services extend:

```javascript
// services/core/DSLServiceProvider.js
const { DSLEngine, createConfig, PostgreSQLAdapter } = require('dsandsl')

class DSLServiceProvider {
  constructor() {
    this.dsl = null
    this.adapter = null
    this.initialized = false
  }

  /**
   * Initialize the DSL service provider
   * Call this once at application startup
   */
  async initialize(config, adapterConfig) {
    if (this.initialized) return

    // Create DSL configuration
    this.config = createConfig(config)
    this.dsl = new DSLEngine(this.config)
    
    // Initialize database adapter
    this.adapter = new PostgreSQLAdapter(this.dsl, adapterConfig)
    await this.adapter.initialize()
    
    this.initialized = true
    console.log('✅ DSL Service Provider initialized')
  }

  /**
   * Get a fresh query builder for a user role
   */
  createQueryBuilder(userRole) {
    this.ensureInitialized()
    return this.adapter.createQueryBuilder(userRole)
  }

  /**
   * Execute a transaction with automatic role context
   */
  async transaction(userRole, callback) {
    this.ensureInitialized()
    return this.adapter.transaction(callback)
  }

  /**
   * Filter data with user role
   */
  filterData(data, userRole, options = {}) {
    this.ensureInitialized()
    return this.dsl.filter(data, userRole, options)
  }

  /**
   * Health check for the service
   */
  async healthCheck() {
    if (!this.initialized) return false
    return this.adapter.healthCheck()
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    if (this.adapter) {
      await this.adapter.close()
    }
    this.initialized = false
  }

  ensureInitialized() {
    if (!this.initialized) {
      throw new Error('DSL Service Provider not initialized. Call initialize() first.')
    }
  }
}

// Export singleton instance
module.exports = new DSLServiceProvider()
```

## 🏢 Domain Services

Create domain-specific services that use the provider:

```javascript
// services/UserService.js
const DSLProvider = require('./core/DSLServiceProvider')
const { DatabaseError } = require('dsandsl')

class UserService {
  
  /**
   * Get users with automatic role-based filtering
   */
  static async getUsers(userRole, options = {}) {
    try {
      const { page = 1, limit = 20, search, department, active } = options
      
      // Build WHERE conditions
      const where = {}
      if (search) where.name = { like: `%${search}%` }
      if (department) where.department_id = department
      if (active !== undefined) where.active = active
      
      // Execute query with role-based filtering
      const users = await DSLProvider.adapter.select('users', userRole, {
        where,
        orderBy: 'created_at',
        orderDirection: 'DESC',
        limit: parseInt(limit),
        offset: (parseInt(page) - 1) * parseInt(limit)
      })
      
      // Get total count for pagination
      const totalQuery = DSLProvider.createQueryBuilder(userRole)
        .select(['COUNT(*) as total'])
        .from('users')
        .where(where)
      
      const { sql, params } = totalQuery.build()
      const totalResult = await DSLProvider.adapter.executeQuery(sql, params)
      const total = totalResult.rows[0]?.total || 0
      
      return {
        users,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: parseInt(total),
          pages: Math.ceil(total / limit)
        }
      }
      
    } catch (error) {
      throw new DatabaseError(`Failed to get users: ${error.message}`, 'user_fetch_failed', error)
    }
  }
  
  /**
   * Get single user by ID with role-based field filtering
   */
  static async getUserById(userId, userRole, context = {}) {
    try {
      const users = await DSLProvider.adapter.select('users', userRole, {
        where: { id: userId },
        limit: 1,
        context: {
          requestingUserId: context.requestingUserId,
          ...context
        }
      })
      
      return users[0] || null
      
    } catch (error) {
      if (error.code === 'table_access_denied') {
        return null // User doesn't have permission to view users
      }
      throw new DatabaseError(`Failed to get user: ${error.message}`, 'user_fetch_failed', error)
    }
  }
  
  /**
   * Create user with automatic field filtering
   */
  static async createUser(userData, userRole, context = {}) {
    try {
      // Validate required fields based on role
      const requiredFields = ['name', 'email']
      for (const field of requiredFields) {
        if (!userData[field]) {
          throw new Error(`Missing required field: ${field}`)
        }
      }
      
      // Execute in transaction
      const result = await DSLProvider.transaction(userRole, async (tx) => {
        // Insert user with role-based field filtering
        const user = await tx.insert('users', {
          ...userData,
          created_at: new Date(),
          created_by: context.requestingUserId
        }, userRole, {
          returning: ['id', 'name', 'email', 'created_at']
        })
        
        // Create default user preferences
        if (user.rows?.[0]?.id) {
          await tx.insert('user_preferences', {
            user_id: user.rows[0].id,
            theme: 'light',
            notifications_enabled: true
          }, userRole)
        }
        
        return user.rows?.[0] || user
      })
      
      return result
      
    } catch (error) {
      throw new DatabaseError(`Failed to create user: ${error.message}`, 'user_create_failed', error)
    }
  }
  
  /**
   * Update user with role-based validation
   */
  static async updateUser(userId, updates, userRole, context = {}) {
    try {
      // Verify user exists and can be accessed
      const existingUser = await this.getUserById(userId, userRole, context)
      if (!existingUser) {
        throw new Error('User not found or access denied')
      }
      
      // Update with role-based field filtering
      const result = await DSLProvider.adapter.update('users', {
        ...updates,
        updated_at: new Date(),
        updated_by: context.requestingUserId
      }, {
        id: userId
      }, userRole, {
        returning: ['id', 'name', 'email', 'updated_at']
      })
      
      return result.rows?.[0] || result
      
    } catch (error) {
      throw new DatabaseError(`Failed to update user: ${error.message}`, 'user_update_failed', error)
    }
  }
  
  /**
   * Get user analytics with automatic aggregation filtering
   */
  static async getUserAnalytics(userRole, filters = {}) {
    try {
      const qb = DSLProvider.createQueryBuilder(userRole)
      
      // Build analytics query
      const { sql, params } = qb
        .select([
          'department_id',
          'COUNT(*) as user_count',
          'AVG(salary) as avg_salary',
          'MAX(created_at) as last_hire_date'
        ])
        .from('users')
        .where({ active: true, ...filters })
        .groupBy(['department_id'])
        .orderBy('user_count', 'DESC')
        .build()
      
      const result = await DSLProvider.adapter.executeQuery(sql, params)
      
      // Filter the aggregated results through DSL
      return DSLProvider.filterData(result.rows, userRole, {
        context: { aggregated: true }
      })
      
    } catch (error) {
      throw new DatabaseError(`Failed to get analytics: ${error.message}`, 'analytics_failed', error)
    }
  }
}

module.exports = UserService
```

## 🏪 Service Registry

Create a service registry for managing multiple domain services:

```javascript
// services/ServiceRegistry.js
const DSLProvider = require('./core/DSLServiceProvider')
const UserService = require('./UserService')
const PartnerService = require('./PartnerService') 
const ReportService = require('./ReportService')

class ServiceRegistry {
  constructor() {
    this.services = new Map()
    this.initialized = false
  }

  /**
   * Initialize all services
   */
  async initialize(dslConfig, adapterConfig) {
    if (this.initialized) return

    // Initialize core DSL provider
    await DSLProvider.initialize(dslConfig, adapterConfig)

    // Register domain services
    this.services.set('users', UserService)
    this.services.set('partners', PartnerService)
    this.services.set('reports', ReportService)

    this.initialized = true
    console.log('✅ Service Registry initialized with', this.services.size, 'services')
  }

  /**
   * Get a service by name
   */
  get(serviceName) {
    if (!this.initialized) {
      throw new Error('Service Registry not initialized')
    }
    
    const service = this.services.get(serviceName)
    if (!service) {
      throw new Error(`Service not found: ${serviceName}`)
    }
    
    return service
  }

  /**
   * Health check all services
   */
  async healthCheck() {
    const health = {
      registry: this.initialized,
      dslProvider: await DSLProvider.healthCheck(),
      services: this.services.size
    }
    
    return health
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('Shutting down Service Registry...')
    await DSLProvider.shutdown()
    this.services.clear()
    this.initialized = false
  }
}

// Export singleton
module.exports = new ServiceRegistry()
```

## 🚀 Application Bootstrap

Initialize your application with the service provider pattern:

```javascript
// app.js
const express = require('express')
const ServiceRegistry = require('./services/ServiceRegistry')

const app = express()

// DSL Configuration
const dslConfig = {
  roles: {
    admin: { level: 100 },
    manager: { level: 50 },
    user: { level: 10 },
    guest: { level: 0 }
  },
  
  fields: {
    // User fields
    'users.password_hash': { deny: true },
    'users.salary': { minRole: 'manager' },
    'users.ssn': { minRole: 'admin' },
    'users.personal_notes': { minRole: 'admin' },
    
    // Partner fields  
    'partners.api_key': { minRole: 'admin' },
    'partners.commission_rate': { minRole: 'manager' },
    
    // Report fields
    'reports.raw_data': { minRole: 'admin' },
    'reports.internal_notes': { minRole: 'manager' }
  },
  
  database: {
    tables: {
      users: { minRole: 'user', operations: ['SELECT', 'INSERT', 'UPDATE'] },
      partners: { minRole: 'manager', operations: ['SELECT', 'UPDATE'] },
      reports: { minRole: 'user', operations: ['SELECT'] },
      audit_logs: { minRole: 'admin', operations: ['SELECT'] }
    }
  }
}

// Database configuration
const adapterConfig = {
  connection: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'myapp',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password'
  },
  validateTableAccess: true,
  validateFieldAccess: true
}

async function startServer() {
  try {
    // Initialize service registry
    await ServiceRegistry.initialize(dslConfig, adapterConfig)
    
    // Your API routes
    require('./routes/users')(app, ServiceRegistry)
    require('./routes/partners')(app, ServiceRegistry)
    require('./routes/reports')(app, ServiceRegistry)
    
    // Health check endpoint
    app.get('/health', async (req, res) => {
      const health = await ServiceRegistry.healthCheck()
      res.json(health)
    })
    
    // Graceful shutdown
    process.on('SIGTERM', async () => {
      console.log('Received SIGTERM, shutting down gracefully...')
      await ServiceRegistry.shutdown()
      process.exit(0)
    })
    
    const port = process.env.PORT || 3000
    app.listen(port, () => {
      console.log(`🚀 Server running on port ${port}`)
    })
    
  } catch (error) {
    console.error('Failed to start server:', error)
    process.exit(1)
  }
}

startServer()
```

## 🛣️ Clean API Routes

Your API routes become clean and focused:

```javascript
// routes/users.js
module.exports = function(app, serviceRegistry) {
  const UserService = serviceRegistry.get('users')
  
  // Get users with pagination and filtering
  app.get('/api/users', async (req, res) => {
    try {
      const result = await UserService.getUsers(req.user.role, req.query)
      res.json(result)
    } catch (error) {
      console.error('Get users error:', error)
      res.status(500).json({ error: 'Failed to get users' })
    }
  })
  
  // Get single user
  app.get('/api/users/:id', async (req, res) => {
    try {
      const user = await UserService.getUserById(req.params.id, req.user.role, {
        requestingUserId: req.user.id,
        ipAddress: req.ip
      })
      
      if (!user) {
        return res.status(404).json({ error: 'User not found' })
      }
      
      res.json(user)
    } catch (error) {
      console.error('Get user error:', error)
      res.status(500).json({ error: 'Failed to get user' })
    }
  })
  
  // Create user
  app.post('/api/users', async (req, res) => {
    try {
      const user = await UserService.createUser(req.body, req.user.role, {
        requestingUserId: req.user.id
      })
      res.status(201).json(user)
    } catch (error) {
      console.error('Create user error:', error)
      res.status(400).json({ error: error.message })
    }
  })
  
  // Update user
  app.put('/api/users/:id', async (req, res) => {
    try {
      const user = await UserService.updateUser(req.params.id, req.body, req.user.role, {
        requestingUserId: req.user.id
      })
      res.json(user)
    } catch (error) {
      console.error('Update user error:', error)
      res.status(400).json({ error: error.message })
    }
  })
  
  // User analytics
  app.get('/api/users/analytics', async (req, res) => {
    try {
      const analytics = await UserService.getUserAnalytics(req.user.role, req.query)
      res.json(analytics)
    } catch (error) {
      console.error('Analytics error:', error)
      res.status(500).json({ error: 'Failed to get analytics' })
    }
  })
}
```

## 🧪 Testing Services

Test your services independently:

```javascript
// tests/UserService.test.js
const UserService = require('../services/UserService')
const ServiceRegistry = require('../services/ServiceRegistry')

describe('UserService', () => {
  beforeAll(async () => {
    await ServiceRegistry.initialize(testConfig, testAdapterConfig)
  })
  
  afterAll(async () => {
    await ServiceRegistry.shutdown()
  })
  
  test('admin can access all user fields', async () => {
    const users = await UserService.getUsers('admin', { limit: 1 })
    
    expect(users.users).toHaveLength(1)
    expect(users.users[0]).toHaveProperty('salary') // Admin can see salary
    expect(users.users[0]).not.toHaveProperty('password_hash') // Always filtered
  })
  
  test('user cannot access salary field', async () => {
    const users = await UserService.getUsers('user', { limit: 1 })
    
    expect(users.users).toHaveLength(1)
    expect(users.users[0]).not.toHaveProperty('salary') // Filtered for user role
  })
  
  test('guest cannot access users table', async () => {
    await expect(UserService.getUsers('guest')).rejects.toThrow('table_access_denied')
  })
})
```

## 🎯 Benefits of Service Provider Pattern

### ✅ Advantages

1. **Centralized Security**: All DSL logic in one place
2. **Clean API Endpoints**: Focus on HTTP concerns only
3. **Testable Services**: Business logic separated from framework
4. **Reusable**: Services can be used across different frameworks
5. **Maintainable**: Single source of truth for data access
6. **Type Safety**: Easy to add TypeScript definitions
7. **Performance**: Singleton pattern avoids repeated initialization

### 🏗️ Architecture Benefits

- **Separation of Concerns**: API layer handles HTTP, service layer handles business logic
- **Dependency Injection**: Easy to mock services for testing
- **Configuration Management**: Centralized DSL configuration
- **Error Handling**: Consistent error patterns across services
- **Monitoring**: Single point for logging and metrics
- **Scaling**: Services can be moved to microservices later

### 🔒 Security Benefits

- **No DSL Code in APIs**: Impossible to bypass security accidentally
- **Consistent Protection**: All data access goes through services
- **Audit Trail**: Central logging of all data operations
- **Role Validation**: Services enforce role requirements
- **Field Filtering**: Automatic field-level security

## 💡 Best Practices

1. **One Service Per Domain**: UserService, PartnerService, etc.
2. **Static Methods**: Services are stateless, use static methods
3. **Error Handling**: Throw DatabaseError with specific codes
4. **Context Passing**: Pass user context for audit trails
5. **Transaction Wrapping**: Use DSL provider transactions
6. **Health Checks**: Implement health monitoring
7. **Graceful Shutdown**: Clean up connections properly

This service provider pattern mirrors the architecture used by tracked_v2 and provides the clean separation you're looking for!