/**
 * @fileoverview DSL Error Classes
 * Custom error types for DSL operations
 */

/**
 * Base DSL error class
 */
class DSLError extends Error {
  constructor(message, code, context = {}) {
    super(message)
    this.name = 'DSLError'
    this.code = code
    this.context = context
    
    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DSLError)
    }
  }
  
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      context: this.context,
      stack: this.stack
    }
  }
}

/**
 * Configuration validation error
 */
class ConfigurationError extends DSLError {
  constructor(message, validationErrors = []) {
    super(message, 'CONFIGURATION_ERROR')
    this.name = 'ConfigurationError'
    this.validationErrors = validationErrors
    this.context.validationErrors = validationErrors
  }
  
  toString() {
    let result = `${this.name}: ${this.message}`
    
    if (this.validationErrors.length > 0) {
      result += '\nValidation errors:'
      this.validationErrors.forEach(error => {
        result += `\n  - ${error}`
      })
    }
    
    return result
  }
}

/**
 * Access denied error for unauthorized field access
 */
class AccessDeniedError extends DSLError {
  constructor(message, resource, userRole, requiredRole = null) {
    super(message, 'ACCESS_DENIED')
    this.name = 'AccessDeniedError'
    this.resource = resource
    this.userRole = userRole
    this.requiredRole = requiredRole
    this.context = {
      resource,
      userRole,
      requiredRole
    }
  }
}

/**
 * Validation error for invalid input data
 */
class ValidationError extends DSLError {
  constructor(message, field = null, value = null) {
    super(message, 'VALIDATION_ERROR')
    this.name = 'ValidationError'
    this.field = field
    this.value = value
    this.context = {
      field,
      value
    }
  }
}

/**
 * Database operation error
 */
class DatabaseError extends DSLError {
  constructor(message, operation, originalError = null) {
    super(message, 'DATABASE_ERROR')
    this.name = 'DatabaseError'
    this.operation = operation
    this.originalError = originalError
    this.context = {
      operation,
      originalError: originalError ? originalError.message : null
    }
  }
}

/**
 * Performance error for operations that exceed limits
 */
class PerformanceError extends DSLError {
  constructor(message, operation, threshold, actualValue) {
    super(message, 'PERFORMANCE_ERROR')
    this.name = 'PerformanceError'
    this.operation = operation
    this.threshold = threshold
    this.actualValue = actualValue
    this.context = {
      operation,
      threshold,
      actualValue
    }
  }
}

/**
 * Framework integration error
 */
class FrameworkError extends DSLError {
  constructor(message, framework, operation) {
    super(message, 'FRAMEWORK_ERROR')
    this.name = 'FrameworkError'
    this.framework = framework
    this.operation = operation
    this.context = {
      framework,
      operation
    }
  }
}

/**
 * Helper function to create user-friendly error messages
 * @param {Error} error - Original error
 * @param {string} operation - Operation that failed
 * @param {Object} context - Additional context
 * @returns {DSLError} Wrapped DSL error
 */
function wrapError(error, operation, context = {}) {
  if (error instanceof DSLError) {
    return error
  }
  
  return new DSLError(
    `${operation} failed: ${error.message}`,
    'WRAPPED_ERROR',
    {
      originalError: error.message,
      operation,
      ...context
    }
  )
}

/**
 * Helper function to handle database errors
 * @param {Error} error - Database error
 * @param {string} operation - Database operation
 * @returns {DatabaseError} Database error instance
 */
function handleDatabaseError(error, operation) {
  if (error instanceof DSLError) {
    return error
  }
  
  // PostgreSQL error codes
  const pgErrorCodes = {
    '23505': 'Unique constraint violation',
    '23503': 'Foreign key constraint violation',
    '23502': 'Not null constraint violation',
    '42P01': 'Table does not exist',
    '42703': 'Column does not exist'
  }
  
  let message = error.message
  
  // Enhanced error messages for PostgreSQL
  if (error.code && pgErrorCodes[error.code]) {
    message = `${pgErrorCodes[error.code]}: ${error.message}`
  }
  
  return new DatabaseError(message, operation, error)
}

/**
 * Helper function to validate required parameters
 * @param {Object} params - Parameters to validate
 * @param {Array<string>} required - Required parameter names
 * @throws {ValidationError} If required parameters are missing
 */
function validateRequired(params, required) {
  const missing = required.filter(param => 
    params[param] === undefined || params[param] === null
  )
  
  if (missing.length > 0) {
    throw new ValidationError(
      `Missing required parameters: ${missing.join(', ')}`,
      'required_parameters',
      missing
    )
  }
}

/**
 * Helper function to validate parameter types
 * @param {Object} params - Parameters to validate
 * @param {Object} types - Expected types { paramName: 'string|number|boolean|object|array' }
 * @throws {ValidationError} If parameter types are invalid
 */
function validateTypes(params, types) {
  const errors = []
  
  Object.entries(types).forEach(([param, expectedType]) => {
    if (params[param] !== undefined) {
      const actualType = Array.isArray(params[param]) ? 'array' : typeof params[param]
      
      if (actualType !== expectedType) {
        errors.push(`${param}: expected ${expectedType}, got ${actualType}`)
      }
    }
  })
  
  if (errors.length > 0) {
    throw new ValidationError(
      `Type validation failed: ${errors.join(', ')}`,
      'type_validation',
      errors
    )
  }
}

module.exports = {
  DSLError,
  ConfigurationError,
  AccessDeniedError,
  ValidationError,
  DatabaseError,
  PerformanceError,
  FrameworkError,
  wrapError,
  handleDatabaseError,
  validateRequired,
  validateTypes
}