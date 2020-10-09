const log = require('~src/handler/log')('app:jwt-tokens')

module.exports = async (req, res) => {
  try {
    const data = await req.db(`
      SELECT
        tokens.*,
        tokens.token_accesstoken_txt as token_accesstoken,
        tokens.call_uuidv4_txt as call_uuidv4,
        tokens.payload_uuidv4_txt as payload_uuidv4
      FROM
        applications
      LEFT JOIN
        tokens ON (
          tokens.application_id = applications.application_id
        )
      WHERE
        application_uuidv4_bin = UNHEX(REPLACE(:app,'-',''))
      AND
        application_auth0_owner = :user
      AND
        application_disabled = 0
      AND
        call_uuidv4_bin IS NOT NULL
      ORDER BY
        tokens.token_id DESC
      LIMIT :skip, :take
    `, {
      user: req.__auth.jwt.sub || '',
      app: req.params.appId || '',
      skip: 0,
      take: 50
    })

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
