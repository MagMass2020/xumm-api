const {TxData} = require('xrpl-txdata')
const config = require('../middleware/config')
const redis = require('../middleware/redis-pubsub')

const options = {module_name: 'getTxData', process_timeout: 10}

const log = function () {
  // console.log({ ...arguments })
  process.send({ debug_log: arguments })
}

/**
 * Code
 */

const main = async (data) => {
  let timeout

  timeout = setTimeout(() => {
    log(`TIMEOUT`)
    process.exit(1)
  }, options.process_timeout * 1000)

  try {
    const c = await config()
    const app = {config: c, use() {}}
    await redis(app, false)

    const txd = new TxData()
    const tx = await txd.getOne(data.txid)

    // log('Publishing to Redis', data.txid)
    app.redis.publish('xrpl-tx:' + data.txid, tx)
  } catch(e) {
    log({module: options.module_name, error: e.message})
    setTimeout(() => process.exit(1), 500)
  }

  // log('Done')
  clearTimeout(timeout)
  setTimeout(() => process.exit(0), 500)
}

/**
 * INIT
 */

process.send({module: options.module_name, pid: process.pid})

process.on('message', msg => {
  if (typeof msg.txid !== 'undefined') {
    main(msg)
  } else {
    log(`<< ${options.module_name} >> Exit, invalid message from parent: `, msg)
    process.exit(2)
  }
})
