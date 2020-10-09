const log = require('~src/handler/log')('app:jwt-tokens')

module.exports = async (req, res) => {
  try {
    const data = await req.db(`
      SELECT
        payloads.*,
        IF(payloads.payload_expiration > CURRENT_TIMESTAMP, 0, 1) as __payload_expired,
        payloads.call_uuidv4_txt as call_uuidv4,
        UNIX_TIMESTAMP(payloads.payload_created) as payload_created_ts,
        tokens.token_issued,
        tokens.token_expiration,
        tokens.token_accesstoken_txt as token_accesstoken,
        tokens.token_days_valid
      FROM
        applications
      LEFT JOIN
        payloads ON (
          payloads.application_id = applications.application_id
        )
      LEFT JOIN
        tokens ON (
          tokens.call_uuidv4_bin = payloads.call_uuidv4_bin
        )
      WHERE
        application_uuidv4_bin = UNHEX(REPLACE(:app,'-',''))
      AND
        application_auth0_owner = :user
      AND
        application_disabled = 0
      AND
        payloads.call_uuidv4_bin IS NOT NULL
      ORDER BY
        FIELD(payloads.call_uuidv4_bin, UNHEX(REPLACE(:record,'-',''))) DESC,
        payloads.payload_id DESC
      LIMIT :skip, :take
    `, {
      user: req.__auth.jwt.sub || '',
      app: req.params.appId || '',
      record: req.params.selectedRecord || '',
      skip: 0,
      take: 50
    })

    // await new Promise((resolve, reject) => {
    //   setTimeout(() => {
    //     resolve()
    //   }, 4000)
    // })

    if (data.constructor.name === 'Array' && data.length > 0 && data[0].constructor.name === 'RowDataPacket') {
      return res.json(data.map(r => {
        const record = Object.assign({}, r)
        Object.keys(record).forEach(k => {
          if ((new RegExp('_id$')).test(k) || ['call_emessage_debug'].indexOf(k) > -1) {
            Object.assign(record, { [k]: undefined })
          }
        })
        return record
      }))
    }
    return res.json({ data: false })
} catch (e) {
    e.httpCode = e.code = 404
    return res.handleError(e)
  }
}
