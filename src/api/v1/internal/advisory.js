const fetch = require('node-fetch')
const log = require('~src/handler/log')('app:advisory')
const getConfig = require('~src/middleware/config')

const ttlSeconds = 60 * 15 * 4 // Update every 15 minutes * 4 = 60 min = 1 hour

const advisoryData = {
  levels: {
    E: 'ERROR',
    0: 'UNKNOWN',
    1: 'PROBABLE',
    2: 'HIGH_PROBABILITY',
    3: 'CONFIRMED'
  },
  accounts: {},
  update: 0,
  updating: false
}

const updateAdvisory = async () => {
  advisoryData.updating = true
  log('Advisory data updating (XRPForensics)')
  
  try {
    const config = await getConfig()
    const authCall = await fetch('https://api.xrplorer.com/v1/auth', {
      headers: {'Content-type': 'application/json'},
      method: 'post',
      timeout: 10000,
      redirect: 'follow',
      follow: 3,
      body: JSON.stringify(config.xrpForensicsApi || {})
    })
    const authData = await authCall.json()

    const data = await fetch('https://api.xrplorer.com/v1/advisorylist', {
      headers: {Authorization: 'Bearer ' + authData.access_token || ''},
      method: 'get',
      timeout: 10000,
      redirect: 'follow',
      follow: 3
    })
    const json = await data.json()

    if (Object.keys(json).length < 100) {
      throw new Error('Invalid advisory repsonse (keylen)')
    }

    advisoryData.update = Math.round(new Date() / 1000)
    advisoryData.updating = false

    log('   > Advisory data updated, #accounts: ', Object.keys(json).length)

    Object.assign(advisoryData.accounts, json)

    return true
  } catch (e) {
    advisoryData.updating = false
    log('Error updating advisory data', e.message)

    return false
  }
}

module.exports = async (account) => {
  if (!advisoryData.updating && advisoryData.update > 0 && advisoryData.update < Math.round(new Date() / 1000) - ttlSeconds) {
    log('Update advisory data (TTL)')
    updateAdvisory()
  }
  if (!advisoryData.updating && advisoryData.update === 0) {
    log('<WAIT> Update advisory data (EMPTY)')
    await updateAdvisory()
  }

  const danger = typeof advisoryData.accounts[account] === 'undefined'
    ? advisoryData.levels[0 + '']
    : advisoryData.levels[(advisoryData.accounts[account].status || 0) + ''] || advisoryData.levels['E']
  
  /**
   * Todo: in case of multiple data soruces
   */
  const confirmations = {
    xrpforensics: danger !== 'ERROR' && danger !== 'UNKNOWN' ? true : undefined
  }

  const advisoryForAccount = {
    account,
    danger,
    confirmations
  }

  return advisoryForAccount
}
