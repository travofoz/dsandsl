/**
 * @fileoverview MySQL Connection Pool Manager
 * High-performance connection pool with monitoring and auto-recovery
 */

const mysql = require('mysql2/promise')
const debug = require('debug')('dsandsl:mysql')
const { DatabaseError } = require('../../core/DSLErrors')

/**
 * MySQL connection pool manager with monitoring
 */
class MySQLManager {
  constructor(options = {}) {
    this.options = {
      // Connection settings
      host: options.host || process.env.DB_HOST || 'localhost',
      port: options.port || process.env.DB_PORT || 3306,
      database: options.database || process.env.DB_NAME,
      user: options.user || process.env.DB_USER,
      password: options.password || process.env.DB_PASSWORD,
      
      // Pool settings
      connectionLimit: options.connectionLimit || 20,
      acquireTimeout: options.acquireTimeout || 5000,
      timeout: options.timeout || 60000,
      reconnect: options.reconnect !== false,
      
      // SSL settings
      ssl: options.ssl || (process.env.NODE_ENV === 'production' ? {} : false),
      
      // MySQL specific
      charset: options.charset || 'utf8mb4',
      timezone: options.timezone || '+00:00',
      
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
   * Initialize the MySQL connection pool
   */
  async initialize() {
    if (this.isInitialized) {
      return this.pool
    }
    
    try {
      // Create pool with configuration
      this.pool = mysql.createPool(this.options)
      
      // Test the connection
      await this.testConnection()
      
      this.isInitialized = true
      
      debug('MySQL connection pool initialized:', {
        host: this.options.host,
        port: this.options.port,
        database: this.options.database,
        connectionLimit: this.options.connectionLimit
      })
      
      return this.pool
      
    } catch (error) {
      debug('MySQL initialization failed:', error.message)
      throw new DatabaseError(
        `MySQL connection failed: ${error.message}`,
        'connection_failed',
        error
      )
    }
  }
  
  /**
   * Test database connection
   */
  async testConnection() {
    const connection = await this.pool.getConnection()
    try {
      const [rows] = await connection.execute('SELECT NOW() as current_time, VERSION() as mysql_version')
      debug('MySQL connection test successful:', {
        currentTime: rows[0].current_time,
        version: rows[0].mysql_version
      })
    } finally {
      connection.release()
    }
  }
  
  /**
   * Execute a query with performance monitoring
   * @param {string} sql - SQL query
   * @param {Array} params - Query parameters
   * @param {Object} context - Query context for monitoring
   * @returns {Promise<Object>} Query result
   */
  async query(sql, params = [], context = {}) {
    if (!this.isInitialized) {
      await this.initialize()
    }
    
    const startTime = performance.now()
    const queryId = `mysql_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    try {
      this.stats.totalQueries++
      
      debug('Executing MySQL query:', {
        queryId,
        sql: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
        paramCount: params.length,
        context
      })
      
      const [rows, fields] = await this.pool.execute(sql, params)
      const executionTime = performance.now() - startTime
      
      // Update statistics
      this.stats.successfulQueries++
      this.stats.totalConnectionTime += executionTime
      
      // Track slow queries
      if (executionTime > 100) {
        this.stats.slowQueries++
        debug('Slow MySQL query detected:', {
          queryId,
          executionTime: `${executionTime.toFixed(2)}ms`,
          sql: sql.substring(0, 200),
          rowCount: Array.isArray(rows) ? rows.length : 0
        })
      }
      
      debug('MySQL query completed:', {
        queryId,
        executionTime: `${executionTime.toFixed(2)}ms`,
        rowCount: Array.isArray(rows) ? rows.length : 0
      })
      
      // Return result in PostgreSQL-compatible format
      return {
        rows: Array.isArray(rows) ? rows : [],
        fields,
        rowCount: Array.isArray(rows) ? rows.length : (rows.affectedRows || 0),
        affectedRows: rows.affectedRows,
        insertId: rows.insertId
      }
      
    } catch (error) {
      const executionTime = performance.now() - startTime
      this.stats.failedQueries++
      
      debug('MySQL query failed:', {
        queryId,
        error: error.message,
        executionTime: `${executionTime.toFixed(2)}ms`,
        sql: sql.substring(0, 200),
        paramCount: params.length
      })
      
      // Enhance error with context
      error.queryId = queryId
      error.sql = sql
      error.params = params
      error.executionTime = executionTime
      error.context = context
      
      throw new DatabaseError(
        `MySQL query failed: ${error.message}`,
        'query_failed',
        error
      )
    }
  }
  
  /**
   * Get a connection for transaction use
   * @returns {Promise<Object>} Database connection
   */
  async getConnection() {
    if (!this.isInitialized) {
      await this.initialize()
    }
    
    return await this.pool.getConnection()
  }
  
  /**
   * Execute a query within a transaction
   * @param {Function} callback - Transaction callback function
   * @param {Object} options - Transaction options
   * @returns {Promise<any>} Transaction result
   */
  async transaction(callback, options = {}) {
    const connection = await this.getConnection()
    
    try {
      await connection.beginTransaction()
      debug('MySQL transaction started')
      
      // Create a connection wrapper for queries
      const transactionWrapper = {
        query: async (sql, params) => {
          const [rows, fields] = await connection.execute(sql, params)
          return {
            rows: Array.isArray(rows) ? rows : [],
            fields,
            rowCount: Array.isArray(rows) ? rows.length : (rows.affectedRows || 0),
            affectedRows: rows.affectedRows,
            insertId: rows.insertId
          }
        }
      }
      
      const result = await callback(transactionWrapper)
      
      await connection.commit()
      debug('MySQL transaction committed')
      
      return result
      
    } catch (error) {
      await connection.rollback()
      debug('MySQL transaction rolled back:', error.message)
      
      throw new DatabaseError(
        `MySQL transaction failed: ${error.message}`,
        'transaction_failed',
        error
      )
    } finally {
      connection.release()
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
      type: 'mysql',
      pool: {
        connectionLimit: this.options.connectionLimit,
        // Note: mysql2 doesn't expose live connection counts like pg
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
   * Health check for MySQL connection
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
      debug('MySQL health check failed:', error.message)
      return false
    }
  }
  
  /**
   * Get MySQL version information
   * @returns {Promise<Object>} Version information
   */
  async getVersion() {
    try {
      const result = await this.query('SELECT VERSION() as version')
      const versionString = result.rows[0].version
      
      return {
        full: versionString,
        version: versionString.split('-')[0],
        platform: 'MySQL'
      }
    } catch (error) {
      debug('Failed to get MySQL version:', error.message)
      return { full: 'Unknown', version: 'Unknown', platform: 'MySQL' }
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
          TABLE_SCHEMA as table_schema,
          TABLE_NAME as table_name,
          ENGINE as engine,
          TABLE_ROWS as table_rows,
          DATA_LENGTH as data_length,
          INDEX_LENGTH as index_length,
          CREATE_TIME as create_time,
          UPDATE_TIME as update_time
        FROM information_schema.TABLES 
        WHERE TABLE_SCHEMA = DATABASE()
      `
      
      const params = []
      
      if (tableName) {
        query += ' AND TABLE_NAME = ?'
        params.push(tableName)
      }
      
      query += ' ORDER BY TABLE_NAME'
      
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
          COLUMN_NAME as column_name,
          DATA_TYPE as data_type,
          IS_NULLABLE as is_nullable,
          COLUMN_DEFAULT as column_default,
          CHARACTER_MAXIMUM_LENGTH as character_maximum_length,
          COLUMN_KEY as column_key,
          EXTRA as extra
        FROM information_schema.COLUMNS 
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
        ORDER BY ORDINAL_POSITION
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
      debug('Closing MySQL connection pool...')
      await this.pool.end()
      this.pool = null
      this.isInitialized = false
      debug('MySQL connection pool closed')
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
    debug('MySQL statistics reset')
  }
}

module.exports = MySQLManager