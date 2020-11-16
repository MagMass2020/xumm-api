const fetch = require('node-fetch')
const translations = require('~src/global/translations')
const options = {
  module_name: 'txPushMessage',
  process_timeout: 5
}

const log = function () {
  process.send({ debug_log: arguments })
}

const main = async data => {
  let timeout

  timeout = setTimeout(() => {
    log(`TIMEOUT @ ${options.module_name} [ push(${data.hash}) ]`)
    process.exit(1)
  }, options.process_timeout * 1000)

  try {
    log('PUSHDATA', data.hash)
    const url = 'https://fcm.googleapis.com/fcm/send'

    const response = await fetch(url, {
      method: 'post',
      body: JSON.stringify({
        to: data.pushtoken,
        notification: {
          title: translations.translate(data.language || 'EN', 'X_RECEIVED', {something: data.type}),
          subtitle: data.accountname,
          body: data.account,
          // badge: data.device.open_sign_requests || 0,
          sound: 'default'
        },
        data: {
          category: 'TXPUSH',
          tx: data.hash,
          account: data.account
        }
      }),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'key=' + data.fcmkey
      }
    })

    const responseText = await response.text()
    log(`Push notification CALL [ ${options.module_name} ] response text:`, responseText.slice(0, 500))
  } catch(e) {
    log(`${e.message} @ ${options.module_name}`, data)
    setTimeout(() => process.exit(1), 500)
  }

  clearTimeout(timeout)
  setTimeout(() => process.exit(0), 500)
}

/**
 * INIT
 */

process.send({ module: options.module_name, pid: process.pid })

process.on('message', msg => {
  if (typeof msg.pushtoken !== 'undefined') {
    main(msg)
  } else {
    // log(`<< ${options.module_name} >> Message from parent: `, msg)
    log(`<< ${options.module_name} >> Exit, invalid message from parent: `, msg)
    process.exit(1)
  }
})
