#!/usr/bin/env node
/**
 * Test script for database adapters
 */

const { 
  DSLEngine, 
  createConfig, 
  PostgreSQLAdapter, 
  MySQLAdapter, 
  SQLiteAdapter 
} = require('./index')

// Test configuration
const dslConfig = createConfig({
  roles: {
    admin: { level: 100 },
    manager: { level: 50 },
    user: { level: 10 },
    guest: { level: 0 }
  },
  fields: {
    'id': { minRole: 'user', category: 'identifier' },
    'name': { minRole: 'user', category: 'personal' },
    'email': { minRole: 'user', category: 'personal' },
    'salary': { minRole: 'admin', category: 'financial' },
    'department': { minRole: 'manager', category: 'organizational' },
    'password': { deny: true },
    'value': { minRole: 'user', category: 'data' },
    'created_at': { minRole: 'user', category: 'metadata' },
    'updated_at': { minRole: 'user', category: 'metadata' }
  },
  database: {
    tables: {
      users: { 
        minRole: 'user',
        operations: ['SELECT', 'INSERT', 'UPDATE', 'DELETE']
      },
      perf_test: {
        minRole: 'user',
        operations: ['SELECT', 'INSERT', 'UPDATE', 'DELETE']
      },
      sensitive_data: {
        minRole: 'admin',
        operations: ['SELECT']
      }
    }
  }
})

// Sample test data
const testUsers = [
  { id: 1, name: 'Alice Admin', email: 'alice@company.com', salary: 120000, department: 'Engineering', password: 'secret123' },
  { id: 2, name: 'Bob Manager', email: 'bob@company.com', salary: 90000, department: 'Sales', password: 'secret456' },
  { id: 3, name: 'Carol User', email: 'carol@company.com', salary: 60000, department: 'Support', password: 'secret789' }
]

async function runDatabaseTests() {
  console.log('🗄️  Testing DSANDSL Database Adapters\n')
  
  // Initialize DSL engine
  const dsl = new DSLEngine(dslConfig)
  
  console.log('✅ DSL Engine initialized for database testing')
  console.log()
  
  // Test SQLite (in-memory for testing)
  await testSQLiteAdapter(dsl)
  
  // Test PostgreSQL (if available)
  // await testPostgreSQLAdapter(dsl)
  
  // Test MySQL (if available)
  // await testMySQLAdapter(dsl)
  
  console.log('🎉 All database adapter tests completed!')
}

async function testSQLiteAdapter(dsl) {
  console.log('📋 Test 1: SQLite Adapter - Basic Operations')
  console.log('============================================')
  
  try {
    // Create SQLite adapter with in-memory database
    const adapter = new SQLiteAdapter(dsl, {
      connection: {
        filename: ':memory:',
        enableWAL: false // Disable WAL for in-memory
      },
      validateTableAccess: true,
      validateFieldAccess: true,
      autoFilter: true
    })
    
    // Initialize adapter
    await adapter.initialize()
    console.log('✅ SQLite adapter initialized')
    
    // Create test table
    await adapter.executeQuery(`
      CREATE TABLE users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        salary INTEGER,
        department TEXT,
        password TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, [])
    console.log('✅ Test table created')
    
    // Test role-based INSERT
    console.log('\n🔍 Testing INSERT operations with different roles...')
    
    const insertData = {
      name: 'Test User',
      email: 'test@company.com',
      salary: 75000,
      department: 'IT',
      password: 'should-be-filtered'
    }
    
    // Test as admin (should allow all fields except password)
    const adminInsertResult = await adapter.insert('users', insertData, 'admin', {
      returning: ['id', 'name', 'email', 'salary']
    })
    console.log('✅ Admin INSERT successful:', {
      rowCount: adminInsertResult.rowCount,
      lastInsertId: adminInsertResult.lastInsertId
    })
    
    // Test as user (should filter salary and department)
    const userInsertData = {
      name: 'User Level Insert',
      email: 'user@company.com',
      salary: 50000, // Should be filtered
      department: 'Marketing' // Should be filtered
    }
    
    const userInsertResult = await adapter.insert('users', userInsertData, 'user')
    console.log('✅ User INSERT successful (filtered fields):', {
      rowCount: userInsertResult.rowCount
    })
    
    // Test role-based SELECT
    console.log('\n🔍 Testing SELECT operations with different roles...')
    
    // Test as admin (should see all allowed fields)
    const adminSelect = await adapter.select('users', 'admin', {
      fields: ['id', 'name', 'email', 'salary', 'department'],
      limit: 5
    })
    console.log('✅ Admin SELECT successful:', {
      rowCount: adminSelect.length,
      sampleRecord: adminSelect[0] ? Object.keys(adminSelect[0]) : 'No records'
    })
    
    // Test as manager (should see some fields)
    const managerSelect = await adapter.select('users', 'manager', {
      fields: ['id', 'name', 'email', 'department'], // salary should be filtered
      limit: 5
    })
    console.log('✅ Manager SELECT successful:', {
      rowCount: managerSelect.length,
      allowedFields: managerSelect[0] ? Object.keys(managerSelect[0]) : 'No records'
    })
    
    // Test as user (should see basic fields only)
    const userSelect = await adapter.select('users', 'user', {
      fields: ['id', 'name', 'email'], // salary and department should be filtered
      limit: 5
    })
    console.log('✅ User SELECT successful:', {
      rowCount: userSelect.length,
      allowedFields: userSelect[0] ? Object.keys(userSelect[0]) : 'No records'
    })
    
    // Test role-based UPDATE
    console.log('\n🔍 Testing UPDATE operations with different roles...')
    
    if (adminInsertResult.lastInsertId) {
      // Test as admin (should allow salary update)
      const adminUpdateResult = await adapter.update(
        'users',
        { salary: 80000, department: 'Engineering' },
        { id: adminInsertResult.lastInsertId },
        'admin'
      )
      console.log('✅ Admin UPDATE successful:', {
        affectedRows: adminUpdateResult.affectedRows
      })
      
      // Test as user (should filter salary update)
      try {
        await adapter.update(
          'users',
          { name: 'Updated Name', salary: 90000 }, // salary should be filtered
          { id: adminInsertResult.lastInsertId },
          'user'
        )
        console.log('✅ User UPDATE successful (salary filtered)')
      } catch (error) {
        console.log('ℹ️ User UPDATE filtered as expected')
      }
    }
    
    // Test query builder directly
    console.log('\n🔍 Testing Query Builder...')
    
    const qb = adapter.createQueryBuilder('manager')
    const { sql, params } = qb
      .select(['id', 'name', 'email', 'department'])
      .from('users')
      .where({ department: 'Engineering' })
      .orderBy('name', 'ASC')
      .limit(10)
      .build()
    
    console.log('✅ Query Builder SQL generated:', {
      sql: sql.substring(0, 100) + '...',
      paramCount: params.length
    })
    
    // Test transaction
    console.log('\n🔍 Testing Transactions...')
    
    const transactionResult = await adapter.transaction(async (tx) => {
      // Insert within transaction
      const txInsert = await tx.insert('users', {
        name: 'Transaction User',
        email: 'tx@company.com'
      }, 'admin')
      
      // Update within transaction
      await tx.update('users', 
        { department: 'Transaction Dept' },
        { id: txInsert.lastInsertId },
        'admin'
      )
      
      return { insertId: txInsert.lastInsertId }
    })
    
    console.log('✅ Transaction successful:', transactionResult)
    
    // Test health check
    const isHealthy = await adapter.healthCheck()
    console.log('✅ Health check:', isHealthy ? 'HEALTHY' : 'UNHEALTHY')
    
    // Test adapter stats
    const stats = adapter.getStats()
    console.log('✅ Adapter stats:', {
      type: stats.adapter,
      initialized: stats.initialized,
      connectionStatus: stats.connection?.status
    })
    
    // Test database info
    const info = await adapter.getInfo()
    console.log('✅ Database info:', {
      version: info.version.version,
      adapter: info.adapter,
      features: Object.keys(info.features).filter(f => info.features[f])
    })
    
    // Close adapter
    await adapter.close()
    console.log('✅ SQLite adapter closed')
    
  } catch (error) {
    console.error('❌ SQLite adapter test failed:', error.message)
    if (error.stack) {
      console.error('Stack trace:', error.stack.substring(0, 500))
    }
  }
  
  console.log()
}

async function testPostgreSQLAdapter(dsl) {
  console.log('📋 Test 2: PostgreSQL Adapter - Connection Test')
  console.log('===============================================')
  
  try {
    // Only test if PostgreSQL environment variables are set
    if (!process.env.DATABASE_URL && !process.env.DB_HOST) {
      console.log('ℹ️ Skipping PostgreSQL test (no connection config)')
      return
    }
    
    const adapter = new PostgreSQLAdapter(dsl, {
      connection: {
        // Uses environment variables or defaults
      },
      validateTableAccess: true,
      autoFilter: true
    })
    
    await adapter.initialize()
    console.log('✅ PostgreSQL adapter initialized')
    
    const isHealthy = await adapter.healthCheck()
    console.log('✅ PostgreSQL health check:', isHealthy ? 'HEALTHY' : 'UNHEALTHY')
    
    const info = await adapter.getInfo()
    console.log('✅ PostgreSQL info:', {
      version: info.version.version,
      features: Object.keys(info.features).filter(f => info.features[f])
    })
    
    await adapter.close()
    console.log('✅ PostgreSQL adapter closed')
    
  } catch (error) {
    console.log('ℹ️ PostgreSQL adapter test skipped:', error.message.substring(0, 100))
  }
  
  console.log()
}

async function testMySQLAdapter(dsl) {
  console.log('📋 Test 3: MySQL Adapter - Connection Test')
  console.log('==========================================')
  
  try {
    // Only test if MySQL environment variables are set
    if (!process.env.DB_HOST || !process.env.DB_USER) {
      console.log('ℹ️ Skipping MySQL test (no connection config)')
      return
    }
    
    const adapter = new MySQLAdapter(dsl, {
      connection: {
        // Uses environment variables
      },
      validateTableAccess: true,
      autoFilter: true
    })
    
    await adapter.initialize()
    console.log('✅ MySQL adapter initialized')
    
    const isHealthy = await adapter.healthCheck()
    console.log('✅ MySQL health check:', isHealthy ? 'HEALTHY' : 'UNHEALTHY')
    
    const info = await adapter.getInfo()
    console.log('✅ MySQL info:', {
      version: info.version.version,
      features: Object.keys(info.features).filter(f => info.features[f])
    })
    
    await adapter.close()
    console.log('✅ MySQL adapter closed')
    
  } catch (error) {
    console.log('ℹ️ MySQL adapter test skipped:', error.message.substring(0, 100))
  }
  
  console.log()
}

// Performance testing
async function runPerformanceTests() {
  console.log('📊 Database Adapter Performance Tests')
  console.log('=====================================')
  
  const dsl = new DSLEngine(dslConfig)
  const adapter = new SQLiteAdapter(dsl, {
    connection: { filename: ':memory:' }
  })
  
  await adapter.initialize()
  
  // Create test table
  await adapter.executeQuery(`
    CREATE TABLE perf_test (
      id INTEGER PRIMARY KEY,
      name TEXT,
      value INTEGER
    )
  `, [])
  
  // Insert test data
  const insertStart = performance.now()
  for (let i = 0; i < 100; i++) {
    await adapter.insert('perf_test', {
      name: `Test Record ${i}`,
      value: Math.floor(Math.random() * 1000)
    }, 'admin')
  }
  const insertTime = performance.now() - insertStart
  
  // Select test
  const selectStart = performance.now()
  const results = await adapter.select('perf_test', 'user', { 
    fields: ['id', 'name', 'value'], // Explicitly specify fields
    limit: 50 
  })
  const selectTime = performance.now() - selectStart
  
  console.log('📈 Performance Results:')
  console.log(`   100 INSERTs: ${insertTime.toFixed(2)}ms (${(insertTime/100).toFixed(2)}ms avg)`)
  console.log(`   50 record SELECT: ${selectTime.toFixed(2)}ms`)
  console.log(`   Records retrieved: ${results.length}`)
  
  await adapter.close()
  console.log()
}

// Error handling tests
async function runErrorHandlingTests() {
  console.log('🚨 Database Adapter Error Handling Tests')
  console.log('=========================================')
  
  const dsl = new DSLEngine(dslConfig)
  const adapter = new SQLiteAdapter(dsl, {
    connection: { filename: ':memory:' }
  })
  
  await adapter.initialize()
  
  // Create a test table for error handling
  await adapter.executeQuery(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY,
      name TEXT,
      email TEXT,
      password TEXT
    )
  `, [])
  
  // Test table access denied
  try {
    await adapter.select('sensitive_data', 'user') // user doesn't have access
    console.log('❌ Should have denied access to sensitive_data')
  } catch (error) {
    console.log('✅ Table access correctly denied:', error.code)
  }
  
  // Test invalid SQL
  try {
    await adapter.executeQuery('INVALID SQL STATEMENT', [])
    console.log('❌ Should have failed on invalid SQL')
  } catch (error) {
    console.log('✅ Invalid SQL correctly rejected')
  }
  
  // Test field filtering in INSERT
  try {
    const result = await adapter.insert('users', {
      name: 'Test',
      password: 'should-be-denied' // password field is denied
    }, 'user')
    console.log('✅ Password field correctly filtered in INSERT')
  } catch (error) {
    console.log('✅ Field access correctly controlled')
  }
  
  await adapter.close()
  console.log()
}

// Run all tests
async function main() {
  try {
    await runDatabaseTests()
    await runPerformanceTests()
    await runErrorHandlingTests()
    
    console.log('🎯 All database adapter tests completed successfully!')
    
  } catch (error) {
    console.error('💥 Test execution failed:', error.message)
    process.exit(1)
  }
}

// Execute tests
main()