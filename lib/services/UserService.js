/**
 * @fileoverview User Service
 * Example domain service using DSANDSL service provider pattern
 */

const BaseService = require('./BaseService')

class UserService extends BaseService {
  
  /**
   * Get users with automatic role-based filtering and pagination
   * @param {string} userRole - User role
   * @param {Object} options - Query options
   * @returns {Promise<Object>} Users with pagination info
   */
  static async getUsers(userRole, options = {}) {
    try {
      const { 
        page = 1, 
        limit = 20, 
        search, 
        department, 
        active,
        sortBy = 'created_at',
        sortDir = 'DESC'
      } = options
      
      // Build WHERE conditions
      const where = {}
      if (search) {
        where.name = { like: `%${search}%` }
      }
      if (department) {
        where.department_id = department
      }
      if (active !== undefined) {
        where.active = active
      }
      
      // Execute query with role-based filtering
      const users = await this.select('users', userRole, {
        where,
        orderBy: sortBy,
        orderDirection: sortDir,
        limit: parseInt(limit),
        offset: (parseInt(page) - 1) * parseInt(limit)
      })
      
      // Get total count for pagination
      const totalQuery = this.createQueryBuilder(userRole)
        .select(['COUNT(*) as total'])
        .from('users')
        .where(where)
      
      const { sql, params } = totalQuery.build()
      const totalResult = await this.getAdapter().executeQuery(sql, params)
      const total = totalResult.rows[0]?.total || 0
      
      return {
        users,
        pagination: this.buildPagination(page, limit, total)
      }
      
    } catch (error) {
      throw this.handleError(error, 'Get users', 'user_fetch_failed')
    }
  }
  
  /**
   * Get single user by ID with role-based field filtering
   * @param {number} userId - User ID
   * @param {string} userRole - User role
   * @param {Object} context - Request context
   * @returns {Promise<Object|null>} User object or null
   */
  static async getUserById(userId, userRole, context = {}) {
    try {
      const users = await this.select('users', userRole, {
        where: { id: userId },
        limit: 1,
        context: {
          requestingUserId: context.requestingUserId,
          ...context
        }
      })
      
      return users[0] || null
      
    } catch (error) {
      if (error.code === 'table_access_denied') {
        return null // User doesn't have permission to view users
      }
      throw this.handleError(error, 'Get user by ID', 'user_fetch_failed')
    }
  }
  
  /**
   * Create user with automatic field filtering
   * @param {Object} userData - User data
   * @param {string} userRole - User role
   * @param {Object} context - Request context
   * @returns {Promise<Object>} Created user
   */
  static async createUser(userData, userRole, context = {}) {
    try {
      // Validate required fields
      this.validateRequiredFields(userData, ['name', 'email'])
      
      // Additional validation
      if (userData.email && !this.isValidEmail(userData.email)) {
        throw new Error('Invalid email format')
      }
      
      // Execute in transaction
      const result = await this.transaction(async (tx) => {
        // Insert user with role-based field filtering
        const user = await tx.insert('users', {
          ...userData,
          created_at: new Date(),
          created_by: context.requestingUserId
        }, userRole, {
          returning: ['id', 'name', 'email', 'created_at']
        })
        
        // Create default user preferences
        if (user.rows?.[0]?.id) {
          await tx.insert('user_preferences', {
            user_id: user.rows[0].id,
            theme: 'light',
            notifications_enabled: true
          }, userRole)
        }
        
        return user.rows?.[0] || user
      })
      
      return result
      
    } catch (error) {
      throw this.handleError(error, 'Create user', 'user_create_failed')
    }
  }
  
  /**
   * Update user with role-based validation
   * @param {number} userId - User ID
   * @param {Object} updates - Update data
   * @param {string} userRole - User role
   * @param {Object} context - Request context
   * @returns {Promise<Object>} Updated user
   */
  static async updateUser(userId, updates, userRole, context = {}) {
    try {
      // Verify user exists and can be accessed
      const existingUser = await this.getUserById(userId, userRole, context)
      if (!existingUser) {
        throw new Error('User not found or access denied')
      }
      
      // Validate email if provided
      if (updates.email && !this.isValidEmail(updates.email)) {
        throw new Error('Invalid email format')
      }
      
      // Update with role-based field filtering
      const result = await this.update('users', {
        ...updates,
        updated_at: new Date(),
        updated_by: context.requestingUserId
      }, {
        id: userId
      }, userRole, {
        returning: ['id', 'name', 'email', 'updated_at']
      })
      
      return result.rows?.[0] || result
      
    } catch (error) {
      throw this.handleError(error, 'Update user', 'user_update_failed')
    }
  }
  
  /**
   * Delete user with role-based authorization
   * @param {number} userId - User ID
   * @param {string} userRole - User role
   * @param {Object} context - Request context
   * @returns {Promise<Object>} Delete result
   */
  static async deleteUser(userId, userRole, context = {}) {
    try {
      // Verify user exists and can be accessed
      const existingUser = await this.getUserById(userId, userRole, context)
      if (!existingUser) {
        throw new Error('User not found or access denied')
      }
      
      // Soft delete in transaction
      const result = await this.transaction(async (tx) => {
        // Mark as deleted
        const deleteResult = await tx.update('users', {
          active: false,
          deleted_at: new Date(),
          deleted_by: context.requestingUserId
        }, {
          id: userId
        }, userRole, {
          returning: ['id', 'name', 'deleted_at']
        })
        
        // Archive user data if needed
        await tx.insert('user_audit', {
          user_id: userId,
          action: 'delete',
          performed_by: context.requestingUserId,
          performed_at: new Date()
        }, userRole)
        
        return deleteResult.rows?.[0] || deleteResult
      })
      
      return result
      
    } catch (error) {
      throw this.handleError(error, 'Delete user', 'user_delete_failed')
    }
  }
  
  /**
   * Get user analytics with automatic aggregation filtering
   * @param {string} userRole - User role
   * @param {Object} filters - Analytics filters
   * @returns {Promise<Array>} Analytics data
   */
  static async getUserAnalytics(userRole, filters = {}) {
    try {
      const qb = this.createQueryBuilder(userRole)
      
      // Build analytics query with role-based field access
      const fields = ['department_id', 'COUNT(*) as user_count']
      
      // Add salary fields only if user has access
      if (this.getProvider().hasFieldAccess('users.salary', userRole)) {
        fields.push('AVG(salary) as avg_salary', 'MAX(salary) as max_salary')
      }
      
      fields.push('MAX(created_at) as last_hire_date')
      
      const { sql, params } = qb
        .select(fields)
        .from('users')
        .where({ active: true, ...filters })
        .groupBy(['department_id'])
        .orderBy('user_count', 'DESC')
        .build()
      
      const result = await this.getAdapter().executeQuery(sql, params)
      
      // Filter the aggregated results through DSL
      return this.filterData(result.rows, userRole, {
        context: { aggregated: true }
      })
      
    } catch (error) {
      throw this.handleError(error, 'Get user analytics', 'analytics_failed')
    }
  }
  
  /**
   * Search users with full-text capabilities
   * @param {string} query - Search query
   * @param {string} userRole - User role
   * @param {Object} options - Search options
   * @returns {Promise<Array>} Search results
   */
  static async searchUsers(query, userRole, options = {}) {
    try {
      const { limit = 20, includeInactive = false } = options
      
      const qb = this.createQueryBuilder(userRole)
      
      // Build search conditions
      const searchConditions = {
        or: [
          { name: { like: `%${query}%` } },
          { email: { like: `%${query}%` } }
        ]
      }
      
      if (!includeInactive) {
        searchConditions.active = true
      }
      
      const { sql, params } = qb
        .select(['id', 'name', 'email', 'department_id', 'created_at'])
        .from('users')
        .where(searchConditions)
        .orderBy('name', 'ASC')
        .limit(limit)
        .build()
      
      const result = await this.getAdapter().executeQuery(sql, params)
      return result.rows
      
    } catch (error) {
      throw this.handleError(error, 'Search users', 'user_search_failed')
    }
  }
  
  /**
   * Validate email format
   * @param {string} email - Email to validate
   * @returns {boolean} True if valid
   * @private
   */
  static isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    return emailRegex.test(email)
  }
}

module.exports = UserService