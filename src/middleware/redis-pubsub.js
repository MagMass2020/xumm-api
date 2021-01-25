const log = require('~src/handler/log')('app:redis-pubsub:pub')
const logGetSet = require('~src/handler/log')('app:redis:getset')
const logSub = require('~src/handler/log')('app:redis-pubsub:sub')
const ioredis = require('ioredis')

module.exports = async function (expressApp, infoLogs) {
  const logInfo = typeof infoLogs === 'boolean' ? infoLogs : true

  if (logInfo) log('Redis PubSub=>PUBLISH connection attempt to', expressApp.config.redis)
  const redis = new ioredis({
    host: expressApp.config.redis.host,
    port: expressApp.config.redis.port,
    // Restart blocking events after reconnecting
    autoResendUnfulfilledCommands: true,
    // Keep on trying to reconnect
    maxRetriesPerRequest: null
  })
  redis.on('connect', () => { if (logInfo) log('Redis PubSub=>PUBLISH Connected') })
  redis.on('ready', () => { if (logInfo) log('Redis PubSub=>PUBLISH Ready') })
  // redis.on('close', () => { log('Redis Disconnected') })
  redis.on('error', e => {
    log('Redis PubSub=>PUBLISH error', e.message)
  })

  expressApp.redis = {
    del () {
      return redis.del(...arguments)
    },
    get () {
      return redis.get(...arguments)
    },
    set () {
      return redis.set(...arguments)
    },
    async getObject (key) {
      try {
        const r = await redis.get(key)
        // logGetSet('got', key, r)
        if (typeof r === 'string' && r.slice(0, 1) === '{' && r.slice(-1) === '}') {
          return JSON.parse(r)
        }
      } catch (e) {
        logGetSet(e)
      }
      return null
    },
    setObject (key, value) {
      return redis.set(key, typeof value === 'object' && value !== null ? JSON.stringify(value) : value)
    },
    setForSeconds (key, value, ttlSeconds) {
      return redis.set(key, typeof value === 'object' && value !== null ? JSON.stringify(value) : value, 'EX', ttlSeconds)
    },
    publish (channel, data) {
      redis.publish(channel, JSON.stringify(data))
    },
    subscribe (channel, fnOnMessage) {
      let subRedis = new ioredis({
        host: expressApp.config.redis.host,
        port: expressApp.config.redis.port,
        autoResendUnfulfilledCommands: false,
        maxRetriesPerRequest: null
      })
      // subRedis.on('connect', () => { logSub(`Redis PubSub=>SUBSCRIBE [ ${channel} ] Connected`) })
      // subRedis.on('ready', () => { logSub(`Redis PubSub=>SUBSCRIBE [ ${channel} ] Ready`) })
      subRedis.on('error', e => {
        logSub(`Redis PubSub=>SUBSCRIBE ${channel} error`, e.message)
      })

      subRedis.subscribe(channel, (error, count) => {
        if (error) {
          logSub(`Subscripe error @ ${channel} channel:`, error)
        } else {
          logSub(`  ✓ Listening for updates on the ${channel} channel`) // [ #${count} ]
        }
      })

      subRedis.on('message', (channel, message) => {
        // logSub(` >> Received the following message from ${channel}`, message)
        fnOnMessage(message)
      })

      subRedis.destroy = () => {
        subRedis.unsubscribe(channel).then(() => {
          try {
            subRedis.disconnect()
            if (logInfo) log('Redis DISCONNECTED')
          } catch (e) {
            log('Redis DISCONNECT error', e.message)
          }
          subRedis = null
        })
      }
      return subRedis
    }
  }

  expressApp.use((req, res, next) => {
    res.redis = req.redis = expressApp.redis
    next()
  })

  return
}
