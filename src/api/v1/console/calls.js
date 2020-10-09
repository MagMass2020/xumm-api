const log = require('~src/handler/log')('app:console')

module.exports = async (req, res) => {
  try {
    const data = await req.db(`
      SELECT
        calls.*,
        calls.call_uuidv4_txt as call_uuidv4,
        UNIX_TIMESTAMP(calls.call_moment) as call_moment_ts,
        payloads.call_uuidv4_txt as payload_uuidv4,
        tokens.token_issued,
        tokens.token_expiration,
        tokens.token_accesstoken_txt as token_accesstoken,
        tokens.token_days_valid,
        tokens.token_hidden
      FROM
        applications
      LEFT JOIN
        calls ON (
          calls.application_id = applications.application_id
        )
      LEFT JOIN
        payloads ON (
          payloads.call_uuidv4_bin = calls.call_uuidv4_bin
        )
      LEFT JOIN
        tokens ON (
          tokens.call_uuidv4_bin = calls.call_uuidv4_bin
        )
      WHERE
        application_uuidv4_bin = UNHEX(REPLACE(:app,'-',''))
      AND
        application_auth0_owner = :user
      AND
        application_disabled = 0
      AND
      	(
          calls.call_type = 'platform'
          OR
          (calls.call_type = 'app' AND calls.call_method = 'PATCH' AND calls.call_endpoint = 'payload' AND calls.call_httpcode != 200)
        )
      ORDER BY
        FIELD(calls.call_uuidv4_bin, UNHEX(REPLACE(:record,'-',''))) DESC,
        calls.call_id DESC
      LIMIT :skip, :take
    `, {
      user: req.__auth.jwt.sub || '',
      app: req.params.appId || '',
      record: req.params.selectedRecord || '',
      skip: 0,
      take: 50
    })

    if (data.constructor.name === 'Array' && data.length > 0 && data[0].constructor.name === 'RowDataPacket') {
      return res.json(data.map(r => {
        const record = Object.assign({}, r)
        Object.keys(record).forEach(k => {
          if ((new RegExp('_id$')).test(k)) {
            //  || ['call_emessage_debug'].indexOf(k) > -1 » Allow passing call_emessage_debug to devs for eg. underlying paylaod create errors
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
