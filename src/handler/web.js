const log = require('~src/handler/log')('app:web')

const translations = require('~src/global/translations')
const express = require('express')
const nunjucks = require('nunjucks')
const locale = require('express-locale')
const mobile = require('is-mobile')

const bodyParser = require('body-parser')

const QrPng = require('./web-misc/qr-png')
const QrJson = require('./web-misc/qr-json')
const QrTxHashJson = require('./web-misc/hash-qr-array')
const HashIconPng = require('./web-misc/hashicon-png')

const dbExtension = require('~web/nunjucks_extensions/db')
const apiExtension = require('~web/nunjucks_extensions/api')
const qrExtension = require('~web/nunjucks_extensions/qr')
const I18nFilter = require('~web/nunjucks_extensions/i18n')

module.exports = async function (expressApp) {
  expressApp.use(bodyParser.urlencoded({ extended: true }))
  expressApp.use(locale({
    priority: [ 'custom', 'accept-language', 'default' ],
    lookups: {
      custom (req) {
        const codes = (req.headers['accept-language'] || '').split(',').map(c => c.split(';')[0])
        for (code in codes) {
          if (codes[code].length !== 2) {
            break
          } else {
            if (Object.keys(translations.raw).indexOf(codes[code]) > -1) {
              return codes[code].toLowerCase() + '-' + codes[code].toUpperCase()
            }
          }
        }
        return undefined
      }
    },
    default: 'en-GB'
  }))
  
  /**
   * WEB Router
   */
  const router = express.Router()

  router.get(['/', '/index.html'], (req, res, next) => {
    if (req.hostname === (req.config.deeplinkRedirectLocation || '')) {
      // Do nothing, will be handled. redirectLocation doesn't serve homepage.
      return next('route')
    } else if (req.hostname === (req.config.userProfileLocation || '')) {
      // Do nothing, will be handled. redirectLocation doesn't serve homepage.
      return res.redirect(301, req.config.baselocation)
    } else{
      return res.render('index.html', {
        module: 'index',
        baselocation: req.config.baselocation,
        path: req.path
      })
    }
  })

  router.get('/app/webviews/:type([a-zA-Z0-9-]+)/:language([a-zA-Z_-]+)?', (req, res, next) => {
    return res.render('webviews/' + req.params.type + '/index.html', {
      ...req.query,
      module: 'webviews',
      mode: req.config.mode,
      version: req.config.TosAndPrivacyPolicyVersion || 1,
      ...(req.params)
    })
  })

  router.get('/*', (req, res, next) => {
    if (req.url.match(/\.(css|png|jpg|gif|js|ico|svg)$/)) {
      res.setHeader('Cache-Control', 'max-age=2592000, public')
    }
    Object.assign(res.locals, {
      locale: req.locale,
      baselocation: req.config.baselocation,
      mode: req.config.mode,
      appstorelinks: req.config.AppStoreLinks,
      trusted: req.ipTrusted,
      hostname: req.hostname,
      deeplinkRedirectLocation: req.config.deeplinkRedirectLocation
    })
    next()
  }, express.static('public_html'))

  const handleSignPage = (req, res, next) => {
    Object.assign(res.locals, {
      uuid: req.params.uuid || '',
      params: req.params,
      mobile: mobile({ ua: req.headers['user-agent'] || '', tablet: true }),
      is: {
        ios: (req.headers['user-agent'] || '').match(/iPhone|iPad/i),
        mac: (req.headers['user-agent'] || '').match(/Macintosh/i),
        android: (req.headers['user-agent'] || '').match(/android/i)
      },
      mode: req.config.mode
    })
    return res.render('sign.html')
  }

  /**
   * Serve sign page for deeplinkRedirection domain no matter the path, or redirect to primary domain
   */
  router.get('*', (req, res, next) => {
    if (req.hostname === (req.config.deeplinkRedirectLocation || '')) {
      // res.redirect(301, req.config.baselocation + '/sign/' + req.params.uuid + '/deeplink')
      const uuid = req.params[0].match(/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89ABab][0-9a-fA-F]{3}-[0-9a-fA-F]{12}/)
      if (uuid && uuid.length > 0) {
        req.params.uuid = uuid[0]
        // OK, skip and next()
        return next()
      } else {
        return res.redirect(301, req.config.baselocation + (req.params[0] || ''))
      }
    } else if (req.hostname === (req.config.userProfileLocation || '')) {
      // Route to user page
      req.url = `/user${req.url}`
      return next('route')  
    }
    return next('route')
  }, handleSignPage)

  router.get('/user/:handle([a-zA-Z0-9_-]+)([/+ ]?):account([a-zA-Z0-9_-]+)?', (req, res, next) => {
    return res.render('user-profiles/index.html', {
      module: 'profile',
      baselocation: req.config.baselocation,
      path: req.path,
      handle: req.params.handle || undefined,
      account: req.params.account || undefined,
      params: req.params,
      mobile: mobile({ ua: req.headers['user-agent'] || '', tablet: true }),
      is: {
        ios: (req.headers['user-agent'] || '').match(/iPhone|iPad/i),
        mac: (req.headers['user-agent'] || '').match(/Macintosh/i),
        android: (req.headers['user-agent'] || '').match(/android/i)
      },
      mode: req.config.mode,
      locale: req.locale,
      baselocation: req.config.baselocation,
      mode: req.config.mode,
      appstorelinks: req.config.AppStoreLinks,
      trusted: req.ipTrusted,
      hostname: req.hostname
    })
  })

  router.get('/about', (req, res, next) => {
    // throw new Error("BROKEN")
    return res.render('about.html')
  })

  router.get('/tangem', (req, res, next) => {
    // throw new Error("BROKEN")
    return res.render('tangem.html')
  })

  router.get('/sign/:uuid([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89ABab][0-9a-fA-F]{3}-[0-9a-fA-F]{12}):qr(/qr)?:deeplink(/deeplink)?', handleSignPage)
  router.get('/sign/:uuid([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89ABab][0-9a-fA-F]{3}-[0-9a-fA-F]{12}):level(_[mqh])?.png', QrPng)
  router.get('/tx/:hash([0-9a-fA-F]{64}).json', QrTxHashJson)
  router.get('/sign/:uuid([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-4[0-9a-fA-F]{3}-[89ABab][0-9a-fA-F]{3}-[0-9a-fA-F]{12}):level(_[mqh])?.json', QrJson)
  router.get('/avatar/:account(r[a-zA-Z0-9]{18,}):size(_[0-9]{1,3})?:padding(_[0-9]{1,3})?.png', HashIconPng)

  // WEBROUTER WILDCARD - FALLBACK
  router.all('*', function(req, res){
    if ('OPTIONS' === req.method) {
      if (typeof req.session !== 'undefined') {
        req.session.destroy()
      }
      res.sendStatus(200)
    } else {
      res.status(404).render('404', { error: 'file not found' })
    }
  })

  // Use
  expressApp.use('/web', router)

  /**
   * Template engine
   */
  expressApp.set('view engine', 'html')

  const env = nunjucks.configure([ 'public_html', 'src/web/template' ], {
    noCache: expressApp.config.mode === 'development',
    watch: expressApp.config.mode === 'development',
    autoescape: true,
    express: expressApp
  })

  env.addGlobal('year', (new Date()).getYear() + 1900)

  env.addExtension('api', new apiExtension(expressApp, 'web'))
  env.addExtension('db', new dbExtension(expressApp))
  env.addExtension('qr', new qrExtension())

  /**
   * Add translations i18n, read from folder with
   * translation js files.
   */  
  env.addFilter('i18n', new I18nFilter({
    default: 'en',
    translations: translations.raw
  }))

  // env.addFilter('sleep', function sleep (input, callback) {
  //   const args = Object.values(arguments).slice(1, -1)
  //   setTimeout(() => {
  //     arguments[arguments.length - 1](false, arguments[0])
  //   }, (args[0] || 1) * 1000)
  // }, true)

  env.addFilter('test', function sleep (input, callback) {
    const args = Object.values(arguments).slice(1, -1)
    return new Promise((resolve, reject) => {
      setTimeout(() => {
        resolve([ 'a', 'b', 'c', 'd' ])
      }, (args[0] || 1) * 1000)
    }).then(results => {
      arguments[arguments.length - 1](false, results)
    })
  }, true)
}
