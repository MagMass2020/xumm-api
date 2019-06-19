const fetch = require('node-fetch')
const options = {
  module_name: 'pushMessage',
  process_timeout: 5
}

const log = function () {
  process.send({ debug_log: arguments })
}

// TODO: Localize i18n

/**
 * Code
 */

const main = async (data) => {
  let timeout
  timeout = setTimeout(() => {
    log(`TIMEOUT @ ${options.module_name} [ payload(${data.payload.uuidv4}) ]`)
    process.exit(1)
  }, options.process_timeout * 1000)

  try {
    log('PUSHDATA', data.payload.body)
    const url = 'https://fcm.googleapis.com/fcm/send'
    const pushData = {
      method: 'post',
      body: JSON.stringify({
        to: data.device.pushtoken,
        notification: data.payload.body || {}
      }),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'key=' + data.config.fcmkey
      }
    }
    log(pushData)
    const response = await fetch(url, pushData)
    const responseText = await response.text()
    log(`Webhook [ ${options.module_name} ] response text:`, responseText.slice(0, 500))
  } catch(e) {
    log(`${e.message} @ ${options.module_name} [ payload(${data.payload.uuidv4}) ]`)
    process.exit(1)
  }

  clearTimeout(timeout)
  process.exit(0)
}

/**
 * INIT
 */

process.send({ module: options.module_name, pid: process.pid })

process.on('message', msg => {
  if (typeof msg.payload !== 'undefined' && msg.payload.body !== 'undefined') {
    main(msg)
  } else {
    // log(`<< ${options.module_name} >> Message from parent: `, msg)
    log(`<< ${options.module_name} >> Exit, invalid message from parent: `, msg)
    process.exit(1)
  }
})
