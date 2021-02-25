const log = require('~src/handler/log')('app:push-badge')
const logChild = require('~src/handler/log')('app:push-badge:child')
const { fork } = require('child_process')
const persistPushResult = require('~api/v1/internal/persist-push-result')

const getUserIdByDestination = require('~api/v1/internal/destination-to-userid')
const getBadgeCount = require('~api/v1/internal/get-user-badge-count')
const getUserDevices = require('~api/v1/internal/get-user-devices')

module.exports = async (destination, db, config) => {
  /**
   * Nested for bg handling
   */
  getUserIdByDestination(destination, db).then(resolvedDestination => {
    getUserDevices(resolvedDestination.userId, db, { includePushToken: true }).then(devices => {
      getBadgeCount(resolvedDestination, db).then(count => {
        log(`-> Update push badge`, {
          resolvedDestination,
          badgeCount: count,
          deviceCount: devices.length
        })
        if (devices && devices.length > 0) {
          devices.map(d => d._device_pushtoken).forEach(pushToken => {
            const child = fork('src/fork/pushMessage.js')

            child.on('message', msg => {
              if (typeof msg.debug_log !== 'undefined') {
                logChild.apply(null, Object.values(msg.debug_log))
              }
              if (typeof msg.push_response !== 'undefined') {
                persistPushResult(pushToken, msg.push_response, db)
              }
              if (typeof msg.pid !== 'undefined') {
                child.send({
                  payload: { body: { badge: count } },
                  device: { pushToken },
                  config: { fcmkey: config.googleFcmKey }
                })
              }
            })
      
            child.on('exit', (code, signal) => {
              logChild(`<uid:${resolvedDestination.userId}> Child process exited with code [ ${code} ]`)
            })
          })
        }
      })
    })
  })
 
  return
}
