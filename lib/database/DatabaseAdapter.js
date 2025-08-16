/**
 * @fileoverview Base Database Adapter Interface
 * Defines the contract for all database adapters
 */

const { DSLError, DatabaseError } = require('../core/DSLErrors')
const { hasPermission } = require('../utils/RoleUtils')

/**
 * Base class for all database adapters
 * Provides common interface and utilities
 */
class DatabaseAdapter {
  constructor(dsl, options = {}) {
    this.dsl = dsl
    this.options = {
      validateTableAccess: options.validateTableAccess !== false,
      validateFieldAccess: options.validateFieldAccess !== false,
      autoFilter: options.autoFilter !== false,
      logQueries: options.logQueries || false,
      ...options
    }
    
    this.connectionManager = null
    this.queryBuilder = null
    this.transactionHelper = null
  }
  
  /**
   * Initialize the database adapter
   * Must be implemented by subclasses
   */
  async initialize() {
    throw new Error('initialize() must be implemented by subclass')
  }
  
  /**
   * Close database connections
   * Must be implemented by subclasses
   */
  async close() {
    throw new Error('close() must be implemented by subclass')
  }
  
  /**
   * Execute a raw query with role-based validation
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @param {string} userRole - User's role
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Query results
   */
  async query(sql, params, userRole, options = {}) {
    try {
      // Validate table access if enabled
      if (this.options.validateTableAccess) {
        this.validateTableAccess(sql, userRole)
      }
      
      // Execute query
      const result = await this.executeQuery(sql, params, options)
      
      // Auto-filter results if enabled
      if (this.options.autoFilter && result.rows) {
        result.rows = this.dsl.filter(result.rows, userRole)
      }
      
      return result
      
    } catch (error) {
      throw new DatabaseError(
        `Query execution failed: ${error.message}`,
        'query_execution',
        error
      )
    }
  }
  
  /**
   * Select data with role-based field filtering
   * @param {string} table - Table name
   * @param {string} userRole - User's role
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Filtered results
   */
  async select(table, userRole, options = {}) {
    // Check table access
    this.checkTableAccess(table, userRole)
    
    // Get allowed fields for this role
    const allowedFields = this.getAllowedFieldsForTable(table, userRole)
    
    if (allowedFields.length === 0) {
      return []
    }
    
    // Build query with only allowed fields
    const query = this.queryBuilder
      .select(allowedFields)
      .from(table)
    
    // Apply filters
    if (options.where) {
      query.where(options.where)
    }
    
    if (options.orderBy) {
      query.orderBy(options.orderBy)
    }
    
    if (options.limit) {
      query.limit(options.limit)
    }
    
    if (options.offset) {
      query.offset(options.offset)
    }
    
    // Execute query
    const { sql, params } = query.build()
    const result = await this.executeQuery(sql, params)
    
    return result.rows || []
  }
  
  /**
   * Insert data with role-based validation
   * @param {string} table - Table name
   * @param {Object} data - Data to insert
   * @param {string} userRole - User's role
   * @param {Object} options - Insert options
   * @returns {Promise<Object>} Insert result
   */
  async insert(table, data, userRole, options = {}) {
    // Check table access
    this.checkTableAccess(table, userRole, 'INSERT')
    
    // Filter data to only allowed fields
    const allowedData = this.filterDataForRole(table, data, userRole)
    
    if (Object.keys(allowedData).length === 0) {
      throw new DatabaseError(
        'No fields allowed for insertion',
        'insufficient_permissions'
      )
    }
    
    // Build insert query
    const query = this.queryBuilder
      .insert(table)
      .values(allowedData)
    
    if (options.returning) {
      query.returning(options.returning)
    }
    
    // Execute query
    const { sql, params } = query.build()
    const result = await this.executeQuery(sql, params)
    
    return result
  }
  
  /**
   * Update data with role-based validation
   * @param {string} table - Table name
   * @param {Object} data - Data to update
   * @param {Object} where - WHERE conditions
   * @param {string} userRole - User's role
   * @param {Object} options - Update options
   * @returns {Promise<Object>} Update result
   */
  async update(table, data, where, userRole, options = {}) {
    // Check table access
    this.checkTableAccess(table, userRole, 'UPDATE')
    
    // Filter data to only allowed fields
    const allowedData = this.filterDataForRole(table, data, userRole)
    
    if (Object.keys(allowedData).length === 0) {
      throw new DatabaseError(
        'No fields allowed for update',
        'insufficient_permissions'
      )
    }
    
    // Build update query
    const query = this.queryBuilder
      .update(table)
      .set(allowedData)
      .where(where)
    
    if (options.returning) {
      query.returning(options.returning)
    }
    
    // Execute query
    const { sql, params } = query.build()
    const result = await this.executeQuery(sql, params)
    
    return result
  }
  
  /**
   * Delete data with role-based validation
   * @param {string} table - Table name
   * @param {Object} where - WHERE conditions
   * @param {string} userRole - User's role
   * @param {Object} options - Delete options
   * @returns {Promise<Object>} Delete result
   */
  async delete(table, where, userRole, options = {}) {
    // Check table access
    this.checkTableAccess(table, userRole, 'DELETE')
    
    // Build delete query
    const query = this.queryBuilder
      .delete()
      .from(table)
      .where(where)
    
    if (options.returning) {
      query.returning(options.returning)
    }
    
    // Execute query
    const { sql, params } = query.build()
    const result = await this.executeQuery(sql, params)
    
    return result
  }
  
  /**
   * Start a database transaction
   * @param {Function} callback - Transaction callback
   * @param {Object} options - Transaction options
   * @returns {Promise<any>} Transaction result
   */
  async transaction(callback, options = {}) {
    if (!this.transactionHelper) {
      throw new DatabaseError(
        'Transactions not supported by this adapter',
        'unsupported_operation'
      )
    }
    
    return await this.transactionHelper.execute(callback, options)
  }
  
  /**
   * Check if user has access to table/operation
   * @param {string} table - Table name
   * @param {string} userRole - User's role
   * @param {string} operation - Operation type (SELECT, INSERT, UPDATE, DELETE)
   * @throws {DatabaseError} If access denied
   */
  checkTableAccess(table, userRole, operation = 'SELECT') {
    const tableConfig = this.dsl.config.database?.tables?.[table]
    
    if (!tableConfig) {
      // No explicit config - allow by default (configurable)
      if (this.dsl.config.database?.denyUnknownTables === true) {
        throw new DatabaseError(
          `Access denied to table: ${table}`,
          'table_access_denied',
          { table, userRole, operation }
        )
      }
      return
    }
    
    // Check role permission for table
    const hasAccess = hasPermission(userRole, tableConfig.minRole, this.dsl.config.roles)
    
    if (!hasAccess) {
      throw new DatabaseError(
        `Insufficient permissions for table ${table}. Required: ${tableConfig.minRole}, User: ${userRole}`,
        'table_access_denied',
        { table, userRole, operation, required: tableConfig.minRole }
      )
    }
    
    // Check operation-specific permissions
    if (tableConfig.operations && !tableConfig.operations.includes(operation)) {
      throw new DatabaseError(
        `Operation ${operation} not allowed on table ${table}`,
        'operation_not_allowed',
        { table, userRole, operation, allowedOperations: tableConfig.operations }
      )
    }
  }
  
  /**
   * Get allowed fields for a table based on user role
   * @param {string} table - Table name
   * @param {string} userRole - User's role
   * @returns {Array<string>} Array of allowed field names
   */
  getAllowedFieldsForTable(table, userRole) {
    const allowedFields = []
    const fieldConfig = this.dsl.config.fields || {}
    
    // Get all fields that match table patterns
    Object.entries(fieldConfig).forEach(([fieldPattern, config]) => {
      // Check if field pattern matches this table
      if (fieldPattern.startsWith(`${table}.`) || !fieldPattern.includes('.')) {
        const fieldName = fieldPattern.includes('.') 
          ? fieldPattern.split('.')[1] 
          : fieldPattern
        
        // Check if user has access to this field
        if (this.dsl.hasFieldAccess(fieldPattern, userRole)) {
          allowedFields.push(fieldName)
        }
      }
    })
    
    // Always include basic fields if no specific config
    if (allowedFields.length === 0) {
      allowedFields.push('id', 'created_at', 'updated_at')
    }
    
    return allowedFields
  }
  
  /**
   * Filter data object to only include allowed fields
   * @param {string} table - Table name
   * @param {Object} data - Data to filter
   * @param {string} userRole - User's role
   * @returns {Object} Filtered data
   */
  filterDataForRole(table, data, userRole) {
    const filtered = {}
    const allowedFields = this.getAllowedFieldsForTable(table, userRole)
    
    Object.entries(data).forEach(([field, value]) => {
      if (allowedFields.includes(field)) {
        filtered[field] = value
      }
    })
    
    return filtered
  }
  
  /**
   * Validate table access in SQL query
   * @param {string} sql - SQL query
   * @param {string} userRole - User's role
   * @throws {DatabaseError} If unauthorized table access detected
   */
  validateTableAccess(sql, userRole) {
    // Simple table extraction (could be improved with proper SQL parsing)
    const tablePattern = /(?:FROM|JOIN|INTO|UPDATE)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi
    const tables = []
    let match
    
    while ((match = tablePattern.exec(sql)) !== null) {
      tables.push(match[1].toLowerCase())
    }
    
    // Check access to each table
    tables.forEach(table => {
      this.checkTableAccess(table, userRole)
    })
  }
  
  /**
   * Execute raw query - must be implemented by subclasses
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Query result
   */
  async executeQuery(sql, params, options = {}) {
    throw new Error('executeQuery() must be implemented by subclass')
  }
  
  /**
   * Get database adapter statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    const stats = {
      type: this.constructor.name,
      initialized: !!this.connectionManager,
      options: this.options
    }
    
    // Add connection manager stats if available
    if (this.connectionManager && this.connectionManager.getStats) {
      stats.connection = this.connectionManager.getStats()
    }
    
    return stats
  }
  
  /**
   * Health check for database connection
   * @returns {Promise<boolean>} Health status
   */
  async healthCheck() {
    try {
      if (!this.connectionManager) {
        return false
      }
      
      // Try a simple query
      await this.executeQuery('SELECT 1', [])
      return true
    } catch (error) {
      return false
    }
  }
}

module.exports = DatabaseAdapter