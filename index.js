/**
 * DSANDSL - Data Service AND Security Layer
 * Universal role-based data filtering and security for Node.js applications
 */

const DSLEngine = require('./lib/core/DSLEngine')
const { createConfig, validateConfig } = require('./lib/core/DSLConfig')
const { DSLError, ConfigurationError, AccessDeniedError, ValidationError } = require('./lib/core/DSLErrors')

// Framework adapters
const NextJSAdapter = require('./lib/adapters/NextJSAdapter')
const ExpressAdapter = require('./lib/adapters/ExpressAdapter')

// Database adapters
const DatabaseAdapter = require('./lib/database/DatabaseAdapter')
const PostgreSQLAdapter = require('./lib/database/adapters/PostgreSQLAdapter')
const MySQLAdapter = require('./lib/database/adapters/MySQLAdapter')
const SQLiteAdapter = require('./lib/database/adapters/SQLiteAdapter')
const QueryBuilder = require('./lib/database/QueryBuilder')

// Database managers
const PostgreSQLManager = require('./lib/database/managers/PostgreSQLManager')
const MySQLManager = require('./lib/database/managers/MySQLManager')
const SQLiteManager = require('./lib/database/managers/SQLiteManager')

// Utilities
const { matchField, extractFields } = require('./lib/utils/FieldMatcher')
const { compareRoles, hasPermission } = require('./lib/utils/RoleUtils')

// Services (Recommended Pattern)
const DSLServiceProvider = require('./lib/services/DSLServiceProvider')
const ServiceRegistry = require('./lib/services/ServiceRegistry')
const BaseService = require('./lib/services/BaseService')
const UserService = require('./lib/services/UserService')

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
  
  // Database adapters
  DatabaseAdapter,
  PostgreSQLAdapter,
  MySQLAdapter,
  SQLiteAdapter,
  QueryBuilder,
  
  // Database managers
  PostgreSQLManager,
  MySQLManager,
  SQLiteManager,
  
  // Utilities
  utils: {
    matchField,
    extractFields,
    compareRoles,
    hasPermission
  },
  
  // Services (Recommended Pattern)
  DSLServiceProvider,
  ServiceRegistry,
  BaseService,
  UserService,
  
  // Convenience exports
  createEngine: (config, options) => new DSLEngine(createConfig(config), options),
  
  // Version
  version: require('./package.json').version
}