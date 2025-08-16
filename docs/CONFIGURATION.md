# DSANDSL Configuration Guide

## Configuration Structure

```javascript
const config = {
  // Core role definitions
  roles: { /* ... */ },
  
  // Field access rules
  fields: { /* ... */ },
  
  // Database integration (optional)
  database: { /* ... */ },
  
  // Security settings
  security: { /* ... */ },
  
  // Performance options
  performance: { /* ... */ },
  
  // Debug and development
  debug: { /* ... */ }
}
```

## Roles Configuration

### Basic Role Hierarchy
```javascript
roles: {
  admin: { level: 100 },
  manager: { level: 50 },
  user: { level: 10 },
  guest: { level: 0 }
}
```

### Role Inheritance
```javascript
roles: {
  admin: { 
    level: 100,
    inherits: ['manager', 'user'] // Gets all permissions from manager and user
  },
  manager: { 
    level: 50,
    inherits: ['user'] // Gets all permissions from user
  },
  user: { 
    level: 10 
  }
}
```

### Custom Role Properties
```javascript
roles: {
  admin: {
    level: 100,
    description: "Full system access",
    inherits: ['manager'],
    customPermissions: ['system_config', 'user_management']
  },
  manager: {
    level: 50,
    description: "Department management access",
    inherits: ['user'],
    customPermissions: ['team_reports', 'budget_view']
  }
}
```

## Field Access Rules

### Exact Field Matching
```javascript
fields: {
  'name': { minRole: 'user', category: 'personal' },
  'email': { minRole: 'user', category: 'personal' },
  'salary': { minRole: 'admin', category: 'financial' },
  'ssn': { deny: true } // Always blocked
}
```

### Wildcard Patterns
```javascript
fields: {
  // Prefix wildcards
  'financial.*': { minRole: 'admin' },        // financial.salary, financial.bonus
  'audit.*': { minRole: 'manager' },          // audit.log, audit.timestamp
  
  // Suffix wildcards  
  '*.password': { deny: true },               // user.password, admin.password
  '*.secret': { minRole: 'admin' },           // api.secret, db.secret
  
  // Nested object patterns
  'profile.contact.*': { minRole: 'user' },   // profile.contact.email
  'settings.security.*': { minRole: 'admin' }, // settings.security.mfa
  
  // Array element patterns
  'users[].salary': { minRole: 'admin' },     // salary in user arrays
  'logs[].ip_address': { minRole: 'manager' } // IP addresses in log arrays
}
```

### Advanced Pattern Matching
```javascript
fields: {
  // Regular expressions
  '/^temp_/': { minRole: 'admin' },           // temp_data, temp_config
  '/.*_internal$/': { minRole: 'manager' },   // data_internal, config_internal
  
  // Custom functions
  'dynamic_field': {
    minRole: 'user',
    condition: (fieldName, value, userRole, context) => {
      // Custom logic for field access
      return context.department === 'IT' || userRole === 'admin'
    }
  }
}
```

### Field Categories
```javascript
fields: {
  'name': { minRole: 'user', category: 'personal' },
  'email': { minRole: 'user', category: 'personal' },
  'salary': { minRole: 'admin', category: 'financial' },
  'department': { minRole: 'manager', category: 'organizational' },
  'created_at': { minRole: 'user', category: 'metadata' }
}

// Query by category
const personalFields = dsl.getFieldsByCategory('personal', 'user')
// Returns: ['name', 'email']
```

## Database Integration

### Basic Database Config
```javascript
database: {
  type: 'postgresql', // 'mysql', 'sqlite', 'mongodb'
  connection: process.env.DATABASE_URL,
  
  // Table-level access control
  tables: {
    'sensitive_data': { minRole: 'admin' },
    'user_profiles': { minRole: 'user' },
    'audit_logs': { minRole: 'manager' }
  }
}
```

### Query Templates
```javascript
database: {
  queries: {
    'user_list': {
      minRole: 'manager',
      template: 'SELECT id, name, email FROM users WHERE active = true',
      description: 'Basic user listing for managers'
    },
    
    'salary_report': {
      minRole: 'admin', 
      template: 'SELECT name, salary, department FROM employees WHERE salary > ?',
      description: 'Salary reporting for admins only'
    },
    
    'user_profile': {
      minRole: 'user',
      template: 'SELECT * FROM profiles WHERE user_id = ?',
      fieldFiltering: true // Apply DSL field filtering to results
    }
  }
}
```

### View Access Control
```javascript
database: {
  views: {
    'financial_summary': { minRole: 'admin' },
    'department_stats': { minRole: 'manager' },
    'public_directory': { minRole: 'user' }
  }
}
```

## Security Settings

### Environment-Based Security
```javascript
security: {
  // Production settings
  production: {
    includeMetadata: false,     // Never leak field information
    includeFieldNames: false,   // Don't show what was filtered
    logFiltering: false,        // No debug logging
    validateConfig: false       // Skip config validation for performance
  },
  
  // Development settings
  development: {
    includeMetadata: true,      // Full debugging info
    includeFieldNames: true,    // Show filtered field names
    includeReasons: true,       // Show why fields were filtered
    logFiltering: true,         // Log all filtering actions
    validateConfig: true        // Validate configuration on startup
  },
  
  // Staging settings
  staging: {
    includeMetadata: true,      // Debugging enabled
    includeFieldNames: false,   // Don't leak schema in staging
    includeReasons: true,       // Show access reasons
    logFiltering: false         // No performance impact
  }
}
```

### Audit Configuration
```javascript
security: {
  audit: {
    enabled: true,
    logLevel: 'info', // 'debug', 'info', 'warn', 'error'
    
    // Custom audit logger
    logger: (event) => {
      console.log(`[DSL-AUDIT] ${event.timestamp}: ${event.action}`, {
        user: event.userRole,
        resource: event.resource,
        result: event.result
      })
    },
    
    // What to audit
    events: [
      'field_access_denied',
      'table_access_denied', 
      'query_blocked',
      'bulk_filtering'
    ]
  }
}
```

## Performance Configuration

### Optimization Settings
```javascript
performance: {
  // Chunked processing for large datasets
  chunkSize: 1000,              // Process 1000 items at a time
  
  // Parallel processing
  parallel: true,               // Use worker threads for large arrays
  maxWorkers: 4,                // Limit worker threads
  
  // Caching
  cacheEnabled: true,           // Cache field access decisions
  cacheTTL: 300000,            // Cache TTL in milliseconds (5 minutes)
  
  // Memory management
  maxMemoryUsage: '100MB',      // Memory limit for large operations
  
  // Performance monitoring
  monitoring: {
    enabled: true,
    slowOperationThreshold: 100, // Log operations > 100ms
    metricsCollection: true      // Collect performance metrics
  }
}
```

### Streaming Configuration
```javascript
performance: {
  streaming: {
    enabled: true,
    batchSize: 500,              // Stream in batches of 500
    bufferSize: 10,              // Buffer 10 batches in memory
    backpressure: true           // Handle backpressure automatically
  }
}
```

## Debug Configuration

### Development Debugging
```javascript
debug: {
  // Validation
  validateConfig: true,          // Validate config on startup
  strictMode: true,              // Strict field matching
  
  // Logging
  logLevel: 'debug',             // 'error', 'warn', 'info', 'debug'
  logFiltering: true,            // Log all filtering operations
  logPerformance: true,          // Log performance metrics
  
  // Metadata
  includeMetadata: true,         // Include filtering metadata
  includeFieldNames: true,       // Show filtered field names
  includeReasons: true,          // Show access denial reasons
  includeTimings: true,          // Include operation timings
  
  // Testing
  testMode: false,               // Enable test mode features
  mockData: false                // Use mock data for testing
}
```

### Custom Debug Handlers
```javascript
debug: {
  customHandlers: {
    onFieldFiltered: (fieldName, reason, context) => {
      console.log(`Field ${fieldName} filtered: ${reason}`)
    },
    
    onSlowOperation: (operation, duration, context) => {
      console.warn(`Slow operation ${operation}: ${duration}ms`)
    },
    
    onConfigError: (error, context) => {
      console.error(`Configuration error: ${error.message}`)
    }
  }
}
```

## Framework-Specific Configuration

### Next.js Configuration
```javascript
frameworks: {
  nextjs: {
    sessionProvider: 'next-auth',
    roleExtractor: async (req, res) => {
      const session = await getServerSession(req, res, authOptions)
      return session?.user?.role || 'guest'
    },
    
    // API route configuration
    apiRoutes: {
      autoWrap: true,              // Automatically wrap API routes
      defaultRole: 'guest',        // Default role for unauthenticated requests
      errorHandler: (error, req, res) => {
        res.status(403).json({ error: 'Access denied' })
      }
    }
  }
}
```

### Express Configuration
```javascript
frameworks: {
  express: {
    sessionProvider: 'express-session',
    roleExtractor: (req) => req.user?.role || 'guest',
    
    // Middleware configuration
    middleware: {
      autoAttach: true,            // Attach DSL to req object
      propertyName: 'dsl',         // req.dsl
      errorHandler: (error, req, res, next) => {
        res.status(403).json({ error: 'Insufficient permissions' })
      }
    }
  }
}
```

## Configuration Validation

DSANDSL automatically validates your configuration and provides helpful error messages:

```javascript
// Invalid configuration example
const invalidConfig = {
  roles: {
    admin: { level: 'high' } // ❌ Level must be a number
  },
  fields: {
    'invalid.*.pattern': { minRole: 'nonexistent' } // ❌ Role doesn't exist
  }
}

// Validation error output:
// ❌ Configuration Error:
// - roles.admin.level: Expected number, got string "high"
// - fields["invalid.*.pattern"].minRole: Role "nonexistent" not defined in roles
```

## Environment Variables

Override configuration with environment variables:

```bash
# Role configuration
DSL_DEFAULT_ROLE=guest
DSL_ADMIN_ROLE=admin

# Security settings
DSL_INCLUDE_METADATA=false
DSL_LOG_FILTERING=true

# Performance settings  
DSL_CHUNK_SIZE=1000
DSL_CACHE_ENABLED=true
DSL_CACHE_TTL=300000

# Database settings
DSL_DB_TYPE=postgresql
DSL_DB_CONNECTION=postgresql://localhost/mydb
```

## Best Practices

### 1. Start Simple
```javascript
// Begin with basic role hierarchy
const config = {
  roles: { admin: { level: 100 }, user: { level: 10 } },
  fields: { 'sensitive_data': { minRole: 'admin' } }
}
```

### 2. Use Categories
```javascript
// Group related fields
fields: {
  'financial.*': { minRole: 'admin', category: 'financial' },
  'personal.*': { minRole: 'user', category: 'personal' }
}
```

### 3. Environment-Specific Security
```javascript
// Different settings per environment
security: process.env.NODE_ENV === 'production' 
  ? { includeMetadata: false, logFiltering: false }
  : { includeMetadata: true, logFiltering: true }
```

### 4. Regular Config Audits
```javascript
// Use built-in config analysis
const analysis = dsl.analyzeConfig()
console.log(analysis.recommendations) // Suggests improvements
console.log(analysis.securityIssues)  // Identifies potential problems
```