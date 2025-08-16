/**
 * @fileoverview Service Registry
 * Central registry for managing domain services with DSANDSL
 */

const DSLProvider = require('./DSLServiceProvider')

class ServiceRegistry {
  constructor() {
    this.services = new Map()
    this.initialized = false
  }

  /**
   * Initialize the service registry
   * @param {Object} dslConfig - DSL configuration
   * @param {Object} adapterConfig - Database adapter configuration
   */
  async initialize(dslConfig, adapterConfig) {
    if (this.initialized) {
      console.warn('Service Registry already initialized')
      return
    }

    try {
      // Initialize core DSL provider
      await DSLProvider.initialize(dslConfig, adapterConfig)

      this.initialized = true
      console.log('✅ Service Registry initialized')
      
    } catch (error) {
      console.error('Failed to initialize Service Registry:', error)
      throw error
    }
  }

  /**
   * Register a service
   * @param {string} name - Service name
   * @param {Class} serviceClass - Service class
   */
  register(name, serviceClass) {
    if (!this.initialized) {
      throw new Error('Service Registry not initialized')
    }
    
    this.services.set(name, serviceClass)
    console.log(`📝 Service registered: ${name}`)
  }

  /**
   * Get a service by name
   * @param {string} serviceName - Service name
   * @returns {Class} Service class
   */
  get(serviceName) {
    if (!this.initialized) {
      throw new Error('Service Registry not initialized')
    }
    
    const service = this.services.get(serviceName)
    if (!service) {
      throw new Error(`Service not found: ${serviceName}`)
    }
    
    return service
  }

  /**
   * Check if service exists
   * @param {string} serviceName - Service name
   * @returns {boolean} True if service exists
   */
  has(serviceName) {
    return this.services.has(serviceName)
  }

  /**
   * Get all registered service names
   * @returns {Array<string>} Service names
   */
  getServiceNames() {
    return Array.from(this.services.keys())
  }

  /**
   * Get the DSL provider instance
   * @returns {DSLServiceProvider} DSL provider
   */
  getProvider() {
    return DSLProvider
  }

  /**
   * Health check all services
   * @returns {Promise<Object>} Health status
   */
  async healthCheck() {
    const health = {
      registry: this.initialized,
      dslProvider: await DSLProvider.healthCheck(),
      services: this.services.size,
      serviceNames: this.getServiceNames()
    }
    
    return health
  }

  /**
   * Get registry statistics
   * @returns {Object} Registry stats
   */
  getStats() {
    return {
      initialized: this.initialized,
      servicesRegistered: this.services.size,
      serviceNames: this.getServiceNames(),
      dslProvider: DSLProvider.getStats()
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    console.log('Shutting down Service Registry...')
    
    await DSLProvider.shutdown()
    this.services.clear()
    this.initialized = false
    
    console.log('✅ Service Registry shutdown completed')
  }

  /**
   * Create a new registry instance (for testing)
   * @returns {ServiceRegistry} New registry instance
   */
  static createInstance() {
    return new ServiceRegistry()
  }
}

// Export singleton instance
module.exports = new ServiceRegistry()
module.exports.ServiceRegistry = ServiceRegistry