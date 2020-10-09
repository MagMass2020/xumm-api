const log = require('~src/handler/log')('app:xpring-metric-reporter:middleware')
const {Counter, Gauge, Pushgateway, Registry} = require('prom-client')

const payIdGaugeRegistry = new Registry()
const payIdCounterRegistry = new Registry()

let hostname // = 'xumm.me'
let reportGatewayUrl // = 'https://push00.mon.payid.tech'x
let org // = 'xumm.app'
let paymentNetwork // = 'XRPL'
let environment // = 'MAINNET'

const payIdServedRequestCounter = new Counter({
  name: 'payid_lookup_request',
  help: 'count of (incoming, served PayID) requests to lookup a PayID',
  labelNames: ['paymentNetwork', 'environment', 'org', 'result'],
  registers: [payIdCounterRegistry]
})

const payIdXummAppLookedUpRequestCounter = new Counter({
  name: 'payid_lookup_inapp',
  help: 'count of (outgoing, fetched, resolved) PayID requests',
  labelNames: ['paymentNetwork', 'environment', 'org', 'result'],
  registers: [payIdCounterRegistry]
})

const payIdCountGauge = new Gauge({
  name: 'payid_count',
  help: 'count of total PayIDs existing (to be served upon request)',
  labelNames: ['paymentNetwork', 'environment', 'org'],
  registers: [payIdGaugeRegistry]
})

function recordPayIdCount (count) {
  payIdCountGauge.set({paymentNetwork, environment, org}, count)
}

function recordPayIdServedResult (found) {
  payIdServedRequestCounter.inc({paymentNetwork, environment, org, result: found ? 'found' : 'not_found'}, 1)
}

function recordPayIdResolvedResult (found) {
  payIdXummAppLookedUpRequestCounter.inc({paymentNetwork, environment, org, result: found ? 'found' : 'not_found'}, 1)
}

function recordPayIdLookupBadAcceptHeader () {
  payIdServedRequestCounter.inc({paymentNetwork: 'unknown', environment: 'unknown', org, result: 'error: bad_accept_header'}, 1)
}

function getMetrics () {
  return payIdCounterRegistry.metrics() + payIdGaugeRegistry.metrics();
}

// function pushMetrics () {
//   recordPayIdCount(5)

//   recordPayIdServedResult(true)
//   recordPayIdServedResult(false)

//   recordPayIdResolvedResult(true)
//   recordPayIdResolvedResult(false)

//   recordPayIdLookupBadAcceptHeader()


//   counterGateway.pushAdd({
//     jobName: 'payid_counter_metrics',
//     groupings: {instance: `${org ? org : 'null'}_${hostname}_${process.pid}`}
//   }, (err, _resp, _body) => {
//     if (err) console.warn('metrics push failed with ', err)
//   })

//   gaugeGateway.push({jobName: 'payid_gauge_metrics', groupings: {instance: org}}, (err, _resp, _body) => {
//     if (err) console.warn('gauge metrics push failed with ', err)
//   })
// }

// // Push Metrics
// pushMetrics()

module.exports = async function (expressApp) {
  log('Load Xpring Stats reporter')
  /**
   * Load config
   */
  await expressApp.config

  hostname = expressApp.config.xpringMetricReporting.hostname
  reportGatewayUrl = expressApp.config.xpringMetricReporting.reportGatewayUrl
  org = expressApp.config.xpringMetricReporting.org
  paymentNetwork = expressApp.config.xpringMetricReporting.paymentNetwork
  environment = expressApp.config.xpringMetricReporting.environment

  const counterGateway = new Pushgateway(reportGatewayUrl, [], payIdCounterRegistry)
  const gaugeGateway = new Pushgateway(reportGatewayUrl, [], payIdGaugeRegistry)

  /**
   * Fetch PayID count
   */
  const reportAccountCount = async () => {
    if (typeof expressApp.db !== 'undefined') {
      try {
        const payIdCount = await expressApp.db(`
          SELECT
            count(1) as count
          FROM
            useraccounts
          WHERE
            useraccount_allowlookup > 0
        `)
        if (payIdCount.length === 1 && typeof payIdCount[0].count !== 'undefined') {
          // log('PayID count', payIdCount[0].count)
          recordPayIdCount(Number(payIdCount[0].count))
        }
      } catch (e) {
        log('Error fetching PayID accounts', e.message)
      }
    }
  }

  setInterval(reportAccountCount, 5 * 60 * 1000) // Every 5 minutes
  reportAccountCount()

  /**
   * Send metrics to Xpring
   */
  setInterval(() => {
    if (typeof hostname !== 'undefined') {
      // log('Report metrics to Xpring', getMetrics())

      counterGateway.pushAdd({
        jobName: 'payid_counter_metrics',
        groupings: {instance: `${org ? org : 'null'}_${hostname}_${process.pid}`}
      }, (err, _resp, _body) => {
        if (err) console.warn('! Metrics push failed with ', err)
      })

      gaugeGateway.push({jobName: 'payid_gauge_metrics', groupings: {instance: org}}, (err, _resp, _body) => {
        if (err) console.warn('! Gauge metrics push failed with ', err)
      })
    } else {
      log('Skipped Xpring metrics reporting')
    }
  }, 10 * 1000)

  /**
   * Export methods to publish metrics
   * to App (global)
   */
  Object.assign(expressApp, {
    xpringMetricReporter: {
      // recordPayIdCount,
      recordPayIdServedResult,
      recordPayIdResolvedResult,
      recordPayIdLookupBadAcceptHeader
    }
  })

  // expressApp.use((req, res, next) => {
  //   // log('xpring-metric-reporter-use')
  //   next()
  // })
}
