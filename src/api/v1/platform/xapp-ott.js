const log = require('~src/handler/log')('app:fetch-ott-xapp')

module.exports = async (req, res) => {
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

    const data = {
      ip: req.remoteAddress,
      ua: Object.keys(req.headers).indexOf('user-agent') > -1
        ? req.headers['user-agent']
        : '',
      moment: new Date() / 1000,
      ott_txt: req?.params?.ott
    }

    const ottData = await req.db(`
      SELECT
        xapp_ott_fetched,
        xapp_ott_data
      FROM
        xapp_ott
      WHERE
        xapp_ott_bin = UNHEX(REPLACE(:ott_txt,'-',''))
      AND
        xapp_ott_moment > DATE_SUB(FROM_UNIXTIME(:moment), INTERVAL 2 MINUTE)
      LIMIT 1
    `, data)

    if (Array.isArray(ottData) && ottData.length === 1) {
      if (ottData[0].xapp_ott_fetched === null) {
        await req.db(`
          UPDATE
            xapp_ott
          SET
            xapp_ott_fetched = FROM_UNIXTIME(:moment),
            xapp_fetched_ip = :ip,
            xapp_fetched_ua = :ua
          WHERE
            xapp_ott_bin = UNHEX(REPLACE(:ott_txt,'-',''))
        `, data)

        const ottDataObject = JSON.parse(ottData[0].xapp_ott_data.toString('utf-8'))
        res.json(ottDataObject)
      } else {
        const e = new Error('OTT already fetched')
        e.code = 410
        throw(e)
      }
    } else {
      const e = new Error('OTT not found or expired')
      e.code = 404
      throw(e)
    }
  } catch (e) {
    res.handleError(e)
  }
}
