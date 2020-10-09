const logws = require('~src/handler/log')('app:web:ws')
const jwt = require('../middleware/auth/devconsole-jwt')

const express = require('express')
const expressWs = require('express-ws')

module.exports = async function (expressApp) {
  expressWs(expressApp)

  /**
   * WebSocket Router
   */
  const router = express.Router()

  // Sign page, users, visitors
  router.ws('/sign/:uuid([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89ABab][0-9a-fA-F]{3}-[0-9a-fA-F]{12})*', (ws, req) => {
    if (typeof req.params.uuid !== undefined) {
      req.db(`
        UPDATE
          payloads
        SET
          payload_ws_opencount = payload_ws_opencount + 1
        WHERE
          call_uuidv4_bin = UNHEX(REPLACE(:call_uuidv4, '-', ''))
        LIMIT 1
      `, { call_uuidv4: req.params.uuid }).then(async r => {
        if (r.constructor.name === 'OkPacket' && typeof r.changedRows !== undefined && r.changedRows > 0) {
          logws('Websocket connected:', req.params.uuid)
          const pubSubChannel = `sign:${req.params.uuid}`
          let payloadTimeoutTimer
          let payloadKeepaliveInterval
          const connectedTs = new Date() / 1000
    
          ws.sendJson = (data) => {
            const json = JSON.stringify(data)
            try {
              ws.send(json)
            } catch (e) {}
          }
    
          const redisMessageHandler = expressApp.redis.subscribe(pubSubChannel, (message) => {
            try {
              const json = JSON.parse(message)
              logws(`  < PubSub MSG @ [ ${pubSubChannel} ]`, json)
              ws.sendJson(json)
            } catch (e) {
              logws(`  < PubSub MSG @ [ ${pubSubChannel} ] ! NON JSON`)
            }
          })
    
          ws.sendJson({ message: `Welcome ` + req.params.uuid })

          ws.on('close', () => {
            logws('Bye', req.params.uuid)
            redisMessageHandler.destroy()
            clearTimeout(payloadTimeoutTimer)
            clearInterval(payloadKeepaliveInterval)
          })

          ws.on('message', (msg) => {
            logws(`<PAYLOAD> WebSocket message from [ ${req.params.uuid} ] `, msg)
            ws.sendJson({ message: `Right back at you!` })
          })

          const payloadExpired = () => {
            ws.sendJson({ expired: true })
            logws(`Payload ${req.params.uuid} expired`)
          }

          const setKeepaliveInterval = (timediff) => {
            payloadKeepaliveInterval = setInterval(() => {
              const expires_in_seconds = timediff * -1 - Math.round(new Date() / 1000 - connectedTs)
              ws.sendJson({ expires_in_seconds })
              if (expires_in_seconds < 120 && expires_in_seconds > 0 && typeof req.payloadExpirationTimeout === 'undefined') {
                req.payloadExpirationTimeout = setTimeout(() => {
                  payloadExpired()
                }, expires_in_seconds * 1000)
              }
            }, 15 * 1000)
          }

          const payloadExpiration = await req.db(`
            SELECT
              (UNIX_TIMESTAMP(CURRENT_TIMESTAMP) - UNIX_TIMESTAMP(payload_expiration)) as timediff,
              IF(payload_resolved IS NULL, 1, 0) as active
            FROM
              payloads
            WHERE
              call_uuidv4_bin = UNHEX(REPLACE(:call_uuidv4, '-', ''))
            LIMIT 1
          `, { call_uuidv4: req.params.uuid })
          if (payloadExpiration.length === 1 && payloadExpiration[0].active === 0) {
            // Resolved
            payloadExpired()
          } else if (payloadExpiration.length === 1 && payloadExpiration[0].timediff >= 0) {
            payloadExpired()
            setKeepaliveInterval(payloadExpiration[0].timediff)
          } else if (payloadExpiration.length < 1) {
            ws.sendJson({ message: `Invalid payload!` })
            setTimeout(() => {
              ws.close()
            }, 100)
          } else if (payloadExpiration.length === 1 && payloadExpiration[0].timediff < 0) {
            logws(`Payload ${req.params.uuid} expires in ${payloadExpiration[0].timediff * -1} seconds, set timer`)
            const expires_in_seconds = payloadExpiration[0].timediff * -1
            ws.sendJson({ expires_in_seconds })
          
            if (expires_in_seconds < 864000) { // Ten days
              req.payloadExpirationTimeout = setTimeout(payloadExpired, payloadExpiration[0].timediff * -1 * 1000)
            }

            setKeepaliveInterval(payloadExpiration[0].timediff)
          }
        }
      })
    }
  })

  // App admin console
  router.ws('/app/:uuid([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89ABab][0-9a-fA-F]{3}-[0-9a-fA-F]{12})*', (ws, req) => {
    const authMsg = `Please send { auth: 'SomeBase64JWT' } command to authorize this socket.`
    const pubSubChannel = `app:${req.params.uuid}`
    let redisMessageHandler
    let authorized

    const authTimeout = setTimeout(() => {
      const nonAuthMsg = `Sorry, closing connection: auth timeout.`
      logws(nonAuthMsg)
      ws.sendJson({ message: nonAuthMsg })
      ws.close()
    }, 5 * 1000)

    ws.sendJson = (data) => {
      const json = JSON.stringify(data)
      try {
        ws.send(json)
      } catch (e) {}
    }

    ws.on('close', () => {
      logws('Bye', req.params.uuid)
      if (typeof redisMessageHandler !== 'undefined') {
        redisMessageHandler.destroy()
      }
    })

    ws.on('message', (msg) => {
      logws(`<DEVCONSOLE> WebSocket message from [ ${req.params.uuid} ] `, msg.replace(/Bearer .+/, 'Bearer...'))
      if (typeof authorized === 'undefined') {
        try {
          const json = JSON.parse(msg)
          const bearer = json.auth.trim().split(' ').reverse()[0]
          req.headers.authorization = `Bearer ${bearer}`
          const jwtAuth = jwt(expressApp, req, {
              set () {},
              handleError (e) {
                logws('handleError', e.message)
              }
            }, { route: req })
            jwtAuth.then(r => {
              authorized = r
              ws.sendJson({ message: `Welcome '${r.jwt_sub}' :D You're now authorized! Now just wait for updates to [${pubSubChannel}].` })
              clearTimeout(authTimeout)
              redisMessageHandler = req.app.redis.subscribe(pubSubChannel, message => {
                try {
                  const json = JSON.parse(message)
                  logws(`  < DevConsole [${pubSubChannel}] PubSub MSG @ [ ${pubSubChannel} ]`, json)
                  ws.sendJson(json)
                } catch (e) {
                  logws(`  < DevConsole [${pubSubChannel}] PubSub MSG @ [ ${pubSubChannel} ] ! NON JSON`)
                }
              })
            }).catch(e => {
              ws.sendJson({ message: `Invalid JWT` })
              logws('jwtAuthCatch', e.message)
            })
        } catch (e) {
          ws.sendJson({ message: authMsg })
        }
      } else {
        ws.sendJson({ message: `Auth valid :) Right back at you!` })
      }
    })

    ws.sendJson({ message: `Welcome ${req.params.uuid}. ${authMsg}` })
  })

  // Use
  expressApp.use('/wss', router)
}
