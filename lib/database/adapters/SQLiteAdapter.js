/**
 * @fileoverview SQLite Database Adapter
 * Concrete implementation for SQLite with DSL integration
 */

const DatabaseAdapter = require('../DatabaseAdapter')
const SQLiteManager = require('../managers/SQLiteManager')
const QueryBuilder = require('../QueryBuilder')
const { DatabaseError } = require('../../core/DSLErrors')
const debug = require('debug')('dsandsl:sqlite-adapter')

/**
 * SQLite adapter with DSL field filtering
 */
class SQLiteAdapter extends DatabaseAdapter {
  constructor(dsl, options = {}) {
    super(dsl, options)
    
    this.connectionManager = new SQLiteManager(options.connection || {})
    this.dbOptions = {
      dialect: 'sqlite',
      ...options
    }
  }
  
  /**
   * Initialize the SQLite adapter
   */
  async initialize() {
    try {
      await this.connectionManager.initialize()
      
      debug('SQLite adapter initialized:', {
        validateTableAccess: this.options.validateTableAccess,
        validateFieldAccess: this.options.validateFieldAccess,
        autoFilter: this.options.autoFilter
      })
      
      return this
      
    } catch (error) {
      throw new DatabaseError(
        `SQLite adapter initialization failed: ${error.message}`,
        'adapter_init_failed',
        error
      )
    }
  }
  
  /**
   * Close database connections
   */
  async close() {
    if (this.connectionManager) {
      await this.connectionManager.close()
    }
  }
  
  /**
   * Execute a raw query
   */
  async executeQuery(sql, params, options = {}) {
    return await this.connectionManager.query(sql, params, {
      userRole: options.userRole,
      operation: options.operation,
      table: options.table,
      ...options
    })
  }
  
  /**
   * Create a query builder for this adapter
   * @param {string} userRole - User's role
   * @param {Object} options - Builder options
   * @returns {QueryBuilder} Query builder instance
   */
  createQueryBuilder(userRole, options = {}) {
    return new QueryBuilder(this.dsl, userRole, {
      dialect: 'sqlite',
      validateFields: this.options.validateFieldAccess,
      autoFilter: this.options.autoFilter,
      ...options
    })
  }
  
  /**
   * Select data with role-based filtering
   * @param {string} table - Table name
   * @param {string} userRole - User's role
   * @param {Object} options - Query options
   * @returns {Promise<Array>} Filtered results
   */
  async select(table, userRole, options = {}) {
    try {
      // Check table access
      this.checkTableAccess(table, userRole, 'SELECT')
      
      // Create query builder
      const qb = this.createQueryBuilder(userRole)
        .select(options.fields || ['*'])
        .from(table)
      
      // Apply conditions
      if (options.where) {
        qb.where(options.where)
      }
      
      if (options.join) {
        options.join.forEach(j => {
          qb.join(j.table, j.condition, j.type)
        })
      }
      
      if (options.orderBy) {
        qb.orderBy(options.orderBy, options.orderDirection)
      }
      
      if (options.groupBy) {
        qb.groupBy(options.groupBy)
      }
      
      if (options.having) {
        qb.having(options.having)
      }
      
      if (options.limit) {
        qb.limit(options.limit)
      }
      
      if (options.offset) {
        qb.offset(options.offset)
      }
      
      // Build and execute query
      const { sql, params } = qb.build()
      const result = await this.query(sql, params, userRole, {
        operation: 'SELECT',
        table
      })
      
      debug('SELECT completed:', {
        table,
        userRole,
        rowCount: result.rows.length,
        executionTime: result.executionTime
      })
      
      return result.rows
      
    } catch (error) {
      throw new DatabaseError(
        `SQLite SELECT failed: ${error.message}`,
        'select_failed',
        error
      )
    }
  }
  
  /**
   * Insert data with role-based validation
   */
  async insert(table, data, userRole, options = {}) {
    try {
      // Check table access
      this.checkTableAccess(table, userRole, 'INSERT')
      
      // Create query builder
      const qb = this.createQueryBuilder(userRole)
        .insert(table)
        .values(data)
      
      if (options.returning) {
        qb.returning(options.returning)
      }
      
      // Build and execute query
      const { sql, params } = qb.build()
      const result = await this.executeQuery(sql, params, {
        userRole,
        operation: 'INSERT',
        table
      })
      
      debug('INSERT completed:', {
        table,
        userRole,
        affectedRows: result.affectedRows,
        lastInsertId: result.lastInsertId
      })
      
      return result
      
    } catch (error) {
      throw new DatabaseError(
        `SQLite INSERT failed: ${error.message}`,
        'insert_failed',
        error
      )
    }
  }
  
  /**
   * Update data with role-based validation
   */
  async update(table, data, where, userRole, options = {}) {
    try {
      // Check table access
      this.checkTableAccess(table, userRole, 'UPDATE')
      
      // Create query builder
      const qb = this.createQueryBuilder(userRole)
        .update(table)
        .set(data)
        .where(where)
      
      if (options.returning) {
        qb.returning(options.returning)
      }
      
      // Build and execute query
      const { sql, params } = qb.build()
      const result = await this.executeQuery(sql, params, {
        userRole,
        operation: 'UPDATE',
        table
      })
      
      debug('UPDATE completed:', {
        table,
        userRole,
        affectedRows: result.affectedRows
      })
      
      return result
      
    } catch (error) {
      throw new DatabaseError(
        `SQLite UPDATE failed: ${error.message}`,
        'update_failed',
        error
      )
    }
  }
  
  /**
   * Delete data with role-based validation
   */
  async delete(table, where, userRole, options = {}) {
    try {
      // Check table access
      this.checkTableAccess(table, userRole, 'DELETE')
      
      // Create query builder
      const qb = this.createQueryBuilder(userRole)
        .delete()
        .from(table)
        .where(where)
      
      if (options.returning) {
        qb.returning(options.returning)
      }
      
      // Build and execute query
      const { sql, params } = qb.build()
      const result = await this.executeQuery(sql, params, {
        userRole,
        operation: 'DELETE',
        table
      })
      
      debug('DELETE completed:', {
        table,
        userRole,
        affectedRows: result.affectedRows
      })
      
      return result
      
    } catch (error) {
      throw new DatabaseError(
        `SQLite DELETE failed: ${error.message}`,
        'delete_failed',
        error
      )
    }
  }
  
  /**
   * Execute query within a transaction
   */
  async transaction(callback, options = {}) {
    try {
      return await this.connectionManager.transaction(async (transactionWrapper) => {
        // Create a transaction-aware adapter
        const transactionAdapter = new SQLiteTransactionAdapter(this, transactionWrapper)
        return await callback(transactionAdapter)
      }, options)
      
    } catch (error) {
      throw new DatabaseError(
        `SQLite transaction failed: ${error.message}`,
        'transaction_failed',
        error
      )
    }
  }
  
  /**
   * Get database version and info
   */
  async getInfo() {
    const version = await this.connectionManager.getVersion()
    const tables = await this.connectionManager.getTables()
    
    return {
      version,
      tables: tables.length,
      adapter: 'SQLite',
      features: {
        transactions: true,
        returning: true,
        schemas: false,
        foreignKeys: true
      }
    }
  }
  
  /**
   * Health check
   */
  async healthCheck() {
    return await this.connectionManager.healthCheck()
  }
  
  /**
   * Get adapter statistics
   */
  getStats() {
    const baseStats = super.getStats()
    const connectionStats = this.connectionManager.getStats()
    
    return {
      ...baseStats,
      connection: connectionStats,
      adapter: 'SQLiteAdapter'
    }
  }
}

/**
 * Transaction-aware adapter for SQLite
 */
class SQLiteTransactionAdapter {
  constructor(adapter, transactionWrapper) {
    this.adapter = adapter
    this.transactionWrapper = transactionWrapper
    this.dsl = adapter.dsl
    this.options = adapter.options
  }
  
  /**
   * Execute query within transaction
   */
  async query(sql, params, userRole, options = {}) {
    try {
      if (this.options.validateTableAccess) {
        this.adapter.validateTableAccess(sql, userRole)
      }
      
      const result = await this.transactionWrapper.query(sql, params)
      
      if (this.options.autoFilter && result.rows) {
        result.rows = this.dsl.filter(result.rows, userRole)
      }
      
      return result
      
    } catch (error) {
      throw new DatabaseError(
        `Transaction query failed: ${error.message}`,
        'transaction_query_failed',
        error
      )
    }
  }
  
  /**
   * Create query builder for transaction
   */
  createQueryBuilder(userRole, options = {}) {
    return this.adapter.createQueryBuilder(userRole, options)
  }
  
  /**
   * Select within transaction
   */
  async select(table, userRole, options = {}) {
    const qb = this.createQueryBuilder(userRole)
      .select(options.fields || ['*'])
      .from(table)
    
    if (options.where) qb.where(options.where)
    if (options.orderBy) qb.orderBy(options.orderBy)
    if (options.limit) qb.limit(options.limit)
    if (options.offset) qb.offset(options.offset)
    
    const { sql, params } = qb.build()
    const result = await this.query(sql, params, userRole, { table, operation: 'SELECT' })
    
    return result.rows
  }
  
  /**
   * Insert within transaction
   */
  async insert(table, data, userRole, options = {}) {
    const qb = this.createQueryBuilder(userRole)
      .insert(table)
      .values(data)
    
    if (options.returning) qb.returning(options.returning)
    
    const { sql, params } = qb.build()
    return await this.query(sql, params, userRole, { table, operation: 'INSERT' })
  }
  
  /**
   * Update within transaction
   */
  async update(table, data, where, userRole, options = {}) {
    const qb = this.createQueryBuilder(userRole)
      .update(table)
      .set(data)
      .where(where)
    
    if (options.returning) qb.returning(options.returning)
    
    const { sql, params } = qb.build()
    return await this.query(sql, params, userRole, { table, operation: 'UPDATE' })
  }
  
  /**
   * Delete within transaction
   */
  async delete(table, where, userRole, options = {}) {
    const qb = this.createQueryBuilder(userRole)
      .delete()
      .from(table)
      .where(where)
    
    if (options.returning) qb.returning(options.returning)
    
    const { sql, params } = qb.build()
    return await this.query(sql, params, userRole, { table, operation: 'DELETE' })
  }
}

module.exports = SQLiteAdapter