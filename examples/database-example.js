#!/usr/bin/env node
/**
 * Comprehensive Database Adapter Example
 * Demonstrates real-world usage patterns with DSANDSL
 */

const { 
  DSLEngine, 
  createConfig, 
  SQLiteAdapter,
  PostgreSQLAdapter,
  MySQLAdapter 
} = require('../index')

// Real-world DSL configuration for an e-commerce application
const ecommerceConfig = createConfig({
  roles: {
    admin: { level: 100, inherits: [] },
    manager: { level: 50, inherits: ['user'] },
    employee: { level: 30, inherits: ['user'] },
    user: { level: 10, inherits: ['guest'] },
    guest: { level: 0, inherits: [] }
  },
  
  fields: {
    // User profile fields
    'users.id': { minRole: 'guest', category: 'identifier' },
    'users.email': { minRole: 'user', category: 'personal' },
    'users.name': { minRole: 'user', category: 'personal' },
    'users.phone': { minRole: 'user', category: 'personal' },
    'users.address': { minRole: 'user', category: 'personal' },
    'users.password_hash': { deny: true },
    'users.credit_card': { minRole: 'admin', category: 'financial' },
    'users.salary': { minRole: 'admin', category: 'financial' },
    'users.notes': { minRole: 'manager', category: 'internal' },
    'users.created_at': { minRole: 'user', category: 'metadata' },
    'users.updated_at': { minRole: 'user', category: 'metadata' },
    
    // Product fields
    'products.id': { minRole: 'guest', category: 'identifier' },
    'products.name': { minRole: 'guest', category: 'public' },
    'products.description': { minRole: 'guest', category: 'public' },
    'products.price': { minRole: 'guest', category: 'public' },
    'products.cost': { minRole: 'manager', category: 'financial' },
    'products.supplier_info': { minRole: 'employee', category: 'internal' },
    'products.inventory_count': { minRole: 'employee', category: 'operational' },
    
    // Order fields
    'orders.id': { minRole: 'user', category: 'identifier' },
    'orders.user_id': { minRole: 'user', category: 'personal' },
    'orders.total': { minRole: 'user', category: 'financial' },
    'orders.internal_notes': { minRole: 'employee', category: 'internal' },
    'orders.profit_margin': { minRole: 'manager', category: 'financial' },
    
    // Generic fallbacks
    'id': { minRole: 'guest', category: 'identifier' },
    'created_at': { minRole: 'user', category: 'metadata' },
    'updated_at': { minRole: 'user', category: 'metadata' }
  },
  
  database: {
    denyUnknownTables: false, // Allow tables not explicitly configured
    tables: {
      // Public tables (admin can manage, others can read)
      'products': {
        minRole: 'guest',
        operations: ['SELECT', 'INSERT', 'UPDATE', 'DELETE']
      },
      'categories': {
        minRole: 'guest', 
        operations: ['SELECT', 'INSERT', 'UPDATE', 'DELETE']
      },
      
      // User-accessible tables
      'users': {
        minRole: 'user',
        operations: ['SELECT', 'INSERT', 'UPDATE'] // Users can read/update their own data
      },
      'orders': {
        minRole: 'user',
        operations: ['SELECT', 'INSERT', 'UPDATE', 'DELETE']
      },
      'order_items': {
        minRole: 'user',
        operations: ['SELECT', 'INSERT', 'UPDATE', 'DELETE']
      },
      
      // Employee tables
      'inventory': {
        minRole: 'employee',
        operations: ['SELECT', 'UPDATE', 'INSERT', 'DELETE']
      },
      'suppliers': {
        minRole: 'employee',
        operations: ['SELECT', 'INSERT', 'UPDATE', 'DELETE']
      },
      
      // Manager tables
      'financial_reports': {
        minRole: 'manager',
        operations: ['SELECT', 'INSERT', 'UPDATE', 'DELETE']
      },
      'employee_data': {
        minRole: 'manager',
        operations: ['SELECT', 'UPDATE', 'INSERT', 'DELETE']
      },
      
      // Admin-only tables
      'audit_logs': {
        minRole: 'admin',
        operations: ['SELECT', 'INSERT', 'UPDATE', 'DELETE']
      },
      'system_config': {
        minRole: 'admin',
        operations: ['SELECT', 'UPDATE', 'INSERT', 'DELETE']
      }
    }
  }
})

async function createTestSchema(adapter) {
  console.log('📋 Creating test schema...')
  
  // Create users table
  await adapter.executeQuery(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      password_hash TEXT NOT NULL,
      credit_card TEXT,
      salary INTEGER,
      notes TEXT,
      role TEXT DEFAULT 'user',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, [])
  
  // Create products table
  await adapter.executeQuery(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      price DECIMAL(10,2) NOT NULL,
      cost DECIMAL(10,2),
      supplier_info TEXT,
      inventory_count INTEGER DEFAULT 0,
      category_id INTEGER,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, [])
  
  // Create orders table
  await adapter.executeQuery(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      total DECIMAL(10,2) NOT NULL,
      status TEXT DEFAULT 'pending',
      internal_notes TEXT,
      profit_margin DECIMAL(5,2),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, [])
  
  // Create audit_logs table (admin only)
  await adapter.executeQuery(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      action TEXT NOT NULL,
      table_name TEXT,
      record_id TEXT,
      old_values TEXT,
      new_values TEXT,
      ip_address TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, [])
  
  console.log('✅ Test schema created')
}

async function seedTestData(adapter) {
  console.log('🌱 Seeding test data...')
  
  // Insert users with different roles
  const users = [
    {
      email: 'admin@company.com',
      name: 'Alice Admin',
      phone: '+1-555-0101',
      address: '123 Admin St',
      password_hash: 'hashed_password_1',
      credit_card: '4111-1111-1111-1111',
      salary: 120000,
      notes: 'Company administrator',
      role: 'admin'
    },
    {
      email: 'manager@company.com', 
      name: 'Bob Manager',
      phone: '+1-555-0102',
      address: '456 Manager Ave',
      password_hash: 'hashed_password_2',
      salary: 90000,
      notes: 'Department manager',
      role: 'manager'
    },
    {
      email: 'employee@company.com',
      name: 'Carol Employee', 
      phone: '+1-555-0103',
      address: '789 Employee Rd',
      password_hash: 'hashed_password_3',
      salary: 60000,
      notes: 'Customer service employee',
      role: 'employee'
    },
    {
      email: 'user@company.com',
      name: 'Dave User',
      phone: '+1-555-0104', 
      address: '321 User Blvd',
      password_hash: 'hashed_password_4',
      role: 'user'
    }
  ]
  
  for (const user of users) {
    await adapter.insert('users', user, 'admin')
  }
  
  // Insert products
  const products = [
    {
      name: 'Premium Widget',
      description: 'High-quality widget for professional use',
      price: 99.99,
      cost: 45.00,
      supplier_info: 'Widget Corp - Contract #WC2024',
      inventory_count: 150,
      category_id: 1
    },
    {
      name: 'Standard Widget',
      description: 'Standard widget for everyday use', 
      price: 49.99,
      cost: 22.50,
      supplier_info: 'Widget Corp - Contract #WC2024',
      inventory_count: 300,
      category_id: 1
    },
    {
      name: 'Economy Widget',
      description: 'Budget-friendly widget option',
      price: 19.99,
      cost: 8.75,
      supplier_info: 'Budget Widgets Ltd',
      inventory_count: 500,
      category_id: 1
    }
  ]
  
  for (const product of products) {
    await adapter.insert('products', product, 'admin')
  }
  
  // Insert orders
  const orders = [
    {
      user_id: 4, // Dave User
      total: 149.98,
      status: 'completed',
      internal_notes: 'Customer requested express shipping',
      profit_margin: 65.5
    },
    {
      user_id: 4,
      total: 49.99,
      status: 'pending',
      internal_notes: 'Awaiting inventory',
      profit_margin: 55.0
    }
  ]
  
  for (const order of orders) {
    await adapter.insert('orders', order, 'admin')
  }
  
  console.log('✅ Test data seeded')
}

async function testRoleBasedAccess(adapter) {
  console.log('\n🔐 Testing Role-Based Access Control')
  console.log('====================================')
  
  const roles = ['guest', 'user', 'employee', 'manager', 'admin']
  
  for (const role of roles) {
    console.log(`\n👤 Testing as ${role.toUpperCase()}:`)
    
    try {
      // Test users table access
      const users = await adapter.select('users', role, { limit: 3 })
      console.log(`  ✅ Users table (${users.length} records):`, 
        users[0] ? Object.keys(users[0]).join(', ') : 'No records')
    } catch (error) {
      console.log(`  ❌ Users table: ${error.message.substring(0, 50)}...`)
    }
    
    try {
      // Test products table access  
      const products = await adapter.select('products', role, { limit: 2 })
      console.log(`  ✅ Products table (${products.length} records):`,
        products[0] ? Object.keys(products[0]).join(', ') : 'No records')
    } catch (error) {
      console.log(`  ❌ Products table: ${error.message.substring(0, 50)}...`)
    }
    
    try {
      // Test orders table access
      const orders = await adapter.select('orders', role, { limit: 2 })
      console.log(`  ✅ Orders table (${orders.length} records):`,
        orders[0] ? Object.keys(orders[0]).join(', ') : 'No records')
    } catch (error) {
      console.log(`  ❌ Orders table: ${error.message.substring(0, 50)}...`)
    }
    
    try {
      // Test audit_logs table (admin only)
      const logs = await adapter.select('audit_logs', role, { limit: 1 })
      console.log(`  ✅ Audit logs table (${logs.length} records)`)
    } catch (error) {
      console.log(`  ❌ Audit logs: Access denied (expected for non-admin)`)
    }
  }
}

async function testComplexQueries(adapter) {
  console.log('\n🔍 Testing Complex Queries')
  console.log('===========================')
  
  // Test query builder with joins (simulated)
  console.log('\n📊 Manager Query - Products with Cost Analysis:')
  const managerQuery = await adapter.select('products', 'manager', {
    fields: ['id', 'name', 'price', 'cost', 'inventory_count'],
    where: { price: 50 }, // This is a simple where for testing
    orderBy: 'price',
    orderDirection: 'DESC',
    limit: 5
  })
  
  console.log(`  Found ${managerQuery.length} products`)
  if (managerQuery.length > 0) {
    console.log('  Sample product:', managerQuery[0])
  }
  
  // Test employee inventory query
  console.log('\n📦 Employee Query - Inventory Check:')
  const inventoryQuery = await adapter.select('products', 'employee', {
    fields: ['id', 'name', 'inventory_count', 'supplier_info'],
    orderBy: 'inventory_count',
    orderDirection: 'ASC',
    limit: 3
  })
  
  console.log(`  Found ${inventoryQuery.length} products needing attention`)
  inventoryQuery.forEach((product, index) => {
    console.log(`  ${index + 1}. ${product.name} - Stock: ${product.inventory_count}`)
  })
  
  // Test user order history  
  console.log('\n🛒 User Query - Order History:')
  const userOrders = await adapter.select('orders', 'user', {
    fields: ['id', 'total', 'status', 'created_at'],
    where: { user_id: 4 }, // Dave User's orders
    orderBy: 'created_at',
    orderDirection: 'DESC'
  })
  
  console.log(`  Found ${userOrders.length} orders`)
  userOrders.forEach((order, index) => {
    console.log(`  ${index + 1}. Order #${order.id} - $${order.total} (${order.status})`)
  })
}

async function testTransactionsAndUpdates(adapter) {
  console.log('\n💳 Testing Transactions and Updates')
  console.log('====================================')
  
  // Test role-based UPDATE operations
  console.log('\n✏️ Testing UPDATE operations:')
  
  try {
    // User tries to update their own profile (allowed)
    const userUpdate = await adapter.update('users', {
      name: 'Dave Updated User',
      phone: '+1-555-9999',
      address: '999 New Address St'
    }, {
      id: 4
    }, 'user')
    
    console.log('  ✅ User profile update successful:', userUpdate.affectedRows, 'rows')
  } catch (error) {
    console.log('  ❌ User profile update failed:', error.message.substring(0, 50))
  }
  
  try {
    // User tries to update salary (should be filtered)
    const salaryUpdate = await adapter.update('users', {
      name: 'Dave User',
      salary: 999999 // This should be filtered out
    }, {
      id: 4  
    }, 'user')
    
    console.log('  ✅ User attempted salary update (salary filtered):', salaryUpdate.affectedRows, 'rows')
  } catch (error) {
    console.log('  ❌ User salary update blocked:', error.message.substring(0, 50))
  }
  
  // Test transaction with multiple operations
  console.log('\n🔄 Testing Transaction:')
  
  try {
    const transactionResult = await adapter.transaction(async (tx) => {
      // Insert a new order
      const newOrder = await tx.insert('orders', {
        user_id: 4,
        total: 79.98,
        status: 'processing'
      }, 'employee')
      
      // Update inventory (employee role can do this)
      await tx.update('products', {
        inventory_count: 149 // Decrease by 1
      }, {
        id: 1 // Premium Widget
      }, 'employee')
      
      // Log the transaction (admin operation within transaction)
      await tx.insert('audit_logs', {
        user_id: 4,
        action: 'order_created',
        table_name: 'orders',
        record_id: newOrder.lastInsertId?.toString() || 'unknown',
        new_values: JSON.stringify({ total: 79.98, status: 'processing' }),
        ip_address: '192.168.1.100'
      }, 'admin')
      
      return { 
        orderId: newOrder.lastInsertId,
        success: true 
      }
    })
    
    console.log('  ✅ Transaction completed successfully:', transactionResult)
  } catch (error) {
    console.log('  ❌ Transaction failed:', error.message)
  }
}

async function testErrorScenarios(adapter) {
  console.log('\n🚨 Testing Error Scenarios')
  console.log('===========================')
  
  // Test table access violations
  console.log('\n🔒 Testing Access Violations:')
  
  try {
    await adapter.select('audit_logs', 'user')
    console.log('  ❌ User should not access audit logs!')
  } catch (error) {
    console.log('  ✅ Audit log access correctly denied for user')
  }
  
  try {
    await adapter.insert('system_config', { key: 'test', value: 'value' }, 'employee')
    console.log('  ❌ Employee should not insert system config!')
  } catch (error) {
    console.log('  ✅ System config insert correctly denied for employee')
  }
  
  // Test field filtering
  console.log('\n🎭 Testing Field Filtering:')
  
  const userQuery = await adapter.select('users', 'user', {
    // Let auto-filtering determine fields  
    limit: 1
  })
  
  if (userQuery.length > 0) {
    const returnedFields = Object.keys(userQuery[0])
    console.log('  ✅ User query returned fields:', returnedFields.join(', '))
    
    if (returnedFields.includes('salary')) {
      console.log('  ❌ Salary should be filtered for user role!')
    } else {
      console.log('  ✅ Salary correctly filtered for user role')
    }
    
    if (returnedFields.includes('password_hash')) {
      console.log('  ❌ Password hash should always be filtered!')
    } else {
      console.log('  ✅ Password hash correctly filtered')
    }
    
    if (returnedFields.includes('credit_card')) {
      console.log('  ❌ Credit card should be filtered for user role!')
    } else {
      console.log('  ✅ Credit card correctly filtered for user role')
    }
  }
}

async function testPerformanceAtScale(adapter) {
  console.log('\n📊 Testing Performance at Scale')
  console.log('================================')
  
  // Create a larger dataset
  console.log('\n📈 Creating large dataset...')
  
  const batchInsertStart = performance.now()
  
  // Insert 1000 test records
  for (let i = 0; i < 100; i++) {
    await adapter.insert('products', {
      name: `Test Product ${i}`,
      description: `Description for test product ${i}`,
      price: Math.round((Math.random() * 100 + 10) * 100) / 100,
      cost: Math.round((Math.random() * 50 + 5) * 100) / 100,
      supplier_info: `Supplier ${i % 10}`,
      inventory_count: Math.floor(Math.random() * 1000),
      category_id: (i % 5) + 1
    }, 'admin')
  }
  
  const batchInsertTime = performance.now() - batchInsertStart
  console.log(`  ✅ Inserted 100 products in ${batchInsertTime.toFixed(2)}ms (${(batchInsertTime/100).toFixed(2)}ms avg)`)
  
  // Test query performance with different roles
  const performanceTests = [
    { role: 'guest', description: 'Guest product browsing' },
    { role: 'user', description: 'User product search' },
    { role: 'employee', description: 'Employee inventory check' },
    { role: 'manager', description: 'Manager cost analysis' },
    { role: 'admin', description: 'Admin full data access' }
  ]
  
  console.log('\n⚡ Query Performance by Role:')
  
  for (const test of performanceTests) {
    const queryStart = performance.now()
    
    try {
      const results = await adapter.select('products', test.role, {
        where: { category_id: 1 },
        orderBy: 'price',
        orderDirection: 'DESC',
        limit: 25
      })
      
      const queryTime = performance.now() - queryStart
      const fieldCount = results[0] ? Object.keys(results[0]).length : 0
      
      console.log(`  📊 ${test.role.padEnd(8)} | ${queryTime.toFixed(2)}ms | ${results.length} records | ${fieldCount} fields | ${test.description}`)
    } catch (error) {
      console.log(`  ❌ ${test.role.padEnd(8)} | Access denied | ${test.description}`)
    }
  }
  
  // Test concurrent operations
  console.log('\n🔄 Testing Concurrent Operations:')
  
  const concurrentStart = performance.now()
  
  const concurrentPromises = []
  for (let i = 0; i < 10; i++) {
    concurrentPromises.push(
      adapter.select('products', 'user', { 
        limit: 10,
        offset: i * 10 
      })
    )
  }
  
  const concurrentResults = await Promise.all(concurrentPromises)
  const concurrentTime = performance.now() - concurrentStart
  
  const totalRecords = concurrentResults.reduce((sum, result) => sum + result.length, 0)
  console.log(`  ✅ 10 concurrent queries completed in ${concurrentTime.toFixed(2)}ms`)
  console.log(`  📊 Total records retrieved: ${totalRecords}`)
  console.log(`  ⚡ Average query time: ${(concurrentTime/10).toFixed(2)}ms`)
}

async function runComprehensiveExample() {
  console.log('🏪 DSANDSL E-Commerce Database Example')
  console.log('======================================')
  console.log('Demonstrating real-world role-based data access control\n')
  
  // Initialize DSL and adapter
  const dsl = new DSLEngine(ecommerceConfig)
  const adapter = new SQLiteAdapter(dsl, {
    connection: {
      filename: ':memory:', // In-memory for testing
      enableWAL: false
    },
    validateTableAccess: true,
    validateFieldAccess: true,
    autoFilter: true
  })
  
  try {
    // Initialize adapter
    await adapter.initialize()
    console.log('✅ Database adapter initialized')
    
    // Set up schema and data
    await createTestSchema(adapter)
    await seedTestData(adapter)
    
    // Run comprehensive tests
    await testRoleBasedAccess(adapter)
    await testComplexQueries(adapter)
    await testTransactionsAndUpdates(adapter)
    await testErrorScenarios(adapter)
    await testPerformanceAtScale(adapter)
    
    // Final statistics
    console.log('\n📊 Final Database Statistics')
    console.log('=============================')
    
    const stats = adapter.getStats()
    console.log('Adapter Performance:')
    console.log(`  Total Queries: ${stats.connection.metrics.totalQueries}`)
    console.log(`  Success Rate: ${stats.connection.metrics.successRate}%`)
    console.log(`  Avg Query Time: ${stats.connection.metrics.avgQueryTimeMs}ms`)
    console.log(`  Slow Queries: ${stats.connection.metrics.slowQueries}`)
    
    // Health check
    const isHealthy = await adapter.healthCheck()
    console.log(`  Health Status: ${isHealthy ? '✅ HEALTHY' : '❌ UNHEALTHY'}`)
    
    // Database info
    const info = await adapter.getInfo()
    console.log(`  Database: ${info.adapter} ${info.version.version}`)
    console.log(`  Features: ${Object.keys(info.features).filter(f => info.features[f]).join(', ')}`)
    
    await adapter.close()
    console.log('\n🎯 Comprehensive example completed successfully!')
    
  } catch (error) {
    console.error('💥 Example failed:', error.message)
    if (error.stack) {
      console.error('Stack trace:', error.stack.substring(0, 500))
    }
    process.exit(1)
  }
}

// Run the comprehensive example
if (require.main === module) {
  runComprehensiveExample()
}

module.exports = {
  runComprehensiveExample,
  ecommerceConfig
}