/**
 * @fileoverview Base Service Class
 * Abstract base class for domain services using DSANDSL
 */

const DSLProvider = require('./DSLServiceProvider')
const { DatabaseError } = require('../core/DSLErrors')

class BaseService {
  
  /**
   * Get the DSL service provider
   * @returns {DSLServiceProvider} Service provider instance
   */
  static getProvider() {
    return DSLProvider
  }

  /**
   * Get database adapter
   * @returns {DatabaseAdapter} Database adapter
   */
  static getAdapter() {
    return DSLProvider.getAdapter()
  }

  /**
   * Create query builder for user role
   * @param {string} userRole - User role
   * @returns {QueryBuilder} Query builder
   */
  static createQueryBuilder(userRole) {
    return DSLProvider.createQueryBuilder(userRole)
  }

  /**
   * Execute transaction
   * @param {Function} callback - Transaction callback
   * @returns {Promise} Transaction result
   */
  static async transaction(callback) {
    return DSLProvider.transaction(callback)
  }

  /**
   * Filter data by role
   * @param {any} data - Data to filter
   * @param {string} userRole - User role
   * @param {Object} options - Filter options
   * @returns {any} Filtered data
   */
  static filterData(data, userRole, options = {}) {
    return DSLProvider.filterData(data, userRole, options)
  }

  /**
   * Select records with role-based filtering
   * @param {string} table - Table name
   * @param {string} userRole - User role
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Query results
   */
  static async select(table, userRole, options = {}) {
    return this.getAdapter().select(table, userRole, options)
  }

  /**
   * Insert record with role-based filtering
   * @param {string} table - Table name
   * @param {Object} data - Data to insert
   * @param {string} userRole - User role
   * @param {Object} options - Insert options
   * @returns {Promise} Insert result
   */
  static async insert(table, data, userRole, options = {}) {
    return this.getAdapter().insert(table, data, userRole, options)
  }

  /**
   * Update records with role-based filtering
   * @param {string} table - Table name
   * @param {Object} data - Data to update
   * @param {Object} where - WHERE conditions
   * @param {string} userRole - User role
   * @param {Object} options - Update options
   * @returns {Promise} Update result
   */
  static async update(table, data, where, userRole, options = {}) {
    return this.getAdapter().update(table, data, where, userRole, options)
  }

  /**
   * Delete records with role-based filtering
   * @param {string} table - Table name
   * @param {Object} where - WHERE conditions
   * @param {string} userRole - User role
   * @param {Object} options - Delete options
   * @returns {Promise} Delete result
   */
  static async delete(table, where, userRole, options = {}) {
    return this.getAdapter().delete(table, where, userRole, options)
  }

  /**
   * Execute raw query with role validation
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @param {string} userRole - User role
   * @param {Object} options - Query options
   * @returns {Promise} Query result
   */
  static async query(sql, params, userRole, options = {}) {
    return this.getAdapter().query(sql, params, userRole, options)
  }

  /**
   * Validate required fields for an operation
   * @param {Object} data - Data object
   * @param {Array<string>} requiredFields - Required field names
   * @throws {Error} If required fields are missing
   */
  static validateRequiredFields(data, requiredFields) {
    const missing = requiredFields.filter(field => !data[field])
    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`)
    }
  }

  /**
   * Build pagination metadata
   * @param {number} page - Current page
   * @param {number} limit - Items per page
   * @param {number} total - Total items
   * @returns {Object} Pagination metadata
   */
  static buildPagination(page, limit, total) {
    return {
      page: parseInt(page),
      limit: parseInt(limit),
      total: parseInt(total),
      pages: Math.ceil(total / limit),
      hasNext: page * limit < total,
      hasPrev: page > 1
    }
  }

  /**
   * Handle service errors consistently
   * @param {Error} error - Original error
   * @param {string} operation - Operation that failed
   * @param {string} code - Error code
   * @returns {DatabaseError} Formatted error
   */
  static handleError(error, operation, code) {
    if (error instanceof DatabaseError) {
      return error
    }
    
    return new DatabaseError(
      `${operation} failed: ${error.message}`,
      code,
      error
    )
  }
}

module.exports = BaseService