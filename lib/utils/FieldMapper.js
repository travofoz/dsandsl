/**
 * @fileoverview Secure Field Mapper Utility
 * Bidirectional semantic ↔ database field mapping with SQL injection protection
 * Based on tracked_v2 implementation with security enhancements
 */

/**
 * Secure field mapping utility
 * Prevents SQL injection by mapping semantic field names to database columns
 */
class FieldMapper {
  
  /**
   * Create a field mapper with predefined field mappings
   * @param {Object} fieldMappings - Map of semantic names to database columns
   * @param {Object} options - Configuration options
   */
  constructor(fieldMappings = {}, options = {}) {
    this.fieldMappings = fieldMappings
    this.options = {
      autoConvert: options.autoConvert !== false, // Enable automatic camelCase ↔ snake_case
      strictMode: options.strictMode === true,    // Only allow explicitly mapped fields
      allowedPattern: options.allowedPattern || /^[a-zA-Z_][a-zA-Z0-9_]*$/, // Valid field name pattern (can start with letter or underscore)
      ...options
    }
    
    // Build reverse mapping for database → semantic conversion
    this.reverseMappings = {}
    Object.entries(this.fieldMappings).forEach(([semantic, database]) => {
      this.reverseMappings[database] = semantic
    })
  }
  
  /**
   * Convert semantic field name to safe database column name
   * @param {string} semanticName - Semantic field name (e.g., 'firstName', 'user-id')
   * @returns {string} Safe database column name
   * @throws {Error} If field name is invalid or not allowed
   */
  toDatabase(semanticName) {
    // Validate field name format
    if (!this.isValidFieldName(semanticName)) {
      throw new Error(`Invalid field name: ${semanticName}`)
    }
    
    // Check explicit mapping first
    if (this.fieldMappings[semanticName]) {
      return this.fieldMappings[semanticName]
    }
    
    // In strict mode, only allow explicitly mapped fields
    if (this.options.strictMode) {
      throw new Error(`Field not allowed: ${semanticName}`)
    }
    
    // Auto-convert using naming convention
    if (this.options.autoConvert) {
      return this.toSnakeCase(semanticName)
    }
    
    // Pass through if no conversion
    return semanticName
  }
  
  /**
   * Convert database column name to semantic field name
   * @param {string} databaseName - Database column name
   * @returns {string} Semantic field name
   */
  toSemantic(databaseName) {
    // Check reverse mapping first
    if (this.reverseMappings[databaseName]) {
      return this.reverseMappings[databaseName]
    }
    
    // Auto-convert using naming convention
    if (this.options.autoConvert) {
      return this.toCamelCase(databaseName)
    }
    
    // Pass through if no conversion
    return databaseName
  }
  
  /**
   * Validate that a field name is safe and follows allowed patterns
   * @param {string} fieldName - Field name to validate
   * @returns {boolean} True if field name is valid
   */
  isValidFieldName(fieldName) {
    if (typeof fieldName !== 'string' || fieldName.length === 0) {
      return false
    }
    
    // Check against allowed pattern (prevents SQL injection)
    if (!this.options.allowedPattern.test(fieldName)) {
      return false
    }
    
    // Additional SQL injection checks - look for whole-word SQL keywords
    const dangerousKeywords = [
      'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DROP', 'CREATE', 'ALTER',
      'UNION', 'WHERE', 'FROM', 'JOIN', 'EXEC', 'EXECUTE', 'TRUNCATE'
    ]
    
    const upperField = fieldName.toUpperCase()
    // Check for whole words, not substrings (to allow "password" etc.)
    const wordBoundaryPattern = new RegExp(`\\b(${dangerousKeywords.join('|')})\\b`)
    if (wordBoundaryPattern.test(upperField)) {
      return false
    }
    
    // Check for SQL injection patterns
    const injectionPatterns = [
      /['";]/,           // Quotes and semicolons
      /--/,              // SQL comments
      /\/\*/,            // Block comments  
      /\*\//,            // Block comment end
      /\s+(OR|AND)\s+/i, // SQL operators with spaces
      /\(\s*SELECT/i,    // Subqueries
      /UNION\s+SELECT/i  // Union injections
    ]
    
    if (injectionPatterns.some(pattern => pattern.test(fieldName))) {
      return false
    }
    
    return true
  }
  
  /**
   * Map object keys from semantic to database format
   * @param {Object} obj - Object with semantic field names
   * @returns {Object} Object with database column names
   */
  mapToDatabase(obj) {
    if (Array.isArray(obj)) {
      return obj.map(item => this.mapToDatabase(item))
    }
    
    if (obj === null || typeof obj !== 'object') {
      return obj
    }
    
    // Handle Date objects
    if (obj instanceof Date) {
      return obj
    }
    
    const result = {}
    for (const [semanticKey, value] of Object.entries(obj)) {
      try {
        const databaseKey = this.toDatabase(semanticKey)
        result[databaseKey] = typeof value === 'object' ? this.mapToDatabase(value) : value
      } catch (error) {
        // Skip invalid field names in non-strict mode
        if (this.options.strictMode) {
          throw error
        }
        // In non-strict mode, log warning but continue
        console.warn(`Skipping invalid field: ${semanticKey} - ${error.message}`)
      }
    }
    
    return result
  }
  
  /**
   * Map object keys from database to semantic format
   * @param {Object} obj - Object with database column names
   * @returns {Object} Object with semantic field names
   */
  mapToSemantic(obj) {
    if (Array.isArray(obj)) {
      return obj.map(item => this.mapToSemantic(item))
    }
    
    if (obj === null || typeof obj !== 'object') {
      return obj
    }
    
    // Handle Date objects
    if (obj instanceof Date) {
      return obj
    }
    
    const result = {}
    for (const [databaseKey, value] of Object.entries(obj)) {
      const semanticKey = this.toSemantic(databaseKey)
      
      if (value instanceof Date) {
        result[semanticKey] = value
      } else if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
        result[semanticKey] = this.mapToSemantic(value)
      } else {
        result[semanticKey] = value
      }
    }
    
    return result
  }
  
  /**
   * Get list of valid semantic field names
   * @returns {Array<string>} Array of valid field names
   */
  getValidFields() {
    const explicitFields = Object.keys(this.fieldMappings)
    
    if (this.options.strictMode) {
      return explicitFields
    }
    
    // In non-strict mode, any field matching the pattern is potentially valid
    return explicitFields // Return explicit fields, caller can validate others dynamically
  }
  
  /**
   * Convert camelCase to snake_case
   * @param {string} str - camelCase string
   * @returns {string} snake_case string
   */
  toSnakeCase(str) {
    return str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`)
  }
  
  /**
   * Convert snake_case to camelCase
   * @param {string} str - snake_case string  
   * @returns {string} camelCase string
   */
  toCamelCase(str) {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
  }
  
  /**
   * Create a default field mapper for common database patterns
   * @param {Object} options - Configuration options
   * @returns {FieldMapper} Configured field mapper
   */
  static createDefault(options = {}) {
    // Common field mappings
    const defaultMappings = {
      // Identifiers
      'id': 'id',
      'userId': 'user_id',
      'partnerId': 'partner_id',
      'orderId': 'order_id',
      
      // Timestamps
      'createdAt': 'created_at',
      'updatedAt': 'updated_at',
      'deletedAt': 'deleted_at',
      
      // Common fields
      'firstName': 'first_name',
      'lastName': 'last_name',
      'emailAddress': 'email_address',
      'phoneNumber': 'phone_number',
      
      ...options.fieldMappings
    }
    
    return new FieldMapper(defaultMappings, {
      autoConvert: true,
      strictMode: false,
      ...options
    })
  }
}

module.exports = FieldMapper