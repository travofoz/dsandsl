/**
 * @fileoverview DSLEngine - Core Data Security Layer Engine
 * Universal role-based field filtering with performance optimization
 */

const debug = require('debug')('dsandsl:engine')
const { DSLError, AccessDeniedError, ValidationError } = require('./DSLErrors')
const { matchField } = require('../utils/FieldMatcher')
const { hasPermission, getRoleLevel } = require('../utils/RoleUtils')

/**
 * Core DSL Engine for role-based data filtering
 */
class DSLEngine {
  constructor(config, options = {}) {
    this.config = config
    this.options = {
      chunkSize: options.chunkSize || 1000,
      parallel: options.parallel || false,
      cacheEnabled: options.cacheEnabled !== false,
      cacheTTL: options.cacheTTL || 300000, // 5 minutes
      strict: options.strict || false,
      ...options
    }
    
    // Performance tracking
    this.stats = {
      totalFilterOperations: 0,
      totalFilterTime: 0,
      cacheHits: 0,
      cacheMisses: 0,
      itemsProcessed: 0
    }
    
    // Field access cache
    this.accessCache = new Map()
    
    // Validate configuration on construction
    this.validateConfiguration()
    
    debug('DSLEngine initialized with config:', {
      roles: Object.keys(config.roles || {}),
      fieldPatterns: Object.keys(config.fields || {}).length,
      options: this.options
    })
  }
  
  /**
   * Filter data based on user role and access rules
   * @param {Object|Array} data - Data to filter
   * @param {string} userRole - User's role
   * @param {Object} options - Filtering options
   * @returns {Object|Array} Filtered data
   */
  filter(data, userRole, options = {}) {
    const startTime = performance.now()
    
    try {
      this.stats.totalFilterOperations++
      
      if (!data) {
        return data
      }
      
      // Merge options with defaults
      const filterOptions = {
        includeMetadata: options.includeMetadata || false,
        strict: options.strict !== undefined ? options.strict : this.options.strict,
        preserveStructure: options.preserveStructure !== false,
        chunkSize: options.chunkSize || this.options.chunkSize,
        ...options
      }
      
      debug('Filtering data for role:', userRole, 'options:', filterOptions)
      
      // Get allowed fields for this role
      const allowedFields = this.getAllowedFields(userRole)
      
      // Process data
      let filteredData
      if (Array.isArray(data)) {
        filteredData = this.processArrayData(data, allowedFields, userRole, filterOptions)
      } else {
        filteredData = this.processObjectData(data, allowedFields, userRole, filterOptions)
      }
      
      // Calculate performance metrics
      const filterTime = performance.now() - startTime
      this.stats.totalFilterTime += filterTime
      
      debug('Filtering completed in', filterTime.toFixed(2), 'ms')
      
      // Return data with optional metadata
      if (filterOptions.includeMetadata) {
        return this.createFilterResult(data, filteredData, userRole, filterTime, filterOptions)
      }
      
      return filteredData
      
    } catch (error) {
      debug('Filter error:', error.message)
      throw new DSLError(`Filtering failed: ${error.message}`, 'FILTER_ERROR', {
        userRole,
        dataType: Array.isArray(data) ? 'array' : typeof data,
        error: error.message
      })
    }
  }
  
  /**
   * Process array data with chunked processing for memory safety
   * @param {Array} data - Array to process
   * @param {Set} allowedFields - Set of allowed field names
   * @param {string} userRole - User's role
   * @param {Object} options - Processing options
   * @returns {Array} Filtered array
   */
  processArrayData(data, allowedFields, userRole, options) {
    const { chunkSize } = options
    const result = []
    
    // Process in chunks to prevent memory spikes
    for (let i = 0; i < data.length; i += chunkSize) {
      const chunk = data.slice(i, i + chunkSize)
      const filteredChunk = chunk.map(item => 
        this.processObjectData(item, allowedFields, userRole, options)
      )
      result.push(...filteredChunk)
      this.stats.itemsProcessed += chunk.length
    }
    
    return result
  }
  
  /**
   * Process single object data
   * @param {Object} data - Object to process
   * @param {Set} allowedFields - Set of allowed field names
   * @param {string} userRole - User's role
   * @param {Object} options - Processing options
   * @returns {Object} Filtered object
   */
  processObjectData(data, allowedFields, userRole, options) {
    const { strict, preserveStructure } = options
    
    if (!data || typeof data !== 'object') return data
    
    const filtered = {}
    
    // Process each field in the object
    Object.entries(data).forEach(([key, value]) => {
      // Handle nested objects
      if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        // Recursively process nested objects
        const nestedFiltered = this.processObjectData(value, allowedFields, userRole, options)
        
        // Only include if has content or preserveStructure is true
        if (preserveStructure || Object.keys(nestedFiltered).length > 0) {
          filtered[key] = nestedFiltered
        }
      }
      // Handle nested arrays
      else if (Array.isArray(value)) {
        filtered[key] = this.processArrayData(value, allowedFields, userRole, options)
      }
      // Handle primitive fields
      else if (this.hasFieldAccess(key, userRole)) {
        filtered[key] = value
      }
      // In non-strict mode, include unknown fields (for IDs, timestamps, etc.)
      else if (!strict && this.isAlwaysAllowedField(key)) {
        filtered[key] = value
      }
      // Unauthorized field - skip in filtered output
    })
    
    return filtered
  }
  
  /**
   * Check if user role has access to a specific field
   * @param {string} fieldName - Field name to check
   * @param {string} userRole - User's role
   * @param {Object} context - Additional context
   * @returns {boolean} True if user has access
   */
  hasFieldAccess(fieldName, userRole, context = {}) {
    // Check cache first
    const cacheKey = `${fieldName}:${userRole}`
    if (this.options.cacheEnabled && this.accessCache.has(cacheKey)) {
      this.stats.cacheHits++
      return this.accessCache.get(cacheKey)
    }
    
    this.stats.cacheMisses++
    
    // Find matching field configuration
    const fieldConfig = this.findFieldConfig(fieldName)
    
    let hasAccess = false
    
    if (fieldConfig) {
      // Explicitly denied
      if (fieldConfig.deny === true) {
        hasAccess = false
      }
      // Check role permission
      else if (fieldConfig.minRole) {
        hasAccess = hasPermission(userRole, fieldConfig.minRole, this.config.roles)
      }
      // Check custom condition
      else if (fieldConfig.condition && typeof fieldConfig.condition === 'function') {
        hasAccess = fieldConfig.condition(fieldName, null, userRole, context)
      }
      // Default allow if no restrictions
      else {
        hasAccess = true
      }
    } else {
      // No explicit configuration - allow by default (configurable)
      hasAccess = this.config.security?.allowUnknownFields !== false
    }
    
    // Cache the result
    if (this.options.cacheEnabled) {
      this.accessCache.set(cacheKey, hasAccess)
      
      // Clean up cache periodically
      if (this.accessCache.size > 10000) {
        this.cleanupCache()
      }
    }
    
    return hasAccess
  }
  
  /**
   * Find field configuration that matches the field name
   * @param {string} fieldName - Field name to match
   * @returns {Object|null} Field configuration or null
   */
  findFieldConfig(fieldName) {
    const fields = this.config.fields || {}
    
    // Check for exact match first
    if (fields[fieldName]) {
      return fields[fieldName]
    }
    
    // Check pattern matches
    for (const [pattern, config] of Object.entries(fields)) {
      if (matchField(fieldName, pattern)) {
        return config
      }
    }
    
    return null
  }
  
  /**
   * Check if field should always be allowed (IDs, timestamps, etc.)
   * @param {string} fieldName - Field name to check
   * @returns {boolean} True if field should always be included
   */
  isAlwaysAllowedField(fieldName) {
    const alwaysAllowed = this.config.security?.alwaysAllowedFields || [
      'id', 'uuid', 'createdAt', 'updatedAt', 'created_at', 'updated_at',
      'name', 'status', 'type'
    ]
    return alwaysAllowed.includes(fieldName)
  }
  
  /**
   * Get all fields accessible to a role
   * @param {string} userRole - User's role
   * @param {string} category - Optional category filter
   * @returns {Set<string>} Set of accessible field names
   */
  getAllowedFields(userRole, category = null) {
    const allowedFields = new Set()
    const fields = this.config.fields || {}
    
    Object.entries(fields).forEach(([fieldPattern, config]) => {
      // Skip if category filter doesn't match
      if (category && config.category !== category) {
        return
      }
      
      // Skip explicitly denied fields
      if (config.deny === true) {
        return
      }
      
      // Check role permission
      if (config.minRole && hasPermission(userRole, config.minRole, this.config.roles)) {
        allowedFields.add(fieldPattern)
      } else if (!config.minRole) {
        // No role restriction
        allowedFields.add(fieldPattern)
      }
    })
    
    return allowedFields
  }
  
  /**
   * Check access to a specific field with detailed result
   * @param {string} fieldName - Field to check
   * @param {string} userRole - User's role
   * @param {Object} context - Additional context
   * @returns {Object} Access result with details
   */
  checkAccess(fieldName, userRole, context = {}) {
    const fieldConfig = this.findFieldConfig(fieldName)
    
    if (!fieldConfig) {
      return {
        allowed: this.config.security?.allowUnknownFields !== false,
        reason: 'no_configuration',
        userRole,
        fieldName
      }
    }
    
    if (fieldConfig.deny === true) {
      return {
        allowed: false,
        reason: 'explicitly_denied',
        userRole,
        fieldName
      }
    }
    
    if (fieldConfig.minRole) {
      const hasAccess = hasPermission(userRole, fieldConfig.minRole, this.config.roles)
      return {
        allowed: hasAccess,
        reason: hasAccess ? 'sufficient_role' : 'insufficient_role',
        requires: fieldConfig.minRole,
        userRole,
        fieldName,
        userLevel: getRoleLevel(userRole, this.config.roles),
        requiredLevel: getRoleLevel(fieldConfig.minRole, this.config.roles)
      }
    }
    
    if (fieldConfig.condition && typeof fieldConfig.condition === 'function') {
      const hasAccess = fieldConfig.condition(fieldName, null, userRole, context)
      return {
        allowed: hasAccess,
        reason: hasAccess ? 'condition_passed' : 'condition_failed',
        userRole,
        fieldName
      }
    }
    
    return {
      allowed: true,
      reason: 'no_restrictions',
      userRole,
      fieldName
    }
  }
  
  /**
   * Get fields by category for a specific role
   * @param {string} category - Field category
   * @param {string} userRole - User's role
   * @returns {Array<string>} Array of field names in category
   */
  getFieldsByCategory(category, userRole) {
    const fields = []
    const configFields = this.config.fields || {}
    
    Object.entries(configFields).forEach(([fieldPattern, config]) => {
      if (config.category === category && this.hasFieldAccess(fieldPattern, userRole)) {
        fields.push(fieldPattern)
      }
    })
    
    return fields
  }
  
  /**
   * Create filter result with metadata
   * @param {*} originalData - Original data
   * @param {*} filteredData - Filtered data
   * @param {string} userRole - User's role
   * @param {number} filterTime - Filtering time in ms
   * @param {Object} options - Filter options
   * @returns {Object} Result with data and metadata
   */
  createFilterResult(originalData, filteredData, userRole, filterTime, options) {
    const metadata = {
      userRole,
      performance: {
        filteringTime: `${filterTime.toFixed(2)}ms`,
        itemsProcessed: Array.isArray(originalData) ? originalData.length : 1
      }
    }
    
    // Add field analysis if requested
    if (options.includeFieldNames || process.env.NODE_ENV === 'development') {
      const analysis = this.analyzeFiltering(originalData, filteredData, userRole)
      Object.assign(metadata, analysis)
    }
    
    return {
      data: filteredData,
      metadata
    }
  }
  
  /**
   * Analyze what was filtered from the data
   * @param {*} original - Original data
   * @param {*} filtered - Filtered data
   * @param {string} userRole - User's role
   * @returns {Object} Analysis results
   */
  analyzeFiltering(original, filtered, userRole) {
    if (!original || typeof original !== 'object') {
      return { totalFields: 0, allowedFields: 0, filteredFields: [] }
    }
    
    const sampleItem = Array.isArray(original) ? original[0] : original
    const sampleFiltered = Array.isArray(filtered) ? filtered[0] : filtered
    
    if (!sampleItem) {
      return { totalFields: 0, allowedFields: 0, filteredFields: [] }
    }
    
    const originalFields = Object.keys(sampleItem)
    const filteredFields = Object.keys(sampleFiltered || {})
    const removedFields = originalFields.filter(field => !filteredFields.includes(field))
    
    const filteredFieldsDetails = removedFields.map(field => {
      const access = this.checkAccess(field, userRole)
      return {
        field,
        reason: access.reason,
        requires: access.requires,
        userRole: access.userRole
      }
    })
    
    return {
      totalFields: originalFields.length,
      allowedFields: filteredFields.length,
      filteredFields: filteredFieldsDetails,
      filteringPercentage: Math.round((removedFields.length / originalFields.length) * 100)
    }
  }
  
  /**
   * Get engine statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    const avgFilterTime = this.stats.totalFilterOperations > 0 
      ? this.stats.totalFilterTime / this.stats.totalFilterOperations 
      : 0
    
    const cacheHitRate = (this.stats.cacheHits + this.stats.cacheMisses) > 0
      ? (this.stats.cacheHits / (this.stats.cacheHits + this.stats.cacheMisses)) * 100
      : 0
    
    return {
      ...this.stats,
      averageFilterTime: Math.round(avgFilterTime * 100) / 100,
      cacheHitRate: Math.round(cacheHitRate * 100) / 100,
      cacheSize: this.accessCache.size
    }
  }
  
  /**
   * Validate the configuration
   * @throws {ConfigurationError} If configuration is invalid
   */
  validateConfiguration() {
    if (!this.config) {
      throw new ValidationError('Configuration is required')
    }
    
    if (!this.config.roles || Object.keys(this.config.roles).length === 0) {
      throw new ValidationError('At least one role must be defined')
    }
    
    // Validate role hierarchy
    Object.entries(this.config.roles).forEach(([roleName, roleConfig]) => {
      if (typeof roleConfig.level !== 'number') {
        throw new ValidationError(`Role '${roleName}' must have a numeric level`)
      }
    })
    
    // Validate field configurations
    if (this.config.fields) {
      Object.entries(this.config.fields).forEach(([fieldPattern, fieldConfig]) => {
        if (fieldConfig.minRole && !this.config.roles[fieldConfig.minRole]) {
          throw new ValidationError(`Field '${fieldPattern}' references undefined role: ${fieldConfig.minRole}`)
        }
      })
    }
    
    debug('Configuration validation passed')
  }
  
  /**
   * Clean up access cache when it gets too large
   */
  cleanupCache() {
    // Simple LRU-style cleanup - remove half the entries
    const entries = Array.from(this.accessCache.entries())
    const keepCount = Math.floor(entries.length / 2)
    
    this.accessCache.clear()
    
    // Keep the most recent half
    entries.slice(-keepCount).forEach(([key, value]) => {
      this.accessCache.set(key, value)
    })
    
    debug('Cache cleaned up, size:', this.accessCache.size)
  }
  
  /**
   * Reset engine statistics
   */
  resetStats() {
    this.stats = {
      totalFilterOperations: 0,
      totalFilterTime: 0,
      cacheHits: 0,
      cacheMisses: 0,
      itemsProcessed: 0
    }
    debug('Statistics reset')
  }
  
  /**
   * Clear access cache
   */
  clearCache() {
    this.accessCache.clear()
    debug('Access cache cleared')
  }
}

module.exports = DSLEngine