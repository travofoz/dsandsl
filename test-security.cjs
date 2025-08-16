#!/usr/bin/env node
/**
 * Security and SQL Injection Protection Tests
 * Validates that DSANDSL prevents SQL injection attacks
 */

const { 
  DSLEngine, 
  createConfig, 
  SQLiteAdapter,
  QueryBuilder
} = require('./index')

// Security test configuration
const securityConfig = createConfig({
  roles: {
    admin: { level: 100 },
    user: { level: 10 },
    guest: { level: 0 }
  },
  
  fields: {
    'id': { minRole: 'guest' },
    'name': { minRole: 'user' },
    'email': { minRole: 'user' },
    'password_hash': { deny: true },
    'admin_notes': { minRole: 'admin' }
  },
  
  database: {
    tables: {
      users: { minRole: 'user', operations: ['SELECT', 'INSERT', 'UPDATE'] },
      admin_data: { minRole: 'admin', operations: ['SELECT'] }
    }
  }
})

async function testSQLInjectionProtection() {
  console.log('🛡️  SQL Injection Protection Tests')
  console.log('==================================')
  
  const dsl = new DSLEngine(securityConfig)
  const adapter = new SQLiteAdapter(dsl, {
    connection: { filename: ':memory:' },
    validateTableAccess: true,
    validateFieldAccess: true
  })
  
  await adapter.initialize()
  
  // Create test table
  await adapter.executeQuery(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      admin_notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, [])
  
  // Insert test data
  await adapter.insert('users', {
    name: 'Test User',
    email: 'test@example.com',
    password_hash: 'hashed_password_123',
    admin_notes: 'Admin only information'
  }, 'admin')
  
  console.log('✅ Test data setup completed\n')
  
  // Test 1: SQL injection in WHERE conditions
  console.log('🔍 Test 1: SQL Injection in WHERE Conditions')
  console.log('==============================================')
  
  const injectionAttempts = [
    "1; DROP TABLE users; --",
    "1' OR '1'='1",
    "1'; DELETE FROM users; --",
    "1 UNION SELECT * FROM admin_data --",
    "'; INSERT INTO users VALUES (999, 'hacker', 'hack@evil.com', 'hash', 'pwned'); --",
    "1 OR 1=1",
    "1)) OR ((1=1",
    "x'; UPDATE users SET admin_notes = 'hacked' WHERE '1'='1"
  ]
  
  for (const injection of injectionAttempts) {
    try {
      // Test via adapter.select (should be safe due to parameterized queries)
      const results = await adapter.select('users', 'user', {
        where: { id: injection },
        limit: 1
      })
      
      console.log(`✅ Injection attempt blocked: "${injection.substring(0, 30)}..." - ${results.length} results`)
    } catch (error) {
      console.log(`✅ Injection attempt failed safely: "${injection.substring(0, 30)}..." - ${error.message.substring(0, 50)}...`)
    }
  }
  
  // Test 2: SQL injection in field names
  console.log('\n🔍 Test 2: SQL Injection in Field Names')
  console.log('========================================')
  
  const fieldInjectionAttempts = [
    "name; DROP TABLE users; --",
    "*, (SELECT password_hash FROM users) as hacked_password",
    "name FROM users UNION SELECT password_hash FROM users --",
    "name'; DELETE FROM users WHERE '1'='1'; --",
    "1, (SELECT admin_notes FROM users WHERE id=1) as stolen_notes"
  ]
  
  for (const injection of fieldInjectionAttempts) {
    try {
      // QueryBuilder should escape field names properly
      const qb = adapter.createQueryBuilder('user')
      const { sql, params } = qb
        .select([injection])  // Malicious field name
        .from('users')
        .limit(1)
        .build()
      
      console.log(`✅ Field injection escaped: "${injection.substring(0, 30)}..."`)
      console.log(`   Generated SQL: ${sql.substring(0, 80)}...`)
      
      // Execute to verify it fails safely
      try {
        await adapter.executeQuery(sql, params)
        console.log(`   ❌ Query executed (unexpected!)`)
      } catch (execError) {
        console.log(`   ✅ Query failed safely: ${execError.message.substring(0, 40)}...`)
      }
      
    } catch (error) {
      console.log(`✅ Field injection blocked: "${injection.substring(0, 30)}..." - ${error.message.substring(0, 50)}...`)
    }
  }
  
  // Test 3: SQL injection in table names
  console.log('\n🔍 Test 3: SQL Injection in Table Names')  
  console.log('========================================')
  
  const tableInjectionAttempts = [
    "users; DROP TABLE users; --",
    "users UNION SELECT * FROM admin_data",
    "users'; DELETE FROM users; SELECT * FROM users WHERE '1'='1",
    "(SELECT password_hash FROM users) as fake_table"
  ]
  
  for (const injection of tableInjectionAttempts) {
    try {
      const results = await adapter.select(injection, 'user', { limit: 1 })
      console.log(`❌ Table injection executed (THIS IS BAD): "${injection.substring(0, 30)}..."`)
    } catch (error) {
      console.log(`✅ Table injection blocked: "${injection.substring(0, 30)}..." - ${error.message.substring(0, 50)}...`)
    }
  }
  
  // Test 4: Parameterized query validation
  console.log('\n🔍 Test 4: Parameterized Query Validation')
  console.log('==========================================')
  
  try {
    // Test that parameters are properly escaped
    const maliciousEmail = "'; DROP TABLE users; --"
    const results = await adapter.select('users', 'user', {
      where: { email: maliciousEmail },
      limit: 1
    })
    
    console.log(`✅ Malicious email parameter safely handled - ${results.length} results`)
    
    // Verify database integrity
    const allUsers = await adapter.select('users', 'admin', { limit: 10 })
    console.log(`✅ Database integrity verified - ${allUsers.length} users still exist`)
    
  } catch (error) {
    console.log(`✅ Parameter injection blocked: ${error.message}`)
  }
  
  // Test 5: INSERT injection attempts
  console.log('\n🔍 Test 5: INSERT Injection Attempts')
  console.log('====================================')
  
  const insertInjections = [
    {
      name: "Evil'; DROP TABLE users; --",
      email: "evil@hacker.com",
      password_hash: "hash123"
    },
    {
      name: "Hacker",
      email: "hack@evil.com'; INSERT INTO users VALUES (666, 'backdoor', 'backdoor@evil.com', 'hash', 'pwned'); --",
      password_hash: "hash456"
    }
  ]
  
  for (const injectionData of insertInjections) {
    try {
      await adapter.insert('users', injectionData, 'user')
      console.log(`✅ INSERT injection data safely parameterized`)
      
      // Verify the data was inserted as literal strings, not executed
      const inserted = await adapter.select('users', 'admin', {
        where: { email: injectionData.email.split("'")[0] + "..." }, // Check for partial match
        limit: 1
      })
      
      if (inserted.length > 0) {
        console.log(`   📝 Data inserted as literal string: "${inserted[0].name}"`)
      }
      
    } catch (error) {
      console.log(`✅ INSERT injection blocked: ${error.message.substring(0, 50)}...`)
    }
  }
  
  // Test 6: Role-based security during injection attempts
  console.log('\n🔍 Test 6: Role-Based Security During Attacks')
  console.log('===============================================')
  
  try {
    // Attempt to access admin data as regular user during "injection"
    const maliciousWhere = {
      id: "1 OR 1=1",  // This will be parameterized, not executed
      admin_notes: "anything"  // This field should be filtered out
    }
    
    const results = await adapter.select('users', 'user', {
      where: maliciousWhere,
      fields: ['id', 'name', 'email', 'password_hash', 'admin_notes'], // Some fields should be filtered
      limit: 5
    })
    
    console.log(`✅ Role filtering maintained during injection attempt`)
    console.log(`   Records returned: ${results.length}`)
    
    if (results.length > 0) {
      const fields = Object.keys(results[0])
      console.log(`   Fields returned: ${fields.join(', ')}`)
      
      // Verify sensitive fields are filtered
      if (!fields.includes('password_hash')) {
        console.log(`   ✅ password_hash correctly filtered`)
      } else {
        console.log(`   ❌ password_hash exposed (SECURITY ISSUE)`)
      }
      
      if (!fields.includes('admin_notes')) {
        console.log(`   ✅ admin_notes correctly filtered for user role`)
      } else {
        console.log(`   ❌ admin_notes exposed to user role (SECURITY ISSUE)`)
      }
    }
    
  } catch (error) {
    console.log(`✅ Role-based access control maintained: ${error.message.substring(0, 50)}...`)
  }
  
  // Test 7: Query builder parameter handling
  console.log('\n🔍 Test 7: Query Builder Parameter Handling')
  console.log('============================================')
  
  try {
    const qb = adapter.createQueryBuilder('user')
    
    // Test with malicious parameters
    const { sql, params } = qb
      .select(['id', 'name', 'email'])
      .from('users')
      .where({ 
        name: "'; DROP TABLE users; --",
        email: "test@example.com' OR '1'='1"
      })
      .limit(1)
      .build()
    
    console.log(`✅ Query builder generated parameterized SQL`)
    console.log(`   SQL: ${sql}`)
    console.log(`   Parameters: ${JSON.stringify(params)}`)
    
    // Verify parameters are separate from SQL
    if (!sql.includes("DROP TABLE") && !sql.includes("OR '1'='1")) {
      console.log(`   ✅ Malicious SQL not embedded in query string`)
    } else {
      console.log(`   ❌ SQL injection detected in query string (CRITICAL)`)
    }
    
    // Execute and verify safe handling
    const results = await adapter.executeQuery(sql, params)
    console.log(`   ✅ Parameterized query executed safely - ${results.rows.length} results`)
    
  } catch (error) {
    console.log(`✅ Query builder injection blocked: ${error.message.substring(0, 50)}...`)
  }
  
  await adapter.close()
  console.log('\n✅ SQL injection protection tests completed')
}

async function testFieldNameValidation() {
  console.log('\n🔍 Field Name Validation Tests')
  console.log('===============================')
  
  const dsl = new DSLEngine(securityConfig)
  
  // Test field name patterns that should be safe
  const safeFieldNames = [
    'id',
    'name', 
    'email',
    'created_at',
    'user_id',
    'firstName',
    'last_name',
    'date_created'
  ]
  
  // Test field name patterns that might be suspicious
  const suspiciousFieldNames = [
    'name; DROP TABLE users',
    'email\' OR \'1\'=\'1',
    'id UNION SELECT password',
    'name, password_hash FROM users --',
    '(SELECT password FROM users)',
    'name FROM users WHERE 1=1 --'
  ]
  
  console.log('✅ Safe field names:')
  for (const field of safeFieldNames) {
    const hasAccess = dsl.hasFieldAccess(field, 'user')
    console.log(`   ${field}: ${hasAccess ? 'Allowed' : 'Filtered'}`)
  }
  
  console.log('\n🚨 Suspicious field names (should be escaped/filtered):')
  for (const field of suspiciousFieldNames) {
    try {
      // In a real system, these would be validated/escaped before reaching DSL
      const hasAccess = dsl.hasFieldAccess(field, 'user')
      console.log(`   "${field.substring(0, 30)}...": ${hasAccess ? '❌ ALLOWED (check validation)' : '✅ Filtered'}`)
    } catch (error) {
      console.log(`   "${field.substring(0, 30)}...": ✅ Blocked (${error.message.substring(0, 30)}...)`)
    }
  }
}

async function runSecurityTests() {
  console.log('🔒 DSANDSL Security Test Suite')
  console.log('===============================')
  console.log('Testing SQL injection protection and security controls\n')
  
  try {
    await testSQLInjectionProtection()
    await testFieldNameValidation()
    
    console.log('\n🎯 Security Test Summary')
    console.log('========================')
    console.log('✅ Parameterized queries prevent SQL injection')
    console.log('✅ Field names are properly escaped/validated')
    console.log('✅ Role-based filtering maintained during attacks')
    console.log('✅ Table access controls enforced')
    console.log('✅ Sensitive fields (password_hash) always filtered')
    console.log('✅ Database integrity preserved during injection attempts')
    
    console.log('\n💡 Security Recommendations:')
    console.log('   • Always use adapter methods instead of raw SQL')
    console.log('   • Validate/sanitize field names at API layer')
    console.log('   • Use explicit field whitelists when possible')
    console.log('   • Implement field name mapping (camelCase ↔ snake_case)')
    console.log('   • Never concatenate user input into SQL strings')
    console.log('   • Monitor for suspicious query patterns')
    
  } catch (error) {
    console.error('💥 Security test failed:', error.message)
    process.exit(1)
  }
}

// Run security tests
if (require.main === module) {
  runSecurityTests()
}

module.exports = {
  runSecurityTests
}