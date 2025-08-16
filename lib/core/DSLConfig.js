/**
 * @fileoverview DSL Configuration Management
 * Configuration creation, validation, and utilities
 */

const { ConfigurationError } = require('./DSLErrors')

/**
 * Create and validate a DSL configuration
 * @param {Object} config - Raw configuration object
 * @returns {Object} Validated configuration
 */
function createConfig(config) {
  const validatedConfig = {
    // Default role hierarchy
    roles: {
      admin: { level: 100 },
      user: { level: 10 },
      ...config.roles
    },
    
    // Field access rules
    fields: config.fields || {},
    
    // Database configuration (optional)
    database: config.database || null,
    
    // Security settings with environment-aware defaults
    security: {
      allowUnknownFields: true,
      alwaysAllowedFields: ['id', 'uuid', 'createdAt', 'updatedAt', 'name', 'status'],
      includeMetadata: process.env.NODE_ENV === 'development',
      includeFieldNames: process.env.NODE_ENV === 'development',
      logFiltering: process.env.NODE_ENV === 'development',
      ...config.security
    },
    
    // Performance settings
    performance: {
      chunkSize: 1000,
      parallel: false,
      cacheEnabled: true,
      cacheTTL: 300000, // 5 minutes
      ...config.performance
    },
    
    // Debug settings
    debug: {
      validateConfig: process.env.NODE_ENV === 'development',
      logLevel: process.env.NODE_ENV === 'development' ? 'debug' : 'error',
      ...config.debug
    }
  }
  
  // Validate the configuration
  validateConfig(validatedConfig)
  
  return validatedConfig
}

/**
 * Validate a DSL configuration
 * @param {Object} config - Configuration to validate
 * @throws {ConfigurationError} If configuration is invalid
 */
function validateConfig(config) {
  const errors = []
  
  // Validate roles
  if (!config.roles || typeof config.roles !== 'object') {
    errors.push('roles: Must be an object')
  } else {
    if (Object.keys(config.roles).length === 0) {
      errors.push('roles: At least one role must be defined')
    }
    
    Object.entries(config.roles).forEach(([roleName, roleConfig]) => {
      if (!roleConfig || typeof roleConfig !== 'object') {
        errors.push(`roles.${roleName}: Must be an object`)
        return
      }
      
      if (typeof roleConfig.level !== 'number') {
        errors.push(`roles.${roleName}.level: Must be a number`)
      }
      
      if (roleConfig.inherits && !Array.isArray(roleConfig.inherits)) {
        errors.push(`roles.${roleName}.inherits: Must be an array`)
      }
      
      // Validate inherited roles exist
      if (roleConfig.inherits) {
        roleConfig.inherits.forEach(inheritedRole => {
          if (!config.roles[inheritedRole]) {
            errors.push(`roles.${roleName}.inherits: Role '${inheritedRole}' not defined`)
          }
        })
      }
    })
  }
  
  // Validate fields
  if (config.fields && typeof config.fields !== 'object') {
    errors.push('fields: Must be an object')
  } else if (config.fields) {
    Object.entries(config.fields).forEach(([fieldPattern, fieldConfig]) => {
      if (!fieldConfig || typeof fieldConfig !== 'object') {
        errors.push(`fields["${fieldPattern}"]: Must be an object`)
        return
      }
      
      // Validate minRole exists
      if (fieldConfig.minRole && !config.roles[fieldConfig.minRole]) {
        errors.push(`fields["${fieldPattern}"].minRole: Role '${fieldConfig.minRole}' not defined`)
      }
      
      // Validate condition is a function
      if (fieldConfig.condition && typeof fieldConfig.condition !== 'function') {
        errors.push(`fields["${fieldPattern}"].condition: Must be a function`)
      }
      
      // Validate category is a string
      if (fieldConfig.category && typeof fieldConfig.category !== 'string') {
        errors.push(`fields["${fieldPattern}"].category: Must be a string`)
      }
      
      // Validate deny is a boolean
      if (fieldConfig.deny !== undefined && typeof fieldConfig.deny !== 'boolean') {
        errors.push(`fields["${fieldPattern}"].deny: Must be a boolean`)
      }
    })
  }
  
  // Validate database configuration
  if (config.database && typeof config.database !== 'object') {
    errors.push('database: Must be an object')
  } else if (config.database) {
    const db = config.database
    
    if (db.type && typeof db.type !== 'string') {
      errors.push('database.type: Must be a string')
    }
    
    if (db.tables && typeof db.tables !== 'object') {
      errors.push('database.tables: Must be an object')
    } else if (db.tables) {
      Object.entries(db.tables).forEach(([tableName, tableConfig]) => {
        if (tableConfig.minRole && !config.roles[tableConfig.minRole]) {
          errors.push(`database.tables["${tableName}"].minRole: Role '${tableConfig.minRole}' not defined`)
        }
      })
    }
    
    if (db.views && typeof db.views !== 'object') {
      errors.push('database.views: Must be an object')
    }
    
    if (db.queries && typeof db.queries !== 'object') {
      errors.push('database.queries: Must be an object')
    }
  }
  
  // Validate security configuration
  if (config.security && typeof config.security !== 'object') {
    errors.push('security: Must be an object')
  }
  
  // Validate performance configuration
  if (config.performance && typeof config.performance !== 'object') {
    errors.push('performance: Must be an object')
  } else if (config.performance) {
    const perf = config.performance
    
    if (perf.chunkSize && (typeof perf.chunkSize !== 'number' || perf.chunkSize < 1)) {
      errors.push('performance.chunkSize: Must be a positive number')
    }
    
    if (perf.cacheTTL && (typeof perf.cacheTTL !== 'number' || perf.cacheTTL < 0)) {
      errors.push('performance.cacheTTL: Must be a non-negative number')
    }
  }
  
  if (errors.length > 0) {
    throw new ConfigurationError('Configuration validation failed', errors)
  }
}

/**
 * Get default configuration template
 * @returns {Object} Default configuration
 */
function getDefaultConfig() {
  return {
    roles: {
      admin: { 
        level: 100, 
        description: 'Full system access' 
      },
      manager: { 
        level: 50, 
        description: 'Management access',
        inherits: ['user']
      },
      user: { 
        level: 10, 
        description: 'Basic user access' 
      },
      guest: { 
        level: 0, 
        description: 'Anonymous access' 
      }
    },
    
    fields: {
      // Personal data - user level
      'name': { minRole: 'user', category: 'personal' },
      'email': { minRole: 'user', category: 'personal' },
      
      // Financial data - admin only
      'salary': { minRole: 'admin', category: 'financial' },
      'revenue': { minRole: 'admin', category: 'financial' },
      'profit': { minRole: 'admin', category: 'financial' },
      
      // Sensitive patterns - always deny
      '*.password': { deny: true },
      '*.secret': { deny: true },
      '*.token': { deny: true },
      
      // Administrative data - manager level
      'department': { minRole: 'manager', category: 'organizational' },
      'team_size': { minRole: 'manager', category: 'organizational' }
    },
    
    security: {
      allowUnknownFields: true,
      alwaysAllowedFields: ['id', 'uuid', 'createdAt', 'updatedAt', 'name', 'status'],
      includeMetadata: false,
      includeFieldNames: false,
      logFiltering: false
    },
    
    performance: {
      chunkSize: 1000,
      parallel: false,
      cacheEnabled: true,
      cacheTTL: 300000
    }
  }
}

/**
 * Merge configurations with inheritance
 * @param {Object} baseConfig - Base configuration
 * @param {Object} overrideConfig - Override configuration
 * @returns {Object} Merged configuration
 */
function mergeConfigs(baseConfig, overrideConfig) {
  return {
    roles: { ...baseConfig.roles, ...overrideConfig.roles },
    fields: { ...baseConfig.fields, ...overrideConfig.fields },
    database: overrideConfig.database || baseConfig.database,
    security: { ...baseConfig.security, ...overrideConfig.security },
    performance: { ...baseConfig.performance, ...overrideConfig.performance },
    debug: { ...baseConfig.debug, ...overrideConfig.debug }
  }
}

/**
 * Create configuration from environment variables
 * @param {Object} baseConfig - Base configuration to extend
 * @returns {Object} Configuration with environment overrides
 */
function createConfigFromEnv(baseConfig = {}) {
  const envConfig = { ...baseConfig }
  
  // Override with environment variables
  if (process.env.DSL_DEFAULT_ROLE) {
    envConfig.defaultRole = process.env.DSL_DEFAULT_ROLE
  }
  
  if (process.env.DSL_INCLUDE_METADATA) {
    envConfig.security = envConfig.security || {}
    envConfig.security.includeMetadata = process.env.DSL_INCLUDE_METADATA === 'true'
  }
  
  if (process.env.DSL_LOG_FILTERING) {
    envConfig.security = envConfig.security || {}
    envConfig.security.logFiltering = process.env.DSL_LOG_FILTERING === 'true'
  }
  
  if (process.env.DSL_CHUNK_SIZE) {
    envConfig.performance = envConfig.performance || {}
    envConfig.performance.chunkSize = parseInt(process.env.DSL_CHUNK_SIZE, 10)
  }
  
  if (process.env.DSL_CACHE_ENABLED) {
    envConfig.performance = envConfig.performance || {}
    envConfig.performance.cacheEnabled = process.env.DSL_CACHE_ENABLED === 'true'
  }
  
  if (process.env.DSL_CACHE_TTL) {
    envConfig.performance = envConfig.performance || {}
    envConfig.performance.cacheTTL = parseInt(process.env.DSL_CACHE_TTL, 10)
  }
  
  return createConfig(envConfig)
}

/**
 * Analyze configuration for recommendations
 * @param {Object} config - Configuration to analyze
 * @returns {Object} Analysis results with recommendations
 */
function analyzeConfig(config) {
  const analysis = {
    recommendations: [],
    warnings: [],
    securityIssues: [],
    performance: [],
    summary: {}
  }
  
  // Analyze role hierarchy
  const roles = config.roles || {}
  const roleCount = Object.keys(roles).length
  
  if (roleCount < 2) {
    analysis.warnings.push('Consider defining multiple roles for better access control')
  }
  
  if (roleCount > 10) {
    analysis.performance.push('Large number of roles may impact performance - consider role consolidation')
  }
  
  // Analyze field patterns
  const fields = config.fields || {}
  const fieldCount = Object.keys(fields).length
  
  if (fieldCount === 0) {
    analysis.warnings.push('No field access rules defined - all fields will be accessible')
  }
  
  // Check for overly permissive patterns
  Object.entries(fields).forEach(([pattern, fieldConfig]) => {
    if (pattern === '*' && !fieldConfig.minRole) {
      analysis.securityIssues.push('Wildcard pattern "*" without role restriction is overly permissive')
    }
  })
  
  // Security analysis
  const security = config.security || {}
  
  if (security.includeMetadata && process.env.NODE_ENV === 'production') {
    analysis.securityIssues.push('Including metadata in production may leak sensitive information')
  }
  
  if (security.allowUnknownFields !== false) {
    analysis.recommendations.push('Consider setting allowUnknownFields to false for stricter security')
  }
  
  // Performance analysis
  const performance = config.performance || {}
  
  if (performance.chunkSize > 5000) {
    analysis.performance.push('Large chunk size may cause memory issues with large datasets')
  }
  
  if (!performance.cacheEnabled) {
    analysis.performance.push('Consider enabling caching for better performance')
  }
  
  // Summary
  analysis.summary = {
    totalRoles: roleCount,
    totalFieldPatterns: fieldCount,
    securityLevel: analysis.securityIssues.length === 0 ? 'good' : 'needs_attention',
    performanceProfile: performance.parallel ? 'high' : 'standard'
  }
  
  return analysis
}

module.exports = {
  createConfig,
  validateConfig,
  getDefaultConfig,
  mergeConfigs,
  createConfigFromEnv,
  analyzeConfig
}