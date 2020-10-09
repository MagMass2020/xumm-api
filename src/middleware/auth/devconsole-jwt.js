const uuid = require('uuid/v4')
const jwt = require('express-jwt')
const jwksRsa = require('jwks-rsa')
const log = require('~src/handler/log')('app:devconsole')

module.exports = async (expressApp, req, res, apiDetails) => {
  const call_uuidv4 = uuid()
  res.set('X-Call-Ref', call_uuidv4)

  return new Promise(async (resolve, reject) => {
    let e

    const _reject = (message, code, httpCode) => {
      e = new Error(message)
      Object.assign(e, { 
        code: code, 
        httpCode: typeof httpCode === 'undefined' || !isNaN(parseInt(httpCode)) ? 403 : parseInt(httpCode) 
      })
      res.handleError(e)
      reject(e)
    }

    // log(req.headers)

    await new Promise((resolve, reject) => {
      try {
        const secretData = {
          cache: true,
          rateLimit: true,
          jwksRequestsPerMinute: 60,
          jwksUri: `https://${req.config.devconsole.jwt.domain}/.well-known/jwks.json`
        }

        const jwtData = {
          audience: req.config.devconsole.jwt.audience,
          issuer: `https://${req.config.devconsole.jwt.domain}/`,
          algorithm: ['RS256']
        }

        // log(jwtData)
        // log(secretData)

        jwt({
          secret: jwksRsa.expressJwtSecret(secretData),
          ...jwtData
        })(req, res, (a, b) => {
          // console.log(req.user)
          resolve(req.user)
          // Todo: JWT error is in b
          // log('a', a)
          // log('b', b)
        })
      } catch (e) {
        // log(e)
        _reject(e.message, 403)
      }
    })

    const now = Math.round(new Date() / 1000)
    if (typeof req.config.devconsole.logJwt === 'undefined' || req.config.devconsole.logJwt) {
      log('user', req.user)
      log('now', now)
      if (req.user) {
        log('now > iat', req.user.iat < now, now - req.user.iat)
        log('now < exp', req.user.exp > now, req.user.exp - now)
      }
    }

    const insertCallLogQuery = `
      INSERT INTO 
        calls
      SET
        application_id = :application_id,
        call_uuidv4_txt = :call_uuidv4,
        call_uuidv4_bin = UNHEX(REPLACE(:call_uuidv4, '-', '')),
        call_moment = CURRENT_TIMESTAMP,
        call_ip = :call_ip,
        call_method = :call_method,
        call_contenttype = :call_contenttype,
        call_endpoint = :call_endpoint,
        call_url = :call_url,
        call_type = :call_type,
        call_version = :call_version,
        call_useragent = :call_useragent,
        call_httpcode = :call_httpcode,
        call_ecode = :call_ecode,
        call_emessage = :call_emessage,
        call_extref = :call_extref
    `
    if (req.user) {
      resolve(Object.assign({}, {
        call_uuidv4: call_uuidv4,
        ...(Object.keys(req.user).filter(a => {
          return a !== 'azp'
        }).reduce((a, b) => {
          Object.assign(a, {
            ['jwt_' + b]: req.user[b]
          })
          return a
        }, {}))
      }))
    } else {
      _reject(`No JWT user`, 800, 401)
    }

    // let extRef = null
    // if (typeof req.params === 'object' && req.params !== null && Object.keys(req.params).length > 0) {
    //   if (Object.keys(req.params)[0].match(/^[a-zA-Z0-9_]+__[a-zA-Z0-9_]+$/)) {
    //     extRef = Object.keys(req.params)[0].split('__')[0] + '(' + req.params[Object.keys(req.params)[0]] + ')'
    //   }
    // }

    res.dbLogLine = req.db(insertCallLogQuery, { 
      call_uuidv4: call_uuidv4,
      application_id: typeof appDetails !== 'undefined' && appDetails.length > 0 ? appDetails[0].application_id : null,
      call_ip: req.remoteAddress,
      call_method: req.method,
      call_contenttype: req.headers['content-type'] ? req.headers['content-type'].split(';')[0] : null,
      call_endpoint: (apiDetails.route.path || req.url).split('/')[0],
      call_url: req.url,
      call_type: apiDetails.type,
      call_version: apiDetails.version,
      call_useragent: req.headers['user-agent'] || null,
      call_httpcode: res.statusCode,
      call_ecode: typeof e !== 'undefined' ? e.code || null : null,
      call_emessage: typeof e !== 'undefined' ? e.message || null : null,
      call_extref: req.user ? req.user.sub : null
      // call_extref: extRef === null ? null : extRef.slice(0, 60)
    })

    return res.dbLogLine
  })
}
