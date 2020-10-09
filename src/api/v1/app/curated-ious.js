const log = require('~src/handler/log')('app:curatedious')

module.exports = async (req, res) => {
  try {
    const match = await req.db(`
      SELECT 
        IFNULL(issuer.knownaccount_name, currency.knownaccount_name) as issuer_name,
        IFNULL(issuer.knownaccount_avatar_url, currency.knownaccount_avatar_url) as issuer_avatar,
        IFNULL(issuer.knownaccount_domain, currency.knownaccount_domain) as issuer_domain,
        currency.knownaccount_account as iou_issuer,
        currency.knownaccount_currency as iou_currency,
        currency.knownaccount_name as iou_name,
        currency.knownaccount_currency_avatar_url as iou_avatar,
        issuer.knownaccount_id as issuer_id,
        currency.knownaccount_id as currency_id,
        issuer.knownaccounts_shortlist as issuer_shortlist,
        currency.knownaccounts_shortlist as iou_shortlist
      FROM 
        knownaccounts as currency
      JOIN
        knownaccounts as issuer ON (
          currency.knownaccount_domain = issuer.knownaccount_domain
        )
      WHERE 
        currency.knownaccount_currency != '' 
        AND
          issuer.knownaccounts_order IS NOT NULL
          AND
          issuer.knownaccount_currency = ''
      ORDER BY 
        currency.knownaccounts_order ASC
    `)

    if (match.length > 0) {
      let currencies = []
      const iou_details = match.reduce((a, b) => {
        if (typeof a[b.issuer_name] === 'undefined') {
          a[b.issuer_name] = {
            id: b.issuer_id,
            name: b.issuer_name,
            domain: b.issuer_domain,
            avatar: b.issuer_avatar,
            shortlist: b.issuer_shortlist,
            currencies: {}
          }
        }
        if (currencies.indexOf(b.iou_currency) < 0) {
          currencies.push(b.iou_currency)
        }
        a[b.issuer_name].currencies[b.iou_currency] = {
          id: b.currency_id,
          issuer_id: b.issuer_id,
          issuer: b.iou_issuer,
          currency: b.iou_currency,
          name: b.iou_name,
          avatar: b.iou_avatar,
          shortlist: b.iou_shortlist
        }
        return a
      }, {})
      res.json({
        issuers: Object.keys(iou_details),
        currencies: currencies,
        details: iou_details
      })
    } else {
      const e = new Error(`Couldn't fetch IOU's`)
      e.code = 500
      throw e
    }    
  } catch (e) {
    res.handleError(e)
  }
}
