const fetch = require('node-fetch')
// const log = require('~src/handler/log')('app:checkdea')

module.exports = async (email) => {
  const getDeaCall = await fetch('https://disposable.debounce.io/?email=' + encodeURIComponent(email), {
    headers: {
      'Content-Type': 'application/json'
    }
  })
  const getDea = await getDeaCall.json()

  return typeof getDea.disposable === 'string' && getDea.disposable === 'true'
}
