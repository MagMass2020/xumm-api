const log = require('~src/handler/log')('app:payid')
const xTagged = require('xrpl-tagged-address-codec')
const userProfile = require('~src/api/v1/internal/user-profile-data')

const express = require('express')
const router = express.Router()

// TODO: tests

module.exports = async function (expressApp) {
  router.all('*', (req, res, next) => {
    req.isPayId = false
    req.isPayVersion = 0
    req.isMainNet = null

    const usedHeaders = {
      contentType: (req.headers['content-type'] || '').toLowerCase().split(';')[0].trim(),
      accept: (req.headers['accept'] || '').toLowerCase().split(';')[0].trim(),
      version: (req.headers['payid-version'] || '').trim().split('.').slice(0, 2).join('.'),
    }

    if (typeof req.headers['payid-api-version'] !== 'undefined') {
      usedHeaders.version = req.headers['payid-api-version'].replace(/[^0-9]/g, '')
    }

    req.sanitizedPath = req.path === '/' || req.path === '/.well-known/pay'
      ? '/'
      : req.path.trim().replace(/\/+$/, '').toLowerCase().replace(/[ \+]+/g, '+').toLowerCase()

    req.payIdAccept = usedHeaders.accept.match(/^application\/xrpl\-([a-z]+)\+json/) || usedHeaders.accept.match(/^application\/payid\+json/)

    if (req.payIdAccept) {
      req.isPayId = true
      req.isMainNet = req.payIdAccept.length < 2 || Boolean(req.payIdAccept[1].match(/main|live/))

      if (!isNaN(Number(usedHeaders.version))) {
        req.isPayVersion = Number(usedHeaders.version)
      }
    } else {
      
      let message = `Payment information for ${req.sanitizedPath.slice(1)}$${req.hostname} could not be found.`
      try {
        req.app.xpringMetricReporter.recordPayIdLookupBadAcceptHeader()
  
        const payIdParts = usedHeaders.accept.split('/')[1].split('+')[0].split('-')
        if (payIdParts.length === 2) {
          message = `Payment information for ${req.sanitizedPath.slice(1)}$${req.hostname} in ` +
            `${payIdParts[0].toUpperCase()} on ${payIdParts[1].toUpperCase()} could not be found.`
        }
      } catch (e) {}

      return res.status(404).json({
        statusCode: 404,
        error: 'Not Found',
        message
      })
    }

    req.payIdNet = req.isMainNet
      ? 'mainnet'
      : 'testnet'

    next()
  })

  router.get('/:payid(*)', async (req, res, next) => {
    // return next()
    const payid = req.sanitizedPath.slice(1)
    const slug = payid.split('+')[0]

    let returnAccount
    try {
      returnAccount = await userProfile(slug, payid, req.db)

      if (typeof returnAccount === 'object' && returnAccount !== null && typeof returnAccount.account === 'string') {
        const account = returnAccount.account.split(':')[0].trim()
        const tag = returnAccount.account.split(':')[1] || null

        const basicPayIdResponse = {
          addressDetailsType: 'CryptoAddressDetails',
          addressDetails: {
            address: xTagged.Encode({account, tag, test: !req.isMainNet})
          }
        }

        if (req.isPayVersion < 1) {
          res.json(basicPayIdResponse)
        } else {
          if (req.isPayVersion > 100) {
            res.json({
              addresses: [
                {
                  paymentNetwork: 'XRPL',
                  environment: req.isMainNet ? 'MAINNET' : 'TESTNET',
                  details: basicPayIdResponse.addressDetails
                }
              ],
              payId: `${req.sanitizedPath.slice(1)}$${req.hostname}`
            })
          } else {
            res.json({
              addresses: [
                {
                  paymentNetwork: 'XRPL',
                  environment: req.isMainNet ? 'MAINNET' : 'TESTNET',
                  ...basicPayIdResponse
                }
              ],
              payId: `${req.sanitizedPath.slice(1)}$${req.hostname}`
            })
          }
        }

        req.app.xpringMetricReporter.recordPayIdServedResult(true)
      } else {
        next()
      }
    } catch (e) {
      log(' >>>> ! PayId Request Error', e)
      next()
    }

    log('$$ PayID call: ' + slug + ' » ' + payid, returnAccount)
  })

  router.all('*', (req, res) => {
    if ('OPTIONS' === req.method) {
      res.sendStatus(200)
    } else {
      req.app.xpringMetricReporter.recordPayIdServedResult(false)

      res.status(404).json({
        statusCode: 404,
        error: `Not Found`,
        message: `Payment information for "${req.sanitizedPath.slice(1)}" in XRPL on ${req.payIdNet.toUpperCase()} could not be found.`
      })
    }
  })

  // Use
  expressApp.use('/payid', router)
}
