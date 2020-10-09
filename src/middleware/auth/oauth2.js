const log = require('~src/handler/log')('app:oauth2')

module.exports = async (expressApp, req, res) => {
  log('<< API: PLATFORM OAUTH2 MIDDLEWARE >>')
  return new Promise((resolve, reject) => {
    // Auth middleware allows to overrule (preset, skip next) response 
    // res.json({
    //   test: true
    // })
    // resolve()
    reject(new Error('Nope. OAUTH2 API is not yet ready.'))
  })
}
