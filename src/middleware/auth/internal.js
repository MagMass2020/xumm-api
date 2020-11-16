const log = require('~src/handler/log')('app:internal-api')

module.exports = async (expressApp, req, res) => {
  // log('<< API: INTERNAL MIDDLEWARE >>')
  if (req.ipTrusted) {
    // log(req.headers.authorization)
    return
  }
  throw new Error('Nope.')
}
