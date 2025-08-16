/**
 * DSANDSL - Data Service AND Security Layer
 * Universal role-based data filtering and security for Node.js applications
 */

const DSLEngine = require('./lib/core/DSLEngine')
const { createConfig, validateConfig } = require('./lib/core/DSLConfig')
const { DSLError, ConfigurationError, AccessDeniedError, ValidationError } = require('./lib/core/DSLErrors')

// Framework adapters (will be implemented)
let NextJSAdapter, ExpressAdapter
try {
  NextJSAdapter = require('./lib/adapters/NextJSAdapter')
} catch (e) {
  NextJSAdapter = null
}
try {
  ExpressAdapter = require('./lib/adapters/ExpressAdapter')
} catch (e) {
  ExpressAdapter = null
}

// Utilities
const { matchField, extractFields } = require('./lib/utils/FieldMatcher')
const { compareRoles, hasPermission } = require('./lib/utils/RoleUtils')

module.exports = {
  // Core classes
  DSLEngine,
  createConfig,
  validateConfig,
  
  // Error classes
  DSLError,
  ConfigurationError,
  AccessDeniedError,
  ValidationError,
  
  // Framework adapters
  NextJSAdapter,
  ExpressAdapter,
  
  // Utilities
  utils: {
    matchField,
    extractFields,
    compareRoles,
    hasPermission
  },
  
  // Convenience exports
  createEngine: (config, options) => new DSLEngine(createConfig(config), options),
  
  // Version
  version: require('./package.json').version
}