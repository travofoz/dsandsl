/**
 * @fileoverview PostgreSQL Connection Pool Manager
 * High-performance connection pool with monitoring and auto-recovery
 * Based on the original tracked_v2 implementation
 */

const { Pool } = require('pg')
const debug = require('debug')('dsandsl:postgresql')
const { DatabaseError } = require('../../core/DSLErrors')

/**
 * PostgreSQL connection pool manager with monitoring
 */
class PostgreSQLManager {
  constructor(options = {}) {
    this.options = {
      // Connection settings
      connectionString: options.connectionString || process.env.DATABASE_URL,
      host: options.host || process.env.DB_HOST,
      port: options.port || process.env.DB_PORT || 5432,
      database: options.database || process.env.DB_NAME,
      user: options.user || process.env.DB_USER,
      password: options.password || process.env.DB_PASSWORD,
      
      // Pool settings
      max: options.max || 20,
      min: options.min || 5,
      acquireTimeoutMillis: options.acquireTimeoutMillis || 5000,
      idleTimeoutMillis: options.idleTimeoutMillis || 30000,
      createTimeoutMillis: options.createTimeoutMillis || 3000,
      createRetryIntervalMillis: options.createRetryIntervalMillis || 200,
      
      // Keep-alive settings
      enableKeepAlive: options.enableKeepAlive !== false,
      keepAliveInitialDelayMillis: options.keepAliveInitialDelayMillis || 10000,
      
      // Error handling
      reapIntervalMillis: options.reapIntervalMillis || 1000,
      
      // SSL settings
      ssl: options.ssl || (process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false),
      
      ...options
    }
    
    this.pool = null
    this.isInitialized = false
    
    // Performance tracking
    this.stats = {
      totalQueries: 0,
      successfulQueries: 0,
      failedQueries: 0,
      totalConnectionTime: 0,
      slowQueries: 0,
      startTime: Date.now()
    }
  }
  
  /**
   * Initialize the PostgreSQL connection pool
   */
  async initialize() {
    if (this.isInitialized) {
      return this.pool
    }
    
    try {
      // Create pool with configuration
      this.pool = new Pool(this.options)
      
      // Set up pool monitoring
      this.setupPoolMonitoring()
      
      // Test the connection
      await this.testConnection()
      
      this.isInitialized = true
      
      debug('PostgreSQL connection pool initialized:', {
        max: this.options.max,
        min: this.options.min,
        ssl: !!this.options.ssl,
        database: this.options.database
      })
      
      return this.pool
      
    } catch (error) {
      debug('PostgreSQL initialization failed:', error.message)
      throw new DatabaseError(
        `PostgreSQL connection failed: ${error.message}`,
        'connection_failed',
        error
      )
    }
  }
  
  /**
   * Set up connection pool event monitoring
   */
  setupPoolMonitoring() {
    // Connection acquisition
    this.pool.on('acquire', (client) => {
      debug('Connection acquired:', {
        totalCount: this.pool.totalCount,
        idleCount: this.pool.idleCount,
        waitingCount: this.pool.waitingCount
      })
    })
    
    // Connection release
    this.pool.on('release', (err, client) => {
      if (err) {
        debug('Error releasing connection:', err.message)
      }
    })
    
    // New connection created
    this.pool.on('connect', (client) => {
      debug('New PostgreSQL connection created')
    })
    
    // Connection removed from pool
    this.pool.on('remove', (client) => {
      debug('PostgreSQL connection removed from pool')
    })
    
    // Pool errors
    this.pool.on('error', (err, client) => {
      debug('PostgreSQL pool error:', err.message)
      this.stats.failedQueries++
    })
  }
  
  /**
   * Test database connection
   */
  async testConnection() {
    const client = await this.pool.connect()
    try {
      const result = await client.query('SELECT NOW() as current_time, version() as pg_version')
      debug('Connection test successful:', {
        currentTime: result.rows[0].current_time,
        version: result.rows[0].pg_version.split(' ')[0]
      })
    } finally {
      client.release()
    }
  }
  
  /**
   * Execute a query with performance monitoring
   * @param {string} text - SQL query
   * @param {Array} params - Query parameters
   * @param {Object} context - Query context for monitoring
   * @returns {Promise<Object>} Query result
   */
  async query(text, params = [], context = {}) {
    if (!this.isInitialized) {
      await this.initialize()
    }
    
    const startTime = performance.now()
    const queryId = `pg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    try {
      this.stats.totalQueries++
      
      debug('Executing PostgreSQL query:', {
        queryId,
        sql: text.substring(0, 100) + (text.length > 100 ? '...' : ''),
        paramCount: params.length,
        context
      })
      
      const result = await this.pool.query(text, params)
      const executionTime = performance.now() - startTime
      
      // Update statistics
      this.stats.successfulQueries++
      this.stats.totalConnectionTime += executionTime
      
      // Track slow queries
      if (executionTime > 100) {
        this.stats.slowQueries++
        debug('Slow PostgreSQL query detected:', {
          queryId,
          executionTime: `${executionTime.toFixed(2)}ms`,
          sql: text.substring(0, 200),
          rowCount: result.rowCount
        })
      }
      
      debug('PostgreSQL query completed:', {
        queryId,
        executionTime: `${executionTime.toFixed(2)}ms`,
        rowCount: result.rowCount
      })
      
      return result
      
    } catch (error) {
      const executionTime = performance.now() - startTime
      this.stats.failedQueries++
      
      debug('PostgreSQL query failed:', {
        queryId,
        error: error.message,
        executionTime: `${executionTime.toFixed(2)}ms`,
        sql: text.substring(0, 200),
        paramCount: params.length
      })
      
      // Enhance error with context
      error.queryId = queryId
      error.sql = text
      error.params = params
      error.executionTime = executionTime
      error.context = context
      
      throw new DatabaseError(
        `PostgreSQL query failed: ${error.message}`,
        'query_failed',
        error
      )
    }
  }
  
  /**
   * Get a client for transaction use
   * @returns {Promise<Object>} Database client
   */
  async getClient() {
    if (!this.isInitialized) {
      await this.initialize()
    }
    
    return await this.pool.connect()
  }
  
  /**
   * Execute a query within a transaction
   * @param {Function} callback - Transaction callback function
   * @param {Object} options - Transaction options
   * @returns {Promise<any>} Transaction result
   */
  async transaction(callback, options = {}) {
    const client = await this.getClient()
    
    try {
      await client.query('BEGIN')
      debug('PostgreSQL transaction started')
      
      const result = await callback(client)
      
      await client.query('COMMIT')
      debug('PostgreSQL transaction committed')
      
      return result
      
    } catch (error) {
      await client.query('ROLLBACK')
      debug('PostgreSQL transaction rolled back:', error.message)
      
      throw new DatabaseError(
        `PostgreSQL transaction failed: ${error.message}`,
        'transaction_failed',
        error
      )
    } finally {
      client.release()
    }
  }
  
  /**
   * Get connection pool status and metrics
   * @returns {Object} Pool status and performance metrics
   */
  getStats() {
    if (!this.pool) {
      return { status: 'not_initialized' }
    }
    
    const uptimeMs = Date.now() - this.stats.startTime
    const avgQueryTime = this.stats.totalQueries > 0 
      ? this.stats.totalConnectionTime / this.stats.totalQueries 
      : 0
    
    return {
      status: 'healthy',
      type: 'postgresql',
      pool: {
        totalCount: this.pool.totalCount,
        idleCount: this.pool.idleCount,
        waitingCount: this.pool.waitingCount,
        max: this.options.max,
        min: this.options.min
      },
      metrics: {
        ...this.stats,
        uptimeMs,
        avgQueryTimeMs: Math.round(avgQueryTime * 100) / 100,
        successRate: this.stats.totalQueries > 0 
          ? Math.round((this.stats.successfulQueries / this.stats.totalQueries) * 10000) / 100
          : 100,
        slowQueryRate: this.stats.totalQueries > 0
          ? Math.round((this.stats.slowQueries / this.stats.totalQueries) * 10000) / 100
          : 0
      }
    }
  }
  
  /**
   * Health check for PostgreSQL connection
   * @returns {Promise<boolean>} Health status
   */
  async healthCheck() {
    try {
      if (!this.isInitialized || !this.pool) {
        return false
      }
      
      const result = await this.query('SELECT 1 as health_check', [], { type: 'health_check' })
      return result.rows[0].health_check === 1
    } catch (error) {
      debug('PostgreSQL health check failed:', error.message)
      return false
    }
  }
  
  /**
   * Get PostgreSQL version information
   * @returns {Promise<Object>} Version information
   */
  async getVersion() {
    try {
      const result = await this.query('SELECT version() as version')
      const versionString = result.rows[0].version
      
      return {
        full: versionString,
        version: versionString.split(' ')[1],
        platform: versionString.includes('PostgreSQL') ? 'PostgreSQL' : 'Unknown'
      }
    } catch (error) {
      debug('Failed to get PostgreSQL version:', error.message)
      return { full: 'Unknown', version: 'Unknown', platform: 'PostgreSQL' }
    }
  }
  
  /**
   * Get table information
   * @param {string} tableName - Table name (optional)
   * @returns {Promise<Array>} Table information
   */
  async getTables(tableName = null) {
    try {
      let query = `
        SELECT 
          schemaname,
          tablename,
          tableowner,
          hasindexes,
          hasrules,
          hastriggers
        FROM pg_tables 
        WHERE schemaname NOT IN ('information_schema', 'pg_catalog')
      `
      
      const params = []
      
      if (tableName) {
        query += ' AND tablename = $1'
        params.push(tableName)
      }
      
      query += ' ORDER BY schemaname, tablename'
      
      const result = await this.query(query, params)
      return result.rows
      
    } catch (error) {
      debug('Failed to get table information:', error.message)
      return []
    }
  }
  
  /**
   * Get column information for a table
   * @param {string} tableName - Table name
   * @returns {Promise<Array>} Column information
   */
  async getColumns(tableName) {
    try {
      const query = `
        SELECT 
          column_name,
          data_type,
          is_nullable,
          column_default,
          character_maximum_length
        FROM information_schema.columns 
        WHERE table_name = $1
        ORDER BY ordinal_position
      `
      
      const result = await this.query(query, [tableName])
      return result.rows
      
    } catch (error) {
      debug('Failed to get column information:', error.message)
      return []
    }
  }
  
  /**
   * Close the connection pool
   */
  async close() {
    if (this.pool) {
      debug('Closing PostgreSQL connection pool...')
      await this.pool.end()
      this.pool = null
      this.isInitialized = false
      debug('PostgreSQL connection pool closed')
    }
  }
  
  /**
   * Reset performance metrics
   */
  resetStats() {
    this.stats = {
      totalQueries: 0,
      successfulQueries: 0,
      failedQueries: 0,
      totalConnectionTime: 0,
      slowQueries: 0,
      startTime: Date.now()
    }
    debug('PostgreSQL statistics reset')
  }
}

module.exports = PostgreSQLManager