# DSANDSL - Data Service AND Security Layer

**Universal role-based data filtering and security for Node.js applications**

DSANDSL provides automatic, configurable, role-based filtering of data objects, arrays, database queries, and API responses. Built for applications that need granular access control without manual security implementation everywhere.

## ⚠️ CRITICAL: This is NOT a Regular ORM

**DSANDSL is a SECURITY FRAMEWORK that happens to include database capabilities.**

- ✅ Use it if you want **bulletproof security** enforced at the data layer
- ✅ Use it if you want **zero possibility** of developers bypassing security
- ✅ Use it if you want **consistent, centralized** data access patterns
- 🚫 **DO NOT** use it if you want manual control over database queries
- 🚫 **DO NOT** use it if you want to write raw SQL in API endpoints
- 🚫 **DO NOT** use it if you think the Service Provider pattern is "overkill"

**If you want a traditional ORM with manual control, use Prisma, Sequelize, or TypeORM instead.**

## 💡 Real-World Origin Story

DSANDSL was born from a practical business need: **preventing affiliate partners from seeing data they shouldn't have access to**. 

**Specific Business Risks:**
- Partners seeing internal costs/revenue data
- Partners accessing other partner's confidential information  
- Data leaks during rapid development iterations due to lack of layered security

The creator's business partner was (rightfully) paranoid about these data exposure risks, and the development team found themselves constantly contemplating "what consumes what" every time they implemented a new API endpoint.

**The DSANDSL Workflow:**
1. Just implement your API and ask the service layer for whatever data you want
2. The service layer returns only what the user role is allowed to have
3. If something's missing that should be there, whitelist it in the DSL configuration
4. Enable debug warnings to quickly see what's being filtered and why

**Result:** You stop worrying about data leaks and focus on building features. The security is automatic and consistent across your entire application.


## 🚀 Quick Start (Service Provider Pattern - MANDATORY)

**⚠️ WARNING: If you don't use the Service Provider pattern, you're using DSANDSL wrong!**

```javascript
const { DSLServiceProvider, BaseService, createConfig } = require('dsandsl')

// 1. Configure your security model
const config = createConfig({
  roles: {
    admin: { level: 100 },
    manager: { level: 50 },
    user: { level: 10 }
  },
  
  fields: {
    'users.email': { minRole: 'user' },
    'users.salary': { minRole: 'admin' },
    'users.password_hash': { deny: true }
  },
  
  database: {
    tables: {
      users: { minRole: 'user', operations: ['SELECT', 'INSERT', 'UPDATE'] }
    }
  }
})

// 2. Initialize the service provider (once at app startup)
await DSLServiceProvider.initialize(config, {
  type: 'postgresql',
  connection: {
    host: 'localhost',
    database: 'myapp',
    user: 'postgres',
    password: 'password'
  }
})

// 3. Create domain services
class UserService extends BaseService {
  static async getUsers(userRole, options = {}) {
    return this.select('users', userRole, options)
  }
  
  static async createUser(userData, userRole) {
    return this.insert('users', userData, userRole)
  }
}

// 4. Use in your API endpoints (security is automatic)
app.get('/api/users', async (req, res) => {
  const users = await UserService.getUsers(req.user.role, req.query)
  res.json(users) // Automatically filtered by role!
})
```

**🎯 This is a SECURITY FRAMEWORK, not a regular ORM. Use it correctly or use something else.**

## 🛡️ Why DSANDSL?

### Problems It Solves

- **Forgotten Security**: Manual field filtering is easy to forget and inconsistent
- **Data Leaks**: Accidentally exposing sensitive data in API responses
- **Complex Authorization**: Role-based access control scattered throughout codebase
- **SQL Injection**: Field names become attack vectors in poorly written APIs
- **API Layer Vulnerabilities**: Developers bypass security with careless input handling
- **Debugging Pain**: No visibility into why data is missing from responses

### Defense-in-Depth Security

DSANDSL provides **data layer security** that protects even when API code is poorly written:

```javascript
// 🔥 BAD API: No input validation
app.get('/api/users', (req, res) => {
  // Developer directly passes user input - DANGEROUS!
  const fields = req.query.fields?.split(',') || ['*']
  const users = await db.select(fields).from('users')
  res.json(users)
})

// ✅ PROTECTED: DSANDSL prevents SQL injection and unauthorized access
app.get('/api/users', (req, res) => {
  // Even with dangerous field names, DSL validates and filters
  const fields = req.query.fields?.split(',') || ['*'] // Could be malicious!
  const users = await adapter.select('users', req.user.role, { fields })
  res.json(users) // Safe - malicious fields blocked, unauthorized fields filtered
})
```

**Key Protection Mechanisms:**
- 🗺️ **FieldMapper** validates all field names before SQL generation
- 🛡️ **Role-based filtering** enforces permissions at data layer
- 🔒 **Parameterized queries** prevent SQL injection in values
- 🏗️ **Table access control** validates operations by role
- ⚡ **Automatic conversion** between camelCase and snake_case
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

## 🚨 Critical: Understand How to Use DSANDSL

**⚠️ IF YOUR CODE DOESN'T LOOK LIKE THE SERVICE PROVIDER PATTERN, YOU'RE DOING IT WRONG!**

```bash
# See the RIGHT WAY vs WRONG WAY comparison
node examples/service-pattern-comparison.js

# Bad API, Good DSL protection examples
node examples/bad-api-good-dsl.js

# FieldMapper security demonstration  
node examples/fieldmapper-protection.js

# SQL injection protection tests
node test-security.cjs
```

**🎯 Key Message: If you want manual control over database queries, use Prisma, Sequelize, or another ORM. DSANDSL is a SECURITY FRAMEWORK that enforces secure patterns.**

These examples demonstrate:
- 🚫 Why direct DSL usage defeats the purpose
- ✅ How Service Provider pattern ensures security
- ✅ Protection against SQL injection in field names
- ✅ Role-based filtering despite API vulnerabilities 
- ✅ Defense-in-depth security at the data layer
- ✅ FieldMapper preventing column name attacks

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

## ⛪ The Church of Murphy Engineering Philosophy

DSANDSL was built following the sacred **Church of Murphy** engineering principles for the **troubleshooting, development, and testing** phases of software engineering:

**Murphy's Law:** *"Anything that can go wrong, will go wrong."*

**The Church of Murphy Tenets (Development & Testing):**
- 🔧 **Measure twice, cut once** - Engineer systematically during implementation
- 🔍 **Investigate until you stop finding problems** - Thorough testing and debugging
- 🛡️ **Assume developers will make mistakes** - Build defensive systems and safeguards
- 🏗️ **Make the wrong way difficult** - Design APIs that guide toward correct usage
- ⚡ **Fail fast and fail safe** - Catch problems early in development and testing

*Note: This philosophy specifically applies to the troubleshooting, implementation, and testing aspects of engineering - not research, planning, or other development phases.*

In the Church of Murphy, we don't fight Murphy's Law during development - we **embrace it** by building systems that make "going wrong" much harder during coding and testing.

**DSANDSL's Church of Murphy Design:**
- Makes accidentally exposing sensitive data difficult ✅
- Makes bypassing security require deliberate effort ✅  
- Makes writing vulnerable queries harder ✅
- Makes forgetting authorization unlikely ✅
- Reduces data leak risk during rapid development ✅

---

## 🙏 A Prayer to Murphy

*Our Murphy, who art in chaos,  
Hallowed be thy law.  
Thy failures come,  
Thy bugs be done,  
On prod as they are in staging.*

*Give us this day our daily builds,  
And forgive us our tech debt,  
As we forgive those who merge without testing.  
And lead us not into production,  
But deliver us from data leaks.*

*For thine is the chaos,  
The edge cases,  
And the midnight pages,  
Forever and ever.*

***Amen.*** ⛪

---

**DSANDSL** - Because security should be automatic, not an afterthought.

*Built with the blessing of Murphy - may your data always be filtered and your queries always be safe.* 🛡️