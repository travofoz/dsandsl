/**
 * @fileoverview MySQL Database Adapter
 * Concrete implementation for MySQL with DSL integration
 */

const DatabaseAdapter = require('../DatabaseAdapter')
const MySQLManager = require('../managers/MySQLManager')
const QueryBuilder = require('../QueryBuilder')
const { DatabaseError } = require('../../core/DSLErrors')
const debug = require('debug')('dsandsl:mysql-adapter')

/**
 * MySQL adapter with DSL field filtering
 */
class MySQLAdapter extends DatabaseAdapter {
  constructor(dsl, options = {}) {
    super(dsl, options)
    
    this.connectionManager = new MySQLManager(options.connection || {})
    this.dbOptions = {
      dialect: 'mysql',
      ...options
    }
  }
  
  /**
   * Initialize the MySQL adapter
   */
  async initialize() {
    try {
      await this.connectionManager.initialize()
      
      debug('MySQL adapter initialized:', {
        validateTableAccess: this.options.validateTableAccess,
        validateFieldAccess: this.options.validateFieldAccess,
        autoFilter: this.options.autoFilter
      })
      
      return this
      
    } catch (error) {
      throw new DatabaseError(
        `MySQL adapter initialization failed: ${error.message}`,
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
      dialect: 'mysql',
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
        `MySQL SELECT failed: ${error.message}`,
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
      
      // Create query builder (MySQL doesn't support RETURNING)
      const qb = this.createQueryBuilder(userRole)
        .insert(table)
        .values(data)
      
      // Build and execute query
      const { sql, params } = qb.build()
      const result = await this.executeQuery(sql, params, {
        userRole,
        operation: 'INSERT',
        table
      })
      
      // For MySQL, if returning fields are requested, fetch them
      if (options.returning && result.insertId) {
        const selectResult = await this.select(table, userRole, {
          where: { id: result.insertId },
          fields: options.returning
        })
        result.rows = selectResult
      }
      
      debug('INSERT completed:', {
        table,
        userRole,
        affectedRows: result.affectedRows,
        insertId: result.insertId
      })
      
      return result
      
    } catch (error) {
      throw new DatabaseError(
        `MySQL INSERT failed: ${error.message}`,
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
      
      // For MySQL RETURNING simulation, get records before update
      let beforeUpdate = []
      if (options.returning) {
        beforeUpdate = await this.select(table, userRole, { where })
      }
      
      // Create query builder
      const qb = this.createQueryBuilder(userRole)
        .update(table)
        .set(data)
        .where(where)
      
      // Build and execute query
      const { sql, params } = qb.build()
      const result = await this.executeQuery(sql, params, {
        userRole,
        operation: 'UPDATE',
        table
      })
      
      // For MySQL, simulate RETURNING by fetching updated records
      if (options.returning && result.affectedRows > 0) {
        const selectResult = await this.select(table, userRole, {
          where,
          fields: options.returning
        })
        result.rows = selectResult
      }
      
      debug('UPDATE completed:', {
        table,
        userRole,
        affectedRows: result.affectedRows
      })
      
      return result
      
    } catch (error) {
      throw new DatabaseError(
        `MySQL UPDATE failed: ${error.message}`,
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
      
      // For MySQL RETURNING simulation, get records before delete
      let beforeDelete = []
      if (options.returning) {
        beforeDelete = await this.select(table, userRole, { where })
      }
      
      // Create query builder
      const qb = this.createQueryBuilder(userRole)
        .delete()
        .from(table)
        .where(where)
      
      // Build and execute query
      const { sql, params } = qb.build()
      const result = await this.executeQuery(sql, params, {
        userRole,
        operation: 'DELETE',
        table
      })
      
      // For MySQL, simulate RETURNING with pre-delete data
      if (options.returning && beforeDelete.length > 0) {
        result.rows = beforeDelete
      }
      
      debug('DELETE completed:', {
        table,
        userRole,
        affectedRows: result.affectedRows
      })
      
      return result
      
    } catch (error) {
      throw new DatabaseError(
        `MySQL DELETE failed: ${error.message}`,
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
        const transactionAdapter = new MySQLTransactionAdapter(this, transactionWrapper)
        return await callback(transactionAdapter)
      }, options)
      
    } catch (error) {
      throw new DatabaseError(
        `MySQL transaction failed: ${error.message}`,
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
      adapter: 'MySQL',
      features: {
        transactions: true,
        returning: false, // MySQL doesn't support RETURNING (simulated)
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
      adapter: 'MySQLAdapter'
    }
  }
}

/**
 * Transaction-aware adapter for MySQL
 */
class MySQLTransactionAdapter {
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
    
    const { sql, params } = qb.build()
    const result = await this.query(sql, params, userRole, { table, operation: 'INSERT' })
    
    // Simulate RETURNING for MySQL
    if (options.returning && result.insertId) {
      const selectResult = await this.select(table, userRole, {
        where: { id: result.insertId },
        fields: options.returning
      })
      result.rows = selectResult
    }
    
    return result
  }
  
  /**
   * Update within transaction
   */
  async update(table, data, where, userRole, options = {}) {
    // Get before-update data for RETURNING simulation
    let beforeUpdate = []
    if (options.returning) {
      beforeUpdate = await this.select(table, userRole, { where })
    }
    
    const qb = this.createQueryBuilder(userRole)
      .update(table)
      .set(data)
      .where(where)
    
    const { sql, params } = qb.build()
    const result = await this.query(sql, params, userRole, { table, operation: 'UPDATE' })
    
    // Simulate RETURNING for MySQL
    if (options.returning && result.affectedRows > 0) {
      const selectResult = await this.select(table, userRole, {
        where,
        fields: options.returning
      })
      result.rows = selectResult
    }
    
    return result
  }
  
  /**
   * Delete within transaction
   */
  async delete(table, where, userRole, options = {}) {
    // Get before-delete data for RETURNING simulation
    let beforeDelete = []
    if (options.returning) {
      beforeDelete = await this.select(table, userRole, { where })
    }
    
    const qb = this.createQueryBuilder(userRole)
      .delete()
      .from(table)
      .where(where)
    
    const { sql, params } = qb.build()
    const result = await this.query(sql, params, userRole, { table, operation: 'DELETE' })
    
    // Simulate RETURNING for MySQL
    if (options.returning && beforeDelete.length > 0) {
      result.rows = beforeDelete
    }
    
    return result
  }
}

module.exports = MySQLAdapter