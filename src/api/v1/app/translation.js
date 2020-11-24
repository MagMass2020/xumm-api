const log = require('~src/handler/log')('app:translation')
const fetch = require('node-fetch')
const crypto = require('crypto')
// const getUserDevices = require('~api/v1/internal/get-user-devices')

module.exports = async (req, res) => {
  try {
    const fallbackCall = await fetch(`https://raw.githubusercontent.com/XRPL-Labs/XUMM-App/develop/src/locale/en.json`)
    const fallbackTranslation = await fallbackCall.json()

    log({translationPreview: req.params.translation_uuid})

    const meta = {language: '??_??'}
    const translation = {}

    const call = await fetch(`http://translate.xumm.dev/json/get-translation/t:${req.params.translation_uuid}`, {
      headers: {
        'x-token': crypto.createHash('sha1').update(req.params.translation_uuid + (req.config.translationPortalKey || '')).digest("hex")
      }
    })
    const translationData = await call.json()
    if (
      typeof translationData === 'object'
      && translationData !== null
      && typeof translationData.data !== 'undefined'
      && translationData.data !== null
    ) {
      meta.language = translationData.data.language

      const matchingSignRequest = await req.db(`
        SELECT
          payloads.payload_id,
          devices.device_id
        FROM
          payloads
        JOIN
          devices ON (
            devices.device_id = payloads.payload_handler
          )        
        WHERE
          call_uuidv4_bin = UNHEX(REPLACE(:call_uuidv4, '-', ''))
        -- AND
        --   payload_response_account = :account
      `, {
        call_uuidv4: translationData.data.signInPayload || '',
        account: translationData.data.user || ''
      })

      if (matchingSignRequest.length === 1 && matchingSignRequest[0].device_id === req.__auth.device.id) {
        const data = translationData.data.values.map(r => {
          const [a, section, key] = r._id.split('.')
          return {
            section, 
            key,
            value: r.value
          }
        }).reduce((a, b) => {
          if (typeof a[b.section] === 'undefined') {
            Object.assign(a, {[b.section]: {}})
          }
          Object.assign(a[b.section], {[b.key]: b.value})
          return a
        }, fallbackTranslation || {})

        Object.assign(translation, data)
      }
    }
      
    // log({translationData})
    const tResponse = {
      meta: {
        language: meta.language,
        version: (new Date()).getTime(),
        token: req.params.translation_uuid,
        valid: Object.keys(translation).length > 0
      },
      translation
    }
    log({translationPreview: req.params.translation_uuid, response: tResponse.meta})
    return res.json(tResponse)
  } catch (e) {
    res.handleError(e)
  }
}
