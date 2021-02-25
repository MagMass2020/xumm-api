const log = require('~src/handler/log')('app:known-account-resolve')

module.exports = (db, account, _options) => {
  const options = {
    retryAfter: typeof _options === 'object' && _options !== null && typeof _options.retryAfter === 'number' ? _options.retryAfter : 0
  }

  if (typeof account === 'undefined' || (typeof account === 'string' && account === '')) {
    log('Resolving: invalid / empty account string')
    return Promise.resolve()
  }

  return new Promise(async (resolve, reject) => {
    let retried = false

    const lookup = async () => {
      try {
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
        if (Array.isArray(existing) && existing.length > 0 && existing[0].constructor.name === 'RowDataPacket') {
          // log('---------- Got instant result')
          resolve(existing[0])
        } else{
          // log('---------- NO RESULT, RETRY')
          if (options.retryAfter > 0 && !retried) {
            retried = true
            await new Promise((resolve, reject) => {
              setTimeout(() => {
                resolve()
              }, options.retryAfter * 1000)
            })
            lookup()
          } else {
            resolve()
          }
        }
      } catch (e) {
        reject(e)
      }
    }

    lookup()
  })
}
