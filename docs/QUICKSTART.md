# DSANDSL Quick Start Guide

## 5-Minute Setup

### 1. Install
```bash
npm install dsandsl
```

### 2. Configure
```javascript
// config/dsl.js
const { createConfig } = require('dsandsl')

module.exports = createConfig({
  roles: {
    admin: { level: 100 },
    manager: { level: 50 },
    user: { level: 10 }
  },
  
  fields: {
    // Personal data - user level access
    'name': { minRole: 'user', category: 'personal' },
    'email': { minRole: 'user', category: 'personal' },
    
    // Financial data - admin only
    'salary': { minRole: 'admin', category: 'financial' },
    'bonus': { minRole: 'admin', category: 'financial' },
    
    // Management data - manager level
    'department': { minRole: 'manager', category: 'organizational' },
    'team_size': { minRole: 'manager', category: 'organizational' },
    
    // Always blocked
    'password': { deny: true },
    'ssn': { deny: true }
  }
})
```

### 3. Basic Usage
```javascript
const { DSLEngine } = require('dsandsl')
const config = require('./config/dsl')

const dsl = new DSLEngine(config)

// Sample data
const employeeData = {
  name: "John Doe",
  email: "john@company.com",
  salary: 75000,
  bonus: 5000,
  department: "Engineering", 
  team_size: 8,
  password: "secret123",
  ssn: "123-45-6789"
}

// Filter for different roles
console.log("User view:", dsl.filter(employeeData, 'user'))
// Output: { name: "John Doe", email: "john@company.com" }

console.log("Manager view:", dsl.filter(employeeData, 'manager'))
// Output: { name: "John Doe", email: "john@company.com", department: "Engineering", team_size: 8 }

console.log("Admin view:", dsl.filter(employeeData, 'admin'))
// Output: { name: "John Doe", email: "john@company.com", salary: 75000, bonus: 5000, department: "Engineering", team_size: 8 }
```

## Framework Integration

### Next.js API Route
```javascript
// pages/api/employees/[id].js
import { DSLEngine, NextJSAdapter } from 'dsandsl'
import { getServerSession } from 'next-auth'
import config from '../../../config/dsl'

const dsl = new DSLEngine(config)

export default NextJSAdapter.createHandler(dsl, {
  roleExtractor: async (req, res) => {
    const session = await getServerSession(req, res, authOptions)
    return session?.user?.role || 'guest'
  },
  
  dataProvider: async (req) => {
    const { id } = req.query
    return await getEmployeeById(id)
  }
})
```

### Express Route
```javascript
// routes/employees.js
const express = require('express')
const { DSLEngine, ExpressAdapter } = require('dsandsl')
const config = require('../config/dsl')

const router = express.Router()
const dsl = new DSLEngine(config)

router.get('/:id', ExpressAdapter.middleware(dsl, {
  roleExtractor: (req) => req.user?.role || 'guest'
}), async (req, res) => {
  const employee = await getEmployeeById(req.params.id)
  res.json(req.dsl.filter(employee))
})

module.exports = router
```

## Development Mode

Enable rich debugging during development:

```javascript
const config = createConfig({
  // ... your config
  
  debug: {
    includeMetadata: true,
    logFiltering: true,
    validateConfig: true
  }
})

const dsl = new DSLEngine(config)

const result = dsl.filter(data, 'user', { includeMetadata: true })
console.log(result)
// {
//   data: { name: "John", email: "john@company.com" },
//   metadata: {
//     totalFields: 8,
//     allowedFields: 2,
//     filteredFields: [
//       { field: 'salary', reason: 'insufficient_role', requires: 'admin', userRole: 'user' },
//       { field: 'department', reason: 'insufficient_role', requires: 'manager', userRole: 'user' }
//     ],
//     performance: { filteringTime: '0.5ms' }
//   }
// }
```

## Common Patterns

### Wildcard Field Matching
```javascript
fields: {
  'financial.*': { minRole: 'admin' },     // financial.salary, financial.bonus
  '*.password': { deny: true },            // user.password, admin.password
  'audit_*': { minRole: 'manager' },       // audit_log, audit_trail
  'profile.contact.*': { minRole: 'user' } // profile.contact.email, profile.contact.phone
}
```

### Role Inheritance
```javascript
roles: {
  admin: { 
    level: 100, 
    inherits: ['manager', 'user'] // Admin gets all manager and user permissions
  },
  manager: { 
    level: 50, 
    inherits: ['user'] // Manager gets all user permissions
  },
  user: { level: 10 }
}
```

### Array Filtering
```javascript
const employees = [
  { name: "John", salary: 50000, role: "developer" },
  { name: "Jane", salary: 75000, role: "manager" },
  { name: "Bob", salary: 90000, role: "director" }
]

// Automatically filters each object in the array
const filtered = dsl.filter(employees, 'user')
// Result: [{ name: "John" }, { name: "Jane" }, { name: "Bob" }]
```

## Next Steps

1. **[Configuration Guide](CONFIGURATION.md)** - Advanced configuration options
2. **[API Reference](API.md)** - Complete API documentation  
3. **[Framework Integration](FRAMEWORKS.md)** - Detailed framework setup
4. **[Performance Tuning](PERFORMANCE.md)** - Optimization techniques
5. **[Security Best Practices](SECURITY.md)** - Production security guidelines

## Need Help?

- 📚 [Full Documentation](../README.md)
- 🎮 [Interactive Demo](../demo/README.md)
- 🐛 [Issue Tracker](https://github.com/yourusername/dsandsl/issues)
- 💬 [Discussions](https://github.com/yourusername/dsandsl/discussions)