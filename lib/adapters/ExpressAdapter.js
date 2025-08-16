/**
 * @fileoverview Express.js Framework Adapter
 * Provides middleware and helpers for Express applications
 */

const { DSLError, FrameworkError, validateRequired, validateTypes } = require('../core/DSLErrors')
const debug = require('debug')('dsandsl:express')

/**
 * Express.js adapter for DSANDSL
 */
class ExpressAdapter {
  
  /**
   * Create Express middleware that attaches DSL filtering to requests
   * @param {DSLEngine} dsl - DSL engine instance
   * @param {Object} options - Middleware options
   * @returns {Function} Express middleware function
   */
  static middleware(dsl, options = {}) {
    try {
      // Validate inputs
      validateRequired({ dsl }, ['dsl'])
      validateTypes({ dsl }, { dsl: 'object' })
      
      const config = {
        roleExtractor: options.roleExtractor || ((req) => req.user?.role || 'guest'),
        attachTo: options.attachTo || 'dsl',
        autoFilter: options.autoFilter !== false,
        errorHandler: options.errorHandler || this.defaultErrorHandler,
        contextExtractor: options.contextExtractor || (() => ({})),
        skipPaths: options.skipPaths || [],
        ...options
      }
      
      debug('Express middleware configured:', {
        attachTo: config.attachTo,
        autoFilter: config.autoFilter,
        skipPaths: config.skipPaths.length
      })
      
      return function dslMiddleware(req, res, next) {
        try {
          // Check if path should be skipped
          if (config.skipPaths.some(path => req.path.startsWith(path))) {
            return next()
          }
          
          // Extract user role
          const userRole = typeof config.roleExtractor === 'function' 
            ? config.roleExtractor(req, res)
            : config.roleExtractor
          
          // Extract additional context
          const context = config.contextExtractor(req, res)
          
          // Create DSL helper object
          const dslHelper = {
            // Core filtering function
            filter: (data, options = {}) => {
              return dsl.filter(data, userRole, { ...context, ...options })
            },
            
            // Check field access
            checkAccess: (fieldName, customRole = null) => {
              return dsl.checkAccess(fieldName, customRole || userRole, context)
            },
            
            // Get allowed fields
            getAllowedFields: (category = null, customRole = null) => {
              return dsl.getAllowedFields(customRole || userRole, category)
            },
            
            // Role information
            userRole,
            context,
            
            // Response helpers
            json: (data, options = {}) => {
              const filtered = dsl.filter(data, userRole, { ...context, ...options })
              return res.json(filtered)
            },
            
            jsonWithMetadata: (data, options = {}) => {
              const result = dsl.filter(data, userRole, { 
                includeMetadata: true, 
                ...context, 
                ...options 
              })
              return res.json(result)
            },
            
            // Error response
            accessDenied: (message = 'Access denied', field = null) => {
              const error = {
                error: 'ACCESS_DENIED',
                message,
                userRole,
                ...(field && { field }),
                timestamp: new Date().toISOString()
              }
              return res.status(403).json(error)
            }
          }
          
          // Attach DSL helper to request
          req[config.attachTo] = dslHelper
          
          debug('DSL attached to request:', {
            path: req.path,
            method: req.method,
            userRole,
            attachedTo: config.attachTo
          })
          
          next()
          
        } catch (error) {
          debug('Middleware error:', error.message)
          config.errorHandler(error, req, res, next)
        }
      }
      
    } catch (error) {
      throw new FrameworkError(
        `Failed to create Express middleware: ${error.message}`,
        'express',
        'middleware_creation'
      )
    }
  }
  
  /**
   * Create a route handler with automatic DSL filtering
   * @param {DSLEngine} dsl - DSL engine instance
   * @param {Function} handler - Route handler function
   * @param {Object} options - Route options
   * @returns {Function} Wrapped route handler
   */
  static createRoute(dsl, handler, options = {}) {
    try {
      validateRequired({ dsl, handler }, ['dsl', 'handler'])
      validateTypes({ handler }, { handler: 'function' })
      
      const config = {
        roleExtractor: options.roleExtractor || ((req) => req.user?.role || 'guest'),
        errorHandler: options.errorHandler || this.defaultErrorHandler,
        autoFilter: options.autoFilter !== false,
        ...options
      }
      
      return async function dslRouteHandler(req, res, next) {
        try {
          const userRole = config.roleExtractor(req, res)
          
          // Create DSL context for this request
          const dslContext = {
            filter: (data, filterOptions = {}) => {
              return dsl.filter(data, userRole, filterOptions)
            },
            checkAccess: (fieldName) => {
              return dsl.checkAccess(fieldName, userRole)
            },
            userRole
          }
          
          // Attach to request
          req.dsl = dslContext
          
          // Call original handler
          const result = await handler(req, res, next)
          
          // If handler returns data and autoFilter is enabled, filter it
          if (config.autoFilter && result && typeof result === 'object') {
            const filtered = dsl.filter(result, userRole)
            return res.json(filtered)
          }
          
          return result
          
        } catch (error) {
          debug('Route handler error:', error.message)
          config.errorHandler(error, req, res, next)
        }
      }
      
    } catch (error) {
      throw new FrameworkError(
        `Failed to create Express route: ${error.message}`,
        'express',
        'route_creation'
      )
    }
  }
  
  /**
   * Create route-specific middleware for different endpoints
   * @param {DSLEngine} dsl - DSL engine instance
   * @param {Object} routes - Route configuration object
   * @returns {Object} Object with route-specific middleware
   */
  static createRouteMiddleware(dsl, routes) {
    const routeMiddleware = {}
    
    Object.entries(routes).forEach(([routeName, routeConfig]) => {
      routeMiddleware[routeName] = this.middleware(dsl, routeConfig)
    })
    
    return routeMiddleware
  }
  
  /**
   * Create error handling middleware
   * @param {Object} options - Error handling options
   * @returns {Function} Express error handling middleware
   */
  static errorMiddleware(options = {}) {
    const config = {
      includeStack: options.includeStack || process.env.NODE_ENV === 'development',
      logger: options.logger || console.error,
      ...options
    }
    
    return function dslErrorMiddleware(error, req, res, next) {
      // Log the error
      config.logger('DSL Error:', {
        message: error.message,
        code: error.code,
        path: req.path,
        method: req.method,
        userRole: req.dsl?.userRole,
        stack: config.includeStack ? error.stack : undefined
      })
      
      // Handle DSL-specific errors
      if (error instanceof DSLError) {
        const status = error.code === 'ACCESS_DENIED' ? 403 : 400
        
        return res.status(status).json({
          error: error.code || 'DSL_ERROR',
          message: error.message,
          ...(config.includeStack && { stack: error.stack }),
          timestamp: new Date().toISOString()
        })
      }
      
      // Pass non-DSL errors to next error handler
      next(error)
    }
  }
  
  /**
   * Default error handler for DSL middleware
   * @param {Error} error - Error that occurred
   * @param {Object} req - Express request object
   * @param {Object} res - Express response object
   * @param {Function} next - Express next function
   */
  static defaultErrorHandler(error, req, res, next) {
    debug('Default error handler:', error.message)
    
    if (error instanceof DSLError) {
      const status = error.code === 'ACCESS_DENIED' ? 403 : 500
      return res.status(status).json({
        error: 'DSL_ERROR',
        message: error.message,
        code: error.code
      })
    }
    
    // Pass unknown errors to Express
    next(error)
  }
  
  /**
   * Create role-based route protection middleware
   * @param {Array<string>} allowedRoles - Array of allowed roles
   * @param {Object} options - Protection options
   * @returns {Function} Express middleware
   */
  static requireRoles(allowedRoles, options = {}) {
    const config = {
      roleExtractor: options.roleExtractor || ((req) => req.user?.role || 'guest'),
      errorHandler: options.errorHandler || this.defaultErrorHandler,
      ...options
    }
    
    return function roleProtectionMiddleware(req, res, next) {
      try {
        const userRole = config.roleExtractor(req, res)
        
        if (!allowedRoles.includes(userRole)) {
          const error = new DSLError(
            `Access denied. Required roles: ${allowedRoles.join(', ')}. User role: ${userRole}`,
            'ACCESS_DENIED',
            { requiredRoles: allowedRoles, userRole }
          )
          return config.errorHandler(error, req, res, next)
        }
        
        next()
        
      } catch (error) {
        config.errorHandler(error, req, res, next)
      }
    }
  }
  
  /**
   * Validate Express adapter configuration
   * @param {Object} config - Configuration to validate
   * @throws {FrameworkError} If configuration is invalid
   */
  static validateConfig(config) {
    const errors = []
    
    if (config.roleExtractor && typeof config.roleExtractor !== 'function') {
      errors.push('roleExtractor must be a function')
    }
    
    if (config.errorHandler && typeof config.errorHandler !== 'function') {
      errors.push('errorHandler must be a function')
    }
    
    if (config.skipPaths && !Array.isArray(config.skipPaths)) {
      errors.push('skipPaths must be an array')
    }
    
    if (errors.length > 0) {
      throw new FrameworkError(
        `Invalid Express adapter configuration: ${errors.join(', ')}`,
        'express',
        'configuration_validation'
      )
    }
  }
}

module.exports = ExpressAdapter