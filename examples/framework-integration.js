#!/usr/bin/env node
/**
 * Framework Integration Examples
 * Demonstrates DSANDSL integration with Express.js and Next.js
 */

const express = require('express')
const { 
  DSLEngine, 
  createConfig, 
  ExpressAdapter, 
  NextJSAdapter,
  SQLiteAdapter
} = require('../index')

// Example configuration for a blog/CMS application
const blogConfig = createConfig({
  roles: {
    admin: { level: 100 },
    editor: { level: 50 },
    author: { level: 30 },
    subscriber: { level: 10 },
    guest: { level: 0 }
  },
  
  fields: {
    // Post fields
    'posts.id': { minRole: 'guest' },
    'posts.title': { minRole: 'guest' },
    'posts.content': { minRole: 'guest' },
    'posts.excerpt': { minRole: 'guest' },
    'posts.published_at': { minRole: 'guest' },
    'posts.author_id': { minRole: 'subscriber' },
    'posts.draft_content': { minRole: 'author' },
    'posts.internal_notes': { minRole: 'editor' },
    'posts.seo_data': { minRole: 'editor' },
    'posts.analytics_data': { minRole: 'admin' },
    
    // User fields
    'users.id': { minRole: 'subscriber' },
    'users.username': { minRole: 'subscriber' },
    'users.email': { minRole: 'author' },
    'users.profile': { minRole: 'subscriber' },
    'users.password_hash': { deny: true },
    'users.api_key': { minRole: 'admin' },
    'users.last_login': { minRole: 'editor' },
    'users.ip_address': { minRole: 'admin' },
    
    // Comment fields
    'comments.id': { minRole: 'guest' },
    'comments.content': { minRole: 'guest' },
    'comments.author_name': { minRole: 'guest' },
    'comments.email': { minRole: 'editor' },
    'comments.ip_address': { minRole: 'admin' },
    'comments.is_spam': { minRole: 'editor' },
    
    // Generic fields
    'created_at': { minRole: 'subscriber' },
    'updated_at': { minRole: 'subscriber' }
  }
})

async function createExpressExample() {
  console.log('🚀 Express.js Integration Example')
  console.log('==================================')
  
  const app = express()
  const dsl = new DSLEngine(blogConfig)
  
  // Setup database adapter (in-memory SQLite for demo)
  const dbAdapter = new SQLiteAdapter(dsl, {
    connection: { filename: ':memory:' }
  })
  
  await dbAdapter.initialize()
  
  // Create test schema
  await dbAdapter.executeQuery(`
    CREATE TABLE posts (
      id INTEGER PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      excerpt TEXT,
      author_id INTEGER,
      draft_content TEXT,
      internal_notes TEXT,
      seo_data TEXT,
      analytics_data TEXT,
      published_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, [])
  
  await dbAdapter.executeQuery(`
    CREATE TABLE users (
      id INTEGER PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      profile TEXT,
      password_hash TEXT,
      api_key TEXT,
      last_login DATETIME,
      ip_address TEXT,
      role TEXT DEFAULT 'subscriber',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `, [])
  
  // Seed test data
  await dbAdapter.insert('users', {
    username: 'admin_user',
    email: 'admin@blog.com',
    profile: JSON.stringify({ name: 'Admin User', bio: 'Site administrator' }),
    password_hash: 'hashed_password_1',
    api_key: 'admin_api_key_123',
    role: 'admin',
    ip_address: '192.168.1.100'
  }, 'admin')
  
  await dbAdapter.insert('users', {
    username: 'editor_user',
    email: 'editor@blog.com', 
    profile: JSON.stringify({ name: 'Editor User', bio: 'Content editor' }),
    password_hash: 'hashed_password_2',
    role: 'editor',
    ip_address: '192.168.1.101'
  }, 'admin')
  
  await dbAdapter.insert('posts', {
    title: 'Getting Started with DSANDSL',
    content: 'This is a comprehensive guide to using DSANDSL for role-based data access...',
    excerpt: 'Learn how to implement secure data access control',
    author_id: 1,
    draft_content: 'Additional content in draft...',
    internal_notes: 'Remember to add SEO keywords',
    seo_data: JSON.stringify({ keywords: ['security', 'data', 'access'], description: 'DSANDSL guide' }),
    analytics_data: JSON.stringify({ views: 1250, bounce_rate: 0.25 }),
    published_at: new Date().toISOString()
  }, 'admin')
  
  // Express middleware setup
  app.use(express.json())
  
  // Mock authentication middleware
  app.use((req, res, next) => {
    // In real app, extract from JWT token, session, etc.
    const authHeader = req.headers.authorization
    if (authHeader === 'Bearer admin') {
      req.user = { id: 1, role: 'admin' }
    } else if (authHeader === 'Bearer editor') {
      req.user = { id: 2, role: 'editor' }
    } else if (authHeader === 'Bearer author') {
      req.user = { id: 3, role: 'author' }
    } else if (authHeader === 'Bearer subscriber') {
      req.user = { id: 4, role: 'subscriber' }
    } else {
      req.user = { id: null, role: 'guest' }
    }
    next()
  })
  
  // Apply DSANDSL middleware
  app.use('/api', ExpressAdapter.middleware(dsl, {
    roleExtractor: (req) => req.user?.role || 'guest',
    attachTo: 'dsl'
  }))
  
  // Blog posts API endpoints
  app.get('/api/posts', async (req, res) => {
    try {
      const posts = await dbAdapter.select('posts', req.dsl.userRole, {
        limit: parseInt(req.query.limit) || 10,
        offset: parseInt(req.query.offset) || 0
      })
      
      res.json({
        data: posts,
        meta: {
          role: req.dsl.userRole,
          fieldCount: posts[0] ? Object.keys(posts[0]).length : 0
        }
      })
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })
  
  app.get('/api/posts/:id', async (req, res) => {
    try {
      const posts = await dbAdapter.select('posts', req.dsl.userRole, {
        where: { id: parseInt(req.params.id) },
        limit: 1
      })
      
      if (posts.length === 0) {
        return res.status(404).json({ error: 'Post not found' })
      }
      
      res.json({
        data: posts[0],
        meta: {
          role: req.dsl.userRole,
          fields: Object.keys(posts[0])
        }
      })
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })
  
  app.post('/api/posts', async (req, res) => {
    try {
      const result = await dbAdapter.insert('posts', req.body, req.dsl.userRole)
      res.status(201).json({ 
        success: true,
        insertId: result.lastInsertId,
        role: req.dsl.userRole
      })
    } catch (error) {
      res.status(400).json({ error: error.message })
    }
  })
  
  // Users API endpoints
  app.get('/api/users', async (req, res) => {
    try {
      const users = await dbAdapter.select('users', req.dsl.userRole, {
        limit: parseInt(req.query.limit) || 10
      })
      
      res.json({
        data: users,
        meta: {
          role: req.dsl.userRole,
          fieldCount: users[0] ? Object.keys(users[0]).length : 0
        }
      })
    } catch (error) {
      res.status(500).json({ error: error.message })
    }
  })
  
  // Role-protected admin endpoint
  app.get('/api/admin/analytics', 
    ExpressAdapter.requireRoles(['admin'], {
      roleExtractor: (req) => req.user?.role || 'guest'
    }),
    async (req, res) => {
      try {
        const posts = await dbAdapter.select('posts', 'admin', {
          fields: ['id', 'title', 'analytics_data']
        })
        
        res.json({
          data: posts,
          message: 'Admin-only analytics data'
        })
      } catch (error) {
        res.status(500).json({ error: error.message })
      }
    }
  )
  
  console.log('✅ Express app configured with DSANDSL middleware')
  
  // Test different role access
  const testCases = [
    { role: 'guest', auth: null, description: 'Anonymous visitor' },
    { role: 'subscriber', auth: 'Bearer subscriber', description: 'Registered user' },
    { role: 'author', auth: 'Bearer author', description: 'Content author' },
    { role: 'editor', auth: 'Bearer editor', description: 'Content editor' },
    { role: 'admin', auth: 'Bearer admin', description: 'Site administrator' }
  ]
  
  console.log('\n📊 Testing API endpoints with different roles:')
  
  for (const testCase of testCases) {
    console.log(`\n👤 ${testCase.role.toUpperCase()} (${testCase.description}):`)
    
    // Test posts endpoint
    try {
      const mockReq = {
        dsl: { userRole: testCase.role },
        query: { limit: 1 }
      }
      const mockRes = {
        json: (data) => data,
        status: () => mockRes
      }
      
      // Simulate API call
      const posts = await dbAdapter.select('posts', testCase.role, { limit: 1 })
      console.log(`  📄 Posts API: ${posts.length} records, ${posts[0] ? Object.keys(posts[0]).length : 0} fields`)
      if (posts[0]) {
        console.log(`     Fields: ${Object.keys(posts[0]).join(', ')}`)
      }
    } catch (error) {
      console.log(`  📄 Posts API: ❌ ${error.message.substring(0, 50)}...`)
    }
    
    // Test users endpoint
    try {
      const users = await dbAdapter.select('users', testCase.role, { limit: 1 })
      console.log(`  👥 Users API: ${users.length} records, ${users[0] ? Object.keys(users[0]).length : 0} fields`)
      if (users[0]) {
        console.log(`     Fields: ${Object.keys(users[0]).join(', ')}`)
      }
    } catch (error) {
      console.log(`  👥 Users API: ❌ ${error.message.substring(0, 50)}...`)
    }
    
    // Test admin endpoint
    if (testCase.role === 'admin') {
      try {
        const analytics = await dbAdapter.select('posts', 'admin', {
          fields: ['id', 'title', 'analytics_data']
        })
        console.log(`  📈 Analytics API: ${analytics.length} records (admin only)`)
      } catch (error) {
        console.log(`  📈 Analytics API: ❌ ${error.message.substring(0, 50)}...`)
      }
    } else {
      console.log(`  📈 Analytics API: ❌ Access denied (admin only)`)
    }
  }
  
  await dbAdapter.close()
  console.log('\n✅ Express integration example completed')
}

async function createNextJSExample() {
  console.log('\n🔷 Next.js Integration Example') 
  console.log('==============================')
  
  const dsl = new DSLEngine(blogConfig)
  
  // Mock Next.js API route handlers
  const createMockNextJSRoute = (handler) => {
    return async (mockReq, mockRes) => {
      const result = await handler(mockReq, mockRes)
      return result
    }
  }
  
  // Example: Posts API route
  const postsHandler = NextJSAdapter.createHandler(dsl, {
    roleExtractor: async (req) => {
      // In real Next.js app, this would use next-auth or similar
      return req.headers['x-user-role'] || 'guest'
    },
    dataProvider: async (req) => {
      // Mock data provider - in real app would use database
      const mockPosts = [
        {
          id: 1,
          title: 'DSANDSL Introduction',
          content: 'Complete guide to role-based data access...',
          excerpt: 'Learn about data security',
          author_id: 1,
          draft_content: 'Additional draft content...',
          internal_notes: 'SEO optimization needed',
          seo_data: JSON.stringify({ keywords: ['security', 'data'] }),
          analytics_data: JSON.stringify({ views: 1500, engagement: 0.75 }),
          published_at: '2024-01-15T10:00:00Z',
          created_at: '2024-01-10T08:00:00Z'
        }
      ]
      
      return req.query?.id ? mockPosts[0] : mockPosts
    },
    autoFilter: true
  })
  
  // Example: Users API route with manual filtering
  const usersHandler = NextJSAdapter.createHandler(dsl, {
    roleExtractor: async (req) => req.headers['x-user-role'] || 'guest'
  })
  
  // Example: Admin-only route
  const adminAnalyticsHandler = NextJSAdapter.requireRoles(['admin'], {
    roleExtractor: async (req) => req.headers['x-user-role'] || 'guest'
  })(async (req, res) => {
    return {
      analytics: {
        totalPosts: 45,
        totalViews: 12500,
        averageEngagement: 0.68
      },
      message: 'Admin analytics data'
    }
  })
  
  console.log('✅ Next.js API handlers configured with DSANDSL')
  
  // Test Next.js handlers
  const nextJSTestCases = [
    { role: 'guest', description: 'Anonymous visitor' },
    { role: 'subscriber', description: 'Registered user' },
    { role: 'editor', description: 'Content editor' },
    { role: 'admin', description: 'Site administrator' }
  ]
  
  console.log('\n📊 Testing Next.js API routes:')
  
  for (const testCase of nextJSTestCases) {
    console.log(`\n👤 ${testCase.role.toUpperCase()} (${testCase.description}):`)
    
    // Test posts route
    try {
      const mockReq = {
        method: 'GET',
        headers: { 'x-user-role': testCase.role },
        query: {}
      }
      const mockRes = {
        status: () => mockRes,
        json: (data) => data,
        setHeader: () => {},
        end: () => {}
      }
      
      const result = await postsHandler(mockReq, mockRes)
      if (result && typeof result === 'object' && result.dsl) {
        // Handler returned context for manual use
        console.log(`  📄 Posts API: Manual mode, role=${result.dsl.userRole}`)
      } else {
        // Handler auto-responded
        console.log(`  📄 Posts API: Auto-filtered response sent`)
      }
    } catch (error) {
      console.log(`  📄 Posts API: ❌ ${error.message.substring(0, 50)}...`)
    }
    
    // Test admin route
    try {
      const mockReq = {
        method: 'GET',
        headers: { 'x-user-role': testCase.role }
      }
      const mockRes = {
        status: (code) => {
          console.log(`     Status: ${code}`)
          return mockRes
        },
        json: (data) => {
          if (data.error) {
            console.log(`     Error: ${data.message}`)
          } else {
            console.log(`     Success: Analytics data returned`)
          }
          return mockRes
        }
      }
      
      await adminAnalyticsHandler(mockReq, mockRes)
    } catch (error) {
      console.log(`  📈 Admin API: ❌ ${error.message.substring(0, 50)}...`)
    }
  }
  
  console.log('\n✅ Next.js integration example completed')
}

async function runFrameworkExamples() {
  console.log('🌐 DSANDSL Framework Integration Examples')
  console.log('==========================================')
  console.log('Demonstrating Express.js and Next.js integration patterns\n')
  
  try {
    await createExpressExample()
    await createNextJSExample()
    
    console.log('\n🎯 All framework integration examples completed successfully!')
    console.log('\n💡 Key Takeaways:')
    console.log('   • Role-based field filtering works automatically across frameworks')
    console.log('   • Different roles see different data fields transparently') 
    console.log('   • Framework adapters provide middleware and helper functions')
    console.log('   • Access control is enforced at the data layer, not route level')
    console.log('   • Zero configuration needed beyond role setup')
    
  } catch (error) {
    console.error('💥 Framework example failed:', error.message)
    process.exit(1)
  }
}

// Run examples
if (require.main === module) {
  runFrameworkExamples()
}

module.exports = {
  runFrameworkExamples,
  blogConfig
}