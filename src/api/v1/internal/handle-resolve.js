const fetch = require('node-fetch')
const log = require('~src/handler/log')('app:handle-resolve')
const knownAccount = require('~api/v1/internal/known-account-hydrate')
const utf8 = require('utf8')
const taggedAddressCodec = require('xrpl-tagged-address-codec')

// For PayId
const URL = require('url')
const isValidDomain = require('is-valid-domain')
const ip = require('ip')
const dns = require('dns')
const payIdProfile = require('~src/api/v1/internal/user-profile-data')

const cacheSeconds = 60 * 15 // 15 minutes

/**
 * Todo: add XUMM hashed address book function lookup
 */

const defaultFetchConfig = {
  timeout: 4000,
  size: 1024 * 100,
  redirect: 'follow',
  follow: 3
}

// TODO:  move
const payIdRe = new RegExp(/^(.*)[\$@]([a-z0-9-_\.]+.*)$/i)

const is = {
  possiblePackedAddress (query) {
    return query.match(/^[TX][a-zA-Z0-9]{20,}$/)
  },
  validEmailAccount (query) {
    const tester = /^[-!#$%&'*+\/0-9=?A-Z^_a-z`{|}~](\.?[-!#$%&'*+\/0-9=?A-Z^_a-z`{|}~])*@[a-zA-Z0-9](-*\.?[a-zA-Z0-9])*\.[a-zA-Z](-?[a-zA-Z0-9])+$/;

    if (!query) {
      return false
    }

    if (query.length > 254) {
      return false
    }
    
    const valid = tester.test(query)

    if (!valid) {
      return false
    }

    const parts = query.split('~')
    if (parts[0].length > 64) {
      return false
    }
    
    const domainParts = parts[1].split('.')
    if (domainParts.some(part => part.length > 63 )) {
      return false
    }

    return true
  },
  possibleXrplAccount (query) {
    return new RegExp(/^r[0-9a-zA-Z]{3,}$/).test(query)
  },
  async possiblePayId (query) {
    /**
     * Checks for IPs and domains pointing to IPs
     * Domain should be valid and IP should not be local
     * to prevent PayId based internal network attack
     */
    if (payIdRe.test(query)) {
      const payIdParts = payIdRe.exec(query.toLowerCase())
      const payIdUrl = URL.parse('https://' + payIdParts[2] + '/' + payIdParts[1].replace(/^\/+/, ''))
      if (typeof payIdUrl.host === 'string' && isValidDomain(payIdUrl.host)) {
        const resolved = await Promise.all([
          new Promise(resolve => {
            dns.resolve4(payIdUrl.host, (err, address) => {
              // console.log('resolve4', payIdUrl.host, err, address)
              if (err) {
                resolve([])
              } else {
                resolve(address)
              }
            })
          }),
          new Promise(resolve => {
            dns.resolve6(payIdUrl.host, (err, address) => {
              // console.log('resolve6', payIdUrl.host, err, address)
              if (err) {
                resolve([])
              } else {
                resolve(address)
              }
            })
          })
        ])

        const localIps = resolved.reduce((a, b) => {
          a = a.concat(b)
          return a
        }, []).filter(a => {
          return ip.isPrivate(a)
        })

        if (localIps < 1) {
          return true
        }
      }
    }
    return false
  }
}

const xrplns = {
  networks: [],
  initialized: false,
  async call (url) {
    const callApi = await fetch('https://api.xrplns.com/v1/' + url, {
      headers: {
        'XRPLNS-KEY': app.config.xrplnsKey || ''
      },
      method: 'get',
      ...defaultFetchConfig
    })
    const json = await callApi.json()
    return json
  },
  async initialize () {
    log('Initializing XRPLNS, fetching social networks')
    this.networks = await this.call('social-networks')
    log('Initialized XRPLNS social networks', this.networks)
  },
  sanitizeQuery (query, network) {
    if (network === 'local' || network === 'twitter') {
      return utf8.encode(query.replace(/^@/, ''))
    }
    return utf8.encode(query)
  },
  async get (query) {
    if (await is.possiblePayId(query)) {
      return []
    }

    const source = 'xrplns'
    try {
      const results = await (async () => {
        if (is.validEmailAccount(query)) {
          const callResults = await this.call('resolve/social/email/' + utf8.encode(query))
          log(utf8.encode(query))
          return [Object.assign(callResults || {}, { network: 'email' })]
        } else {
          return Promise.all(this.networks.map(async n => {
            const callResults = await this.call('resolve/social/' + n + '/' + this.sanitizeQuery(query, n))
            return Object.assign(callResults || {}, { network: n })
          }).concat(await (async () => {
            const callResults = await this.call('resolve/user/' + this.sanitizeQuery(query, 'local'))
            if (callResults !== null &&
              typeof callResults === 'object' &&
              typeof callResults.data === 'object' &&
              callResults.data !== null &&
              typeof callResults.data.xrplAccounts === 'object'
            ) {
              const data = callResults.data.xrplAccounts
              return data.map(d => {
                return {
                  network: 'local',
                  data: d
                }
              })
            }
          })()))
        }
      })()

      // log(results)

      return results.filter(r => r !== null && typeof r === 'object' && typeof r.data === 'object' && typeof r.data.xrplAccount === 'string').map(r => {
        return {
          source,
          network: r.network,
          alias: r.data.slug || query,
          account: r.data.xrplAccount,
          tag: r.data.destinationTag === '' ? null : Number(r.data.destinationTag),
          description: r.data.label || ''
        }
      })
    } catch (e) {
      log('Query @' + source + ' for [' + query + ']', e.message)
    }
    return []
  }
}

const bithomp = {
  async get (query) {
    if (await is.possiblePayId(query)) {
      return []
    }

    const source = 'bithomp.com'
    try {
      const method = is.possibleXrplAccount(query) && query.length >= 20 ? 'address' : 'username'
      const call = await fetch('https://bithomp.com/api/v2/' + method + '/' + utf8.encode(query) + '?service=true&username=true&verifiedDomain=true&blacklisted=true', {
        method: 'get',
        ...defaultFetchConfig,
        headers: {
          'x-bithomp-token': app.config.bithompToken
        }
      })
      const response = await call.json()
      if (typeof response === 'object' && response !== null && typeof response.address === 'string') {
        return [{
          source,
          network: null,
          alias: response.service ? (response.service.name || (response.username || query)) : (response.username || query),
          account: response.address,
          tag: null,
          description: response.verifiedDomain || (response.service ? (response.service.domain || '') : '')
        }]
      }
    } catch (e) {
      log('Query @' + source + ' for [' + query + ']', e.message)
    }
    return []
  }
}

const xrpscan = {
  async get (query) {
    if (await is.possiblePayId(query)) {
      return []
    }

    const source = 'xrpscan.com'
    if (is.possibleXrplAccount(query)) {
      try {
        const call = await fetch('https://api.xrpscan.com/api/v1/account/' + utf8.encode(query), {
          method: 'get',
          ...defaultFetchConfig
        })
        const response = await call.json()
        if (typeof response === 'object' && response !== null && typeof response.account === 'string' && typeof response.accountName === 'object' && response.accountName !== null) {
          return [{
            source,
            network: null,
            alias: response.accountName.name || query,
            account: response.account,
            tag: null,
            description: response.accountName.desc || ''
          }]
        }
      } catch (e) {
        if (!e.message.match(/Unexpected token/)) {
          log('Query @' + source + ' for [' + query + ']', e.message)
        }
      }
    }
    return []
  }
}

const xrpl = {
  async get (query) {
    if (await is.possiblePayId(query)) {
      return []
    }

    const source = 'xrpl'
    if (is.possibleXrplAccount(query)) {
      try {
        const call = await fetch('https://s1.ripple.com:51234', {
          method: 'post',
          ...defaultFetchConfig,
          body: JSON.stringify({
            method: 'account_info',
            params: [ { account: query } ]
          }),
        })
        const response = await call.json()
        if (typeof response === 'object' && response !== null && typeof response.result === 'object' && response.result !== null && typeof response.result.account_data === 'object') {
          return [{
            source,
            network: null,
            alias: typeof response.result.account_data.Domain === 'string' && response.result.account_data.Domain !== '' ? Buffer.from(response.result.account_data.Domain, 'hex').toString('utf-8') : query,
            account: response.result.account_data.Account,
            tag: null,
            description: ''
          }]
        }
      } catch (e) {
        log('Query @' + source + ' for [' + query + ']', e.message)
      }
    }
    return []
  }
}

const payId = {
  async get (query, net) {
    const source = 'payid'
    if (await is.possiblePayId(query)) {
      try {
        // const payIdParts = payIdRe.exec(query.toLowerCase())
        const payIdParts = payIdRe.exec(query)
        const asUrl = URL.parse('https://' + payIdParts[2] + '/' + payIdParts[1].replace(/^\/+/, ''))
        const endpoint = asUrl.href + (
          asUrl.path === '/'
            ? '.well-known/pay'
            : ''
        )
        let gotActivePayid404s = 0
        let requestCount = 0

        log('Lookup: payId', query, endpoint)

        const lookupTypeHeaders = {
          general: 'application/payid+json'
        }

        if (net !== '') {
          if (net.match(/main|live/)) {
            Object.assign(lookupTypeHeaders, {mainnet: 'application/xrpl-mainnet+json'})
          } else {
            Object.assign(lookupTypeHeaders, {testnet: 'application/xrpl-testnet+json'})
          }
        } else {
          Object.assign(lookupTypeHeaders, {
            mainnet: 'application/xrpl-mainnet+json',
            testnet: 'application/xrpl-testnet+json'
          })
        }

        for (lookupNet in lookupTypeHeaders) {
          const call = await fetch(endpoint, {
            method: 'get',
            ...defaultFetchConfig,
            headers: {
              'Accept': lookupTypeHeaders[lookupNet],
              'PayID-Version': '1.0',
              'PayID-API-Version': '2020-05-28'
            }    
          })
          
          let response
          let matchingAddresses = []

          try {
            response = await call.json()
            // log(response)
            requestCount++
          } catch (e) {
            response = {}
          }

          if (typeof response === 'object' && response !== null && typeof response.addresses !== 'undefined') {
            if (Array.isArray(response.addresses) && response.addresses.length > 0) {
              // log(response.addresses)
              matchingAddresses = response.addresses.filter(r => {
                return typeof r.paymentNetwork === 'string'
                  && (
                    (
                      // typeof r.addressDetailsType === 'string'
                      // && r.addressDetailsType === 'CryptoAddressDetails'
                      typeof r.addressDetails === 'object'
                      && r.addressDetails !== null
                      && (
                        typeof r.addressDetails.address === 'string' ||
                        (
                          typeof r.addressDetails.address === 'object' &&
                          r.addressDetails.address !== null &&
                          typeof r.addressDetails.address.account === 'string'
                        )
                      )
                    ) ||
                    (
                      typeof r.details === 'object'
                      && r.details !== null
                      && (
                        typeof r.details.address === 'string' ||
                        (
                          typeof r.details.address === 'object' &&
                          r.details.address !== null &&
                          typeof r.details.address.account === 'string'
                        )
                      )
                    )
                  )
                  && r.paymentNetwork.toUpperCase() === 'XRPL'
                  && typeof r.environment === 'string'
                  && (
                    (net === '' || net.match(/main|live/))
                      ? r.environment.toLowerCase().match(/main|live/)
                      : r.environment.toLowerCase().match(/test|dev/)
                  )
              }).sort(a => {
                return a.environment === 'MAINNET' ? -1 : 1
              }).map(a => {
                if (typeof a.details !== 'undefined') {
                  a.addressDetails = a.details 
                }
                return a
              })
            }
          }

          if (typeof response === 'object' && response !== null && typeof response.addressDetails === 'object') {
            if (response.addressDetails !== null && typeof response.addressDetails.address === 'string') {
              matchingAddresses.push({
                paymentNetwork: 'XRPL',
                environment: lookupNet.toUpperCase(),
                ...response
              })
            }
          }

          if (typeof response === 'object' && response !== null && typeof response.details === 'object') {
            if (response.details !== null && typeof response.details.address === 'string') {
              response.addressDetails = response.details
              matchingAddresses.push({
                paymentNetwork: 'XRPL',
                environment: lookupNet.toUpperCase(),
                ...response
              })
            }
          }

          if (
            typeof response === 'object' &&
            response !== null &&
            (
              (typeof response.statusCode !== 'undefined' && Number(response.statusCode) === 404) ||
              (typeof response.status !== 'undefined' && Number(response.status) === 404) || 
              (typeof response.addresses !== 'undefined' && Array.isArray(response.addresses) && response.addresses.length < 1)
            )
            // typeof response.response.error !== 'undefined' && typeof response.response.message !== 'undefined'
          ) {
            gotActivePayid404s++
          }

          if (matchingAddresses.length > 0) {
            return await Promise.all(matchingAddresses.map(async response => {
              if (typeof response === 'object' && response !== null && typeof response.addressDetails === 'object') {
                if (response.addressDetails !== null && typeof response.addressDetails.address === 'object') {
                  // Classic address hack
                  if (response.addressDetails.address !== null && typeof response.addressDetails.address.account === 'string') {
                    response.addressDetails.address = response.addressDetails.address.account.trim() 
                      + ':' + (response.addressDetails.address.destinationTag || '')
                  }
                }
                if (response.addressDetails !== null && typeof response.addressDetails.address === 'string') {
                  // Classic address hack
                  if (typeof response.addressDetails.tag !== 'undefined') {
                    response.addressDetails.address += ':' + response.addressDetails.tag
                  }
                }
                if (response.addressDetails !== null && typeof response.addressDetails.address === 'string') {
                  if (response.addressDetails.address.match(/^[rXT]/)) {
                    const classicAddress = {}
                    const isRAddress = response.addressDetails.address.trim().match(/^r/)
                    if (isRAddress) {
                      const addressTagSplit = response.addressDetails.address.trim().split(':')
                      Object.assign(classicAddress, {
                        account: addressTagSplit[0],
                        tag: addressTagSplit.length > 1 && addressTagSplit[1] !== ''
                          ? addressTagSplit[1]
                          : (typeof response.addressDetails.destinationTag !== 'undefined' ? String(response.addressDetails.destinationTag) : null)
                      })
                    } else {
                      Object.assign(classicAddress, taggedAddressCodec.Decode(response.addressDetails.address))
                    }
                    const resolvedPayIdDestination = await resolver.get(classicAddress.account, net)
                    const resolvedAliasses = resolvedPayIdDestination.matches.filter(m => {
                      return m.alias !== m.account
                    })
    
                    let alias = resolvedAliasses.length > 0
                      ? resolvedAliasses[0].alias
                      : query
    
                    if (new RegExp(app.config.userProfileLocation + '$').test(query)) {
                      returnAccount = await payIdProfile('', query, app.db)
                      // log({query, returnAccount})
                      if (typeof returnAccount === 'object' && returnAccount !== null) {
                        alias = returnAccount.name || alias
                      }
                    }

                    // log('__________REPORT XPRING RESOLVE TRUE')
                    app.xpringMetricReporter.recordPayIdResolvedResult(true)
                    
                    return {
                      source,
                      network: null,
                      alias,
                      account: classicAddress.account,
                      tag: classicAddress.tag === null ? null : Number(classicAddress.tag),
                      description: query
                    }
                  }
                }
              }
            }))
          } else {
            const lookupLength = Object.keys(lookupTypeHeaders).length
            // log({gotActivePayid404s, requestCount, lookupLength})
            if (gotActivePayid404s === requestCount && requestCount === lookupLength) {
              // log('__________REPORT XPRING RESOLVE FALSE')
              app.xpringMetricReporter.recordPayIdResolvedResult(false)
            }
          }
        }
      } catch (e) {
        log('Query @' + source + ' for [' + query + ']', e.message)
      }
    }
    return []
  }
}

const internalAccounts = {
  async get (query) {
    const source = 'xumm.app'
    if (is.possibleXrplAccount(query)) {
      try {
        const existing = await app.db(`
          SELECT 
            knownaccount_name,
            knownaccount_account
          FROM
            knownaccounts
          WHERE
            knownaccount_account LIKE CONCAT(:knownaccount_account, '%')
          AND
            knownaccount_currency = ''
          LIMIT 10
        `, {
          knownaccount_account: query
        })

        if (existing.length > 0) {
          return existing.map(a => {
            return {
              source,
              network: null,
              alias: a.knownaccount_name,
              account: a.knownaccount_account,
              tag: null,
              description: ''
            }
          })
        }
      } catch (e) {
        log('Query @' + source + ' for [' + query + ']', e.message)
      }
    }

    return []
  }
}

const activeApps = [ payId, bithomp, xrpscan, internalAccounts, xrplns, xrpl ]

const app = {
  config: {},
  db: null,
  query: {},
  initializing: false,
  initialized: false,
  async initialize (req) {
    this.config = req.config
    this.db = req.db
    this.xpringMetricReporter = req.app.xpringMetricReporter
    
    if (typeof req.query === 'object' && req.query !== null) {
      this.query = Object.assign({}, req.query)
    }

    if (!this.initializing) {
      this.initializing = true
      const reducedApps = activeApps.reduce((stack, current) => {
        if (typeof current.initialized !== 'undefined' && typeof current.initialize !== 'undefined') {
          stack.push(current.initialize())
          current.initialized = true
        }
        return stack
      }, [])
      try {
        await Promise.all(reducedApps)
      } catch (e) {
        log(e.message)
      }
      this.initialized = true
      return this.initialized
    }
  },
  xpringMetricReporter: {}
}

const resolver = {
  cache: {},
  async get (query, req) {
    /**
     * query = input, used for cache
     * lookupHandle = possibly decoded input, the value to work with
     *    eg. query = X address, lookupHandle = X address decoded to r-address
     */
    let lookupHandle = query
    let net = ''

    if (typeof req.headers !== 'undefined' && Object.keys(req.headers).indexOf('x-xummnet') > 0) {
      if (!req.headers['x-xummnet'].toLowerCase().trim().match(/main|live/)) {
        net = req.headers['x-xummnet'].toLowerCase().trim()
      }
    }

    const cacheKey = query + '~' + net

    const now = Math.round(new Date() / 1000)
    if (typeof this.cache[cacheKey] === 'undefined' || this.cache[cacheKey].cached < now - cacheSeconds) {
      this.cache[cacheKey] = {
        cached: now,
        explicitTests: {},
        matches: {}
      }

      this.cache[cacheKey].explicitTests = {
        emailAddress: is.validEmailAccount(lookupHandle),
        xrplAccount: is.possibleXrplAccount(lookupHandle)
      }
    
      const allApps = activeApps.reduce((stack, current) => {
        stack.push(current.get(lookupHandle, net))
        return stack
      }, [])
  
      this.cache[cacheKey].matches = await Promise.all(allApps).then(r => {
        return r.reduce((stack, current) => {
          current.forEach(c => stack.push(c))
          return stack
        }, [])
      })
    }

    if (is.possibleXrplAccount(lookupHandle) && lookupHandle.length >= 20) {
      // Populate backend cache
      knownAccount(app.db, lookupHandle, app.config)
    }

    return Object.assign({
      live: now === this.cache[cacheKey].cached
    }, this.cache[cacheKey])
  }
}

/**
  * Samples:
  *   rPdvC6ccq8hCdPKSPJkPmyZ4Mi1oG2FFkT
  *   hi<at>wietse.com
  *   WietseWind
  *   pepperew
  *   xrptipbot
  *   tacostand
  */

module.exports = async (handle, req) => {
  let query = handle.trim()

  if (!app.initialized) {
    log('Initializing')
    await app.initialize(req)
    log('Initialized')
  }

  if (is.possiblePackedAddress(query)) {
    try {
      const decoded = taggedAddressCodec.Decode(query)
      query = decoded.account
    } catch (e) {
      // Do nothing
    }
  }

  const resolved = await resolver.get(query, req)

  return {
    input: handle,
    ...resolved
  }
}
