const express = require('express')
const app = express()
const log = require('debug')('app:main')

const readyHandler = {}
readyHandler.promise = new Promise((resolve, reject) => Object.assign(readyHandler, { resolve, reject }))

module.exports = {
  ready: readyHandler.promise,
  async close () {
    return await app.close()
  }
}

async function start () {
  const middleware = [
    { type: 'middleware', module: 'config' },
    { type: 'middleware', module: 'bugsnag' },
    { type: 'storage', module: 'database' },
    { type: 'middleware', module: 'cors' },
    { type: 'middleware', module: 'headers' },
    { type: 'middleware', module: 'what-router' },
    { type: 'middleware', module: 'remote-addr' },
    { type: 'middleware', module: 'cli-logger' },
    { type: 'middleware', module: 'error-handler' },
    { type: 'middleware', module: 'redis-pubsub' },
    { type: 'middleware', module: 'xpring-metric-reporter' },
    /**
     * Handlers always last, otherwise they don't have
     * the middleware modules registered
     */
    { type: 'handler', module: 'web' },
    { type: 'handler', module: 'api' },
    { type: 'handler', module: 'wss' },
    { type: 'handler', module: 'payid' },
  ]

  log('Loading modules') 
  for (let i = 0; i<middleware.length; i++) {
    log(` - ${middleware[i].type}: ${middleware[i].module}`)
    await require(`~src/${middleware[i].type}/${middleware[i].module}`)(app)
  }
  log('Modules loaded')

  app.listen(app.config.port)
  log(`\nXRPL-SIGN ${app.config.mode} - Server running at port ${app.config.port}\n`)
  
  readyHandler.resolve()
}

start()

process.on('SIGINT', async () => {
  log('--- STOPPING ---')
  process.exit(0)
})
