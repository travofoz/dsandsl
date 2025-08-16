# Framework Adapters

DSANDSL provides first-class adapters for popular Node.js frameworks, making it easy to integrate role-based data filtering into your existing applications.

## Express.js Adapter

### Basic Middleware

```javascript
const express = require('express')
const { DSLEngine, createConfig, ExpressAdapter } = require('dsandsl')

const app = express()

// Configure DSL
const config = createConfig({
  roles: {
    admin: { level: 100 },
    user: { level: 10 }
  },
  fields: {
    'salary': { minRole: 'admin' },
    'email': { minRole: 'user' }
  }
})

const dsl = new DSLEngine(config)

// Add DSL middleware
app.use(ExpressAdapter.middleware(dsl, {
  roleExtractor: (req) => req.user?.role || 'guest',
  attachTo: 'dsl' // Available as req.dsl
}))

// Use in routes
app.get('/api/users/:id', (req, res) => {
  const userData = getUserById(req.params.id)
  
  // Automatic filtering based on user role
  return req.dsl.json(userData)
})
```

### Advanced Middleware Configuration

```javascript
app.use('/api/admin/*', ExpressAdapter.middleware(dsl, {
  roleExtractor: (req) => req.headers['x-user-role'] || 'guest',
  attachTo: 'security',
  skipPaths: ['/api/admin/health', '/api/admin/metrics'],
  errorHandler: (error, req, res, next) => {
    console.error('DSL Error:', error)
    res.status(403).json({ error: 'Access denied' })
  }
}))
```

### Route-Specific Middleware

```javascript
const routeMiddleware = ExpressAdapter.createRouteMiddleware(dsl, {
  users: { 
    roleExtractor: (req) => req.session?.role || 'guest',
    attachTo: 'userDSL'
  },
  admin: {
    roleExtractor: (req) => req.user?.role || 'guest',
    attachTo: 'adminDSL'
  }
})

app.use('/api/users', routeMiddleware.users)
app.use('/api/admin', routeMiddleware.admin)
```

### Role-Based Route Protection

```javascript
// Protect entire route
app.use('/api/admin', ExpressAdapter.requireRoles(['admin', 'manager']))

// Protect specific route
app.get('/api/financial-data', 
  ExpressAdapter.requireRoles(['admin']),
  (req, res) => {
    // Only admins can access this
    res.json(getFinancialData())
  }
)
```

### DSL Helper Methods

When using the Express adapter, the following methods are available on `req.dsl`:

```javascript
app.get('/api/users', (req, res) => {
  const users = getAllUsers()
  
  // Filter data
  const filtered = req.dsl.filter(users)
  
  // Check field access
  const canViewSalary = req.dsl.checkAccess('salary')
  
  // Get allowed fields
  const allowedFields = req.dsl.getAllowedFields('financial')
  
  // Response helpers
  req.dsl.json(users) // Auto-filtered JSON response
  req.dsl.jsonWithMetadata(users) // Include filtering metadata
  req.dsl.accessDenied('Insufficient permissions', 'salary')
  
  // Access role information
  console.log('User role:', req.dsl.userRole)
})
```

### Error Handling Middleware

```javascript
app.use(ExpressAdapter.errorMiddleware({
  includeStack: process.env.NODE_ENV === 'development',
  logger: console.error
}))
```

## Next.js Adapter

### Basic API Route Handler

```javascript
// pages/api/users/[id].js
import { DSLEngine, createConfig, NextJSAdapter } from 'dsandsl'
import { getServerSession } from 'next-auth'

const dsl = new DSLEngine(config)

export default NextJSAdapter.createHandler(dsl, {
  roleExtractor: async (req, res) => {
    const session = await getServerSession(req, res, authOptions)
    return session?.user?.role || 'guest'
  },
  
  dataProvider: async (req) => {
    const { id } = req.query
    return await getUserById(id)
  },
  
  autoFilter: true // Automatically filter the response
})
```

### Manual Response Handling

```javascript
// pages/api/custom.js
export default NextJSAdapter.createHandler(dsl, {
  roleExtractor: async (req) => req.user?.role || 'guest'
})

// Then in your handler
export default async function handler(req, res) {
  const result = await NextJSAdapter.createHandler(dsl, config)(req, res)
  
  if (typeof result === 'object' && result.dsl) {
    const { dsl, req, res } = result
    
    // Custom logic
    const data = await getCustomData()
    
    // Use DSL helpers
    return dsl.json(data)
  }
}
```

### REST Operations

```javascript
// pages/api/resources.js
export default NextJSAdapter.createRESTHandler(dsl, {
  get: async (req, res, dsl) => {
    const resources = await getResources()
    return dsl.filter(resources)
  },
  
  post: async (req, res, dsl) => {
    // Check permissions
    if (!dsl.checkAccess('create_resource').allowed) {
      return res.status(403).json({ error: 'Cannot create resources' })
    }
    
    const newResource = await createResource(req.body)
    return dsl.filter(newResource)
  },
  
  roleExtractor: async (req, res) => {
    const session = await getServerSession(req, res, authOptions)
    return session?.user?.role || 'guest'
  }
})
```

### Method and CORS Configuration

```javascript
export default NextJSAdapter.createHandler(dsl, {
  methods: ['GET', 'POST'],
  cors: {
    origin: 'https://myapp.com',
    methods: ['GET', 'POST', 'OPTIONS'],
    headers: ['Content-Type', 'Authorization'],
    credentials: true
  },
  roleExtractor: async (req) => extractRoleFromJWT(req.headers.authorization)
})
```

### Paginated Responses

```javascript
export default NextJSAdapter.createHandler(dsl, {
  dataProvider: async (req) => {
    const { page = 1, limit = 10 } = req.query
    const { data, total } = await getPaginatedUsers(page, limit)
    
    return { data, page, limit, total }
  },
  
  roleExtractor: async (req) => req.user?.role || 'guest'
})

// Response will be automatically formatted as:
// {
//   data: [...filtered data...],
//   pagination: {
//     page: 1,
//     limit: 10,
//     total: 150,
//     pages: 15
//   }
// }
```

### Webhook Handler

```javascript
// pages/api/webhooks/stripe.js
export default NextJSAdapter.createWebhookHandler(dsl, 
  async (body, req, res, dsl) => {
    // Process webhook
    const event = await processStripeEvent(body)
    
    // Filter response data with admin privileges
    return dsl.filter(event)
  },
  {
    validateSignature: async (req) => {
      return validateStripeSignature(req)
    },
    roleForWebhook: 'admin', // Webhooks run with admin privileges
    allowedMethods: ['POST']
  }
)
```

### Next.js Middleware Integration

```javascript
// middleware.js
import { NextJSAdapter } from 'dsandsl'

export const middleware = NextJSAdapter.createMiddleware(dsl, {
  roleExtractor: async (request) => {
    const token = request.headers.get('authorization')
    return await extractRoleFromToken(token)
  },
  
  pathMatcher: (pathname) => {
    return pathname.startsWith('/api/protected/')
  }
})

export const config = {
  matcher: '/api/protected/:path*'
}
```

### DSL Helper Methods

Next.js handlers provide these DSL helpers:

```javascript
export default NextJSAdapter.createHandler(dsl, {
  dataProvider: async (req, res) => {
    const data = await getData()
    
    // Available on the dsl object:
    // req.dsl.filter(data, options)
    // req.dsl.checkAccess(fieldName)
    // req.dsl.getAllowedFields(category)
    // req.dsl.json(data) // Auto-filtered JSON response
    // req.dsl.jsonWithMetadata(data) // Include metadata
    // req.dsl.paginated(data, page, limit, total, meta)
    // req.dsl.accessDenied(message, field)
    // req.dsl.error(message, status, code)
    // req.dsl.userRole // Current user role
    
    return req.dsl.json(data)
  }
})
```

### Role-Based Route Protection

```javascript
// Protect entire API route
export default NextJSAdapter.requireRoles(['admin', 'manager'])(
  async (req, res) => {
    // Only admin and manager can access
    const data = await getSensitiveData()
    res.json(data)
  }
)

// Or use in combination with handler
const protectedHandler = NextJSAdapter.requireRoles(['admin'])(
  NextJSAdapter.createHandler(dsl, config)
)

export default protectedHandler
```

## Configuration Options

### Express Adapter Options

```javascript
ExpressAdapter.middleware(dsl, {
  roleExtractor: (req, res) => string,     // Extract user role
  attachTo: 'dsl',                         // Property name on req object
  autoFilter: true,                        // Auto-filter responses
  errorHandler: (error, req, res, next) => void, // Custom error handling
  contextExtractor: (req, res) => object,  // Additional context
  skipPaths: ['/health', '/metrics']       // Paths to skip DSL processing
})
```

### Next.js Adapter Options

```javascript
NextJSAdapter.createHandler(dsl, {
  roleExtractor: async (req, res) => string,  // Extract user role
  dataProvider: async (req, res) => any,      // Provide data for filtering
  autoFilter: true,                           // Auto-filter responses
  methods: ['GET', 'POST'],                   // Allowed HTTP methods
  cors: boolean | object,                     // CORS configuration
  validateMethod: true,                       // Validate HTTP methods
  errorHandler: (error, req, res) => void    // Custom error handling
})
```

## Error Handling

Both adapters provide comprehensive error handling:

### DSL Errors

```javascript
// Access denied errors (403)
{
  error: 'ACCESS_DENIED',
  message: 'Access denied. Required roles: admin. User role: user',
  userRole: 'user',
  requiredRoles: ['admin'],
  timestamp: '2023-12-07T10:30:00.000Z'
}

// Configuration errors (400)
{
  error: 'CONFIGURATION_ERROR',
  message: 'Invalid field pattern: invalid.*',
  timestamp: '2023-12-07T10:30:00.000Z'
}
```

### Framework Errors

```javascript
// Method not allowed (405)
{
  error: 'METHOD_NOT_ALLOWED',
  message: 'Method DELETE not allowed',
  allowedMethods: ['GET', 'POST'],
  timestamp: '2023-12-07T10:30:00.000Z'
}
```

## Performance

Framework adapters add minimal overhead:

- **Express middleware**: ~0.01ms per request
- **Next.js handler**: ~0.02ms per request  
- **Raw DSL filtering**: ~0.037ms per operation

The adapter overhead is negligible compared to typical database queries (10-50ms) and network latency (20-100ms).

## Best Practices

### 1. Role Extraction

```javascript
// ✅ Good: Async role extraction with error handling
roleExtractor: async (req, res) => {
  try {
    const session = await getServerSession(req, res, authOptions)
    return session?.user?.role || 'guest'
  } catch (error) {
    console.error('Role extraction failed:', error)
    return 'guest'
  }
}

// ❌ Bad: Synchronous role extraction that might fail
roleExtractor: (req) => req.user.role // Could throw if user is undefined
```

### 2. Error Handling

```javascript
// ✅ Good: Custom error handler with logging
errorHandler: (error, req, res, next) => {
  console.error('DSL Error:', {
    message: error.message,
    path: req.path,
    userRole: req.dsl?.userRole
  })
  
  res.status(403).json({
    error: 'Access denied',
    message: 'Insufficient permissions'
  })
}
```

### 3. Performance Optimization

```javascript
// ✅ Good: Skip DSL processing for health checks
ExpressAdapter.middleware(dsl, {
  skipPaths: ['/health', '/metrics', '/api/public/*']
})

// ✅ Good: Use appropriate chunk sizes for large datasets
const dsl = new DSLEngine(config, {
  chunkSize: 5000 // For processing large arrays
})
```

### 4. Security

```javascript
// ✅ Good: Strict CORS configuration
cors: {
  origin: ['https://myapp.com', 'https://admin.myapp.com'],
  credentials: true,
  methods: ['GET', 'POST']
}

// ❌ Bad: Overly permissive CORS
cors: true // Allows any origin
```

## Integration Examples

### Express + Passport

```javascript
app.use(passport.initialize())
app.use(passport.session())

app.use(ExpressAdapter.middleware(dsl, {
  roleExtractor: (req) => req.user?.role || 'guest'
}))
```

### Next.js + NextAuth

```javascript
export default NextJSAdapter.createHandler(dsl, {
  roleExtractor: async (req, res) => {
    const session = await getServerSession(req, res, authOptions)
    return session?.user?.role || 'guest'
  }
})
```

### Express + JWT

```javascript
app.use(ExpressAdapter.middleware(dsl, {
  roleExtractor: (req) => {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) return 'guest'
    
    try {
      const decoded = jwt.verify(token, JWT_SECRET)
      return decoded.role || 'user'
    } catch {
      return 'guest'
    }
  }
}))
```