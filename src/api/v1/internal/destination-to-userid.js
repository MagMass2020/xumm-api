const log = require('~src/handler/log')('app:destination-to-userid')

module.exports = async (destination, db) => {
  try {
    if (typeof destination === 'object' && destination !== null) {
      if (typeof destination.payloadUuid !== 'undefined') {
        /**
         * Resolve payload ID to userId
         */
        const user = await db(`
          SELECT 
            tokens.user_id
          FROM
            payloads
          JOIN tokens ON (
            tokens.token_id = payloads.token_id
          )
          WHERE 
            payloads.token_id IS NOT NULL
          AND
            payloads.call_uuidv4_bin = UNHEX(REPLACE(:uuid,'-',''))
          LIMIT 1
        `, {
          uuid: destination.payloadUuid
        })
        Object.assign(destination, { userId: user && user.length === 1 ? user[0].user_id : null })
      }
      if (typeof destination.deviceId !== 'undefined') {
        /**
         * Resolve deviceId to userId
         */
        const user = await db(`
          SELECT user_id
          FROM devices
          WHERE device_id = :device_id
          LIMIT 1
        `, {
          device_id: destination.deviceId
        })
        Object.assign(destination, { userId: user && user.length === 1 ? user[0].user_id : null })
      }
      if (typeof destination.userId !== 'undefined' && destination.userId) {
        /**
         * Already got the user id
         */
      }
    }
  } catch (e) {
    log('Error resolving userId', e.message || e)
  }
  return destination
}
