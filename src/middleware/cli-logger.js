const log = require('~src/handler/log')('app:cli-logger')

module.exports = async function (expressApp) {
  expressApp.use((req, res, next) => {
    if (typeof req.config.logRequestsToConsole !== 'undefined' && req.config.logRequestsToConsole) {
      if (!req.url.match(/\.(png|svg|css|js|ico)$/i)) {
        log(`>> ${req.method} [${req.config.mode}, trusted: ${req.ipTrusted ? 1 : 0}] Got [${req.routeType}] call [${req.headers['content-type'] ? req.headers['content-type'].split(';')[0] : 'NO CONTENT-TYPE'}] to [${req.url}] from ${req.remoteAddress}`)
      }
    }
    next()
  })
}
