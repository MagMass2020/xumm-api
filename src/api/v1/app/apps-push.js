// const log = require('~src/handler/log')('app:curatedious')

module.exports = async (req, res) => {
  try {
    const authorizations = await req.db(`
      SELECT 
        tokens.call_uuidv4_txt as authorization_uuidv4,
        tokens.token_issued as authorization_issued,
        tokens.token_expiration as authorization_expiration,
        tokens.token_days_valid as authorization_days_valid,
        applications.application_name,
        applications.application_description,
        applications.application_icon_url
      FROM
        tokens
      LEFT JOIN
        applications ON (
          applications.application_id = tokens.application_id
        )
      WHERE
        tokens.user_id = :userId
      AND
        tokens.token_hidden < 1
      AND
        tokens.token_reported < 1
      AND
        applications.application_disabled < 1
    `, {
      userId: req.__auth.user.id
    })

    switch (req.method) {
      case 'GET': 
        res.json({
          authorizations: authorizations.map(d => {
            return Object.keys(d).reduce((a, b) => {
              const s = b.split('_')
              if (typeof a[s[0]] === 'undefined') {
                Object.assign(a, { [s[0]]: {} })
              }
              a[s[0]][s.slice(1).join('_')] = d[b]
              return a
            }, {})
          })
        })
      break;

      case 'DELETE':
        if (typeof req.body.uuidv4 === 'undefined') {
          const e = new Error('Authorizations UUIDv4 missing')
          e.code = 404
          throw e
        } else if (authorizations.filter(a => {
          return a.authorization_uuidv4 === req.body.uuidv4
        }).length !== 1) {
          const e = new Error('UUIDv4 invalid / previously revoked')
          e.code = 500
          throw e
        } else {
          res.json({revoked: true})
          req.db(`
            UPDATE 
              tokens
            SET
              tokens.token_expiration = FROM_UNIXTIME(:expire),
              tokens.token_hidden = 1,
              tokens.token_reported = :report,
              tokens.token_reported_desc = :reason
            WHERE
              tokens.user_id = :userId
            AND
              tokens.token_hidden < 1
            AND
              tokens.token_reported < 1
            AND
              tokens.call_uuidv4_bin = UNHEX(REPLACE(:uuidv4,'-',''))
            LIMIT 1
          `, {
            userId: req.__auth.user.id,
            uuidv4: req.body.uuidv4,
            expire: new Date() / 1000,
            report: typeof req.body.report_abuse !== 'undefined' && (req.body.report_abuse === 1 || req.body.report_abuse === true) ? 1 : 0,
            reason: String(req.body.reason || '')
          })
        }
      break;
    }
  } catch (e) {
    res.handleError(e)
  }
}
