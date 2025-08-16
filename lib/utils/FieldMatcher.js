/**
 * @fileoverview Field Pattern Matching Utilities
 * Pattern matching for field access rules
 */

/**
 * Test if a field name matches a pattern
 * @param {string} fieldName - Field name to test
 * @param {string} pattern - Pattern to match against
 * @returns {boolean} True if field matches pattern
 */
function matchField(fieldName, pattern) {
  // Exact match
  if (fieldName === pattern) {
    return true
  }
  
  // Regular expression pattern (starts with /)
  if (pattern.startsWith('/') && pattern.endsWith('/')) {
    const regexPattern = pattern.slice(1, -1)
    const regex = new RegExp(regexPattern)
    return regex.test(fieldName)
  }
  
  // Wildcard patterns
  if (pattern.includes('*')) {
    return matchWildcardPattern(fieldName, pattern)
  }
  
  // Array element patterns
  if (pattern.includes('[') && pattern.includes(']')) {
    return matchArrayPattern(fieldName, pattern)
  }
  
  return false
}

/**
 * Match wildcard patterns (* and **)
 * @param {string} fieldName - Field name to test
 * @param {string} pattern - Wildcard pattern
 * @returns {boolean} True if field matches pattern
 */
function matchWildcardPattern(fieldName, pattern) {
  // Convert wildcard pattern to regex
  // * matches any characters except dots (single level)
  // ** matches any characters including dots (multiple levels)
  
  let regexPattern = pattern
    .replace(/\*\*/g, '§DOUBLESTAR§') // Temporary placeholder
    .replace(/\*/g, '[^.]*') // Single * matches anything except dots
    .replace(/§DOUBLESTAR§/g, '.*') // Double ** matches anything including dots
    .replace(/\./g, '\\.') // Escape dots
  
  // Anchor the pattern
  regexPattern = `^${regexPattern}$`
  
  const regex = new RegExp(regexPattern)
  return regex.test(fieldName)
}

/**
 * Match array element patterns (field[].subfield)
 * @param {string} fieldName - Field name to test
 * @param {string} pattern - Array pattern
 * @returns {boolean} True if field matches pattern
 */
function matchArrayPattern(fieldName, pattern) {
  // Convert array patterns to regex
  // field[].subfield matches field.0.subfield, field.1.subfield, etc.
  // field[*].subfield matches field.any.subfield
  
  let regexPattern = pattern
    .replace(/\[\]/g, '\\.[0-9]+') // [] matches array indices
    .replace(/\[\*\]/g, '\\.[^.]+') // [*] matches any array key
    .replace(/\./g, '\\.') // Escape remaining dots
  
  // Anchor the pattern
  regexPattern = `^${regexPattern}$`
  
  const regex = new RegExp(regexPattern)
  return regex.test(fieldName)
}

/**
 * Extract all field names from data that match a pattern
 * @param {Object|Array} data - Data to extract fields from
 * @param {string} pattern - Pattern to match
 * @returns {Array<string>} Array of matching field names
 */
function extractFields(data, pattern) {
  const fields = []
  
  if (!data || typeof data !== 'object') {
    return fields
  }
  
  // Get all field paths from the data
  const allFields = getAllFieldPaths(data)
  
  // Filter by pattern
  return allFields.filter(field => matchField(field, pattern))
}

/**
 * Get all possible field paths from nested data
 * @param {Object|Array} data - Data to analyze
 * @param {string} prefix - Current path prefix
 * @returns {Array<string>} Array of all field paths
 */
function getAllFieldPaths(data, prefix = '') {
  const paths = []
  
  if (!data || typeof data !== 'object') {
    return paths
  }
  
  if (Array.isArray(data)) {
    // For arrays, add paths for each element
    data.forEach((item, index) => {
      const itemPrefix = prefix ? `${prefix}.${index}` : index.toString()
      paths.push(...getAllFieldPaths(item, itemPrefix))
    })
  } else {
    // For objects, add paths for each property
    Object.keys(data).forEach(key => {
      const fieldPath = prefix ? `${prefix}.${key}` : key
      paths.push(fieldPath)
      
      // Recursively get nested paths
      if (data[key] && typeof data[key] === 'object') {
        paths.push(...getAllFieldPaths(data[key], fieldPath))
      }
    })
  }
  
  return paths
}

/**
 * Normalize field patterns for consistent matching
 * @param {string} pattern - Pattern to normalize
 * @returns {string} Normalized pattern
 */
function normalizePattern(pattern) {
  return pattern
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '') // Remove whitespace
}

/**
 * Test multiple patterns against a field name
 * @param {string} fieldName - Field name to test
 * @param {Array<string>} patterns - Patterns to test
 * @returns {Object} Result with match status and matching pattern
 */
function matchMultiplePatterns(fieldName, patterns) {
  for (const pattern of patterns) {
    if (matchField(fieldName, pattern)) {
      return {
        matched: true,
        pattern,
        fieldName
      }
    }
  }
  
  return {
    matched: false,
    pattern: null,
    fieldName
  }
}

/**
 * Create optimized matcher function for repeated pattern matching
 * @param {string} pattern - Pattern to create matcher for
 * @returns {Function} Optimized matcher function
 */
function createMatcher(pattern) {
  // Pre-compile regex patterns for better performance
  let matcher
  
  if (pattern.startsWith('/') && pattern.endsWith('/')) {
    // Regex pattern
    const regexPattern = pattern.slice(1, -1)
    const regex = new RegExp(regexPattern)
    matcher = (fieldName) => regex.test(fieldName)
  } else if (pattern.includes('*')) {
    // Wildcard pattern
    const regex = createWildcardRegex(pattern)
    matcher = (fieldName) => regex.test(fieldName)
  } else if (pattern.includes('[') && pattern.includes(']')) {
    // Array pattern
    const regex = createArrayRegex(pattern)
    matcher = (fieldName) => regex.test(fieldName)
  } else {
    // Exact match
    matcher = (fieldName) => fieldName === pattern
  }
  
  return matcher
}

/**
 * Create regex for wildcard pattern
 * @param {string} pattern - Wildcard pattern
 * @returns {RegExp} Compiled regex
 */
function createWildcardRegex(pattern) {
  let regexPattern = pattern
    .replace(/\*\*/g, '§DOUBLESTAR§')
    .replace(/\*/g, '[^.]*')
    .replace(/§DOUBLESTAR§/g, '.*')
    .replace(/\./g, '\\.')
  
  return new RegExp(`^${regexPattern}$`)
}

/**
 * Create regex for array pattern
 * @param {string} pattern - Array pattern
 * @returns {RegExp} Compiled regex
 */
function createArrayRegex(pattern) {
  let regexPattern = pattern
    .replace(/\[\]/g, '\\.[0-9]+')
    .replace(/\[\*\]/g, '\\.[^.]+')
    .replace(/\./g, '\\.')
  
  return new RegExp(`^${regexPattern}$`)
}

/**
 * Validate field pattern syntax
 * @param {string} pattern - Pattern to validate
 * @returns {Object} Validation result
 */
function validatePattern(pattern) {
  const result = {
    valid: true,
    errors: [],
    type: 'exact'
  }
  
  try {
    if (pattern.startsWith('/') && pattern.endsWith('/')) {
      // Validate regex pattern
      new RegExp(pattern.slice(1, -1))
      result.type = 'regex'
    } else if (pattern.includes('*')) {
      result.type = 'wildcard'
      
      // Basic wildcard validation
      if (pattern.includes('***')) {
        result.errors.push('Triple asterisk (***) is not supported')
        result.valid = false
      }
    } else if (pattern.includes('[') || pattern.includes(']')) {
      result.type = 'array'
      
      // Validate array pattern syntax
      const brackets = pattern.match(/\[|\]/g) || []
      if (brackets.length % 2 !== 0) {
        result.errors.push('Unmatched brackets in array pattern')
        result.valid = false
      }
    }
    
    // Check for empty pattern
    if (!pattern.trim()) {
      result.errors.push('Pattern cannot be empty')
      result.valid = false
    }
    
  } catch (error) {
    result.errors.push(`Invalid regex pattern: ${error.message}`)
    result.valid = false
  }
  
  return result
}

/**
 * Get pattern complexity score (for optimization)
 * @param {string} pattern - Pattern to analyze
 * @returns {number} Complexity score (1-10)
 */
function getPatternComplexity(pattern) {
  let complexity = 1
  
  // Regex patterns are most complex
  if (pattern.startsWith('/') && pattern.endsWith('/')) {
    complexity += 5
  }
  
  // Wildcards add complexity
  const wildcardCount = (pattern.match(/\*/g) || []).length
  complexity += wildcardCount
  
  // Array patterns add complexity
  if (pattern.includes('[') && pattern.includes(']')) {
    complexity += 2
  }
  
  // Nested patterns are more complex
  const dotCount = (pattern.match(/\./g) || []).length
  complexity += Math.floor(dotCount / 2)
  
  return Math.min(complexity, 10)
}

module.exports = {
  matchField,
  matchWildcardPattern,
  matchArrayPattern,
  extractFields,
  getAllFieldPaths,
  normalizePattern,
  matchMultiplePatterns,
  createMatcher,
  validatePattern,
  getPatternComplexity
}