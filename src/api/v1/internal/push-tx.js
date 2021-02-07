const log = require('~src/handler/log')('app:push-tx')
const logChild = require('~src/handler/log')('app:push-tx:child')
const { fork } = require('child_process')

const hashCache = {}

module.exports = async (req, res) => {
  let pushed = false

  try {  
    if (typeof req.body === 'object' && req.body !== null) {
      if (typeof req.body.params === 'object' && req.body.params !== null) {
        const data = req.body.params
        if (typeof data.transaction === 'object' && data.transaction !== null) {
          const tx = data.transaction
          if (typeof tx.Destination === 'string' && typeof tx.hash === 'string') {
            if (typeof hashCache[tx.Destination] === 'string' && hashCache[tx.Destination] === tx.hash) {
              // Return, we've seen this one.
              log('Skip pushing, hash known', tx.hash)
              return res.json({processed: false, reason: 'Already pushed'})
            } else {
              // Mark cached
              hashCache[tx.Destination] = tx.hash
            }

            notify = await req.db(`
              SELECT
                useraccounts.user_id as userid,
                devices.device_id as deviceid,
                useraccounts.useraccount_private_name as accountname,
                devices.device_pushtoken,
                devices.device_appLanguage
              FROM
                useraccounts
              LEFT  JOIN
                devices ON (
                  devices.user_id = useraccounts.user_id
                )
              WHERE
                useraccount_account = :account
              AND
                useraccount_push = 1
              AND
                devices.device_lockedbydeviceid IS NULL
              AND
                devices.device_extuniqueid IS NOT NULL
              AND
                devices.device_disabled IS NULL
              AND
                devices.device_accesstoken_bin IS NOT NULL
            `, {
              account: tx.Destination
            })

            if (notify.constructor.name === 'Array' && notify.length > 0 && notify[0].constructor.name === 'RowDataPacket') {
              pushed = true
            }

            if (pushed) {
              notify.forEach(n => {
                const child = fork('src/fork/txPushMessage.js')

                child.on('message', msg => {
                  if (typeof msg.debug_log !== 'undefined') logChild.apply(null, Object.values(msg.debug_log))
                  if (typeof msg.pid !== 'undefined') child.send({
                    pushtoken: n?.device_pushtoken,
                    accountname: n?.accountname,
                    hash: tx?.hash,
                    account: tx?.Destination,
                    type: tx?.TransactionType,
                    language: n?.device_appLanguage,
                    fcmkey: req.config.googleFcmKey
                  })
                })
      
                child.on('exit', code => logChild(`${tx.hash}: Child process exited with code [ ${code} ]`))
              })

              res.json({
                processed: true,
                reason: 'OK',
                hash: tx.hash,
                destination: tx.Destination,
                notifications: notify.map(n => {
                  return `${n.userid}.${n.deviceid}`
                })
                // notify // Sensitive data
              })
            } else {
              return res.json({processed: false, reason: 'No push subscriber'})
            }
          } else {
            return res.json({processed: false, reason: 'No `Destination`'})
          }
        } else {
          return res.json({processed: false, reason: 'Transaction missing'})
        }
      }
    }

    if (!pushed) {
      const e = new Error('Not implemented')
      e.noLogging = true
      return res.handleError(e)
    }
  } catch (e) {
    return res.handleError(e)
  }
}
