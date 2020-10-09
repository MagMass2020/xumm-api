const log = require('~src/handler/log')('app:redis-pubsub:pub')
const logSub = require('~src/handler/log')('app:redis-pubsub:sub')
const ioredis = require('ioredis')

module.exports = async function (expressApp) {
  log('Redis PubSub=>PUBLISH connection attempt to', expressApp.config.redis)
  const redis = new ioredis({
    host: expressApp.config.redis.host,
    port: expressApp.config.redis.port,
    // Restart blocking events after reconnecting
    autoResendUnfulfilledCommands: true,
    // Keep on trying to reconnect
    maxRetriesPerRequest: null
  })
  redis.on('connect', () => { log('Redis PubSub=>PUBLISH Connected') })
  redis.on('ready', () => { log('Redis PubSub=>PUBLISH Ready') })
  // redis.on('close', () => { log('Redis Disconnected') })
  redis.on('error', e => {
    log('Redis PubSub=>PUBLISH error', e.message)
  })

  expressApp.redis = {
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
            log('Redis DISCONNECTED')
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
