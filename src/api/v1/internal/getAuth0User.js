const fetch = require('node-fetch')
// const log = require('~src/handler/log')('app:auth0')

module.exports = async (config, user) => {
  const getAuth0TokenCall = await fetch('https://xumm.eu.auth0.com/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json'
    },
    body: JSON.stringify(config)
  })
  const getAuth0Token = await getAuth0TokenCall.json()
  const userDetailsCall = await fetch('https://xumm.eu.auth0.com/api/v2/users/' + encodeURIComponent(user), {
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': 'Bearer ' + getAuth0Token.access_token
    }
  })
  const userDetails = await userDetailsCall.json()

  return userDetails
}
