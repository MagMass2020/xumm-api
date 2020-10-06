const fetch = require('node-fetch')
const getUserDevices = require('@api/v1/internal/get-user-devices')

module.exports = async (req, res) => {
  try {
    // TODO: get actual translations
    let trl = {}

    if (req.params.payloads__payload_id.match(/^[0-9]/)) {
      let locale = 'en'
      if (req.params.payloads__payload_id.slice(0, 1) === '1') locale = 'ja'
      if (req.params.payloads__payload_id.slice(0, 1) === '2') locale = 'es'

      const call = await fetch(`https://raw.githubusercontent.com/XRPL-Labs/XUMM-App/develop/src/locale/${locale}.json`)
      trl = await call.json()

      // TODO: Do not prefix, but possibly sanitize
      Object.keys(trl).forEach(k => {
        Object.keys(trl[k]).forEach(t => {
          trl[k][t] = '<trl>' + trl[k][t]
        })
      })
    }

    return res.json({
      meta: {
        language: '??_??',
        version: (new Date()).getTime(),
        token: req.params.payloads__payload_id,
        valid: Object.keys(trl).length > 0
      },
      translation: trl
    })
  } catch (e) {
    res.handleError(e)
  }
}
