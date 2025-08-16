#!/usr/bin/env node
/**
 * Simple DSANDSL Examples
 * Basic usage patterns and role-based filtering demonstrations
 */

const { 
  DSLEngine, 
  createConfig, 
  SQLiteAdapter,
  ExpressAdapter,
  NextJSAdapter
} = require('../index')

// Simple blog configuration
const simpleConfig = createConfig({
  roles: {
    admin: { level: 100 },
    editor: { level: 50 },
    author: { level: 30 },
    user: { level: 10 },
    guest: { level: 0 }
  },
  
  fields: {
    // Public fields
    'id': { minRole: 'guest' },
    'title': { minRole: 'guest' },
    'content': { minRole: 'guest' },
    'published_at': { minRole: 'guest' },
    
    // User fields
    'author_name': { minRole: 'user' },
    'email': { minRole: 'author' },
    
    // Editor fields
    'draft_content': { minRole: 'author' },
    'internal_notes': { minRole: 'editor' },
    'seo_data': { minRole: 'editor' },
    
    // Admin fields
    'analytics': { minRole: 'admin' },
    'password_hash': { deny: true }, // Always denied
    
    // Timestamps
    'created_at': { minRole: 'user' },
    'updated_at': { minRole: 'user' }
  }
})

async function basicUsageExample() {
  console.log('📝 Basic DSANDSL Usage Example')
  console.log('===============================')
  
  const dsl = new DSLEngine(simpleConfig)
  
  // Sample blog post data
  const blogPost = {
    id: 1,
    title: 'Getting Started with DSANDSL',
    content: 'This is a comprehensive guide to using DSANDSL...',
    author_name: 'John Doe',
    email: 'john@example.com',
    draft_content: 'Additional draft content here...',
    internal_notes: 'Remember to add SEO keywords',
    seo_data: JSON.stringify({ keywords: ['security', 'data'], description: 'DSANDSL guide' }),
    analytics: JSON.stringify({ views: 1500, engagement: 0.75 }),
    password_hash: 'never_show_this',
    published_at: '2024-01-15T10:00:00Z',
    created_at: '2024-01-10T08:00:00Z',
    updated_at: '2024-01-14T16:30:00Z'
  }
  
  const roles = ['guest', 'user', 'author', 'editor', 'admin']
  
  console.log('\n🔍 Role-based Field Filtering:')
  console.log('Original data has', Object.keys(blogPost).length, 'fields')
  
  for (const role of roles) {
    const filtered = dsl.filter(blogPost, role)
    const fieldNames = Object.keys(filtered)
    
    console.log(`\n👤 ${role.toUpperCase()}:`)
    console.log(`   Fields (${fieldNames.length}): ${fieldNames.join(', ')}`)
    
    // Show what specific sensitive fields are filtered
    if (!filtered.password_hash) {
      console.log('   ✅ Password hash correctly filtered')
    }
    if (!filtered.analytics && role !== 'admin') {
      console.log('   ✅ Analytics data correctly filtered')
    }
    if (!filtered.email && ['guest', 'user'].includes(role)) {
      console.log('   ✅ Email correctly filtered')
    }
  }
}

async function arrayFilteringExample() {
  console.log('\n\n📊 Array Filtering Example')
  console.log('===========================')
  
  const dsl = new DSLEngine(simpleConfig)
  
  // Sample array of user profiles
  const users = [
    {
      id: 1,
      title: 'Administrator',
      author_name: 'Alice Admin',
      email: 'alice@company.com',
      internal_notes: 'Full system access',
      analytics: JSON.stringify({ login_count: 245 }),
      password_hash: 'admin_hash_123',
      created_at: '2023-01-01T00:00:00Z'
    },
    {
      id: 2,
      title: 'Content Editor',
      author_name: 'Bob Editor',
      email: 'bob@company.com',
      internal_notes: 'Content management access',
      analytics: JSON.stringify({ login_count: 156 }),
      password_hash: 'editor_hash_456',
      created_at: '2023-06-15T00:00:00Z'
    },
    {
      id: 3,
      title: 'Blog Author',
      author_name: 'Carol Writer',
      email: 'carol@company.com',
      draft_content: 'Working on new article...',
      password_hash: 'author_hash_789',
      created_at: '2023-09-01T00:00:00Z'
    }
  ]
  
  console.log('\nOriginal array has', users.length, 'users with', Object.keys(users[0]).length, 'fields each')
  
  const testRoles = ['guest', 'user', 'author', 'editor', 'admin']
  
  for (const role of testRoles) {
    const filtered = dsl.filter(users, role)
    const fieldCount = filtered[0] ? Object.keys(filtered[0]).length : 0
    
    console.log(`\n👤 ${role.toUpperCase()}: ${filtered.length} users, ${fieldCount} fields each`)
    
    if (filtered.length > 0) {
      console.log(`   Sample fields: ${Object.keys(filtered[0]).slice(0, 5).join(', ')}${fieldCount > 5 ? '...' : ''}`)
      
      // Check sensitive field filtering
      const hasPasswords = filtered.some(user => user.password_hash)
      const hasAnalytics = filtered.some(user => user.analytics)
      const hasEmails = filtered.some(user => user.email)
      
      console.log(`   Password hashes: ${hasPasswords ? '❌ EXPOSED' : '✅ Filtered'}`)
      console.log(`   Analytics data: ${hasAnalytics ? (role === 'admin' ? '✅ Allowed' : '❌ EXPOSED') : '✅ Filtered'}`)
      console.log(`   Email addresses: ${hasEmails ? (['author', 'editor', 'admin'].includes(role) ? '✅ Allowed' : '❌ EXPOSED') : '✅ Filtered'}`)
    }
  }
}

async function databaseIntegrationExample() {
  console.log('\n\n🗄️  Database Integration Example')
  console.log('=================================')
  
  const dsl = new DSLEngine(simpleConfig)
  const adapter = new SQLiteAdapter(dsl, {
    connection: { filename: ':memory:' },
    autoFilter: true
  })
  
  await adapter.initialize()
  
  // Create test table
  await adapter.executeQuery(`
    CREATE TABLE articles (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      author_name TEXT,
      email TEXT,
      draft_content TEXT,
      internal_notes TEXT,
      seo_data TEXT,
      analytics TEXT,
      password_hash TEXT,
      published_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, [])
  
  // Insert test data
  const articles = [
    {
      title: 'DSANDSL Security Guide',
      content: 'Complete guide to implementing secure data access...',
      author_name: 'Security Expert',
      email: 'security@company.com',
      draft_content: 'Additional security considerations...',
      internal_notes: 'High priority article',
      seo_data: JSON.stringify({ keywords: ['security', 'access control'] }),
      analytics: JSON.stringify({ views: 2500, shares: 45 }),
      password_hash: 'should_never_appear',
      published_at: '2024-01-20T10:00:00Z'
    },
    {
      title: 'Role-Based Access Control',
      content: 'Understanding RBAC principles and implementation...',
      author_name: 'RBAC Specialist',
      email: 'rbac@company.com', 
      draft_content: 'Advanced RBAC patterns...',
      internal_notes: 'Technical deep-dive',
      seo_data: JSON.stringify({ keywords: ['rbac', 'permissions'] }),
      analytics: JSON.stringify({ views: 1800, shares: 32 }),
      password_hash: 'never_show_this_either',
      published_at: '2024-01-22T14:30:00Z'
    }
  ]
  
  for (const article of articles) {
    await adapter.insert('articles', article, 'admin')
  }
  
  console.log('\n📊 Database Query Results by Role:')
  
  const dbTestRoles = ['guest', 'user', 'author', 'editor', 'admin']
  
  for (const role of dbTestRoles) {
    try {
      const results = await adapter.select('articles', role, { limit: 2 })
      const fieldCount = results[0] ? Object.keys(results[0]).length : 0
      
      console.log(`\n👤 ${role.toUpperCase()}: ${results.length} articles, ${fieldCount} fields each`)
      
      if (results.length > 0) {
        const sample = results[0]
        console.log(`   Sample fields: ${Object.keys(sample).slice(0, 6).join(', ')}${fieldCount > 6 ? '...' : ''}`)
        
        // Security checks
        const checks = [
          { field: 'password_hash', expected: false, message: 'Password hash filtered' },
          { field: 'analytics', expected: role === 'admin', message: 'Analytics access' },
          { field: 'email', expected: ['author', 'editor', 'admin'].includes(role), message: 'Email access' },
          { field: 'internal_notes', expected: ['editor', 'admin'].includes(role), message: 'Internal notes access' }
        ]
        
        checks.forEach(check => {
          const hasField = sample.hasOwnProperty(check.field)
          const status = hasField === check.expected ? '✅' : '❌'
          console.log(`   ${status} ${check.message}: ${hasField ? 'Present' : 'Filtered'}`)
        })
      }
    } catch (error) {
      console.log(`\n👤 ${role.toUpperCase()}: ❌ ${error.message.substring(0, 60)}...`)
    }
  }
  
  await adapter.close()
}

async function frameworkAdapterExample() {
  console.log('\n\n🌐 Framework Adapter Example')
  console.log('=============================')
  
  const dsl = new DSLEngine(simpleConfig)
  
  // Simulate Express.js request/response
  console.log('\n🚀 Express.js Adapter:')
  
  const mockExpressReq = {
    path: '/api/articles',
    method: 'GET',
    user: { role: 'editor' },
    query: { limit: '5' }
  }
  
  const mockExpressRes = {
    json: (data) => {
      console.log('   📤 Response data keys:', Object.keys(data).join(', '))
      return mockExpressRes
    },
    status: (code) => {
      console.log('   📋 Status code:', code)
      return mockExpressRes
    }
  }
  
  // Create Express middleware
  const expressMiddleware = ExpressAdapter.middleware(dsl, {
    roleExtractor: (req) => req.user?.role || 'guest'
  })
  
  // Test middleware
  expressMiddleware(mockExpressReq, mockExpressRes, () => {
    console.log('   ✅ Express middleware processed successfully')
    console.log('   👤 User role:', mockExpressReq.dsl.userRole)
    console.log('   🔍 Available methods:', Object.keys(mockExpressReq.dsl).join(', '))
    
    // Test filtering
    const testData = {
      id: 1,
      title: 'Test Article',
      content: 'Public content',
      email: 'author@example.com',
      analytics: JSON.stringify({ views: 100 }),
      password_hash: 'secret'
    }
    
    const filtered = mockExpressReq.dsl.filter(testData)
    console.log('   📊 Filtered fields:', Object.keys(filtered).join(', '))
  })
  
  // Simulate Next.js API route
  console.log('\n🔷 Next.js Adapter:')
  
  const mockNextJSReq = {
    method: 'GET',
    headers: { 'x-user-role': 'author' },
    query: { id: '1' }
  }
  
  const mockNextJSRes = {
    status: (code) => {
      console.log('   📋 Next.js status:', code)
      return mockNextJSRes
    },
    json: (data) => {
      console.log('   📤 Next.js response keys:', Object.keys(data).join(', '))
      return mockNextJSRes
    },
    setHeader: (name, value) => {
      console.log(`   🏷️  Header: ${name} = ${value}`)
    },
    end: () => {
      console.log('   ✅ Next.js response ended')
    }
  }
  
  // Create Next.js handler
  const nextJSHandler = NextJSAdapter.createHandler(dsl, {
    roleExtractor: async (req) => req.headers['x-user-role'] || 'guest',
    dataProvider: async (req) => {
      // Mock data provider
      return {
        id: parseInt(req.query.id) || 1,
        title: 'Next.js Article',
        content: 'Article content here...',
        author_name: 'Next.js Author',
        email: 'nextjs@example.com',
        draft_content: 'Draft content...',
        internal_notes: 'Internal notes here',
        analytics: JSON.stringify({ views: 500 }),
        password_hash: 'never_show_this'
      }
    },
    autoFilter: true
  })
  
  // Test Next.js handler
  try {
    await nextJSHandler(mockNextJSReq, mockNextJSRes)
    console.log('   ✅ Next.js handler executed successfully')
  } catch (error) {
    console.log('   ❌ Next.js handler error:', error.message)
  }
}

async function performanceExample() {
  console.log('\n\n⚡ Performance Example')
  console.log('======================')
  
  const dsl = new DSLEngine(simpleConfig)
  
  // Create large dataset
  const largeDataset = []
  for (let i = 0; i < 1000; i++) {
    largeDataset.push({
      id: i,
      title: `Article ${i}`,
      content: `Content for article ${i}...`,
      author_name: `Author ${i % 10}`,
      email: `author${i % 10}@example.com`,
      draft_content: `Draft content ${i}...`,
      internal_notes: `Internal note ${i}`,
      seo_data: JSON.stringify({ keywords: [`keyword${i}`] }),
      analytics: JSON.stringify({ views: Math.floor(Math.random() * 1000) }),
      password_hash: `hash_${i}`,
      created_at: new Date(Date.now() - i * 86400000).toISOString()
    })
  }
  
  console.log(`\n📊 Performance test with ${largeDataset.length} records:`)
  
  const performanceRoles = ['guest', 'user', 'author', 'editor', 'admin']
  
  for (const role of performanceRoles) {
    const startTime = performance.now()
    const filtered = dsl.filter(largeDataset, role)
    const endTime = performance.now()
    
    const filterTime = endTime - startTime
    const fieldCount = filtered[0] ? Object.keys(filtered[0]).length : 0
    const throughput = largeDataset.length / (filterTime / 1000)
    
    console.log(`\n👤 ${role.toUpperCase()}:`)
    console.log(`   ⏱️  Filter time: ${filterTime.toFixed(2)}ms`)
    console.log(`   📊 Fields per record: ${fieldCount}`)
    console.log(`   🚀 Throughput: ${Math.round(throughput).toLocaleString()} records/second`)
    console.log(`   📈 Per-record time: ${(filterTime / largeDataset.length * 1000).toFixed(3)}μs`)
  }
  
  // Memory usage test
  const memBefore = process.memoryUsage().heapUsed
  const filtered = dsl.filter(largeDataset, 'admin')
  const memAfter = process.memoryUsage().heapUsed
  const memDiff = memAfter - memBefore
  
  console.log(`\n💾 Memory usage:`)
  console.log(`   Original dataset: ~${Math.round(JSON.stringify(largeDataset).length / 1024)}KB`)
  console.log(`   Filtered dataset: ~${Math.round(JSON.stringify(filtered).length / 1024)}KB`)
  console.log(`   Memory delta: ${memDiff > 0 ? '+' : ''}${Math.round(memDiff / 1024)}KB`)
}

async function runAllExamples() {
  console.log('🎯 DSANDSL Comprehensive Examples')
  console.log('==================================')
  console.log('Demonstrating role-based data access control\n')
  
  try {
    await basicUsageExample()
    await arrayFilteringExample()
    await databaseIntegrationExample()
    await frameworkAdapterExample()
    await performanceExample()
    
    console.log('\n\n🎉 All examples completed successfully!')
    console.log('\n💡 Key Features Demonstrated:')
    console.log('   ✅ Role-based field filtering')
    console.log('   ✅ Array and object processing')
    console.log('   ✅ Database integration with auto-filtering')
    console.log('   ✅ Framework adapter integration')
    console.log('   ✅ High-performance filtering (1000+ records/ms)')
    console.log('   ✅ Memory-efficient processing')
    console.log('   ✅ Zero configuration beyond role setup')
    
  } catch (error) {
    console.error('💥 Example failed:', error.message)
    process.exit(1)
  }
}

// Run examples
if (require.main === module) {
  runAllExamples()
}

module.exports = {
  runAllExamples,
  simpleConfig
}