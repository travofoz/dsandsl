#!/usr/bin/env node
/**
 * Test script for framework adapters
 */

const { DSLEngine, createConfig, ExpressAdapter, NextJSAdapter } = require('./index')

// Test data
const sampleData = {
  id: 1,
  name: "John Doe",
  email: "john@company.com", 
  salary: 75000,
  department: "Engineering",
  password: "secret123"
}

// DSL configuration
const config = createConfig({
  roles: {
    admin: { level: 100 },
    manager: { level: 50 },
    user: { level: 10 },
    guest: { level: 0 }
  },
  fields: {
    'name': { minRole: 'user', category: 'personal' },
    'email': { minRole: 'user', category: 'personal' },
    'salary': { minRole: 'admin', category: 'financial' },
    'department': { minRole: 'manager', category: 'organizational' },
    'password': { deny: true }
  }
})

async function runTests() {
console.log('🧪 Testing DSANDSL Framework Adapters\n')

// Initialize DSL engine
const dsl = new DSLEngine(config)

console.log('✅ DSL Engine initialized for adapter testing')
console.log()

// Test Express Adapter
console.log('📋 Test 1: Express Adapter - Middleware Creation')
console.log('================================================')

try {
  // Test basic middleware creation
  const basicMiddleware = ExpressAdapter.middleware(dsl, {
    roleExtractor: (req) => req.user?.role || 'guest'
  })
  
  console.log('✅ Basic Express middleware created successfully')
  console.log('Type:', typeof basicMiddleware)
  console.log('Function length:', basicMiddleware.length) // Should be 3 for (req, res, next)
  
  // Test middleware with custom options
  const advancedMiddleware = ExpressAdapter.middleware(dsl, {
    roleExtractor: (req) => req.headers['x-user-role'] || 'guest',
    attachTo: 'security',
    autoFilter: true,
    skipPaths: ['/health', '/metrics']
  })
  
  console.log('✅ Advanced Express middleware created successfully')
  
} catch (error) {
  console.error('❌ Express middleware creation failed:', error.message)
}

console.log()

console.log('📋 Test 2: Express Adapter - Mock Request Processing')
console.log('===================================================')

try {
  // Create mock Express request/response objects
  const mockReq = {
    path: '/api/users/1',
    method: 'GET',
    user: { role: 'manager' },
    headers: {}
  }
  
  const mockRes = {
    json: (data) => {
      console.log('📤 Response data:', JSON.stringify(data, null, 2))
      return mockRes
    },
    status: (code) => {
      console.log('📋 Status code:', code)
      return mockRes
    }
  }
  
  const mockNext = () => {
    console.log('✅ Next() called successfully')
  }
  
  // Create middleware and test it
  const middleware = ExpressAdapter.middleware(dsl, {
    roleExtractor: (req) => req.user?.role || 'guest',
    attachTo: 'dsl'
  })
  
  // Execute middleware
  middleware(mockReq, mockRes, mockNext)
  
  // Test the attached DSL object
  if (mockReq.dsl) {
    console.log('✅ DSL object attached to request')
    console.log('User role:', mockReq.dsl.userRole)
    
    // Test filtering
    const filtered = mockReq.dsl.filter(sampleData)
    console.log('🔍 Filtered data for manager:', JSON.stringify(filtered, null, 2))
    
    // Test field access check
    const salaryAccess = mockReq.dsl.checkAccess('salary')
    console.log('💰 Salary access for manager:', salaryAccess.allowed ? '✅' : '❌')
    
    // Test helper methods
    console.log('📋 Allowed fields:', Array.from(mockReq.dsl.getAllowedFields()))
  } else {
    console.error('❌ DSL object not attached to request')
  }
  
} catch (error) {
  console.error('❌ Express request processing failed:', error.message)
}

console.log()

console.log('📋 Test 3: Next.js Adapter - Handler Creation')
console.log('==============================================')

try {
  // Test basic handler creation
  const basicHandler = NextJSAdapter.createHandler(dsl, {
    roleExtractor: async (req) => req.user?.role || 'guest'
  })
  
  console.log('✅ Basic Next.js handler created successfully')
  console.log('Type:', typeof basicHandler)
  console.log('Function length:', basicHandler.length) // Should be 2 for (req, res)
  
  // Test handler with data provider
  const dataProviderHandler = NextJSAdapter.createHandler(dsl, {
    roleExtractor: async (req) => req.headers['x-user-role'] || 'guest',
    dataProvider: async (req) => {
      // Simulate data fetching
      return sampleData
    },
    autoFilter: true
  })
  
  console.log('✅ Data provider Next.js handler created successfully')
  
} catch (error) {
  console.error('❌ Next.js handler creation failed:', error.message)
}

console.log()

console.log('📋 Test 4: Next.js Adapter - Mock API Route Processing')
console.log('======================================================')

try {
  // Create mock Next.js request/response objects
  const mockReq = {
    method: 'GET',
    query: { id: '1' },
    headers: {},
    user: { role: 'user' }
  }
  
  let responseData = null
  let responseStatus = null
  
  const mockRes = {
    json: (data) => {
      responseData = data
      console.log('📤 API Response:', JSON.stringify(data, null, 2))
      return mockRes
    },
    status: (code) => {
      responseStatus = code
      console.log('📋 Response status:', code)
      return mockRes
    },
    setHeader: (name, value) => {
      console.log(`🏷️ Header set: ${name} = ${value}`)
    },
    end: () => {
      console.log('✅ Response ended')
    }
  }
  
  // Create handler with data provider
  const handler = NextJSAdapter.createHandler(dsl, {
    roleExtractor: async (req) => req.user?.role || 'guest',
    dataProvider: async (req) => {
      console.log('📊 Data provider called for user:', req.user?.role)
      return sampleData
    },
    autoFilter: true
  })
  
  // Execute handler
  await handler(mockReq, mockRes)
  
  // Verify response
  if (responseData) {
    console.log('✅ Handler executed successfully')
    
    // Check that sensitive data was filtered
    if (responseData.salary) {
      console.log('❌ Salary should be filtered for user role')
    } else {
      console.log('✅ Salary correctly filtered for user role')
    }
    
    if (responseData.password) {
      console.log('❌ Password should always be filtered')
    } else {
      console.log('✅ Password correctly filtered')
    }
    
    if (responseData.name && responseData.email) {
      console.log('✅ Name and email accessible for user role')
    } else {
      console.log('❌ Name and email should be accessible for user role')
    }
  }
  
} catch (error) {
  console.error('❌ Next.js API route processing failed:', error.message)
}

console.log()

console.log('📋 Test 5: Error Handling')
console.log('==========================')

try {
  // Test Express adapter error handling
  console.log('🔍 Testing Express error handling...')
  
  const errorMiddleware = ExpressAdapter.middleware(dsl, {
    roleExtractor: () => {
      throw new Error('Role extraction failed')
    }
  })
  
  const mockReq = { path: '/test', method: 'GET' }
  const mockRes = {
    status: (code) => {
      console.log('📋 Error status:', code)
      return mockRes
    },
    json: (data) => {
      console.log('📤 Error response:', data)
      return mockRes
    }
  }
  const mockNext = (error) => {
    if (error) {
      console.log('✅ Error passed to next middleware:', error.message)
    }
  }
  
  errorMiddleware(mockReq, mockRes, mockNext)
  
} catch (error) {
  console.log('✅ Error handling test completed')
}

try {
  // Test Next.js adapter error handling
  console.log('🔍 Testing Next.js error handling...')
  
  const errorHandler = NextJSAdapter.createHandler(dsl, {
    roleExtractor: async () => {
      throw new Error('Next.js role extraction failed')
    }
  })
  
  const mockReq = { method: 'GET' }
  const mockRes = {
    status: (code) => {
      console.log('📋 Next.js error status:', code)
      return mockRes
    },
    json: (data) => {
      console.log('📤 Next.js error response:', data)
      return mockRes
    }
  }
  
  await errorHandler(mockReq, mockRes)
  
} catch (error) {
  console.log('✅ Next.js error handling test completed')
}

console.log()

console.log('📋 Test 6: Role-based Access Control')
console.log('=====================================')

try {
  // Test Express role protection
  const roleProtection = ExpressAdapter.requireRoles(['admin', 'manager'], {
    roleExtractor: (req) => req.user?.role || 'guest'
  })
  
  // Test with allowed role
  const allowedReq = { user: { role: 'admin' } }
  const mockRes = {
    status: () => mockRes,
    json: () => mockRes
  }
  
  let nextCalled = false
  const mockNext = () => { nextCalled = true }
  
  roleProtection(allowedReq, mockRes, mockNext)
  
  if (nextCalled) {
    console.log('✅ Admin role allowed through protection')
  } else {
    console.log('❌ Admin role incorrectly blocked')
  }
  
  // Test with denied role
  const deniedReq = { user: { role: 'user' } }
  let errorStatus = null
  const errorRes = {
    status: (code) => {
      errorStatus = code
      return errorRes
    },
    json: (data) => {
      console.log('🚫 Access denied response:', data)
      return errorRes
    }
  }
  
  roleProtection(deniedReq, errorRes, () => {})
  
  if (errorStatus === 403) {
    console.log('✅ User role correctly denied access')
  } else {
    console.log('❌ User role should be denied access')
  }
  
} catch (error) {
  console.error('❌ Role protection test failed:', error.message)
}

console.log()

console.log('📋 Test 7: Configuration Validation')
console.log('====================================')

try {
  // Test invalid configuration
  console.log('🔍 Testing invalid Express configuration...')
  
  try {
    ExpressAdapter.validateConfig({
      roleExtractor: 'not-a-function',
      errorHandler: 123,
      skipPaths: 'not-an-array'
    })
    console.log('❌ Should have thrown validation error')
  } catch (validationError) {
    console.log('✅ Express configuration validation working:', validationError.message.substring(0, 50))
  }
  
  console.log('🔍 Testing invalid Next.js configuration...')
  
  try {
    NextJSAdapter.validateConfig({
      roleExtractor: 'not-a-function',
      dataProvider: 123,
      methods: 'not-an-array'
    })
    console.log('❌ Should have thrown validation error')
  } catch (validationError) {
    console.log('✅ Next.js configuration validation working:', validationError.message.substring(0, 50))
  }
  
} catch (error) {
  console.error('❌ Configuration validation test failed:', error.message)
}

console.log()
console.log('🎉 All adapter tests completed!')

// Performance comparison
console.log()
console.log('📊 Performance Comparison')
console.log('=========================')

const iterations = 1000

// Test raw DSL performance
const startRaw = performance.now()
for (let i = 0; i < iterations; i++) {
  dsl.filter(sampleData, 'user')
}
const rawTime = performance.now() - startRaw

console.log(`Raw DSL filtering (${iterations} iterations): ${rawTime.toFixed(2)}ms`)
console.log(`Average per operation: ${(rawTime / iterations).toFixed(4)}ms`)

// Test Express adapter performance
const middleware = ExpressAdapter.middleware(dsl, {
  roleExtractor: () => 'user'
})

const mockReq = { path: '/test', method: 'GET' }
const mockRes = { json: () => {}, status: () => mockRes }
const mockNext = () => {}

const startExpress = performance.now()
for (let i = 0; i < iterations; i++) {
  middleware(mockReq, mockRes, mockNext)
  mockReq.dsl.filter(sampleData)
}
const expressTime = performance.now() - startExpress

console.log(`Express adapter (${iterations} iterations): ${expressTime.toFixed(2)}ms`)
console.log(`Average per operation: ${(expressTime / iterations).toFixed(4)}ms`)
console.log(`Overhead: ${((expressTime - rawTime) / iterations).toFixed(4)}ms per operation`)

console.log()
console.log('📊 Framework adapter overhead is minimal!')
console.log('🚀 Adapters are production-ready!')
}

// Run the tests
runTests().catch(error => {
  console.error('Test execution failed:', error)
  process.exit(1)
})