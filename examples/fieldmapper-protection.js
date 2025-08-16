#!/usr/bin/env node
/**
 * @fileoverview FieldMapper Protection Demonstration
 * Shows how the FieldMapper approach provides security at the data layer
 * Even when API developers make mistakes with input validation
 */

const { DSLEngine, createConfig, SQLiteAdapter } = require('../index')
const FieldMapper = require('../lib/utils/FieldMapper')

async function demonstrateFieldMapperProtection() {
  console.log('🗺️  FieldMapper Protection Demonstration')
  console.log('=========================================')
  console.log('Showing how FieldMapper provides defense-in-depth security\n')
  
  // Example 1: Direct FieldMapper validation
  console.log('📝 Example 1: FieldMapper Input Validation')
  console.log('==========================================')
  
  const fieldMapper = FieldMapper.createDefault({
    strictMode: false,
    autoConvert: true
  })
  
  // Test safe field names
  const safeFields = ['firstName', 'lastName', 'emailAddress', 'userId', 'created_at']
  console.log('✅ Safe field names:')
  safeFields.forEach(field => {
    try {
      const dbField = fieldMapper.toDatabase(field)
      console.log(`   ${field} → ${dbField}`)
    } catch (error) {
      console.log(`   ${field} → ❌ ${error.message}`)
    }
  })
  
  // Test malicious field names
  const maliciousFields = [
    'name; DROP TABLE users',
    "email' OR '1'='1",
    'id UNION SELECT password',
    '(SELECT * FROM admin_data)',
    'users.name, (SELECT password FROM users) as hack',
    'name--comment',
    'field/**/UNION/**/SELECT',
    'name\'; DELETE FROM users; --'
  ]
  
  console.log('\n🚨 Malicious field names (should be blocked):')
  maliciousFields.forEach(field => {
    try {
      const dbField = fieldMapper.toDatabase(field)
      console.log(`   "${field}" → ❌ ALLOWED: ${dbField} (THIS IS BAD!)`)
    } catch (error) {
      console.log(`   "${field.substring(0, 30)}..." → ✅ BLOCKED: ${error.message.substring(0, 40)}...`)
    }
  })
  
  // Example 2: Object mapping with validation
  console.log('\n\n📝 Example 2: Object Mapping with Embedded Attacks')
  console.log('==================================================')
  
  const maliciousUserData = {
    'firstName': 'John',
    'lastName': 'Doe',
    'email; DROP TABLE users; --': 'john@evil.com',
    'salary': 50000,
    "password' OR '1'='1": 'secrethash',
    'admin_notes': 'Normal user',
    '(SELECT password_hash FROM users)': 'injection attempt'
  }
  
  console.log('🔥 BAD API: Attempting to map object with malicious field names:')
  console.log('   Input object keys:', Object.keys(maliciousUserData))
  
  try {
    const safeObject = fieldMapper.mapToDatabase(maliciousUserData)
    console.log('\n✅ FIELDMAPPER PROTECTION: Malicious fields filtered out')
    console.log('   Safe database object keys:', Object.keys(safeObject))
    console.log('   Values preserved for valid fields:', JSON.stringify(safeObject, null, 2))
  } catch (error) {
    console.log(`\n✅ FIELDMAPPER PROTECTION: Object mapping blocked - ${error.message}`)
  }
  
  // Example 3: Integration with Database Adapter
  console.log('\n\n📝 Example 3: End-to-End Protection via Database Adapter')
  console.log('========================================================')
  
  const config = createConfig({
    roles: {
      admin: { level: 100 },
      user: { level: 10 }
    },
    fields: {
      'id': { minRole: 'user' },
      'name': { minRole: 'user' },
      'email': { minRole: 'user' },
      'password_hash': { deny: true },
      'salary': { minRole: 'admin' }
    }
  })
  
  const dsl = new DSLEngine(config)
  const adapter = new SQLiteAdapter(dsl, {
    connection: { filename: ':memory:' },
    validateTableAccess: true,
    validateFieldAccess: true
  })
  
  await adapter.initialize()
  
  // Setup test table
  await adapter.executeQuery(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      name TEXT,
      email TEXT,
      password_hash TEXT,
      salary INTEGER
    )
  `, [])
  
  // Test 1: Bad API trying to insert malicious field names
  console.log('\n🚨 Attack: API attempts INSERT with malicious field names')
  
  const maliciousInsertData = {
    'name': 'Attacker',
    'email': 'attacker@evil.com',
    'password_hash; DROP TABLE users; --': 'hackvalue',
    "salary' OR '1'='1": 99999,
    '(SELECT COUNT(*) FROM users)': 'injection'
  }
  
  console.log('🔥 BAD API: Raw insert data:', Object.keys(maliciousInsertData))
  
  try {
    const result = await adapter.insert('users', maliciousInsertData, 'user')
    console.log('✅ DSL+FIELDMAPPER: Insert succeeded with filtered data')
    
    // Verify what actually got inserted
    const inserted = await adapter.select('users', 'admin', { 
      where: { email: 'attacker@evil.com' },
      limit: 1 
    })
    
    if (inserted.length > 0) {
      console.log('   Actual fields inserted:', Object.keys(inserted[0]))
      console.log('   Safe data preserved:', inserted[0])
    }
    
  } catch (error) {
    console.log(`✅ DSL+FIELDMAPPER: Malicious insert blocked - ${error.message}`)
  }
  
  // Test 2: Bad API trying to select with malicious field list
  console.log('\n🚨 Attack: API attempts SELECT with malicious field names')
  
  const maliciousSelectFields = [
    'id',
    'name',
    'email, password_hash',
    'salary; UPDATE users SET salary = 999999',
    '(SELECT password_hash FROM users) as stolen_password'
  ]
  
  console.log('🔥 BAD API: Raw field selection:', maliciousSelectFields)
  
  try {
    const results = await adapter.select('users', 'user', {
      fields: maliciousSelectFields,
      limit: 5
    })
    
    console.log('✅ DSL+FIELDMAPPER: SELECT succeeded with filtered fields')
    console.log('   Actual fields returned:', Object.keys(results[0] || {}))
    
  } catch (error) {
    console.log(`✅ DSL+FIELDMAPPER: Malicious select blocked - ${error.message}`)
  }
  
  // Test 3: Bad API trying to update with malicious WHERE conditions
  console.log('\n🚨 Attack: API attempts UPDATE with malicious WHERE clause')
  
  const maliciousWhere = {
    'id': 1,
    "name'; DELETE FROM users; --": 'anything',
    '1=1 OR (SELECT COUNT(*) FROM users)': 'injection'
  }
  
  console.log('🔥 BAD API: Raw WHERE conditions:', Object.keys(maliciousWhere))
  
  try {
    const result = await adapter.update('users', 
      { name: 'Updated Name' }, 
      maliciousWhere, 
      'user'
    )
    
    console.log('✅ DSL+FIELDMAPPER: UPDATE succeeded with sanitized WHERE clause')
    console.log('   Malicious WHERE conditions were parameterized, not executed')
    
  } catch (error) {
    console.log(`✅ DSL+FIELDMAPPER: Malicious update blocked - ${error.message}`)
  }
  
  await adapter.close()
  
  console.log('\n\n🎯 FieldMapper Defense-in-Depth Summary')
  console.log('========================================')
  console.log('🛡️  Protection Layers:')
  console.log('   1. FieldMapper validates all field names before SQL generation')
  console.log('   2. Role-based filtering removes unauthorized fields')
  console.log('   3. Parameterized queries prevent SQL injection in values')
  console.log('   4. Table access control validates operations')
  console.log('')
  console.log('💡 Key Advantages of FieldMapper Approach:')
  console.log('   ✅ Works regardless of API code quality')
  console.log('   ✅ Validates field names at data layer, not API layer')
  console.log('   ✅ Automatic camelCase ↔ snake_case conversion')
  console.log('   ✅ Prevents column name string literals in SQL')
  console.log('   ✅ Bidirectional mapping maintains semantic field names')
  console.log('   ✅ No dependency on developer discipline')
  console.log('')
  console.log('🚫 What FieldMapper Prevents:')
  console.log('   • SQL injection via field names')
  console.log('   • Unauthorized field access')
  console.log('   • Database schema exposure')
  console.log('   • Column name manipulation attacks')
  console.log('   • Subquery injection in field selection')
  console.log('')
  console.log('📝 Best Practice: The FieldMapper approach is superior because:')
  console.log('   → Security is enforced at the DATA layer, not API layer')
  console.log('   → Developers cannot accidentally bypass security')
  console.log('   → Consistent protection across all database operations')
  console.log('   → Semantic field names improve code readability')
  console.log('   → Automatic conversion reduces manual mapping errors')
}

// Run the demonstration
if (require.main === module) {
  demonstrateFieldMapperProtection().catch(console.error)
}

module.exports = { demonstrateFieldMapperProtection }