const knownAccount = require('~api/v1/internal/known-account-hydrate')
const AddressCodec = require('ripple-address-codec')
const log = require('~src/handler/log')('app:accountinfo')


module.exports = async (req, res) => {
  try {
    // log(req.params.address)
    let accountInfo
    if (AddressCodec.isValidClassicAddress(req.params.address)) {
      log('knownAccount lookup', req.params.address)
      accountInfo = await knownAccount(req.db, req.params.address, req.config)
    } else {
      // Wildcard search
      log('Wildcard search', req.params.address)
      const match = await req.db(`
        SELECT 
          knownaccount_account,
          knownaccount_name,
          knownaccount_domain,
          knownaccount_source,
          knownaccount_blacklist
        FROM
          knownaccounts
        WHERE
          knownaccount_account LIKE CONCAT(:knownaccount_account, '%')
        AND
          knownaccount_currency = ''
        LIMIT 10
      `, {
        knownaccount_account: req.params.address
      })

      if (match.length === 1) {
        accountInfo = {
          account: match[0].knownaccount_account,
          name: match[0].knownaccount_name,
          domain: match[0].knownaccount_domain,
          blocked: match[0].knownaccount_blacklist > 0,
          source: 'wildcard:' + match[0].knownaccount_source
        }
      }
    }
    res.json({
      ...accountInfo
    })
  } catch (e) {
    res.handleError(e)
  }
}
