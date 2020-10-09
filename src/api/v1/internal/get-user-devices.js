const log = require('~src/handler/log')('app:user-devices')

module.exports = async (userId, db, options) => {
  let additionalFields = ''
  if (typeof options === 'object' && options !== null) {
    if (typeof options.includePushToken !== 'undefined' && options.includePushToken) {
      additionalFields += ', device_pushtoken as _device_pushtoken'
    }
  }
  try {
    const devices = await db(`
      SELECT
        device_platform,
        device_uuidv4_txt,
        device_lastcall,
        device_created
        ${additionalFields}
      FROM
        devices
      WHERE
        user_id = :user_id
      AND
        device_disabled IS NULL
      AND
        device_lockedbydeviceid IS NULL
      AND
        device_accesstoken_bin IS NOT NULL
      ORDER BY
        device_lastcall DESC
    `, { user_id: userId })

    return devices && devices.length > 0 ? devices.map(d => Object.assign({}, d)) : []
  } catch (e) {
    log('Error fetching user devices', e.message || e)
  }
  return []
}
