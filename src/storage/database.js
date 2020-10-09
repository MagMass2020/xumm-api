const log = require('~src/handler/log')('app:db')
const mysql = require('mysql')

module.exports = (app) => {
  if (typeof app.config.db === 'undefined') app.config.db = {}

  log('Connecting to DB')

  const pool = mysql.createPool({
    connectionLimit: app.config.db.connectionLimit || 10,
    host: app.config.db.host || '127.0.0.1',
    user: app.config.db.user || 'db',
    password: app.config.db.password || 'db',
    database: app.config.db.database || 'db',
    charset : 'utf8mb4',
    queryFormat (query, values) {
      if (!values) return query
      return query.replace(/\:(\w+)/g, ((txt, key) => {
        if (values.hasOwnProperty(key)) return this.escape(values[key])
        return txt
      }).bind(this))
    }
  })

  pool.on('connection', c => {
    log(`Database connected @ ${c.threadId}`)
  })

  Object.assign(app, {
    db: async (query, params) => {
      return new Promise ((resolve, reject) => {
        pool.query(query || '', params || {}, (error, results) => {
          if (error) reject(error)
          resolve(results)
        })
      })
    }    
  })

  // Trigger pool connection
  app.db('SELECT @@VERSION')

  app.use((req, res, next) => {
    req.db = app.db
    next()
  })
}