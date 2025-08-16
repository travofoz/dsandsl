/**
 * @fileoverview Core DSL Service Provider
 * Centralized service for managing DSANDSL instances and database adapters
 */

const DSLEngine = require('../core/DSLEngine')
const { createConfig } = require('../core/DSLConfig')
const PostgreSQLAdapter = require('../database/adapters/PostgreSQLAdapter')
const MySQLAdapter = require('../database/adapters/MySQLAdapter')
const SQLiteAdapter = require('../database/adapters/SQLiteAdapter')

class DSLServiceProvider {
  constructor() {
    this.dsl = null
    this.adapter = null
    this.config = null
    this.initialized = false
  }

  /**
   * Initialize the DSL service provider
   * Call this once at application startup
   * @param {Object} dslConfig - DSL configuration object
   * @param {Object} adapterConfig - Database adapter configuration
   * @param {string} adapterConfig.type - Database type: 'postgresql', 'mysql', 'sqlite'
   */
  async initialize(dslConfig, adapterConfig) {
    if (this.initialized) {
      console.warn('DSL Service Provider already initialized')
      return
    }

    try {
      // Create DSL configuration
      this.config = typeof dslConfig.roles ? dslConfig : createConfig(dslConfig)
      this.dsl = new DSLEngine(this.config)
      
      // Initialize database adapter based on type
      const { type = 'postgresql', ...config } = adapterConfig
      
      switch (type.toLowerCase()) {
        case 'postgresql':
        case 'postgres':
          this.adapter = new PostgreSQLAdapter(this.dsl, config)
          break
        case 'mysql':
          this.adapter = new MySQLAdapter(this.dsl, config)
          break
        case 'sqlite':
          this.adapter = new SQLiteAdapter(this.dsl, config)
          break
        default:
          throw new Error(`Unsupported database type: ${type}`)
      }
      
      await this.adapter.initialize()
      
      this.initialized = true
      console.log(`✅ DSL Service Provider initialized with ${type} adapter`)
      
    } catch (error) {
      console.error('Failed to initialize DSL Service Provider:', error)
      throw error
    }
  }

  /**
   * Get a fresh query builder for a user role
   * @param {string} userRole - User role
   * @returns {QueryBuilder} Configured query builder
   */
  createQueryBuilder(userRole) {
    this.ensureInitialized()
    return this.adapter.createQueryBuilder(userRole)
  }

  /**
   * Execute a transaction with automatic role context
   * @param {Function} callback - Transaction callback function
   * @returns {Promise} Transaction result
   */
  async transaction(callback) {
    this.ensureInitialized()
    return this.adapter.transaction(callback)
  }

  /**
   * Filter data with user role
   * @param {any} data - Data to filter
   * @param {string} userRole - User role
   * @param {Object} options - Filtering options
   * @returns {any} Filtered data
   */
  filterData(data, userRole, options = {}) {
    this.ensureInitialized()
    return this.dsl.filter(data, userRole, options)
  }

  /**
   * Check if user has field access
   * @param {string} fieldName - Field name to check
   * @param {string} userRole - User role
   * @param {Object} context - Additional context
   * @returns {boolean} True if user has access
   */
  hasFieldAccess(fieldName, userRole, context = {}) {
    this.ensureInitialized()
    return this.dsl.hasFieldAccess(fieldName, userRole, context)
  }

  /**
   * Get database adapter for direct queries
   * @returns {DatabaseAdapter} Database adapter instance
   */
  getAdapter() {
    this.ensureInitialized()
    return this.adapter
  }

  /**
   * Get DSL engine for direct filtering
   * @returns {DSLEngine} DSL engine instance
   */
  getDSL() {
    this.ensureInitialized()
    return this.dsl
  }

  /**
   * Health check for the service
   * @returns {Promise<boolean>} Health status
   */
  async healthCheck() {
    if (!this.initialized) return false
    return this.adapter.healthCheck()
  }

  /**
   * Get service statistics
   * @returns {Object} Service statistics
   */
  getStats() {
    if (!this.initialized) {
      return { initialized: false }
    }

    return {
      initialized: true,
      adapter: this.adapter.getStats(),
      dsl: {
        rolesCount: Object.keys(this.config.roles || {}).length,
        fieldsCount: Object.keys(this.config.fields || {}).length,
        tablesCount: Object.keys(this.config.database?.tables || {}).length
      }
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    if (this.adapter) {
      await this.adapter.close()
    }
    this.dsl = null
    this.adapter = null
    this.config = null
    this.initialized = false
    console.log('✅ DSL Service Provider shutdown completed')
  }

  /**
   * Ensure the service is initialized
   * @private
   */
  ensureInitialized() {
    if (!this.initialized) {
      throw new Error('DSL Service Provider not initialized. Call initialize() first.')
    }
  }

  /**
   * Create a new instance (for testing or multiple configurations)
   * @returns {DSLServiceProvider} New service provider instance
   */
  static createInstance() {
    return new DSLServiceProvider()
  }
}

// Export singleton instance
module.exports = new DSLServiceProvider()
module.exports.DSLServiceProvider = DSLServiceProvider