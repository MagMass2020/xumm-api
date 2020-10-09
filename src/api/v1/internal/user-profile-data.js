// const Levenshtein = require('levenshtein')
const stringSimilarity = require('string-similarity')
const humanize = require('humanize-string')
const log = require('~src/handler/log')('app:userprofile')
const xTagged = require('xrpl-tagged-address-codec')

// TODO: Tests

module.exports = async (userSlug, PayId, db) => {
  let payid
  let slug

  if (typeof userSlug === 'string') {
    slug = userSlug.toLowerCase()
  }

  if (typeof PayId === 'string') {
    payid = decodeURI(PayId).split('$')[0]
    slug = payid.split('+')[0]
    // log({payid, slug})

    const accounts = await db(`
      SELECT
        CONCAT(
          users.user_slug,
          IF(
            useraccounts.useraccount_slug IS NULL,
            '',
            CONCAT('+', useraccounts.useraccount_slug)
          )
        ) as __full_slug,
        useraccounts.useraccount_account,
        users.user_name,
        useraccounts.useraccount_slug
      FROM
        users
      LEFT JOIN
        useraccounts ON (
          users.user_id = useraccounts.user_id
        )
      WHERE
        users.user_slug = :slug
        AND
        useraccounts.useraccount_allowlookup = 1
    `, {
      slug
    })
    
    // log({accounts})

    let returnAccount = {}
    if (accounts.length > 0) {
      const match = accounts.filter(a => {
        return a.__full_slug === payid
      })
      if (match.length === 1) {
        returnAccount = {
          account: match[0].useraccount_account,
          name: match[0].user_name + (
            match[0].useraccount_slug
              ? ' (' + match[0].useraccount_slug.replace(/^(.)/, _ => { return _.toUpperCase() }) + ')'
              : ''
          )
        }
      } else {
        // Check distance
        const sorted = accounts.map(a => {
          return Object.assign({}, {
            ...a,
            __sim: stringSimilarity.compareTwoStrings(payid, a.__full_slug)
          })
        })
        .filter(a => {
          return a.__sim > .7
        })
        .sort((a, b) => {
          return b.__sim - a.__sim
        })

        // log({sorted})
        if (sorted.length > 0) {
          returnAccount = {
            account: sorted[0].useraccount_account,
            name: sorted[0].user_name + (
              sorted[0].useraccount_slug
                ? ' (' + sorted[0].useraccount_slug.replace(/^(.)/, _ => { return _.toUpperCase() }) + ')'
                : ''
            )
          }
        }
      }
    }

    // if (typeof returnAccount.name === 'string') {
    //   returnAccount.name = humanize(returnAccount.name)
    //     .replace(/\s(.)/g, $1 => { return $1.toUpperCase() })
    //     .replace(/^(.)/, $1 => { return $1.toUpperCase() })
    // }

    return returnAccount
  } else if (typeof userSlug === 'string') {
    const accountsFromDb = await db(`
      SELECT
        CONCAT(
          users.user_slug,
          IF(
            useraccounts.useraccount_slug IS NULL,
            '',
            CONCAT('+', useraccounts.useraccount_slug)
          )
        ) as __full_slug,
        useraccounts.useraccount_account,
        users.user_name,
        useraccounts.useraccount_slug,
        users.user_slug,
        users.user_intro_text,
        users.user_profilepage
      FROM
        users
      LEFT JOIN
        useraccounts ON (
          users.user_id = useraccounts.user_id
        )
      WHERE
        users.user_slug = :slug
        AND
        useraccounts.useraccount_allowlookup = 1
      ORDER BY
        useraccounts.useraccount_slug IS NULL DESC,
        useraccounts.useraccount_slug ASC
    `, {
      slug: userSlug.toLowerCase().trim()
    })
    
    const profile = {}
    const accounts = accountsFromDb.map(a => {
      const account = a.useraccount_account.split(':')[0]
      const tag = a.useraccount_account.split(':')[1] || null
      const xaddr = xTagged.Encode({account, tag})
      return {
        title: a.useraccount_slug ? humanize(a.useraccount_slug) : accountsFromDb[0].user_name,
        payId: a.__full_slug,
        slug: a.useraccount_slug,
        account,
        tag,
        xaddr
      }
    })

    if (accountsFromDb.length > 0) {
      const profilepage = Boolean(accountsFromDb[0].user_profilepage)
      if (profilepage) {
        Object.assign(profile, {
          slug: accountsFromDb[0].user_slug,
          name: accountsFromDb[0].user_name,
          intro: accountsFromDb[0].user_intro_text,
          profilepage
        })
      }
    }
    
    return {
      profile,
      accounts
    }
  }

  return
}
