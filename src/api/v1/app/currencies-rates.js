const log = require('~src/handler/log')('app:currencies')
const fetch = require('node-fetch')
const getConfig = require('~src/middleware/config')

const localeAndCurrencyData = {
  languageCodes: {},
  currencyTranslations: {},
  loaded: false,
  origin: 'NONE'
}

const popularCurrencies = [
  'USD', 'EUR', 'JPY', 'GBP', 'AUD', 'CAD', 'CHF',
  // 'CNY', 'HKD', 'NZD', 'SEK', 'KRW', 'SGD', 'NOK',
  // 'MXN', 'INR', 'RUB', 'ZAR', 'TRY', 'BRL', 'TWD',
  // 'DKK', 'PLN', 'THB', 'IDR', 'HUF', 'CZK', 'ILS',
  // 'CLP', 'PHP', 'AED', 'COP', 'SAR', 'MYR', 'RON'
]

const getLocalesAndCurrencies = async () => {
  const config = await getConfig()

  log('Initialize locales and currencies')

  const xummLanguagesCall = await fetch('https://translate.xumm.dev/json/export-meta')
  const xummLanguagesData = await xummLanguagesCall.json()

  const unicodeCldrCall = await fetch(`https://${config.github.user}:${config.github.publicRepoReadToken}@api.github.com/repos/unicode-org/cldr-json/contents/cldr-json/cldr-numbers-full/main`)
  const unicodeCldrData = await unicodeCldrCall.json()
  const unicodeLanguages = unicodeCldrData.filter(u => u.type === 'dir').map(u => u.name)
  // log(unicodeLanguages)

  // Format: xummLanguageCode : unicodeLanguageCode
  const languageCodes = Object.keys(xummLanguagesData.languages).map(k => {
    let unicodeMatch = unicodeLanguages.indexOf(k)

    if (unicodeMatch > -1) {
      return k + ':' + unicodeLanguages[unicodeMatch]
    } else {
      const aliasses = Object.values(xummLanguagesData['language-code-alias']).map((target, i) => {
        if (target === k) return Object.keys(xummLanguagesData['language-code-alias'])[i]
        return null
      }).filter(a => a !== null)
      if (aliasses.length > 0) {
        const matchingAliasses = aliasses.map(a => {
          unicodeMatch = unicodeLanguages.indexOf(a)
          if (unicodeMatch > -1) {
            // log('   -> Alias: ', a, unicodeMatch)
            return k + ':' + unicodeLanguages[unicodeMatch]
          }
          return null
        }).filter(a => a !== null)
        if (matchingAliasses.length > 0) {
          return matchingAliasses[0]
        } else {
          log('! XUMM Lang (no unicode match) = ', k)
        }
      }
    }
  })

  await Promise.all(languageCodes.map(async l => {
    const xummVsUnicode = l.split(':')
    localeAndCurrencyData.languageCodes[xummVsUnicode[0]] = xummVsUnicode[1]

    log(`Get cldr-numbers-full for ${xummVsUnicode[1]} (${xummVsUnicode[0]})`)
    const currencyTranslationCall = await fetch(`https://raw.githubusercontent.com/unicode-org/cldr-json/master/cldr-json/cldr-numbers-full/main/${xummVsUnicode[1]}/currencies.json`)
    const currencyTranslationData = await currencyTranslationCall.json()  
    
    localeAndCurrencyData.currencyTranslations[xummVsUnicode[0]] = currencyTranslationData.main[xummVsUnicode[1]].numbers.currencies
  }))

  localeAndCurrencyData.loaded = true
  localeAndCurrencyData.origin = 'LIVE'
}

// (async () => {
//   await getLocalesAndCurrencies()
//   log(localeAndCurrencyData.currencyTranslations.en)
// })()

module.exports = async (req, res) => {
  const hydrateLocaleAndCurrencies = async () => {
    if (!localeAndCurrencyData.loaded) {
      log('<< hydrateLocaleAndCurrencies >>')
      log(' - Not Loaded, check redis')
      const cachedLocaleAndCurrencies = await req.redis.getObject('locale_and_currencies')
      if (typeof cachedLocaleAndCurrencies === 'object' && cachedLocaleAndCurrencies !== null) {
        log('  > FROM REDIS')
        Object.assign(localeAndCurrencyData, cachedLocaleAndCurrencies)
      } else {
        log(' ! Not in Redis, fetch live')
        await getLocalesAndCurrencies()
        log(' >>> Loaded (live), store in Redis')
        const storeData = Object.assign({}, localeAndCurrencyData)
        Object.assign(storeData, { origin: 'REDIS' })
        await req.redis.setObject('locale_and_currencies', storeData)
        log('     >>> Stored')
      }
    } else {
      // log('<< hydrateLocaleAndCurrencies >> Already Loaded')
    }
  }

  const getRates = async () => {
    await hydrateLocaleAndCurrencies()
    // await req.redis.del('locale_and_currencies')

    const cachedRates = await req.redis.getObject('fx_rates')
    // log('Got cached rates', cachedRates)
    if (typeof cachedRates === 'object' && cachedRates !== null) {
      return cachedRates
    } else {
      try {
        const rateCall = await fetch('https://data.fixer.io/api/latest?base=USD&access_key=' + req.config.fixer.apiKey)
        const rateData = await rateCall.json()
        Object.assign(rateData, { __meta: { fetched: new Date() } })

        await req.redis.setForSeconds('fx_rates', rateData, 60 /* seconds */ * 15 /* minutes */)
        // log('Stored fx_rates', rateData)
        // await req.redis.setForSeconds('fx_rates', rateData, 20)
        await req.redis.setObject('fx_rates_backup', rateData)

        log('Got rates live, stored in cache')

        return rateData
      } catch (e) {
        // Error, try to fall back to last working cache
        const cachedRates = await req.redis.getObject('fx_rates_backup')
        if (typeof cachedRates === 'object' && cachedRates !== null) {
          log('Got rates from backup cache because', e.message)
          return cachedRates
        }
      }
    }

    throw new Error(`Couldn't fetch exchange rates`)
  }

  // req.redis.del('fx_rates')
  // req.redis.del('fx_rates_backup')

  try {
    const rates = await getRates()
    const knownCurrencyCodes = Object.keys(rates.rates)

    if (req.params?.type === 'currencies') {
      const locale = (req.params.locale || '').trim()
      const currencies = {
        popular: {},
        all: {}
      }

      const response = {
        locale,
        currencies,
        error: ''
      }

      if (typeof localeAndCurrencyData.currencyTranslations[locale] !== 'undefined') {
        currencies.all = Object.keys(localeAndCurrencyData.currencyTranslations[locale])
          .filter(currency => knownCurrencyCodes.indexOf(currency) > -1)
          .filter(currency => typeof localeAndCurrencyData.currencyTranslations[locale][currency] !== 'undefined')
          .filter(currency => currency.slice(0, 1) !== 'X')
          .reduce((a, b) => {
            const matchedCurrency = localeAndCurrencyData.currencyTranslations[locale][b]
            if (matchedCurrency.displayName.match(/[0-9]{4}/)) {
              return a
            }
            Object.assign(a, {
              [b]: {
                name: matchedCurrency.displayName,
                code: b,
                symbol: (matchedCurrency['symbol-alt-narrow'] || matchedCurrency['symbol']) || b
              } 
            })
            return a
          }, {})

        popularCurrencies.forEach(f => {
          if (typeof currencies.all[f] !== 'undefined') {
            currencies.popular[f] = currencies.all[f]
          }
        })
      } else {
        response.error = 'Unknown locale'
      }

      return res.json(response)
    } else if (req.params?.type === 'rates') {
      const u = (req.params.locale || '_UNKNOWN_CURRENCY_').toUpperCase().trim()
      if (typeof rates.rates[u] !== 'undefined') {
        const r = rates.rates[u]
        let xrpusd = 0

        const cachedXrpUsd = await req.redis.get('xrpusd_rate')
        if (typeof cachedXrpUsd !== 'undefined' && cachedXrpUsd !== null) {
          xrpusd = Number(cachedXrpUsd)
          log('Got cached XRPUSD rate', typeof cachedXrpUsd, cachedXrpUsd, '»', xrpusd)
        } else {
          log('Getting On Ledger XRPUSD rate')
          try {
            const rateCall = await fetch('https://xrpl.ws', {
              method: 'POST', body: JSON.stringify({ method: 'account_lines', params: [ { account: 'rXUMMaPpZqPutoRszR29jtC8amWq3APkx' } ]})
            })
            const rateData = await rateCall.json()
            // log('oracle', {rateData})
            xrpusd = Number(rateData.result.lines.filter(l => l.currency === 'USD')[0].limit) || 0
            // log('oracle', {xrpusd})
            if (xrpusd > 0) {
              log('Got <<< live >>> oracle XRPUSD rate', xrpusd)
              await req.redis.setForSeconds('xrpusd_rate', xrpusd, 60 * 1) // seconds (one minutes)
              req.redis.set('xrpusd_rate_backup', xrpusd)
            } else {
              throw new Error('Invalid USDXRP rate (zero)')
            }
          } catch (e) {
            log('Error getting XRPUSD rate from XRPL Oracle', e.message)
          }
          if (xrpusd === 0) {
            log('Getting live XRPUSD rate')
            try {
              const rateCall = await fetch('https://api.cryptowat.ch/markets/kraken/xrpusd/price?apikey=' + req.config.cryptowatch.apiKey)
              const rateData = await rateCall.json()
              xrpusd = Number(rateData.result.price) || 0
              if (xrpusd > 0) {
                log('Got <<< live >>> XRPUSD rate', xrpusd)
                await req.redis.setForSeconds('xrpusd_rate', xrpusd, 60 * 3) // seconds (three minutes)
                req.redis.set('xrpusd_rate_backup', xrpusd)
              } else {
                throw new Error('Invalid USDXRP rate (zero)')
              }
            } catch (e) {
              log('Error getting XRPUSD rate', e.message)
            }
          }
        }

        if ((Number(xrpusd) || 0) === 0) {
          const fallbackXrpUsd = await req.redis.get('xrpusd_rate_backup')
          if (typeof fallbackXrpUsd !== 'undefined' && fallbackXrpUsd !== null) {
            xrpusd = Number(fallbackXrpUsd)
            log('Got FALLBACK (CACHED) XRPUSD rate', typeof fallbackXrpUsd, fallbackXrpUsd, '»', xrpusd)
          } else {
            throw new Error(`Couldn't get XRPUSD exchange rate`)
          }  
        }

        const matchedCurrency = localeAndCurrencyData.currencyTranslations.en[u]

        return res.json({
          USD: Math.round(r * 1000000) / 1000000,
          XRP: Math.round(r * xrpusd * 1000000) / 1000000,
          __meta: {
            currency: {
              en: matchedCurrency.displayName,
              code: u,
              symbol: (matchedCurrency['symbol-alt-narrow'] || matchedCurrency['symbol']) || u
            }
          }
        })
      } else {
        throw new Error('Unknown currency')
      }
    }

    throw new Error('Endpoint params invalid')
  } catch (e) {
    res.handleError(e)
  }
}
