const log = require('~src/handler/log')('app:xapp:push')
const fetch = require('node-fetch')
const uuidv4_format = new RegExp(/^[0-9A-F]{8}-[0-9A-F]{4}-4[0-9A-F]{3}-[89AB][0-9A-F]{3}-[0-9A-F]{12}$/i)

module.exports = async (req, res, uuid) => {
  let pushed = false

  try {
    const appXapp = await req.db(`
      SELECT
        application_xapp_identifier as xapp
      FROM
        applications
      WHERE
        application_id = :appId
    `, {
      appId: req.__auth.application.id
    })
    const xAppId = Array.isArray(appXapp) && appXapp.length > 0 ? appXapp[0].xapp : null

    if (xAppId === null) {
      const e = new Error('No xApp ID for calling application')
      e.code = 403
      throw(e)
    }

    if (typeof req.body === 'object' && req.body !== null) {
      if (Object.keys(req.body).indexOf('user_token') > -1 && req.body.user_token.match(uuidv4_format)) {
        pushToken = await req.db(`
          SELECT 
            devices.device_pushtoken,
            devices.device_appLanguage,
            applications.application_name,
            tokens.token_id,
            (SELECT count(1) FROM payloads WHERE payloads.token_id = tokens.token_id AND payloads.payload_handler IS NULL AND payloads.payload_expiration > FROM_UNIXTIME(:token_expiration)) AS open_sign_requests
          FROM 
            tokens
          JOIN
            users ON ( tokens.user_id = users.user_id )
          JOIN
            devices ON ( devices.user_id = users.user_id )
          JOIN
            applications ON ( applications.application_id = tokens.application_id )
          WHERE
            token_accesstoken_bin = UNHEX(REPLACE(:token_accesstoken,'-',''))
          AND token_hidden = 0
          AND tokens.application_id = :application_id
          AND token_expiration >= FROM_UNIXTIME(:token_expiration)
          AND devices.device_disabled IS NULL
          AND devices.device_accesstoken_bin IS NOT NULL
          AND devices.device_pushtoken IS NOT NULL
          AND devices.device_lockedbydeviceid IS NULL
          ORDER BY
            devices.device_lastcall DESC
        `, {
          token_accesstoken: req.body.user_token,
          token_expiration: new Date() / 1000,
          application_id: req?.__auth?.application?.id
        })

        if (pushToken.constructor.name === 'Array' && pushToken.length > 0 && pushToken[0].constructor.name === 'RowDataPacket') {
          const pushData = {
            body: 'xApp',
            data: {}
          }

          if (typeof req.body.data === 'object' && req.body.data !== null) {
            Object.assign(pushData, req.body.data)
            Object.assign(pushData, {data: req.body.data})
          }

          Object.assign(pushData, {
            ...(req.body),
            title: pushToken[0].application_name,
            badge: pushToken[0].open_sign_requests,
            sound: 'default'
          })

          Object.assign(pushData.data, {
            category: 'OPENXAPP',
            xappUrl: 'https://xumm.app/detect/xapp:' + xAppId
          })

          delete pushData.user_token

          // log(pushToken[0])
          log({pushData})

          try {
            const response = await fetch('https://fcm.googleapis.com/fcm/send', {
              method: 'post',
              body: JSON.stringify({
                to: pushToken[0].device_pushtoken,
                notification: pushData,
                data: pushData.data
              }),
              headers: { 'Content-Type': 'application/json', 'Authorization': 'key=' + req.config.googleFcmKey }
            })
            const responseText = await response.text()
            if (typeof responseText === 'string' && responseText.slice(0, 2) === '{"') {
              const pushResult = JSON.parse(responseText)
              pushed = typeof pushResult.success !== 'undefined' && pushResult.success > 0
            }
            log(`xapp push notification response:`, responseText.slice(0, 500))
          } catch(e) {
            log(e.message)
          }
        } else {
          const e = new Error('Expired or invalid user_token')
          e.code = 602
          throw(e)
        }
      } else {
        const e = new Error('No user_token provided (JSON body)')
        e.code = 600
        throw(e)
      }
    } else {
      const e = new Error('Invalid body (POST, expecting: JSON)')
      e.code = 601
      throw(e)
    }

    const response = { pushed }
    if (typeof req.body.uuid !== 'undefined' && typeof uuid !== undefined && uuid === req.body.uuid) {
      Object.assign(response, {uuid: req.body.uuid})
    }
    res.json(response)
  } catch (e) {
    res.handleError(e)
  }
}
