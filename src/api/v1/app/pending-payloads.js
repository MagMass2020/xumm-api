// const log = require('~src/handler/log')('app:payload-api')
const getPayloadData = require('~api/v1/internal/payload-data')
const formatPayloadData = require('~api/v1/internal/payload-data-formatter')
// const uuid = require('uuid/v4')

module.exports = async (req, res) => {
  try {
    // res.json(req.__auth)
    const payloads = await req.db(`
      SELECT
        payloads.call_uuidv4_txt as call_uuidv4
      FROM
        users
      LEFT JOIN
        tokens ON (tokens.user_id = users.user_id)
      LEFT JOIN
        payloads ON (payloads.token_id = tokens.token_id)
      WHERE 
        users.user_id = :user_id
      AND
        tokens.token_hidden = 0
      AND 
        tokens.token_reported = 0
      AND
        tokens.token_expiration > FROM_UNIXTIME(:now)
      AND
        payloads.payload_handler IS NULL
      AND
        payloads.payload_expiration > FROM_UNIXTIME(:now)
    `, {
      user_id: req.__auth.user.id,
      now: new Date() / 1000
    })
  
    if (payloads.constructor.name === 'Array' && payloads.length > 0 && payloads[0].constructor.name === 'RowDataPacket') {
      const payloadData = await Promise.all(payloads.map(p => {
        return getPayloadData(p.call_uuidv4, req.app, 'app')
      }))
      return res.json({
        payloads: payloadData.map(payload => {
          return formatPayloadData(payload, {
            meta: {
              exists: false,
              uuid: null
            },
            application: {},
            payload: {}
          })
        })
      })
    } else {
      res.json({
        payloads: []
      })
    }
  } catch (e) {
    res.handleError(e)
  }
}
