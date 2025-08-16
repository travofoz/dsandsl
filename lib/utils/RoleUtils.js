/**
 * @fileoverview Role Hierarchy Utilities
 * Role permission checking and hierarchy management
 */

/**
 * Check if user role has required permission level
 * @param {string} userRole - User's role
 * @param {string} requiredRole - Required role level
 * @param {Object} roleHierarchy - Role hierarchy configuration
 * @returns {boolean} True if user has sufficient permissions
 */
function hasPermission(userRole, requiredRole, roleHierarchy) {
  if (!userRole || !requiredRole || !roleHierarchy) {
    return false
  }
  
  const userLevel = getRoleLevel(userRole, roleHierarchy)
  const requiredLevel = getRoleLevel(requiredRole, roleHierarchy)
  
  // Direct level comparison
  if (userLevel >= requiredLevel) {
    return true
  }
  
  // Check role inheritance
  return hasInheritedPermission(userRole, requiredRole, roleHierarchy)
}

/**
 * Get numeric level for a role
 * @param {string} role - Role name
 * @param {Object} roleHierarchy - Role hierarchy configuration
 * @returns {number} Role level (0 if not found)
 */
function getRoleLevel(role, roleHierarchy) {
  if (!role || !roleHierarchy || !roleHierarchy[role]) {
    return 0
  }
  
  return roleHierarchy[role].level || 0
}

/**
 * Check if user role inherits required permission
 * @param {string} userRole - User's role
 * @param {string} requiredRole - Required role
 * @param {Object} roleHierarchy - Role hierarchy configuration
 * @returns {boolean} True if user role inherits required permission
 */
function hasInheritedPermission(userRole, requiredRole, roleHierarchy) {
  const userRoleConfig = roleHierarchy[userRole]
  
  if (!userRoleConfig || !userRoleConfig.inherits) {
    return false
  }
  
  // Check if user role directly inherits the required role
  if (userRoleConfig.inherits.includes(requiredRole)) {
    return true
  }
  
  // Recursively check inherited roles
  for (const inheritedRole of userRoleConfig.inherits) {
    if (hasPermission(inheritedRole, requiredRole, roleHierarchy)) {
      return true
    }
  }
  
  return false
}

/**
 * Compare two roles based on hierarchy levels
 * @param {string} role1 - First role
 * @param {string} role2 - Second role
 * @param {Object} roleHierarchy - Role hierarchy configuration
 * @returns {number} -1 if role1 < role2, 0 if equal, 1 if role1 > role2
 */
function compareRoles(role1, role2, roleHierarchy) {
  const level1 = getRoleLevel(role1, roleHierarchy)
  const level2 = getRoleLevel(role2, roleHierarchy)
  
  if (level1 < level2) return -1
  if (level1 > level2) return 1
  return 0
}

/**
 * Get all roles that a user role can access (equal or lower level)
 * @param {string} userRole - User's role
 * @param {Object} roleHierarchy - Role hierarchy configuration
 * @returns {Array<string>} Array of accessible role names
 */
function getAccessibleRoles(userRole, roleHierarchy) {
  const userLevel = getRoleLevel(userRole, roleHierarchy)
  const accessibleRoles = []
  
  Object.entries(roleHierarchy).forEach(([roleName, roleConfig]) => {
    if (roleConfig.level <= userLevel) {
      accessibleRoles.push(roleName)
    }
  })
  
  // Add inherited roles
  const userRoleConfig = roleHierarchy[userRole]
  if (userRoleConfig && userRoleConfig.inherits) {
    userRoleConfig.inherits.forEach(inheritedRole => {
      if (!accessibleRoles.includes(inheritedRole)) {
        accessibleRoles.push(inheritedRole)
      }
    })
  }
  
  return accessibleRoles.sort((a, b) => 
    compareRoles(b, a, roleHierarchy) // Sort by level descending
  )
}

/**
 * Get the highest role level among multiple roles
 * @param {Array<string>} roles - Array of role names
 * @param {Object} roleHierarchy - Role hierarchy configuration
 * @returns {string|null} Highest role name or null if none found
 */
function getHighestRole(roles, roleHierarchy) {
  if (!roles || roles.length === 0) {
    return null
  }
  
  let highestRole = roles[0]
  let highestLevel = getRoleLevel(highestRole, roleHierarchy)
  
  for (let i = 1; i < roles.length; i++) {
    const currentLevel = getRoleLevel(roles[i], roleHierarchy)
    if (currentLevel > highestLevel) {
      highestRole = roles[i]
      highestLevel = currentLevel
    }
  }
  
  return highestRole
}

/**
 * Check if role hierarchy has circular dependencies
 * @param {Object} roleHierarchy - Role hierarchy configuration
 * @returns {Object} Validation result with any circular dependencies found
 */
function validateRoleHierarchy(roleHierarchy) {
  const result = {
    valid: true,
    circularDependencies: [],
    orphanedRoles: [],
    warnings: []
  }
  
  // Check for circular dependencies
  Object.keys(roleHierarchy).forEach(roleName => {
    const visited = new Set()
    const path = []
    
    if (hasCircularDependency(roleName, roleHierarchy, visited, path)) {
      result.valid = false
      result.circularDependencies.push({
        role: roleName,
        path: [...path]
      })
    }
  })
  
  // Check for orphaned inherited roles
  Object.entries(roleHierarchy).forEach(([roleName, roleConfig]) => {
    if (roleConfig.inherits) {
      roleConfig.inherits.forEach(inheritedRole => {
        if (!roleHierarchy[inheritedRole]) {
          result.orphanedRoles.push({
            role: roleName,
            missingInheritedRole: inheritedRole
          })
        }
      })
    }
  })
  
  // Check for level conflicts with inheritance
  Object.entries(roleHierarchy).forEach(([roleName, roleConfig]) => {
    if (roleConfig.inherits) {
      roleConfig.inherits.forEach(inheritedRole => {
        const inheritedConfig = roleHierarchy[inheritedRole]
        if (inheritedConfig && inheritedConfig.level > roleConfig.level) {
          result.warnings.push(
            `Role '${roleName}' (level ${roleConfig.level}) inherits from '${inheritedRole}' (level ${inheritedConfig.level}) which has a higher level`
          )
        }
      })
    }
  })
  
  return result
}

/**
 * Check for circular dependency in role inheritance
 * @param {string} roleName - Role to check
 * @param {Object} roleHierarchy - Role hierarchy
 * @param {Set} visited - Visited roles in current path
 * @param {Array} path - Current inheritance path
 * @returns {boolean} True if circular dependency found
 */
function hasCircularDependency(roleName, roleHierarchy, visited, path) {
  if (visited.has(roleName)) {
    path.push(roleName)
    return true
  }
  
  const roleConfig = roleHierarchy[roleName]
  if (!roleConfig || !roleConfig.inherits) {
    return false
  }
  
  visited.add(roleName)
  path.push(roleName)
  
  for (const inheritedRole of roleConfig.inherits) {
    if (hasCircularDependency(inheritedRole, roleHierarchy, new Set(visited), [...path])) {
      return true
    }
  }
  
  visited.delete(roleName)
  path.pop()
  return false
}

/**
 * Flatten role inheritance to get all effective permissions
 * @param {string} roleName - Role to flatten
 * @param {Object} roleHierarchy - Role hierarchy configuration
 * @returns {Object} Flattened role with all inherited permissions
 */
function flattenRole(roleName, roleHierarchy) {
  const roleConfig = roleHierarchy[roleName]
  if (!roleConfig) {
    return null
  }
  
  const flattened = {
    name: roleName,
    level: roleConfig.level,
    description: roleConfig.description,
    customPermissions: [...(roleConfig.customPermissions || [])],
    allInheritedRoles: new Set()
  }
  
  // Recursively collect inherited roles and permissions
  function collectInherited(currentRole) {
    const currentConfig = roleHierarchy[currentRole]
    if (!currentConfig || !currentConfig.inherits) {
      return
    }
    
    currentConfig.inherits.forEach(inheritedRole => {
      if (!flattened.allInheritedRoles.has(inheritedRole)) {
        flattened.allInheritedRoles.add(inheritedRole)
        
        // Add custom permissions from inherited role
        const inheritedConfig = roleHierarchy[inheritedRole]
        if (inheritedConfig && inheritedConfig.customPermissions) {
          inheritedConfig.customPermissions.forEach(permission => {
            if (!flattened.customPermissions.includes(permission)) {
              flattened.customPermissions.push(permission)
            }
          })
        }
        
        // Recursively collect from inherited role
        collectInherited(inheritedRole)
      }
    })
  }
  
  collectInherited(roleName)
  
  // Convert Set to Array for JSON serialization
  flattened.allInheritedRoles = Array.from(flattened.allInheritedRoles)
  
  return flattened
}

/**
 * Create a role hierarchy graph for visualization
 * @param {Object} roleHierarchy - Role hierarchy configuration
 * @returns {Object} Graph representation with nodes and edges
 */
function createRoleGraph(roleHierarchy) {
  const nodes = []
  const edges = []
  
  // Create nodes
  Object.entries(roleHierarchy).forEach(([roleName, roleConfig]) => {
    nodes.push({
      id: roleName,
      label: roleName,
      level: roleConfig.level,
      description: roleConfig.description || '',
      customPermissions: roleConfig.customPermissions || []
    })
  })
  
  // Create edges for inheritance
  Object.entries(roleHierarchy).forEach(([roleName, roleConfig]) => {
    if (roleConfig.inherits) {
      roleConfig.inherits.forEach(inheritedRole => {
        edges.push({
          from: roleName,
          to: inheritedRole,
          label: 'inherits'
        })
      })
    }
  })
  
  return { nodes, edges }
}

/**
 * Get role suggestions based on common patterns
 * @param {Object} currentHierarchy - Current role hierarchy
 * @returns {Array<Object>} Suggested roles to add
 */
function getRoleSuggestions(currentHierarchy) {
  const suggestions = []
  const existingRoles = Object.keys(currentHierarchy)
  
  // Common role patterns
  const commonRoles = [
    { name: 'super_admin', level: 200, description: 'Super administrator with all permissions' },
    { name: 'admin', level: 100, description: 'Administrator with full access' },
    { name: 'manager', level: 50, description: 'Manager with team oversight' },
    { name: 'user', level: 10, description: 'Standard user access' },
    { name: 'guest', level: 0, description: 'Anonymous/guest access' },
    { name: 'moderator', level: 30, description: 'Content moderation access' },
    { name: 'support', level: 25, description: 'Customer support access' },
    { name: 'auditor', level: 40, description: 'Read-only audit access' }
  ]
  
  commonRoles.forEach(role => {
    if (!existingRoles.includes(role.name)) {
      suggestions.push(role)
    }
  })
  
  return suggestions
}

module.exports = {
  hasPermission,
  getRoleLevel,
  hasInheritedPermission,
  compareRoles,
  getAccessibleRoles,
  getHighestRole,
  validateRoleHierarchy,
  flattenRole,
  createRoleGraph,
  getRoleSuggestions
}