const log = require('@src/handler/log')('app:api')

const express = require('express')
const bodyParser = require('body-parser')
const uuid = require('uuid/v4')
const isError = require('iserror')

module.exports = async function (expressApp) {
  expressApp.use(bodyParser.json())
  expressApp.use(bodyParser.raw()) // {type: '*/*'}
  
  /**
   * API Error handler
   */

  const sendErrorToBugsnag = (e, req = {}) => {
    // expressApp.bugsnagClient.notify
    //isError
    if (typeof expressApp.config.bugsnagKey !== 'undefined') {
      if (typeof expressApp.bugsnagClient !== 'undefined') {
        let error = e
        if (typeof e.causingError !== 'undefined' && e.causingError !== null) {
          error = e.causingError
        }
        if (!isError(error)) {
          error = Object.assign(new Error(error.message || error), e)
        }
        expressApp.bugsnagClient.notify(error, event => {
          event.addMetadata('xumm', {
            auth: req.__auth || {},
            hostname: req.hostname || '',
            router: req.routeType || '',
            url: req.originalUrl || '',
            method: req.method || '',
            ip: req.remoteAddress || '',
            headers: req.headers || []
          })
          if (typeof req.body === 'object' || typeof req.body === 'string') {
            event.addMetadata('body', {
              body: req.body
            })
          }
        })
      }
    }
  }

  Object.assign(expressApp, {sendErrorToBugsnag})

  const errorHandler = async (e, req, res) => {
    // TODO: migrate to module
    sendErrorToBugsnag(e, req)

    const errorRef = res.get('X-Call-Ref') || uuid()
    const code = parseInt(((e.code || '') + '').replace(/[^0-9]/g, ''))
    log(`ERROR @ ${req.remoteAddress || req.ip} ${errorRef} - ${e.message} (${e.httpCode||'-'})`, req.config.__env === 'dev' ? e : undefined)
    res.status(typeof e.httpCode === 'undefined' || isNaN(parseInt(e.httpCode)) ? 400 : parseInt(e.httpCode)).json({
      error: {
        reference: errorRef,
        code: isNaN(code) ? null : code
      }
    })

    if (typeof e.sqlMessage !== 'undefined') {
      // Internal DB error, move error to causingError to prevent error detail bleeding
      const sqlError = ((e.code || '') + ' ' + e.sqlMessage).trim()
      e = new Error('Platform (internal) exception')
      e.causingError = sqlError
    }

    const dbCallUpdateQuery = `
      UPDATE 
        calls 
      SET 
        call_httpcode = :call_httpcode,
        call_ecode = :call_ecode,
        call_emessage = :call_emessage,
        call_emessage_debug = :call_emessage_debug,
        application_id = IF(application_id IS NULL, :application_id, application_id)
      WHERE
        call_uuidv4_bin = UNHEX(REPLACE(:call_uuidv4, '-', ''))
      LIMIT 1
    `

    let causingError = null
    if (typeof e !== 'undefined') {
      if (typeof e.causingError === 'string') {
        causingError = e.causingError.slice(0, 100)
      } else if (typeof e.causingError === 'object' && e.causingError !== null && typeof e.causingError.message !== 'undefined') {
        causingError = e.causingError.message.slice(0, 100)
      }
    }

    if (typeof res.dbLogLine !== 'undefined') {
      await res.dbLogLine
    }

    const db = await req.db(dbCallUpdateQuery, { 
      call_uuidv4: errorRef,
      call_httpcode: res.statusCode,
      call_ecode: isNaN(code) ? null : code,
      call_emessage: typeof e !== 'undefined' && typeof e.message === 'string' ? e.message.slice(0, 100) : null,
      call_emessage_debug: causingError,
      application_id: typeof e !== 'undefined' && typeof e.applicationId !== 'undefined' ? e.applicationId : null
    })
  }

  /**
   * API Router
   */
  const router = express.Router()

  router.get('/', function(req, res) {
    // throw new Error("BROKEN")
    res.json({ message: 'XRPL Labs - Signing Platform' })
  })

  const apiDefinition = {
    v1: {
      /**
       * App: custom auth, for our App
       */
      app: {
        middleware: 'auth/app',
        routes: [
          /**
           * add-user
           *    > Add user + pairing, new device, new registration
           * 
           * Disable middleware: no unique device ID is known yet,
           * wait for device activation callback.
           */
          { 
            method: 'post',
            path: 'add-user',
            disableAuth: true,
            // module: 'some-alt-file-at-disk'
          },
          { method: 'post', path: 'activate-device', disableAuth: true },
          { method: 'post', path: 'ping' },
          { method: 'post', path: 'dev/push/raw', module: 'dev-push-raw' },
          { method: 'post', path: 'update-device' },
          { method: 'post', path: 'add-device' },
          { method: [ 'get', 'patch', 'delete' ], path: 'pending-devices' },
          { method: [ 'get', 'patch', 'post' ], path: 'payload/:payloads__payload_id([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89ABab][0-9a-fA-F]{3}-[0-9a-fA-F]{12})', module: 'payload' },
          { method: 'get', path: 'pending-payloads' },
          { method: 'get', path: 'user-devices' },
          { method: 'get', path: 'curated-ious' },
          { method: 'get', path: 'liquidity-boundaries/:issuer(r[a-zA-Z0-9]{3,})/:iou([^/]{3,})', module: 'liquidity-boundaries' },
          { method: 'get', path: 'account-info/:address(r[a-zA-Z0-9]{3,})', module: 'account-info' },
          { method: 'get', path: 'handle-lookup/:handle', module: 'handle-lookup' },
          { method: 'get', path: 'account-advisory/:address(r[a-zA-Z0-9]{3,})', module: 'account-advisory' },
          { method: [ 'get', 'delete' ], path: 'apps/push', module: 'apps-push' },
          { method: 'get', path: 'translation/:payloads__payload_id([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89ABab][0-9a-fA-F]{3}-[0-9a-fA-F]{12})', module: 'translation' },
        ],
        errorHandler: errorHandler
      },
      /**
       * Platform: Simple custom API for 3rd party Developers
       */
      platform: {
        middleware: 'auth/platform',
        routes: [
          { method: [ 'get', 'post' ], path: 'ping-nomiddleware', disableMiddleware: true, module: 'ping' },
          { method: [ 'get', 'post' ], path: 'ping-noauth', disableAuth: true, module: 'ping' },
          { method: [ 'get', 'post' ], path: 'ping' },
          { method: [ 'get', 'post', 'delete' ], path: 'app-storage' },
          { method: 'get', path: 'curated-assets' },
          { method: [ 'get' ], path: 'payload/:payloads__payload_id([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89ABab][0-9a-fA-F]{3}-[0-9a-fA-F]{12})', module: 'payload-get' },
          { method: [ 'get' ], path: 'payload/ci/:payloads_external_meta__meta_string(*)', module: 'payload-get' },
          { method: [ 'delete' ], path: 'payload/:payloads__payload_id([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89ABab][0-9a-fA-F]{3}-[0-9a-fA-F]{12})', module: 'payload-cancel' },
          { method: [ 'post' ], path: 'payload', module: 'payload-post' },
        ],
        errorHandler: errorHandler
      },
      console: {
        middleware: 'auth/devconsole-jwt',
        routes: [
          { method: [ 'get', 'post' ], path: 'ping' },
          { method: [ 'get' ], path: 'apps' },
          { method: [ 'get' ], module: 'calls', path: 'calls/:appId([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89ABab][0-9a-fA-F]{3}-[0-9a-fA-F]{12})/:selectedRecord([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89ABab][0-9a-fA-F]{3}-[0-9a-fA-F]{12})?' },
          { method: [ 'get' ], module: 'docs-jwt', path: 'docs-jwt/:appId([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89ABab][0-9a-fA-F]{3}-[0-9a-fA-F]{12})' },
          { method: [ 'get' ], module: 'payloads', path: 'payloads/:appId([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89ABab][0-9a-fA-F]{3}-[0-9a-fA-F]{12})/:selectedRecord([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89ABab][0-9a-fA-F]{3}-[0-9a-fA-F]{12})?' },
          { method: [ 'get' ], module: 'user-tokens', path: 'user-tokens/:appId([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89ABab][0-9a-fA-F]{3}-[0-9a-fA-F]{12})/:selectedRecord([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89ABab][0-9a-fA-F]{3}-[0-9a-fA-F]{12})?' },
          { method: [ 'post' ], path: 'app', module: 'persist-app' },
          { method: [ 'post', 'delete', 'patch' ], path: 'app/:appId([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89ABab][0-9a-fA-F]{3}-[0-9a-fA-F]{12})', module: 'persist-app' },
          { method: [ 'post' ], path: 'store-logo' }
          // { method: [ 'post' ], path: 'payload', module: 'payload-post' },
        ],
        errorHandler: errorHandler
      },
      /**
       * Platform: OAuth2 for 3rd party Developers
       */
      oauth2: {
        middleware: 'auth/oauth2',
        routes: [
          // Todo
        ],
        errorHandler: errorHandler
      }
    }
  }

  Object.keys(apiDefinition).map(apiVersion => {
    Object.keys(apiDefinition[apiVersion]).map(apiType => {
      const apiDetails = apiDefinition[apiVersion][apiType]
      apiDetails.routes.map(route => {
        let methods = route.method
        if (typeof methods === 'string') {
          methods = [ methods ]
        }
        methods.forEach(method => {
          router[method](`/${apiVersion}/${apiType}/${route.path}`, [ async (req, res, next) => {
            req.__auth = {}
            if (typeof apiDetails.errorHandler !== 'undefined') {
              Object.assign(res, {
                handleError (error) {
                  return apiDetails.errorHandler(error, req, res)
                }
              })
            }
            if (typeof route.disableMiddleware === 'undefined' || !route.disableMiddleware) {
              require(`../middleware/${apiDetails.middleware}`)(expressApp, req, res, {
                route: route,
                version: apiVersion,
                type: apiType,
                auth: typeof route.disableAuth === 'undefined' || !route.disableAuth
              })
                .then(r => {
                  if (typeof r !== 'undefined') {
                    // log(`API Auth middleware [ next ]`, r)
                    req.__auth = Object.keys(r).reduce((a, b) => {
                      const s = b.replace(/^_+/, '').split('_')
                      if (s[0] !== '') {
                        if (typeof a[s[0]] === 'undefined') a[s[0]] = {}
                        a[s[0]][s[1]] = r[b]
                      }
                      return a
                    }, {})
                  }
                  /**
                   * Middleware is allowed to send cusom responses, skip
                   * the followup method if his has happened.
                   */
                  if (!res.headersSent) {
                    next()
                  }
                })
                .catch(e => {
                  /**
                   * Middleware is allowed to send cusom responses, skip
                   * the generic 500 error if this has happened.
                   */
                  if (!res.headersSent) {
                    /**
                     * Todo: normalize errors (per api type?)
                     */
                    if (typeof expressApp.config.bugsnagKey !== 'undefined') {
                      if (typeof expressApp.bugsnagClient !== 'undefined') {
                        sendErrorToBugsnag(e, req)
                      }
                    }                      
                    res.status(500).json({ 
                      error: true,
                      message: `API Auth middleware rejected: [ ${e.message} ]`,
                      code: 500,
                      reference: '',
                      req: req.url,
                      method: req.method
                    })
                  }
                })
            } else {
              next()
            }
          } ], require(`@api/${apiVersion}/${apiType}/${route.module || route.path}`))
        })
      })
    })
  })

  router.post('/', async (req, res, next) => {
    if (typeof req.body === 'object' && typeof req.body.name !== 'undefined') {
      res.json({ 
        message: 'Test response',
        env: {
          mode: req.config.mode,
          remoteAddress: req.remoteAddress,
          ipTrusted: req.ipTrusted
        },
        data: {
          body: req.body,
          query: req.query
        },
        db: await expressApp.db(`SELECT "YES" as online`)
      })
    } else {
      next()
    }
  })

  // API ROUTER WILDCARD - FALLBACK
  router.all('*', function(req, res){
    if ('OPTIONS' === req.method) {
      res.sendStatus(200)
    } else {
      /**
       * Todo: normalize errors (per api type?)
       */
      res.status(404).json({ 
        error: true,
        message: 'Endpoint unknown or method invalid for given endpoint',
        reference: '',
        code: 404, 
        req: req.url,
        method: req.method
      })
    }
  })

  // Use
  expressApp.use('/api', router)
}
