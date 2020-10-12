const log = require('~src/handler/log')('app:xrpl-tx-api')
const { fork } = require('child_process')
const logChild = require('~src/handler/log')('app:xrpl-tx-api:child')

const startProcess = params => {
  const child = fork('src/fork/getTxData.js')

  child.on('message', msg => {
    if (typeof msg.debug_log !== 'undefined') {
      logChild.apply(null, Object.values(msg.debug_log))
    }
    if (typeof msg.pid !== 'undefined') {
      /**
       * Initial message with PID, child is ready. Deliver data.
       */
      child.send(params)
    }
  })

  child.on('exit', (code, signal) => {
    logChild(`XRPL-TX [${params.txid}]: Child process exited with code [ ${code} ]`) // and signal ${signal}
  })
}

module.exports = async (req, res) => {
  startProcess(req.params) 

  // log('Subscribing to Redis')

  const txData = await new Promise(async (resolve, reject) => {
    try {
      const sub = await req.app.redis.subscribe('xrpl-tx:' + req.params.txid, msg => {
        resolve(msg)
        try { sub.destroy() } catch (e) {}
        return
      })

      setTimeout(() => {
        try { sub.destroy() } catch (e) {}
        log('txData child timeout')
        return resolve()
      }, 10 * 1000)
    } catch (e) {
      log(e)
      resolve()
    }
  })

  if (typeof txData === 'string') {
    try {
      const txJson = JSON.parse(txData)
      log(`Resolved transaction [${req.params.txid}] by [${txJson.resolvedBy}] from [${txJson.host}]`)
      res.json({
        txid: req.params.txid,
        balanceChanges: txJson.balanceChanges || {},
        node: txJson.host || '',
        transaction: txJson.result || {}
      })
    } catch (err) {
      const e = new Error(`Couldn't parse transaction results ${req.params.txid}`)
      e.code = e.httpCode = 502
      e.causingError = err
      res.handleError(e)
    }
  } else {
    const e = new Error(`Couldn't fetch transaction ${req.params.txid}`)
    e.code = e.httpCode = 500
    res.handleError(e)
  }
}
