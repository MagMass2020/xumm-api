const uuid = require('uuid/v4')
const log = require('~src/handler/log')('app:xapp-pre-launch')

const formatData = jsonObj => {
  const objKeys = Object.keys(jsonObj)
  ;['style', 'accounttype', 'accountaccess'].forEach(e => {
    if (objKeys.indexOf(e) > -1) {
      jsonObj[e] = jsonObj[e].toUpperCase()
    }
  })
  return jsonObj
}

module.exports = async (req, res) => {
  try {
    const appid = req?.params?.appid || ''

    const app = appid === 'xumm.more'
      ? [{c:1}]
      : await req.db(`SELECT count(1) c FROM applications WHERE application_xapp_identifier = :appid`, {appid})

    if (Array.isArray(app) && app.length > 0 && app[0]?.c > 0) {      
      const data = {
        token: uuid(),
        body: typeof req.body === 'object' && req.body !== null
          ? JSON.stringify(formatData(req.body))
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
          xapp_ott_data
        ) VALUES (
          :ott_txt,
          UNHEX(REPLACE(:ott_txt,'-','')),
          :identifier,
          FROM_UNIXTIME(:moment),
          :ott_data
        )
      `, {
        ott_txt: data.token,
        identifier: appid,
        moment: new Date() / 1000,
        ott_data: data.body
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
