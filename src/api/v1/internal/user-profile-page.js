const log = require('~src/handler/log')('app:user-profile-page')
const userProfile = require('~src/api/v1/internal/user-profile-data')

module.exports = async (params, expressApp, invoker) => {
  if (invoker !== 'web') {
    throw new Error('User profile: invoker not implemented')
  }
  // const db = expressApp.db

  // wietse$xumm.me
  // wietse+savings$xumm.me
  // wietse+tipbot$xumm.me

  log('user-profile-page', params)
  const returnAccount = await userProfile(params.handle, null, expressApp.db)
  log('user-profile-page-results', returnAccount)

  return { 
    params,
    ...returnAccount
  }
}
