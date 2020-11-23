const log = require('~src/handler/log')('app:translation')
const fetch = require('node-fetch')
const crypto = require('crypto')
// const getUserDevices = require('~api/v1/internal/get-user-devices')

module.exports = async (req, res) => {
  try {
    const fallbackCall = await fetch(`https://raw.githubusercontent.com/XRPL-Labs/XUMM-App/develop/src/locale/en.json`)
    const fallbackTranslation = await fallbackCall.json()
    // log({fallbackTranslation})

    const meta = {
      language: '??_??'
    }
    const translation = {}

    const call = await fetch(`http://translate.xumm.dev/json/get-translation/t:${req.params.translation_uuid}`, {
      headers: {
        'x-token': crypto.createHash('sha1').update(req.params.translation_uuid + (req.config.translationPortalKey || '')).digest("hex")
      }
    })
    const translationData = await call.json()
    if (typeof translationData === 'object' && translationData !== null && typeof translationData.data !== 'undefined') {
      meta.language = translationData.data.language

      const matchingSignRequest = await req.db(`
        SELECT payload_id FROM payloads WHERE
          call_uuidv4_bin = UNHEX(REPLACE(:call_uuidv4, '-', ''))
        AND
          payload_response_account = :account
      `, {
        call_uuidv4: translationData.data.signInPayload || '',
        account: translationData.data.user || ''
      })

      if (matchingSignRequest.length === 1) {
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

    return res.json({
      meta: {
        language: meta.language,
        version: (new Date()).getTime(),
        token: req.params.translation_uuid,
        valid: Object.keys(translation).length > 0
      },
      translation
    })
  } catch (e) {
    res.handleError(e)
  }
}
