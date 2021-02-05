const uuid = require('uuid/v4')
const log = require('~src/handler/log')('app:push-badge')

module.exports = async (req, res) => {
  try {
    const appid = req?.params?.appid || ''

    const app = await req.db(`
      SELECT count(1) c FROM applications WHERE application_xapp_identifier = :appid
    `, {appid})

    if (Array.isArray(app) && app.length > 0 && app[0]?.c > 0) {      
      const data = {
        token: uuid(),
        ip: req.remoteAddress,
        ua: Object.keys(req.headers).indexOf('user-agent') > -1
          ? req.headers['user-agent']
          : '',
        body: typeof req.body === 'object' && req.body !== null
          ? JSON.stringify(req.body)
          : '{}'
      }

      if (data.body === '{}') {
        throw new Error('Invalid xApp Payload body')
      }

      const insertResult = await req.db(`
        INSERT INTO xapp_ott (
          xapp_ott_txt,
          xapp_ott_bin,
          xapp_identifier,
          xapp_ott_moment,
          xapp_ott_data,
          xapp_fetched_ip,
          xapp_fetched_ua
        ) VALUES (
          :ott_txt,
          UNHEX(REPLACE(:ott_txt,'-','')),
          :identifier,
          FROM_UNIXTIME(:moment),
          :ott_data,
          :fetched_ip,
          :fetched_ua
        )
      `, {
        ott_txt: data.token,
        identifier: appid,
        moment: new Date() / 1000,
        ott_data: data.body,
        fetched_ip: data.ip,
        fetched_ua: data.ua,
      })

      if (typeof insertResult === 'object' && insertResult !== null && insertResult.constructor.name === 'OkPacket') {
        return res.json({
          ott: data.token,
          error: ''
        })
      } else {
        res.json({ott: null, error: 'ERROR_SAVING_XAPP_LOAD'})
      }
    } else {
      res.json({ott: null, error: 'INVALID_XAPP_ID'})
    }
  } catch (e) {
    res.handleError(e)
  }
}
