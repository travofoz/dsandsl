#!/usr/bin/env node
/**
 * Basic test script for DSANDSL core functionality
 */

const { DSLEngine, createConfig } = require('./index.js')

// Sample data to test with
const sampleData = {
  id: 1,
  name: "John Doe", 
  email: "john@company.com",
  salary: 75000,
  bonus: 5000,
  department: "Engineering",
  team_size: 8,
  password: "secret123",
  ssn: "123-45-6789",
  profile: {
    contact: {
      phone: "555-0123",
      address: "123 Main St"
    },
    preferences: {
      theme: "dark",
      notifications: true
    }
  },
  financial: {
    salary: 75000,
    stock_options: 1000,
    retirement_401k: 25000
  }
}

const sampleArray = [
  { name: "Alice", salary: 80000, department: "Engineering" },
  { name: "Bob", salary: 90000, department: "Sales" },
  { name: "Carol", salary: 70000, department: "Marketing" }
]

// Create DSL configuration
const config = createConfig({
  roles: {
    admin: { level: 100, description: "Full access" },
    manager: { level: 50, description: "Management access", inherits: ["user"] },
    user: { level: 10, description: "Basic access" },
    guest: { level: 0, description: "Anonymous access" }
  },
  
  fields: {
    // Personal data - user level
    'name': { minRole: 'user', category: 'personal' },
    'email': { minRole: 'user', category: 'personal' },
    'id': { minRole: 'user', category: 'public' },
    
    // Financial data - admin only
    'salary': { minRole: 'admin', category: 'financial' },
    'bonus': { minRole: 'admin', category: 'financial' },
    'financial.*': { minRole: 'admin', category: 'financial' },
    
    // Management data - manager level
    'department': { minRole: 'manager', category: 'organizational' },
    'team_size': { minRole: 'manager', category: 'organizational' },
    
    // Contact info - user level
    'profile.contact.*': { minRole: 'user', category: 'contact' },
    'profile.preferences.*': { minRole: 'user', category: 'preferences' },
    
    // Always blocked
    'password': { deny: true },
    'ssn': { deny: true },
    '*.password': { deny: true }
  }
})

console.log('🧪 Testing DSANDSL Core Functionality\n')

// Initialize DSL engine
const dsl = new DSLEngine(config)

console.log('✅ DSL Engine initialized successfully')
console.log('Roles configured:', Object.keys(config.roles))
console.log('Field patterns configured:', Object.keys(config.fields).length)
console.log()

// Test 1: Basic filtering for different roles
console.log('📋 Test 1: Basic Role-based Filtering')
console.log('=====================================')

const roles = ['guest', 'user', 'manager', 'admin']

roles.forEach(role => {
  console.log(`\n🔐 ${role.toUpperCase()} view:`)
  const filtered = dsl.filter(sampleData, role)
  console.log(JSON.stringify(filtered, null, 2))
})

// Test 2: Array filtering
console.log('\n📋 Test 2: Array Filtering')
console.log('==========================')

roles.forEach(role => {
  console.log(`\n🔐 ${role.toUpperCase()} array view:`)
  const filtered = dsl.filter(sampleArray, role)
  console.log(JSON.stringify(filtered, null, 2))
})

// Test 3: Metadata and debugging
console.log('\n📋 Test 3: Metadata and Debugging')
console.log('==================================')

const userResult = dsl.filter(sampleData, 'user', { includeMetadata: true })
console.log('\n🔍 User filtering with metadata:')
console.log('Data:', JSON.stringify(userResult.data, null, 2))
console.log('Metadata:', JSON.stringify(userResult.metadata, null, 2))

// Test 4: Field access checking
console.log('\n📋 Test 4: Individual Field Access Checking')
console.log('============================================')

const testFields = ['name', 'salary', 'department', 'password', 'ssn']

testFields.forEach(field => {
  console.log(`\n🔍 Field: ${field}`)
  roles.forEach(role => {
    const access = dsl.checkAccess(field, role)
    console.log(`  ${role}: ${access.allowed ? '✅' : '❌'} ${access.reason || ''} ${access.requires ? `(requires: ${access.requires})` : ''}`)
  })
})

// Test 5: Pattern matching
console.log('\n📋 Test 5: Pattern Matching')
console.log('============================')

const { matchField } = require('./lib/utils/FieldMatcher')

const patterns = [
  { field: 'financial.salary', pattern: 'financial.*' },
  { field: 'user.password', pattern: '*.password' },
  { field: 'profile.contact.phone', pattern: 'profile.contact.*' },
  { field: 'normal_field', pattern: 'financial.*' }
]

patterns.forEach(test => {
  const matches = matchField(test.field, test.pattern)
  console.log(`🔍 "${test.field}" matches "${test.pattern}": ${matches ? '✅' : '❌'}`)
})

// Test 6: Role hierarchy
console.log('\n📋 Test 6: Role Hierarchy')
console.log('=========================')

const { hasPermission, getRoleLevel } = require('./lib/utils/RoleUtils')

console.log('\n🏗️ Role levels:')
roles.forEach(role => {
  const level = getRoleLevel(role, config.roles)
  console.log(`  ${role}: level ${level}`)
})

console.log('\n🔐 Permission checks:')
const permissionTests = [
  { user: 'admin', required: 'user' },
  { user: 'manager', required: 'admin' },
  { user: 'user', required: 'manager' },
  { user: 'manager', required: 'user' }
]

permissionTests.forEach(test => {
  const hasAccess = hasPermission(test.user, test.required, config.roles)
  console.log(`  ${test.user} can access ${test.required}: ${hasAccess ? '✅' : '❌'}`)
})

// Test 7: Performance stats
console.log('\n📋 Test 7: Performance Statistics')
console.log('==================================')

const stats = dsl.getStats()
console.log('📊 Engine statistics:')
console.log(JSON.stringify(stats, null, 2))

// Test 8: Error handling
console.log('\n📋 Test 8: Error Handling')
console.log('==========================')

try {
  // Test invalid role
  const result = dsl.filter(sampleData, 'invalid_role')
  console.log('❌ Should have thrown error for invalid role')
} catch (error) {
  console.log('✅ Correctly handled invalid role:', error.message.substring(0, 50))
}

try {
  // Test with null data
  const result = dsl.filter(null, 'user')
  console.log('✅ Correctly handled null data:', result)
} catch (error) {
  console.log('❌ Unexpected error with null data:', error.message)
}

console.log('\n🎉 All tests completed!')
console.log('\n📊 Final Engine Stats:')
console.log(JSON.stringify(dsl.getStats(), null, 2))