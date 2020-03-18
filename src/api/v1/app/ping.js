const getBadgeCount = require('@api/v1/internal/get-user-badge-count')

module.exports = async (req, res) => {
  if (typeof req.body === 'object' && req.body !== null) {
    if (typeof req.body.appLanguage !== 'undefined' || typeof req.body.appVersion !== 'undefined') {
      await req.db(`
        UPDATE
          devices
        SET
          device_appVersion = :appVersion,
          device_appLanguage = :appLanguage
        WHERE
          device_uuidv4_bin = UNHEX(REPLACE(:deviceUuid,'-',''))
        AND
          (device_disabled IS NULL OR device_disabled > NOW())
        AND
          device_accesstoken_bin IS NOT NULL
        LIMIT 1
      `, { 
        appVersion: req.body.appVersion || null,
        appLanguage: req.body.appLanguage || null,
        deviceUuid: req.__auth.device.uuidv4
      })
    }
  }

  res.json({ 
    pong: true,
    tosAndPrivacyPolicyVersion: Number(req.config.TosAndPrivacyPolicyVersion) || 0,
    badge: await getBadgeCount({ userId: req.__auth.user.id }, req.db),
    auth: Object.keys(req.__auth).reduce((a, b) => {
      return Object.assign(a, { 
        [b]: Object.keys(req.__auth[b]).filter(e => {
          return e !== 'id'
        }).reduce((c, d) => {
          return Object.assign(c, {
            [d]: req.__auth[b][d]
          })
        }, {})
      })
    }, {})
  })
}
