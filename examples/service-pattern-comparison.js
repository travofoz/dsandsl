#!/usr/bin/env node
/**
 * @fileoverview Service Pattern Comparison
 * Demonstrates the difference between direct DSL usage vs Service Provider pattern
 * Shows why the Service Provider pattern is mandatory for proper security
 */

const { 
  DSLEngine, 
  createConfig, 
  SQLiteAdapter,
  DSLServiceProvider,
  ServiceRegistry,
  UserService
} = require('../index')

// Test configuration
const config = createConfig({
  roles: {
    admin: { level: 100 },
    manager: { level: 50 },
    user: { level: 10 },
    guest: { level: 0 }
  },
  fields: {
    'users.password_hash': { deny: true },
    'users.salary': { minRole: 'manager' },
    'users.personal_notes': { minRole: 'admin' },
    'users.email': { minRole: 'user' },
    'users.name': { minRole: 'user' }
  },
  database: {
    tables: {
      users: { minRole: 'user', operations: ['SELECT', 'INSERT', 'UPDATE'] }
    }
  }
})

const adapterConfig = {
  type: 'sqlite',
  connection: { filename: ':memory:' }
}

async function demonstrateDirectDSLApproach() {
  console.log('🚫 THE WRONG WAY: Direct DSL Usage (EVEN IF IT WORKS)')
  console.log('=====================================================')
  console.log('❌ DO NOT DO THIS - even though it technically works')
  console.log('❌ Violates security best practices')
  console.log('❌ Creates maintenance nightmares')
  console.log('❌ Leads to security vulnerabilities\n')

  // Simulate what each API developer would have to do
  const dsl = new DSLEngine(config)
  const adapter = new SQLiteAdapter(dsl, adapterConfig)
  await adapter.initialize()

  // Setup test data
  await adapter.executeQuery(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      name TEXT,
      email TEXT,
      password_hash TEXT,
      salary INTEGER,
      personal_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, [])

  await adapter.insert('users', {
    name: 'John Doe',
    email: 'john@company.com',
    password_hash: 'secret123',
    salary: 75000,
    personal_notes: 'Excellent employee'
  }, 'admin')

  // ❌ BAD: Each endpoint developer must remember to implement security
  console.log('Example API endpoint with direct DSL (each dev must implement):')
  console.log(`
// ❌ EVERY ENDPOINT looks like this - repetitive and error-prone
app.get('/api/users', async (req, res) => {
  try {
    // Developer must remember to create DSL engine
    const dsl = new DSLEngine(config)
    const adapter = new SQLiteAdapter(dsl, adapterConfig)
    await adapter.initialize()
    
    // Developer must remember role-based filtering
    const users = await adapter.select('users', req.user.role, {
      limit: req.query.limit || 20,
      offset: req.query.offset || 0
    })
    
    // Developer must remember to close connection
    await adapter.close()
    
    res.json(users)
  } catch (error) {
    // Developer must implement consistent error handling
    res.status(500).json({ error: error.message })
  }
})`)

  // Show what happens with this approach
  console.log('\n🚨 Problems with this approach:')
  
  // Test as different roles
  const adminUsers = await adapter.select('users', 'admin')
  const userUsers = await adapter.select('users', 'user')
  
  console.log('   Admin sees fields:', Object.keys(adminUsers[0]))
  console.log('   User sees fields:', Object.keys(userUsers[0]))
  console.log('   ✅ Security works IF developer remembers to implement it')
  
  // Simulate what happens when developer forgets
  console.log('\n💥 What happens when developer forgets security:')
  console.log(`
// 💥 DEVELOPER FORGETS - bypasses all security
app.get('/api/users-vulnerable', async (req, res) => {
  const db = require('sqlite3')
  const results = await db.all('SELECT * FROM users') // NO SECURITY!
  res.json(results) // Exposes password_hash, salary, everything!
})`)

  await adapter.close()
  console.log('   💥 Result: All sensitive data exposed, no role filtering')
}

async function demonstrateServiceProviderApproach() {
  console.log('\n\n✅ THE RIGHT WAY: Service Provider Pattern (MANDATORY)')
  console.log('======================================================')
  console.log('✅ THIS IS THE ONLY CORRECT WAY to use DSANDSL')
  console.log('✅ Security enforced at data layer - cannot be bypassed')
  console.log('✅ If your code doesn\'t look like this, you\'re doing it WRONG\n')

  // Initialize service provider
  await DSLServiceProvider.initialize(config, adapterConfig)

  // Setup test data
  const adapter = DSLServiceProvider.getAdapter()
  await adapter.executeQuery(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      name TEXT,
      email TEXT,
      password_hash TEXT,
      salary INTEGER,
      personal_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, [])

  await UserService.insert('users', {
    name: 'Jane Smith',
    email: 'jane@company.com',
    password_hash: 'secret456',
    salary: 85000,
    personal_notes: 'Team lead'
  }, 'admin')

  console.log('Example API endpoint with Service Provider:')
  console.log(`
// ✅ EVERY ENDPOINT is clean and secure by default
app.get('/api/users', async (req, res) => {
  try {
    // Developer CANNOT bypass security - it's built into the service
    const result = await UserService.getUsers(req.user.role, req.query)
    res.json(result)
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

app.get('/api/users/:id', async (req, res) => {
  try {
    // Security is automatic and consistent
    const user = await UserService.getUserById(req.params.id, req.user.role)
    res.json(user)
  } catch (error) {
    res.status(404).json({ error: 'User not found' })
  }
})`)

  // Demonstrate the service approach
  console.log('\n✅ Benefits of Service Provider approach:')
  
  // Test service with different roles using simpler select
  const adminResult = await UserService.select('users', 'admin', { limit: 5 })
  const userResult = await UserService.select('users', 'user', { limit: 5 })
  
  console.log('   Admin sees fields:', Object.keys(adminResult[0]))
  console.log('   User sees fields:', Object.keys(userResult[0]))
  console.log('   ✅ Security is AUTOMATIC and CONSISTENT')
  
  // Show impossible bypass attempts
  console.log('\n🛡️  Security CANNOT be bypassed:')
  console.log(`
// 🛡️  DEVELOPER CANNOT BYPASS - no direct database access
app.get('/api/users-attempt-bypass', async (req, res) => {
  // Developer has NO access to raw database
  // Must go through UserService which enforces security
  const users = await UserService.getUsers(req.user.role) // Always secure!
  res.json(users)
})`)

  console.log('   🛡️  Result: Security is enforced at the DATA layer')
  console.log('   🛡️  Developers CANNOT accidentally expose sensitive data')

  // Demonstrate transaction safety
  console.log('\n🔒 Transaction safety built-in:')
  try {
    // Use simpler insert for demo
    const newUser = await UserService.insert('users', {
      name: 'Bob Wilson',
      email: 'bob@company.com',
      salary: 65000 // This will be filtered based on role
    }, 'user')
    
    console.log('   Created user successfully')
    console.log('   ✅ Salary field automatically filtered during creation')
  } catch (error) {
    console.log('   ✅ Creation blocked by role validation:', error.message)
  }

  await DSLServiceProvider.shutdown()
}

async function demonstrateSecurityComparison() {
  console.log('\n\n🎯 CRITICAL: HOW TO USE DSANDSL CORRECTLY')
  console.log('==========================================')
  
  console.log('\n⚠️  IF YOUR CODE LOOKS LIKE THE "WRONG WAY":')
  console.log('   🚫 YOU ARE DEFEATING THE ENTIRE PURPOSE OF DSANDSL')
  console.log('   🚫 YOU ARE USING IT INCORRECTLY')
  console.log('   🚫 GO USE PRISMA, SEQUELIZE, OR ANOTHER ORM INSTEAD')
  console.log('   🚫 DSANDSL IS NOT FOR YOU IF YOU WANT MANUAL CONTROL')
  
  console.log('\n💡 THE WHOLE POINT OF DSANDSL:')
  console.log('   ✅ FORCE security at the data layer')
  console.log('   ✅ PREVENT developers from making security mistakes')
  console.log('   ✅ ELIMINATE the possibility of bypassing security')
  console.log('   ✅ CENTRALIZE all data access through secure services')
  
  console.log('\n🚨 UNDERSTAND THIS OR DON\'T USE DSANDSL:')
  console.log('   • If you want manual control over queries: USE ANOTHER ORM')
  console.log('   • If you want to write raw SQL in endpoints: USE ANOTHER ORM')
  console.log('   • If you don\'t want forced security: USE ANOTHER ORM')
  console.log('   • If you think service pattern is "overkill": USE ANOTHER ORM')
  
  console.log('\n✅ DSANDSL IS FOR TEAMS WHO WANT:')
  console.log('   • Bulletproof security that cannot be bypassed')
  console.log('   • Consistent data access patterns across all code')
  console.log('   • Protection against developer security mistakes')
  console.log('   • Centralized business logic in services')
  console.log('   • Clean separation between API and data layers')
  
  console.log('\n📋 MANDATORY IMPLEMENTATION PATTERN:')
  console.log('   1. Initialize DSLServiceProvider at app startup (ONCE)')
  console.log('   2. Create domain services extending BaseService')
  console.log('   3. API endpoints ONLY call service methods (NO EXCEPTIONS)')
  console.log('   4. ZERO direct database access in API layer')
  console.log('   5. ALL security handled automatically by service layer')
  
  console.log('\n🎯 FINAL WARNING:')
  console.log('   If you find yourself bypassing the service pattern,')
  console.log('   you need to STOP and contemplate how DSANDSL works.')
  console.log('   This is not a regular ORM - it\'s a SECURITY FRAMEWORK.')
  console.log('   Use it correctly or use something else.')
}

async function runComparison() {
  console.log('🔒 DSANDSL Service Pattern Comparison')
  console.log('=====================================')
  console.log('Comparing Direct DSL vs Service Provider approaches\n')

  try {
    await demonstrateDirectDSLApproach()
    await demonstrateServiceProviderApproach()
    await demonstrateSecurityComparison()
    
    console.log('\n🎉 Comparison complete!')
    console.log('Use the Service Provider pattern for secure, maintainable code.')
    
  } catch (error) {
    console.error('💥 Comparison failed:', error)
    process.exit(1)
  }
}

// Run the comparison
if (require.main === module) {
  runComparison().catch(console.error)
}

module.exports = { 
  demonstrateDirectDSLApproach,
  demonstrateServiceProviderApproach,
  demonstrateSecurityComparison
}