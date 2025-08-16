/**
 * @fileoverview Next.js Framework Adapter
 * Provides API route handlers and middleware for Next.js applications
 */

const { DSLError, FrameworkError, validateRequired, validateTypes } = require('../core/DSLErrors')
const debug = require('debug')('dsandsl:nextjs')

/**
 * Next.js adapter for DSANDSL
 */
class NextJSAdapter {
  
  /**
   * Create a Next.js API route handler with automatic DSL filtering
   * @param {DSLEngine} dsl - DSL engine instance
   * @param {Object} options - Handler options
   * @returns {Function} Next.js API route handler
   */
  static createHandler(dsl, options = {}) {
    try {
      validateRequired({ dsl }, ['dsl'])
      validateTypes({ dsl }, { dsl: 'object' })
      
      const config = {
        roleExtractor: options.roleExtractor || this.defaultRoleExtractor,
        dataProvider: options.dataProvider || null,
        errorHandler: options.errorHandler || this.defaultErrorHandler,
        methods: options.methods || ['GET', 'POST', 'PUT', 'DELETE'],
        cors: options.cors || false,
        validateMethod: options.validateMethod !== false,
        autoFilter: options.autoFilter !== false,
        ...options
      }
      
      debug('Next.js handler configured:', {
        methods: config.methods,
        cors: config.cors,
        autoFilter: config.autoFilter
      })
      
      return async function nextJSHandler(req, res) {
        try {
          // CORS handling
          if (config.cors) {
            NextJSAdapter.setCorsHeaders(res, config.cors)
            
            // Handle preflight requests
            if (req.method === 'OPTIONS') {
              return res.status(200).end()
            }
          }
          
          // Method validation
          if (config.validateMethod && !config.methods.includes(req.method)) {
            return res.status(405).json({
              error: 'METHOD_NOT_ALLOWED',
              message: `Method ${req.method} not allowed`,
              allowedMethods: config.methods
            })
          }
          
          // Extract user role
          const userRole = await config.roleExtractor(req, res)
          
          // Create DSL context
          const dslContext = {
            filter: (data, filterOptions = {}) => {
              return dsl.filter(data, userRole, filterOptions)
            },
            
            checkAccess: (fieldName, customRole = null) => {
              return dsl.checkAccess(fieldName, customRole || userRole)
            },
            
            getAllowedFields: (category = null, customRole = null) => {
              return dsl.getAllowedFields(customRole || userRole, category)
            },
            
            userRole,
            
            // Response helpers
            json: (data, options = {}) => {
              const filtered = dsl.filter(data, userRole, options)
              return res.status(200).json(filtered)
            },
            
            jsonWithMetadata: (data, options = {}) => {
              const result = dsl.filter(data, userRole, { 
                includeMetadata: true, 
                ...options 
              })
              return res.status(200).json(result)
            },
            
            paginated: (data, page, limit, total, meta = {}) => {
              const filtered = dsl.filter(data, userRole)
              const result = {
                data: filtered,
                pagination: {
                  page: Math.max(1, parseInt(page) || 1),
                  limit: Math.max(1, parseInt(limit) || 10),
                  total: Math.max(0, parseInt(total) || 0),
                  pages: Math.ceil(Math.max(0, parseInt(total) || 0) / Math.max(1, parseInt(limit) || 10))
                },
                meta
              }
              return res.status(200).json(result)
            },
            
            accessDenied: (message = 'Access denied', field = null) => {
              const error = {
                error: 'ACCESS_DENIED',
                message,
                userRole,
                ...(field && { field }),
                timestamp: new Date().toISOString()
              }
              return res.status(403).json(error)
            },
            
            error: (message, status = 400, code = 'BAD_REQUEST') => {
              return res.status(status).json({
                error: code,
                message,
                userRole,
                timestamp: new Date().toISOString()
              })
            }
          }
          
          // Attach DSL to request for custom handlers
          req.dsl = dslContext
          
          // If dataProvider is provided, use it
          if (config.dataProvider) {
            const data = await config.dataProvider(req, res)
            
            if (config.autoFilter) {
              return dslContext.json(data)
            } else {
              return res.status(200).json(data)
            }
          }
          
          // If no dataProvider, return DSL context for manual use
          // This allows the route to handle the response manually
          return { dsl: dslContext, req, res }
          
        } catch (error) {
          debug('Handler error:', error.message)
          return config.errorHandler(error, req, res)
        }
      }
      
    } catch (error) {
      throw new FrameworkError(
        `Failed to create Next.js handler: ${error.message}`,
        'nextjs',
        'handler_creation'
      )
    }
  }
  
  /**
   * Create method-specific handlers for REST operations
   * @param {DSLEngine} dsl - DSL engine instance
   * @param {Object} config - Configuration for each method
   * @returns {Function} Next.js API route handler
   */
  static createRESTHandler(dsl, config) {
    const handlers = {
      GET: config.get || null,
      POST: config.post || null,
      PUT: config.put || null,
      PATCH: config.patch || null,
      DELETE: config.delete || null
    }
    
    return async function restHandler(req, res) {
      try {
        const method = req.method
        const handler = handlers[method]
        
        if (!handler) {
          const allowedMethods = Object.keys(handlers).filter(m => handlers[m])
          return res.status(405).json({
            error: 'METHOD_NOT_ALLOWED',
            message: `Method ${method} not allowed`,
            allowedMethods
          })
        }
        
        // Extract user role
        const userRole = await (config.roleExtractor || NextJSAdapter.defaultRoleExtractor)(req, res)
        
        // Create DSL context
        const dslContext = {
          filter: (data, options = {}) => dsl.filter(data, userRole, options),
          checkAccess: (fieldName) => dsl.checkAccess(fieldName, userRole),
          userRole
        }
        
        // Execute method handler
        const result = await handler(req, res, dslContext)
        
        // Auto-filter if result is returned
        if (result && typeof result === 'object' && !res.headersSent) {
          const filtered = dsl.filter(result, userRole)
          return res.status(200).json(filtered)
        }
        
        return result
        
      } catch (error) {
        debug('REST handler error:', error.message)
        return NextJSAdapter.defaultErrorHandler(error, req, res)
      }
    }
  }
  
  /**
   * Create middleware for Next.js using experimental middleware
   * @param {DSLEngine} dsl - DSL engine instance
   * @param {Object} options - Middleware options
   * @returns {Function} Next.js middleware function
   */
  static createMiddleware(dsl, options = {}) {
    const config = {
      roleExtractor: options.roleExtractor || this.defaultRoleExtractor,
      pathMatcher: options.pathMatcher || ((pathname) => pathname.startsWith('/api/')),
      ...options
    }
    
    return async function nextJSMiddleware(request) {
      try {
        const { pathname } = request.nextUrl
        
        // Check if this path should be processed
        if (!config.pathMatcher(pathname)) {
          return
        }
        
        // Extract user role (may need to be adapted based on auth system)
        const userRole = await config.roleExtractor(request)
        
        // Add DSL context to headers for API routes to read
        const requestHeaders = new Headers(request.headers)
        requestHeaders.set('x-dsl-user-role', userRole)
        
        return Response.next({
          request: {
            headers: requestHeaders
          }
        })
        
      } catch (error) {
        debug('Middleware error:', error.message)
        // Don't block request on middleware errors
        return
      }
    }
  }
  
  /**
   * Create role-based access control for API routes
   * @param {Array<string>} allowedRoles - Array of allowed roles
   * @param {Object} options - Access control options
   * @returns {Function} Access control wrapper
   */
  static requireRoles(allowedRoles, options = {}) {
    return function roleWrapper(handler) {
      return async function roleCheckedHandler(req, res) {
        try {
          const roleExtractor = options.roleExtractor || NextJSAdapter.defaultRoleExtractor
          const userRole = await roleExtractor(req, res)
          
          if (!allowedRoles.includes(userRole)) {
            return res.status(403).json({
              error: 'ACCESS_DENIED',
              message: `Access denied. Required roles: ${allowedRoles.join(', ')}. User role: ${userRole}`,
              requiredRoles: allowedRoles,
              userRole
            })
          }
          
          return await handler(req, res)
          
        } catch (error) {
          debug('Role check error:', error.message)
          return NextJSAdapter.defaultErrorHandler(error, req, res)
        }
      }
    }
  }
  
  /**
   * Helper to extract user session and role from Next.js request
   * Compatible with next-auth and other auth systems
   * @param {Object} req - Next.js request object
   * @param {Object} res - Next.js response object
   * @returns {string} User role
   */
  static async defaultRoleExtractor(req, res) {
    // Try to get from headers (middleware)
    if (req.headers['x-dsl-user-role']) {
      return req.headers['x-dsl-user-role']
    }
    
    // Try to get from session (next-auth)
    try {
      // This would require next-auth to be installed
      // const { getServerSession } = require('next-auth')
      // const session = await getServerSession(req, res, authOptions)
      // return session?.user?.role || 'guest'
      
      // Fallback: check for user in request
      return req.user?.role || 'guest'
    } catch (error) {
      debug('Role extraction failed:', error.message)
      return 'guest'
    }
  }
  
  /**
   * Set CORS headers for cross-origin requests
   * @param {Object} res - Next.js response object
   * @param {Object|boolean} corsConfig - CORS configuration
   */
  static setCorsHeaders(res, corsConfig) {
    const config = corsConfig === true ? {} : corsConfig
    
    const origin = config.origin || '*'
    const methods = config.methods || ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
    const headers = config.headers || ['Content-Type', 'Authorization']
    
    res.setHeader('Access-Control-Allow-Origin', origin)
    res.setHeader('Access-Control-Allow-Methods', methods.join(', '))
    res.setHeader('Access-Control-Allow-Headers', headers.join(', '))
    
    if (config.credentials) {
      res.setHeader('Access-Control-Allow-Credentials', 'true')
    }
  }
  
  /**
   * Default error handler for Next.js routes
   * @param {Error} error - Error that occurred
   * @param {Object} req - Next.js request object
   * @param {Object} res - Next.js response object
   */
  static defaultErrorHandler(error, req, res) {
    debug('Default error handler:', error.message)
    
    if (res.headersSent) {
      return
    }
    
    if (error instanceof DSLError) {
      const status = error.code === 'ACCESS_DENIED' ? 403 : 400
      return res.status(status).json({
        error: error.code || 'DSL_ERROR',
        message: error.message,
        timestamp: new Date().toISOString()
      })
    }
    
    // Generic error
    const status = error.status || error.statusCode || 500
    return res.status(status).json({
      error: 'INTERNAL_ERROR',
      message: process.env.NODE_ENV === 'development' ? error.message : 'An error occurred',
      ...(process.env.NODE_ENV === 'development' && { stack: error.stack }),
      timestamp: new Date().toISOString()
    })
  }
  
  /**
   * Create a webhook handler with DSL filtering
   * @param {DSLEngine} dsl - DSL engine instance
   * @param {Function} webhookHandler - Webhook processing function
   * @param {Object} options - Webhook options
   * @returns {Function} Next.js webhook handler
   */
  static createWebhookHandler(dsl, webhookHandler, options = {}) {
    const config = {
      validateSignature: options.validateSignature || null,
      allowedMethods: options.allowedMethods || ['POST'],
      roleForWebhook: options.roleForWebhook || 'admin',
      ...options
    }
    
    return async function webhookAPIHandler(req, res) {
      try {
        // Method validation
        if (!config.allowedMethods.includes(req.method)) {
          return res.status(405).json({ error: 'Method not allowed' })
        }
        
        // Signature validation if configured
        if (config.validateSignature) {
          const isValid = await config.validateSignature(req)
          if (!isValid) {
            return res.status(401).json({ error: 'Invalid signature' })
          }
        }
        
        // Create DSL context with webhook role
        const dslContext = {
          filter: (data, options = {}) => dsl.filter(data, config.roleForWebhook, options),
          checkAccess: (fieldName) => dsl.checkAccess(fieldName, config.roleForWebhook),
          userRole: config.roleForWebhook
        }
        
        // Process webhook
        const result = await webhookHandler(req.body, req, res, dslContext)
        
        if (result && !res.headersSent) {
          return res.status(200).json(result)
        }
        
      } catch (error) {
        debug('Webhook error:', error.message)
        return NextJSAdapter.defaultErrorHandler(error, req, res)
      }
    }
  }
  
  /**
   * Validate Next.js adapter configuration
   * @param {Object} config - Configuration to validate
   * @throws {FrameworkError} If configuration is invalid
   */
  static validateConfig(config) {
    const errors = []
    
    if (config.roleExtractor && typeof config.roleExtractor !== 'function') {
      errors.push('roleExtractor must be a function')
    }
    
    if (config.dataProvider && typeof config.dataProvider !== 'function') {
      errors.push('dataProvider must be a function')
    }
    
    if (config.methods && !Array.isArray(config.methods)) {
      errors.push('methods must be an array')
    }
    
    if (errors.length > 0) {
      throw new FrameworkError(
        `Invalid Next.js adapter configuration: ${errors.join(', ')}`,
        'nextjs',
        'configuration_validation'
      )
    }
  }
}

module.exports = NextJSAdapter