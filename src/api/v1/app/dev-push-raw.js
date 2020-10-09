const log = require('~src/handler/log')('app:payload:post')
const logChild = require('~src/handler/log')('app:payload:post:child')
const { fork } = require('child_process')

module.exports = async (req, res) => {
  const pushInfo = await req.db(`
    SELECT 
      device_pushtoken
    FROM 
      devices
    WHERE
      device_uuidv4_bin = UNHEX(REPLACE(:device,'-',''))
    AND
      devices.device_disabled IS NULL
    AND
      devices.device_accesstoken_bin IS NOT NULL
    AND
      devices.device_pushtoken IS NOT NULL
    AND
      devices.device_lockedbydeviceid IS NULL
    LIMIT 1
  `, {
    device: req.__auth.device.uuidv4 || ''
  })

  if (pushInfo.constructor.name === 'Array' && pushInfo.length > 0 && pushInfo[0].constructor.name === 'RowDataPacket' && String(pushInfo[0].device_pushtoken) !== '') {
    const pushToken = pushInfo[0].device_pushtoken
    const uuid = res.get('X-Call-Ref') || null
    if (uuid === null) {
      throw Object.assign(new Error('Payload call reference error'), { code: 605 })
    }  

    try {
      log(`# Pushing payload [ freeform ] to device ${req.__auth.device.uuidv4 || ''}`)

      const child = fork('src/fork/pushMessage.js')

      child.on('message', msg => {
        if (typeof msg.debug_log !== 'undefined') {
          logChild.apply(null, Object.values(msg.debug_log))
        }
        if (typeof msg.pid !== 'undefined') {
          /**
           * Initial message with PID, child is ready.
           * Deliver data.
           */
          child.send({
            payload: {
              body: req.body
            },
            device: {
              pushToken
            },
            config: {
              fcmkey: req.config.googleFcmKey
            }
          })
        }
      })

      child.on('exit', (code, signal) => {
        logChild(`${uuid}: Child process exited with code [ ${code} ]`) // and signal ${signal}
      })

      res.json({
        sent_body: req.body,
        sample_body: {
          title: 'SampleApp',
          subtitle: 'SampleEvent',
          body: 'Hi!',
          sound: 'default',
          click_action: 'SOMEACTION'
        }
      })
    } catch (e) {
      res.handleError(e)
    }

    return
  }

  const e = new Error(`No push token for this device`)
  e.httpCode = e.code = 400
  res.handleError(e)
}
