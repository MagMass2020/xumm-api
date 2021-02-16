const fetch = require('node-fetch')
const log = require('~src/handler/log')('app:known-account-hydrate')

const recordMaxDays = 3
const recordMaxDaysUnknown = 1

module.exports = (db, account, config) => {
  let response = {
    account: account,
    name: null,
    domain: null,
    blocked: false,
    source: 'none'
  }

  const persist = (data) => {
    /**
     * Remove potential existing (prefixed) 'internal:' result
     */
    if (typeof data.source === 'string') {
      data.source = data.source.split(':').reverse()[0]
    }

    if ((data.source === '' || data.source === null) && data.name === null && data.domain === null) {
      // No results, nothing to persist
      return false
    } else {
      return db(`
        INSERT INTO knownaccounts (
          knownaccount_account,
          knownaccount_name,
          knownaccount_domain,
          knownaccount_source
        )
        VALUES (
          :account,
          :name,
          :domain,
          :source
        )
        ON DUPLICATE KEY UPDATE
          knownaccount_name = IF(:name = '' OR :name IS NULL, knownaccount_name, :name),
          knownaccount_source = IF(:source = '' OR :source IS NULL, knownaccount_source, :source),
          knownaccount_domain = IF(:domain = '' OR :domain IS NULL, knownaccount_domain, :domain),
          knownaccount_updated = CURRENT_TIMESTAMP
      `, data)
    }
  }

  const lookupBithomp = () => {
    return new Promise(async (resolve, reject) => {
      /**
       * Lookup @ Bithomp API
       */
      log(`  --> Fetching accountinfo @ Bithomp [ ${account} ]`)
      try {
        const bithomp = await fetch('https://bithomp.com/api/v2/address/' + account + '?service=true&username=true&verifiedDomain=true&blacklisted=true', { 
          follow: 1,
          timeout: 2500,
          headers: {
            'x-bithomp-token': config.bithompToken
          }
        })
        const bithompResponse = await bithomp.json()
        if (typeof bithompResponse === 'object' && bithompResponse !== null && ((typeof bithompResponse.service !== 'undefined' && bithompResponse.service.name !== 'undefined') || (typeof bithompResponse.username !== 'undefined'))) {
          response = {
            account: account,
            name: bithompResponse.service ? bithompResponse.service.name : (bithompResponse.username || null),
            domain: bithompResponse.verifiedDomain || (bithompResponse.service ? bithompResponse.service.domain : (bithompResponse.username || null)),
            blocked: false,
            source: 'bithomp.com'
          }
          log(response)
        }
        if (response.name === null || response.name === '') {
          resolve()
        } else {
          resolve(response)
        }
      } catch (e) {
        resolve()
      }
    })
  }

  const lookupXrpScan = () => {
    return new Promise(async (resolve, reject) => {
      /**
       * Lookup @ Bithomp API
       */
      log(`  --> Fetching accountinfo @ XRPScan [ ${account} ]`)
      try {
        const xrpscan = await fetch('https://api.xrpscan.com/api/v1/account/' + account, { follow: 1, timeout: 1500 })
        const xrpscanResponse = await xrpscan.json()
        if (typeof xrpscanResponse === 'object' && xrpscanResponse !== null && typeof xrpscanResponse.accountName === 'object' && xrpscanResponse.accountName !== null && typeof xrpscanResponse.accountName.name === 'string') {
          response = {
            account: account,
            name: xrpscanResponse.accountName.name,
            domain: xrpscanResponse.accountName.domain || null,
            blocked: false,
            source: 'xrpscan.com'
          }
        }
        if (response.name === null || response.name === '') {
          resolve()
        } else {
          resolve(response)
        }
      } catch (e) {
        resolve()
      }
    })
  }

  const lookupXrpl = () => {
    return new Promise(async (resolve, reject) => {
      /**
       * Lookup @ XRPL (Domain & MailHash field)
       */
      let source = 's1.ripple.com'

      log(`  --> Fetching accountinfo @ XRPL [ ${account} ]`)
      try {
        const rippled = await fetch('https://s1.ripple.com:51234/', { 
          method: 'post', 
          body: JSON.stringify({
            method: 'account_info',
            params: [ { account: account } ]
          }), 
          follow: 0, 
          timeout: 2500 
        })
        const rippledResponse = await rippled.json()

        if (typeof rippledResponse === 'object' && rippledResponse !== null && typeof rippledResponse.result === 'object' && typeof rippledResponse.result.account_data === 'object') {
          let domain = null
          if (typeof rippledResponse.result.account_data.Domain !== 'undefined' && rippledResponse.result.account_data.Domain.match(/^[A-F0-9]+$/)) {
            domain = Buffer.from(rippledResponse.result.account_data.Domain, 'hex').toString('utf-8')
          }
          if (typeof rippledResponse.result.account_data.EmailHash !== 'undefined' && rippledResponse.result.account_data.EmailHash.match(/^[A-F0-9]{32}$/i)) {
            const gravatar = await fetch('https://nl.gravatar.com/' + rippledResponse.result.account_data.EmailHash.toLowerCase() + '.json', { follow: 1, timeout: 1500 })
            const gravatarResponse = await gravatar.json()
            if (typeof gravatarResponse === 'object' && gravatarResponse !== null && typeof gravatarResponse.entry !== 'undefined' && gravatarResponse.entry.length > 0) {
              const gravatsWithNames = gravatarResponse.entry.filter(r => {
                return typeof r.displayName === 'string'
              })
              if (gravatsWithNames.length > 0) {
                if (response.name === null) {
                  response.name = gravatsWithNames[0].displayName
                  source += ',gravatar'
                }
              }
            }    
          }
          response = {
            account: rippledResponse.result.account_data.Account || '',
            name: response.name,
            domain: domain,
            blocked: false,
            source: source
          }
        }
        if (response.name === null || response.name === '') {
          resolve()
        } else {
          resolve(response)
        }
      } catch (e) {
        resolve(e)
      }
    })
  }

  const lookup = () => {
    const lookups = [ lookupBithomp, lookupXrpScan, lookupXrpl ]
    let resolved = false
    let persisted = false

    return new Promise((resolve, reject) => {
      let lookupPromises = []
      lookups.forEach(l => {
        const thisPromise = l()
        lookupPromises.push(thisPromise)
        thisPromise.then(r => {
          if (r) {
            log(`    # [ ${account} ] @ ${l.name}    >`, response.name)
            resolve(response)
            if (!resolved && !persisted) {
              persisted = true
              persist(response)
            }
            resolved = true
          } else {
            log(`    # [ ${account} ] @ ${l.name}    >`, false)
          }
        })
      })
      Promise.all(lookupPromises).then(r => {
        resolve(response)
        if (!persisted) {
          persist(Object.assign(response, {
            source: ''
          }))
        }
      })
    })
  }

  return new Promise(async (resolve, reject) => {
    const existing = await db(`
      SELECT 
        knownaccount_name,
        knownaccount_domain,
        knownaccount_source,
        knownaccount_blacklist,
        DATEDIFF(NOW(), knownaccount_updated) as _age
      FROM
        knownaccounts
      WHERE
        knownaccount_account = :knownaccount_account
      AND
        knownaccount_currency = ''
      LIMIT 1
    `, {
      knownaccount_account: account
    })

    if (existing.length > 0) {
      const source = (existing[0].knownaccount_source !== '' ? 'internal:' + existing[0].knownaccount_source : null)

      response = {
        account: account,
        name: existing[0].knownaccount_name,
        domain: existing[0].knownaccount_domain,
        blocked: existing[0].knownaccount_blacklist > 0,
        source
      }
      // Background data refresh
      if (source === null) {
        if (existing[0]._age >= recordMaxDaysUnknown) {
          response = await lookup()
        }
      } else {
        if (existing[0]._age >= recordMaxDays) {
          lookup()
        }
      }
    } else {
      response = await lookup()
    }

    resolve(response)
  })
}
