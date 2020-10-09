const helmet = require('helmet')

module.exports = async (expressApp) => {
  expressApp.disable('x-powered-by')
  expressApp.use(helmet({
    frameguard: true,
    referrerPolicy: { 
      policy: 'same-origin'
    },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: [ "'self'" ].concat(expressApp.config.resources.default || []),
        // unsafe-eval required for VueJS
        // ununsafe-inline required for WS Tests
        scriptSrc: [ "'self'", "'unsafe-inline'", "'unsafe-eval'" ].concat(expressApp.config.resources.script || []),
        styleSrc: [ "'self'", "'unsafe-inline'" ].concat(expressApp.config.resources.styles || []),
        connectSrc: [ "'self'" ].concat(expressApp.config.resources.connect || []),
        imgSrc: [ "'self'" ].concat(expressApp.config.resources.images || []),
        fontSrc: [ "'self'" ].concat(expressApp.config.resources.fonts || [])
      }
    }
  }))
}
