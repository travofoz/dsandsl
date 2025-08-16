/**
 * @fileoverview Role-Aware Query Builder
 * SQL query builder with automatic field filtering based on user roles
 */

const { DatabaseError } = require('../core/DSLErrors')
const FieldMapper = require('../utils/FieldMapper')
const debug = require('debug')('dsandsl:querybuilder')

/**
 * Role-aware SQL query builder
 */
class QueryBuilder {
  constructor(dsl, userRole, options = {}) {
    this.dsl = dsl
    this.userRole = userRole
    this.options = {
      dialect: options.dialect || 'postgresql', // postgresql, mysql, sqlite
      validateFields: options.validateFields !== false,
      autoFilter: options.autoFilter !== false,
      ...options
    }
    
    // Create field mapper for SQL injection protection
    this.fieldMapper = options.fieldMapper || FieldMapper.createDefault({
      strictMode: false, // Allow auto-conversion for flexibility
      autoConvert: true  // Enable camelCase ↔ snake_case conversion
    })
    
    this.reset()
  }
  
  /**
   * Reset query builder state
   */
  reset() {
    this.query = {
      type: null,
      table: null,
      fields: [],
      values: {},
      conditions: [],
      joins: [],
      orderBy: [],
      groupBy: [],
      having: [],
      limit: null,
      offset: null,
      returning: []
    }
    this.params = []
    this.paramIndex = 0
    return this
  }
  
  /**
   * Start a SELECT query
   * @param {Array|string} fields - Fields to select (auto-filtered by role)
   * @returns {QueryBuilder} Builder instance
   */
  select(fields = ['*']) {
    this.query.type = 'SELECT'
    
    if (typeof fields === 'string') {
      fields = fields === '*' ? ['*'] : [fields]
    }
    
    // Validate and map field names for security
    if (fields[0] !== '*') {
      fields = this.validateAndMapFields(fields)
    }
    
    // Auto-filter fields based on user role
    if (this.options.autoFilter && fields[0] !== '*') {
      fields = this.filterFieldsByRole(fields)
    }
    
    this.query.fields = fields
    return this
  }
  
  /**
   * Set the table for the query
   * @param {string} table - Table name
   * @returns {QueryBuilder} Builder instance
   */
  from(table) {
    this.query.table = table
    
    // Auto-populate allowed fields if SELECT * is used
    if (this.query.type === 'SELECT' && this.query.fields[0] === '*') {
      const allowedFields = this.getAllowedFieldsForTable(table)
      this.query.fields = allowedFields.length > 0 ? allowedFields : ['*']
    }
    
    return this
  }
  
  /**
   * Start an INSERT query
   * @param {string} table - Table name
   * @returns {QueryBuilder} Builder instance
   */
  insert(table) {
    this.query.type = 'INSERT'
    this.query.table = table
    return this
  }
  
  /**
   * Set values for INSERT query
   * @param {Object} values - Values to insert (auto-filtered by role)
   * @returns {QueryBuilder} Builder instance
   */
  values(values) {
    // Validate and map field names
    values = this.validateAndMapData(values)
    
    if (this.options.autoFilter) {
      values = this.filterDataByRole(values)
    }
    
    this.query.values = values
    return this
  }
  
  /**
   * Start an UPDATE query
   * @param {string} table - Table name
   * @returns {QueryBuilder} Builder instance
   */
  update(table) {
    this.query.type = 'UPDATE'
    this.query.table = table
    return this
  }
  
  /**
   * Set values for UPDATE query
   * @param {Object} values - Values to update (auto-filtered by role)
   * @returns {QueryBuilder} Builder instance
   */
  set(values) {
    // Validate and map field names
    values = this.validateAndMapData(values)
    
    if (this.options.autoFilter) {
      values = this.filterDataByRole(values)
    }
    
    this.query.values = values
    return this
  }
  
  /**
   * Start a DELETE query
   * @returns {QueryBuilder} Builder instance
   */
  delete() {
    this.query.type = 'DELETE'
    return this
  }
  
  /**
   * Add WHERE conditions
   * @param {Object|string} conditions - WHERE conditions
   * @param {Array} params - Parameters for string conditions
   * @returns {QueryBuilder} Builder instance
   */
  where(conditions, params = []) {
    if (typeof conditions === 'object' && conditions !== null) {
      // Validate and map field names in conditions
      const safeConditions = this.validateAndMapConditions(conditions)
      
      // Object-style conditions
      Object.entries(safeConditions).forEach(([field, value]) => {
        this.addCondition(field, '=', value)
      })
    } else if (typeof conditions === 'string') {
      // Raw SQL conditions - NOTE: This should be avoided in production
      console.warn('Using raw SQL in WHERE clause - consider using object conditions for better security')
      this.query.conditions.push({ raw: conditions, params })
      this.params.push(...params)
    }
    
    return this
  }
  
  /**
   * Add WHERE condition with operator
   * @param {string} field - Field name
   * @param {string} operator - SQL operator
   * @param {any} value - Value to compare
   * @returns {QueryBuilder} Builder instance
   */
  whereCondition(field, operator, value) {
    this.addCondition(field, operator, value)
    return this
  }
  
  /**
   * Add OR WHERE condition
   * @param {Object|string} conditions - OR conditions
   * @returns {QueryBuilder} Builder instance
   */
  orWhere(conditions) {
    // Implementation for OR conditions
    if (typeof conditions === 'object') {
      const orConditions = Object.entries(conditions).map(([field, value]) => {
        return this.buildCondition(field, '=', value)
      })
      this.query.conditions.push({ or: orConditions })
    }
    return this
  }
  
  /**
   * Add JOIN clause
   * @param {string} table - Table to join
   * @param {string} condition - Join condition
   * @param {string} type - Join type (INNER, LEFT, RIGHT)
   * @returns {QueryBuilder} Builder instance
   */
  join(table, condition, type = 'INNER') {
    this.query.joins.push({ table, condition, type })
    return this
  }
  
  /**
   * Add LEFT JOIN clause
   * @param {string} table - Table to join
   * @param {string} condition - Join condition
   * @returns {QueryBuilder} Builder instance
   */
  leftJoin(table, condition) {
    return this.join(table, condition, 'LEFT')
  }
  
  /**
   * Add ORDER BY clause
   * @param {string|Object} field - Field name or object with field/direction
   * @param {string} direction - Sort direction (ASC, DESC)
   * @returns {QueryBuilder} Builder instance
   */
  orderBy(field, direction = 'ASC') {
    if (typeof field === 'object') {
      Object.entries(field).forEach(([f, dir]) => {
        this.query.orderBy.push({ field: f, direction: dir.toUpperCase() })
      })
    } else {
      this.query.orderBy.push({ field, direction: direction.toUpperCase() })
    }
    return this
  }
  
  /**
   * Add GROUP BY clause
   * @param {string|Array} fields - Fields to group by
   * @returns {QueryBuilder} Builder instance
   */
  groupBy(fields) {
    if (typeof fields === 'string') {
      fields = [fields]
    }
    this.query.groupBy.push(...fields)
    return this
  }
  
  /**
   * Add HAVING clause
   * @param {string} condition - Having condition
   * @returns {QueryBuilder} Builder instance
   */
  having(condition) {
    this.query.having.push(condition)
    return this
  }
  
  /**
   * Add LIMIT clause
   * @param {number} count - Limit count
   * @returns {QueryBuilder} Builder instance
   */
  limit(count) {
    this.query.limit = parseInt(count)
    return this
  }
  
  /**
   * Add OFFSET clause
   * @param {number} count - Offset count
   * @returns {QueryBuilder} Builder instance
   */
  offset(count) {
    this.query.offset = parseInt(count)
    return this
  }
  
  /**
   * Add RETURNING clause (PostgreSQL/SQLite)
   * @param {Array|string} fields - Fields to return
   * @returns {QueryBuilder} Builder instance
   */
  returning(fields) {
    if (typeof fields === 'string') {
      fields = [fields]
    }
    
    if (this.options.autoFilter) {
      fields = this.filterFieldsByRole(fields)
    }
    
    this.query.returning = fields
    return this
  }
  
  /**
   * Build the final SQL query and parameters
   * @returns {Object} Object with sql and params
   */
  build() {
    try {
      const { sql, params } = this.buildQuery()
      
      debug('Query built:', {
        sql: sql.substring(0, 200),
        paramCount: params.length,
        userRole: this.userRole,
        table: this.query.table
      })
      
      return { sql, params }
      
    } catch (error) {
      throw new DatabaseError(
        `Query build failed: ${error.message}`,
        'query_build_failed',
        error
      )
    }
  }
  
  /**
   * Build the SQL query based on query type
   * @returns {Object} Object with sql and params
   */
  buildQuery() {
    switch (this.query.type) {
      case 'SELECT':
        return this.buildSelect()
      case 'INSERT':
        return this.buildInsert()
      case 'UPDATE':
        return this.buildUpdate()
      case 'DELETE':
        return this.buildDelete()
      default:
        throw new Error(`Unsupported query type: ${this.query.type}`)
    }
  }
  
  /**
   * Build SELECT query
   */
  buildSelect() {
    let sql = 'SELECT '
    
    // Fields
    if (this.query.fields.length === 0) {
      throw new Error('No fields specified for SELECT query')
    }
    
    sql += this.query.fields.join(', ')
    
    // FROM
    sql += ` FROM ${this.escapeIdentifier(this.query.table)}`
    
    // JOINs
    if (this.query.joins.length > 0) {
      sql += this.query.joins.map(join => 
        ` ${join.type} JOIN ${this.escapeIdentifier(join.table)} ON ${join.condition}`
      ).join('')
    }
    
    // WHERE
    if (this.query.conditions.length > 0) {
      sql += ' WHERE ' + this.buildWhereClause()
    }
    
    // GROUP BY
    if (this.query.groupBy.length > 0) {
      sql += ` GROUP BY ${this.query.groupBy.map(f => this.escapeIdentifier(f)).join(', ')}`
    }
    
    // HAVING
    if (this.query.having.length > 0) {
      sql += ` HAVING ${this.query.having.join(' AND ')}`
    }
    
    // ORDER BY
    if (this.query.orderBy.length > 0) {
      sql += ' ORDER BY ' + this.query.orderBy.map(order => 
        `${this.escapeIdentifier(order.field)} ${order.direction}`
      ).join(', ')
    }
    
    // LIMIT and OFFSET
    if (this.query.limit !== null) {
      sql += ` LIMIT ${this.query.limit}`
    }
    
    if (this.query.offset !== null) {
      sql += ` OFFSET ${this.query.offset}`
    }
    
    return { sql, params: this.params }
  }
  
  /**
   * Build INSERT query
   */
  buildInsert() {
    if (Object.keys(this.query.values).length === 0) {
      throw new Error('No values specified for INSERT query')
    }
    
    const fields = Object.keys(this.query.values)
    const placeholders = fields.map(() => this.getParameterPlaceholder())
    
    // Add values to params
    fields.forEach(field => {
      this.params.push(this.query.values[field])
    })
    
    let sql = `INSERT INTO ${this.escapeIdentifier(this.query.table)} `
    sql += `(${fields.map(f => this.escapeIdentifier(f)).join(', ')}) `
    sql += `VALUES (${placeholders.join(', ')})`
    
    // RETURNING clause
    if (this.query.returning.length > 0) {
      if (this.options.dialect === 'mysql') {
        // MySQL doesn't support RETURNING, we'll handle this in the adapter
      } else {
        sql += ` RETURNING ${this.query.returning.join(', ')}`
      }
    }
    
    return { sql, params: this.params }
  }
  
  /**
   * Build UPDATE query
   */
  buildUpdate() {
    if (Object.keys(this.query.values).length === 0) {
      throw new Error('No values specified for UPDATE query')
    }
    
    let sql = `UPDATE ${this.escapeIdentifier(this.query.table)} SET `
    
    // SET clause
    const setClauses = Object.keys(this.query.values).map(field => {
      this.params.push(this.query.values[field])
      return `${this.escapeIdentifier(field)} = ${this.getParameterPlaceholder()}`
    })
    
    sql += setClauses.join(', ')
    
    // WHERE clause
    if (this.query.conditions.length > 0) {
      sql += ' WHERE ' + this.buildWhereClause()
    }
    
    // RETURNING clause
    if (this.query.returning.length > 0 && this.options.dialect !== 'mysql') {
      sql += ` RETURNING ${this.query.returning.join(', ')}`
    }
    
    return { sql, params: this.params }
  }
  
  /**
   * Build DELETE query
   */
  buildDelete() {
    let sql = `DELETE FROM ${this.escapeIdentifier(this.query.table)}`
    
    // WHERE clause
    if (this.query.conditions.length > 0) {
      sql += ' WHERE ' + this.buildWhereClause()
    }
    
    // RETURNING clause
    if (this.query.returning.length > 0 && this.options.dialect !== 'mysql') {
      sql += ` RETURNING ${this.query.returning.join(', ')}`
    }
    
    return { sql, params: this.params }
  }
  
  /**
   * Build WHERE clause from conditions
   */
  buildWhereClause() {
    return this.query.conditions.map(condition => {
      if (condition.raw) {
        return condition.raw
      }
      if (condition.or) {
        return `(${condition.or.join(' OR ')})`
      }
      return condition.clause
    }).join(' AND ')
  }
  
  /**
   * Add a condition to the query
   */
  addCondition(field, operator, value) {
    const clause = this.buildCondition(field, operator, value)
    this.query.conditions.push({ clause })
  }
  
  /**
   * Build a single condition
   */
  buildCondition(field, operator, value) {
    this.params.push(value)
    return `${this.escapeIdentifier(field)} ${operator} ${this.getParameterPlaceholder()}`
  }
  
  /**
   * Get parameter placeholder based on dialect
   */
  getParameterPlaceholder() {
    switch (this.options.dialect) {
      case 'postgresql':
        return `$${++this.paramIndex}`
      case 'mysql':
      case 'sqlite':
        return '?'
      default:
        return '?'
    }
  }
  
  /**
   * Escape identifier (table/column names)
   */
  escapeIdentifier(identifier) {
    switch (this.options.dialect) {
      case 'postgresql':
        return `"${identifier}"`
      case 'mysql':
        return `\`${identifier}\``
      case 'sqlite':
        return `"${identifier}"`
      default:
        return `"${identifier}"`
    }
  }
  
  /**
   * Filter fields based on user role
   */
  filterFieldsByRole(fields) {
    if (!this.query.table) {
      return fields
    }
    
    return fields.filter(field => {
      const fieldPattern = `${this.query.table}.${field}`
      return this.dsl.hasFieldAccess(fieldPattern, this.userRole) ||
             this.dsl.hasFieldAccess(field, this.userRole)
    })
  }
  
  /**
   * Filter data object based on user role
   */
  filterDataByRole(data) {
    if (!this.query.table) {
      return data
    }
    
    const filtered = {}
    Object.entries(data).forEach(([field, value]) => {
      const fieldPattern = `${this.query.table}.${field}`
      if (this.dsl.hasFieldAccess(fieldPattern, this.userRole) ||
          this.dsl.hasFieldAccess(field, this.userRole)) {
        filtered[field] = value
      }
    })
    
    return filtered
  }
  
  /**
   * Get all allowed fields for a table based on user role
   */
  getAllowedFieldsForTable(table) {
    const allowedFields = []
    const fieldConfig = this.dsl.config.fields || {}
    
    Object.entries(fieldConfig).forEach(([fieldPattern, config]) => {
      if (fieldPattern.startsWith(`${table}.`) || !fieldPattern.includes('.')) {
        const fieldName = fieldPattern.includes('.') 
          ? fieldPattern.split('.')[1] 
          : fieldPattern
        
        if (this.dsl.hasFieldAccess(fieldPattern, this.userRole)) {
          allowedFields.push(fieldName)
        }
      }
    })
    
    // Include common fields if no specific config
    if (allowedFields.length === 0) {
      allowedFields.push('id', 'created_at', 'updated_at')
    }
    
    return allowedFields
  }
  
  /**
   * Validate and map field names for SQL injection protection
   * @param {Array<string>} fields - Field names to validate and map
   * @returns {Array<string>} Safe database field names
   * @throws {DatabaseError} If field names are invalid
   */
  validateAndMapFields(fields) {
    const safeFields = []
    
    for (const field of fields) {
      try {
        // Validate field name format
        if (!this.fieldMapper.isValidFieldName(field)) {
          throw new Error(`Invalid field name: ${field}`)
        }
        
        // Map to safe database column name
        const databaseField = this.fieldMapper.toDatabase(field)
        safeFields.push(databaseField)
        
      } catch (error) {
        throw new DatabaseError(
          `Field validation failed: ${error.message}`,
          'invalid_field_name',
          { field, userRole: this.userRole }
        )
      }
    }
    
    return safeFields
  }
  
  /**
   * Validate and map WHERE condition fields
   * @param {Object} conditions - WHERE conditions with semantic field names
   * @returns {Object} Conditions with safe database field names
   */
  validateAndMapConditions(conditions) {
    if (typeof conditions !== 'object' || conditions === null) {
      return conditions
    }
    
    const safeConditions = {}
    
    for (const [field, value] of Object.entries(conditions)) {
      try {
        // Validate and map field name
        if (!this.fieldMapper.isValidFieldName(field)) {
          throw new Error(`Invalid field name in WHERE clause: ${field}`)
        }
        
        const databaseField = this.fieldMapper.toDatabase(field)
        safeConditions[databaseField] = value
        
      } catch (error) {
        throw new DatabaseError(
          `WHERE clause validation failed: ${error.message}`,
          'invalid_where_field',
          { field, userRole: this.userRole }
        )
      }
    }
    
    return safeConditions
  }
  
  /**
   * Validate and map data object fields
   * @param {Object} data - Data object with semantic field names
   * @returns {Object} Data object with safe database field names
   */
  validateAndMapData(data) {
    try {
      return this.fieldMapper.mapToDatabase(data)
    } catch (error) {
      throw new DatabaseError(
        `Data field validation failed: ${error.message}`,
        'invalid_data_field',
        { userRole: this.userRole }
      )
    }
  }
  
  /**
   * Create a new query builder with the same settings
   */
  clone() {
    return new QueryBuilder(this.dsl, this.userRole, this.options)
  }
}

module.exports = QueryBuilder