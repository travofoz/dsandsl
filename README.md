# DSANDSL - Data Service AND Security Layer

**Universal role-based data filtering and security for Node.js applications**

DSANDSL provides automatic, configurable, role-based filtering of data objects, arrays, database queries, and API responses. Built for applications that need granular access control without manual security implementation everywhere.

## 🚀 Quick Start

```javascript
const { DSLEngine, createConfig } = require('dsandsl')

// Configure your security model
const config = createConfig({
  roles: {
    admin: { level: 100 },
    manager: { level: 50 },
    user: { level: 10 }
  },
  
  fields: {
    'user.email': { minRole: 'user', category: 'personal' },
    'user.salary': { minRole: 'admin', category: 'financial' },
    'user.department': { minRole: 'manager', category: 'organizational' }
  }
})

const dsl = new DSLEngine(config)

// Automatic filtering based on user role
const userData = {
  name: "John Doe",
  email: "john@company.com", 
  salary: 75000,
  department: "Engineering"
}

const filtered = dsl.filter(userData, 'user') // Role: 'user'
console.log(filtered)
// Output: { name: "John Doe", email: "john@company.com" }
// salary and department automatically filtered out
```

## 🛡️ Why DSANDSL?

### Problems It Solves

- **Forgotten Security**: Manual field filtering is easy to forget and inconsistent
- **Data Leaks**: Accidentally exposing sensitive data in API responses
- **Complex Authorization**: Role-based access control scattered throughout codebase
- **Debugging Pain**: No visibility into why data is missing from responses
- **Performance**: Inefficient manual filtering of large datasets

### DSANDSL Solution

- **Automatic Enforcement**: Configure once, apply everywhere
- **Single Source of Truth**: Centralized security configuration
- **Framework Agnostic**: Works with Express, Next.js, or standalone
- **Performance Optimized**: Chunked processing for large datasets
- **Developer Friendly**: Rich metadata for debugging and development

## ⚡ Key Features

### 🔒 Universal Field Filtering
```javascript
// Configure field access by role
const config = {
  fields: {
    'financial.*': { minRole: 'admin' },
    'personal.email': { minRole: 'user' },
    'audit.*': { minRole: 'manager' }
  }
}

// Works on objects, arrays, nested data
const result = dsl.filter(complexData, userRole)
```

### 🎯 Role-Based Access Control
```javascript
const roles = {
  admin: { level: 100, inherits: ['manager'] },
  manager: { level: 50, inherits: ['user'] },
  user: { level: 10 }
}
```

### 📊 Rich Debugging Metadata
```javascript
const result = dsl.filter(data, 'user', { includeMetadata: true })
console.log(result.metadata)
// {
//   totalFields: 10,
//   allowedFields: 6,
//   filteredFields: [
//     { field: 'salary', reason: 'insufficient_role', requires: 'admin' }
//   ],
//   userRole: 'user'
// }
```

### 🏗️ Framework Integrations
```javascript
// Next.js API Route
import { NextJSAdapter } from 'dsandsl/adapters/nextjs'

export default NextJSAdapter.createHandler(dsl, {
  roleExtractor: (req) => req.user?.role
})

// Express Middleware
import { ExpressAdapter } from 'dsandsl/adapters/express'

app.use('/api/users', ExpressAdapter.middleware(dsl))
```

### 🗃️ Database Query Security
```javascript
// Automatically filter query results and validate access
const safeQuery = dsl.buildQuery({
  select: ['name', 'email', 'salary'], // salary auto-filtered for non-admin
  from: 'users',
  where: { active: true },
  userRole: 'user'
})
// Result: SELECT name, email FROM users WHERE active = true
```

## 📋 Configuration

### Field Access Patterns
```javascript
const config = {
  // Exact field matching
  'user.email': { minRole: 'user' },
  
  // Wildcard patterns
  'financial.*': { minRole: 'admin' },
  '*.password': { deny: true },
  
  // Nested object patterns
  'profile.contact.phone': { minRole: 'manager' },
  
  // Array element patterns
  'users[].salary': { minRole: 'admin' }
}
```

### Security Levels
```javascript
const securityConfig = {
  // Production: No metadata leakage
  production: {
    includeMetadata: false,
    includeFieldNames: false,
    logFiltering: false
  },
  
  // Development: Full debugging
  development: {
    includeMetadata: true,
    includeFieldNames: true,
    includeReasons: true,
    logFiltering: true
  }
}
```

### Database Integration
```javascript
const config = {
  database: {
    type: 'postgresql', // 'mysql', 'sqlite'
    connection: process.env.DATABASE_URL,
    
    // Table-level access control
    tables: {
      'sensitive_data': { minRole: 'admin' },
      'user_profiles': { minRole: 'user' }
    },
    
    // Query template access
    queries: {
      'salary_report': { minRole: 'admin', template: '...' }
    }
  }
}
```

## 🏃‍♂️ Getting Started

### Installation
```bash
npm install dsandsl
```

### Basic Setup
```javascript
const { DSLEngine, createConfig } = require('dsandsl')

// 1. Define your roles
const config = createConfig({
  roles: {
    admin: { level: 100 },
    user: { level: 10 }
  },
  
  // 2. Configure field access
  fields: {
    'sensitive_data': { minRole: 'admin' },
    'public_info': { minRole: 'user' }
  }
})

// 3. Create DSL instance
const dsl = new DSLEngine(config)

// 4. Use anywhere in your app
const filtered = dsl.filter(data, userRole)
```

### Next.js Integration
```javascript
// pages/api/users/[id].js
import { DSLEngine, createConfig, NextJSAdapter } from 'dsandsl'
import { getServerSession } from 'next-auth'

const dsl = new DSLEngine(createConfig(config))

export default NextJSAdapter.createHandler(dsl, {
  roleExtractor: async (req, res) => {
    const session = await getServerSession(req, res, authOptions)
    return session?.user?.role || 'guest'
  },
  
  dataProvider: async (req) => {
    const { id } = req.query
    return await getUserById(id)
  },
  
  autoFilter: true // Automatically filter response
})
```

### Express Integration
```javascript
const express = require('express')
const { DSLEngine, createConfig, ExpressAdapter } = require('dsandsl')

const app = express()
const dsl = new DSLEngine(createConfig(config))

// Add DSL middleware
app.use(ExpressAdapter.middleware(dsl, {
  roleExtractor: (req) => req.user?.role || 'guest',
  attachTo: 'dsl'
}))

// Use in routes
app.get('/api/users/:id', (req, res) => {
  const userData = getUserById(req.params.id)
  return req.dsl.json(userData) // Automatically filtered
})
```

## 🎮 Interactive Demo

Run the demo to see DSANDSL in action:

```bash
cd node_modules/dsandsl/demo
npm start
# Visit http://localhost:3000
```

The demo shows:
- Real-time role switching
- Field filtering visualization  
- Metadata inspection
- Performance benchmarks

## 🔧 Advanced Usage

### Custom Field Matchers
```javascript
const config = {
  customMatchers: [
    {
      pattern: /^audit_/,
      handler: (fieldName, value, userRole) => {
        return userRole === 'admin' || userRole === 'auditor'
      }
    }
  ]
}
```

### Performance Optimization
```javascript
// For large datasets
const dsl = new DSLEngine(config, {
  chunkSize: 5000,        // Process in chunks
  parallel: true,         // Use worker threads
  cacheEnabled: true      // Cache field access decisions
})
```

### Security Audit Mode
```javascript
// Enable comprehensive logging
const dsl = new DSLEngine(config, {
  auditMode: true,
  auditLogger: (event) => {
    console.log(`AUDIT: ${event.type} - ${event.details}`)
  }
})
```

## 🔌 Framework Adapters

DSANDSL provides first-class adapters for popular frameworks:

- **[Express.js](docs/ADAPTERS.md#expressjs-adapter)** - Middleware and route helpers
- **[Next.js](docs/ADAPTERS.md#nextjs-adapter)** - API route handlers and middleware
- **Generic** - Use with any Node.js framework

See the [complete adapter documentation](docs/ADAPTERS.md) for detailed examples and configuration options.

## 📚 API Reference

### DSLEngine

#### `new DSLEngine(config, options)`
Creates a new DSL engine instance.

#### `filter(data, userRole, options)`
Filters data based on user role and configured access rules.

#### `checkAccess(fieldName, userRole)`
Checks if a user role has access to a specific field.

#### `buildQuery(queryOptions)`
Builds a database query with automatic role-based field filtering.

### Configuration Schema

```typescript
interface DSLConfig {
  roles: {
    [roleName: string]: {
      level: number
      inherits?: string[]
    }
  }
  
  fields: {
    [fieldPattern: string]: {
      minRole: string
      category?: string
      deny?: boolean
    }
  }
  
  security?: {
    includeMetadata?: boolean
    includeFieldNames?: boolean
    logFiltering?: boolean
  }
}
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Make your changes
4. Add tests: `npm test`
5. Commit: `git commit -m 'Add amazing feature'`
6. Push: `git push origin feature/amazing-feature`
7. Open a Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

Built with inspiration from production affiliate tracking systems requiring granular data security and high-performance field filtering.

---

**DSANDSL** - Because security should be automatic, not an afterthought.