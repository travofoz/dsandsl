/**
 * @fileoverview SQLite Connection Manager
 * High-performance SQLite with WAL mode and connection monitoring
 */

const sqlite3 = require('sqlite3').verbose()
const debug = require('debug')('dsandsl:sqlite')
const { DatabaseError } = require('../../core/DSLErrors')

/**
 * SQLite connection manager with monitoring
 */
class SQLiteManager {
  constructor(options = {}) {
    this.options = {
      // Database file path
      filename: options.filename || options.database || process.env.DB_FILE || ':memory:',
      
      // SQLite settings
      mode: options.mode || sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE,
      verbose: options.verbose || false,
      
      // WAL mode for better concurrency
      enableWAL: options.enableWAL !== false,
      
      // Connection pool simulation (SQLite doesn't have real pooling)
      maxConnections: options.maxConnections || 1,
      busyTimeout: options.busyTimeout || 10000,
      
      // Pragmas
      pragmas: options.pragmas || {
        journal_mode: 'WAL',
        synchronous: 'NORMAL',
        cache_size: 10000,
        foreign_keys: 'ON',
        temp_store: 'MEMORY'
      },
      
      ...options
    }
    
    this.db = null
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
   * Initialize the SQLite database connection
   */
  async initialize() {
    if (this.isInitialized) {
      return this.db
    }
    
    return new Promise((resolve, reject) => {
      try {
        // Create database connection
        this.db = new sqlite3.Database(
          this.options.filename,
          this.options.mode,
          async (err) => {
            if (err) {
              debug('SQLite initialization failed:', err.message)
              return reject(new DatabaseError(
                `SQLite connection failed: ${err.message}`,
                'connection_failed',
                err
              ))
            }
            
            try {
              // Set busy timeout
              await this.setPragma('busy_timeout', this.options.busyTimeout)
              
              // Apply all pragmas
              for (const [pragma, value] of Object.entries(this.options.pragmas)) {
                await this.setPragma(pragma, value)
              }
              
              // Test the connection
              await this.testConnection()
              
              this.isInitialized = true
              
              debug('SQLite database initialized:', {
                filename: this.options.filename,
                mode: this.options.mode,
                pragmas: this.options.pragmas
              })
              
              resolve(this.db)
              
            } catch (initError) {
              debug('SQLite initialization error:', initError.message)
              reject(initError)
            }
          }
        )
        
        // Enable verbose mode if requested
        if (this.options.verbose) {
          this.db.on('trace', (sql) => {
            debug('SQLite trace:', sql)
          })
        }
        
        // Error handling
        this.db.on('error', (err) => {
          debug('SQLite database error:', err.message)
          this.stats.failedQueries++
        })
        
      } catch (error) {
        debug('SQLite setup failed:', error.message)
        reject(new DatabaseError(
          `SQLite setup failed: ${error.message}`,
          'setup_failed',
          error
        ))
      }
    })
  }
  
  /**
   * Set a pragma value
   * @param {string} pragma - Pragma name
   * @param {any} value - Pragma value
   */
  async setPragma(pragma, value) {
    return new Promise((resolve, reject) => {
      const sql = `PRAGMA ${pragma} = ${value}`
      this.db.run(sql, (err) => {
        if (err) {
          reject(new DatabaseError(
            `Failed to set pragma ${pragma}: ${err.message}`,
            'pragma_failed',
            err
          ))
        } else {
          debug(`Pragma set: ${pragma} = ${value}`)
          resolve()
        }
      })
    })
  }
  
  /**
   * Test database connection
   */
  async testConnection() {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT datetime("now") as current_time, sqlite_version() as sqlite_version',
        (err, row) => {
          if (err) {
            reject(new DatabaseError(
              `SQLite connection test failed: ${err.message}`,
              'connection_test_failed',
              err
            ))
          } else {
            debug('SQLite connection test successful:', {
              currentTime: row.current_time,
              version: row.sqlite_version
            })
            resolve(row)
          }
        }
      )
    })
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
    const queryId = `sqlite_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    return new Promise((resolve, reject) => {
      try {
        this.stats.totalQueries++
        
        debug('Executing SQLite query:', {
          queryId,
          sql: sql.substring(0, 100) + (sql.length > 100 ? '...' : ''),
          paramCount: params.length,
          context
        })
        
        // Determine query type
        const queryType = sql.trim().toUpperCase().split(' ')[0]
        
        if (queryType === 'SELECT') {
          // SELECT queries return multiple rows
          this.db.all(sql, params, (err, rows) => {
            this.handleQueryResult(err, { rows }, startTime, queryId, sql, resolve, reject)
          })
        } else {
          // INSERT, UPDATE, DELETE queries
          this.db.run(sql, params, function(err) {
            const result = {
              rows: [],
              rowCount: this.changes,
              affectedRows: this.changes,
              lastInsertId: this.lastID
            }
            this.handleQueryResult.call(this, err, result, startTime, queryId, sql, resolve, reject)
          }.bind(this))
        }
        
      } catch (error) {
        const executionTime = performance.now() - startTime
        this.stats.failedQueries++
        
        debug('SQLite query setup failed:', {
          queryId,
          error: error.message,
          executionTime: `${executionTime.toFixed(2)}ms`,
          sql: sql.substring(0, 200)
        })
        
        reject(new DatabaseError(
          `SQLite query setup failed: ${error.message}`,
          'query_setup_failed',
          error
        ))
      }
    })
  }
  
  /**
   * Handle query result (shared between SELECT and modification queries)
   */
  handleQueryResult(err, result, startTime, queryId, sql, resolve, reject) {
    const executionTime = performance.now() - startTime
    
    if (err) {
      this.stats.failedQueries++
      
      debug('SQLite query failed:', {
        queryId,
        error: err.message,
        executionTime: `${executionTime.toFixed(2)}ms`,
        sql: sql.substring(0, 200)
      })
      
      // Enhance error with context
      err.queryId = queryId
      err.sql = sql
      err.executionTime = executionTime
      
      reject(new DatabaseError(
        `SQLite query failed: ${err.message}`,
        'query_failed',
        err
      ))
    } else {
      // Update statistics
      this.stats.successfulQueries++
      this.stats.totalConnectionTime += executionTime
      
      // Track slow queries
      if (executionTime > 100) {
        this.stats.slowQueries++
        debug('Slow SQLite query detected:', {
          queryId,
          executionTime: `${executionTime.toFixed(2)}ms`,
          sql: sql.substring(0, 200),
          rowCount: Array.isArray(result.rows) ? result.rows.length : result.rowCount
        })
      }
      
      debug('SQLite query completed:', {
        queryId,
        executionTime: `${executionTime.toFixed(2)}ms`,
        rowCount: Array.isArray(result.rows) ? result.rows.length : result.rowCount
      })
      
      // Return result in PostgreSQL-compatible format
      resolve({
        rows: result.rows || [],
        rowCount: result.rowCount || (Array.isArray(result.rows) ? result.rows.length : 0),
        affectedRows: result.affectedRows,
        lastInsertId: result.lastInsertId
      })
    }
  }
  
  /**
   * Execute a query within a transaction
   * @param {Function} callback - Transaction callback function
   * @param {Object} options - Transaction options
   * @returns {Promise<any>} Transaction result
   */
  async transaction(callback, options = {}) {
    if (!this.isInitialized) {
      await this.initialize()
    }
    
    return new Promise(async (resolve, reject) => {
      try {
        // Begin transaction
        await this.query('BEGIN TRANSACTION')
        debug('SQLite transaction started')
        
        // Create a transaction wrapper
        const transactionWrapper = {
          query: async (sql, params) => {
            return await this.query(sql, params)
          }
        }
        
        try {
          const result = await callback(transactionWrapper)
          
          // Commit transaction
          await this.query('COMMIT')
          debug('SQLite transaction committed')
          
          resolve(result)
          
        } catch (error) {
          // Rollback transaction
          await this.query('ROLLBACK')
          debug('SQLite transaction rolled back:', error.message)
          
          reject(new DatabaseError(
            `SQLite transaction failed: ${error.message}`,
            'transaction_failed',
            error
          ))
        }
        
      } catch (error) {
        debug('SQLite transaction setup failed:', error.message)
        reject(new DatabaseError(
          `SQLite transaction setup failed: ${error.message}`,
          'transaction_setup_failed',
          error
        ))
      }
    })
  }
  
  /**
   * Get database status and metrics
   * @returns {Object} Database status and performance metrics
   */
  getStats() {
    if (!this.db) {
      return { status: 'not_initialized' }
    }
    
    const uptimeMs = Date.now() - this.stats.startTime
    const avgQueryTime = this.stats.totalQueries > 0 
      ? this.stats.totalConnectionTime / this.stats.totalQueries 
      : 0
    
    return {
      status: 'healthy',
      type: 'sqlite',
      database: {
        filename: this.options.filename,
        pragmas: this.options.pragmas
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
   * Health check for SQLite connection
   * @returns {Promise<boolean>} Health status
   */
  async healthCheck() {
    try {
      if (!this.isInitialized || !this.db) {
        return false
      }
      
      const result = await this.query('SELECT 1 as health_check', [], { type: 'health_check' })
      return result.rows[0].health_check === 1
    } catch (error) {
      debug('SQLite health check failed:', error.message)
      return false
    }
  }
  
  /**
   * Get SQLite version information
   * @returns {Promise<Object>} Version information
   */
  async getVersion() {
    try {
      const result = await this.query('SELECT sqlite_version() as version')
      const versionString = result.rows[0].version
      
      return {
        full: versionString,
        version: versionString,
        platform: 'SQLite'
      }
    } catch (error) {
      debug('Failed to get SQLite version:', error.message)
      return { full: 'Unknown', version: 'Unknown', platform: 'SQLite' }
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
          name as table_name,
          type,
          sql
        FROM sqlite_master 
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      `
      
      const params = []
      
      if (tableName) {
        query += ' AND name = ?'
        params.push(tableName)
      }
      
      query += ' ORDER BY name'
      
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
      const query = `PRAGMA table_info(${tableName})`
      const result = await this.query(query, [])
      
      // Convert SQLite pragma format to standard format
      return result.rows.map(row => ({
        column_name: row.name,
        data_type: row.type,
        is_nullable: row.notnull ? 'NO' : 'YES',
        column_default: row.dflt_value,
        primary_key: row.pk > 0
      }))
      
    } catch (error) {
      debug('Failed to get column information:', error.message)
      return []
    }
  }
  
  /**
   * Close the database connection
   */
  async close() {
    if (this.db) {
      return new Promise((resolve, reject) => {
        debug('Closing SQLite database...')
        this.db.close((err) => {
          if (err) {
            debug('Error closing SQLite database:', err.message)
            reject(new DatabaseError(
              `Failed to close SQLite database: ${err.message}`,
              'close_failed',
              err
            ))
          } else {
            this.db = null
            this.isInitialized = false
            debug('SQLite database closed')
            resolve()
          }
        })
      })
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
    debug('SQLite statistics reset')
  }
}

module.exports = SQLiteManager