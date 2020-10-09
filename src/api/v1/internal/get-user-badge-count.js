const log = require('~src/handler/log')('app:get-badge-count')
const getUserIdByDestination = require('~api/v1/internal/destination-to-userid')

module.exports = async (destination, db) => {
  try {
    if (typeof destination === 'object' && destination !== null) {
      let resolvedDestination = destination
      if (typeof resolvedDestination.userId === 'undefined' || !resolvedDestination.userId) {
        resolvedDestination = await getUserIdByDestination(destination, db)
      }

      if (typeof resolvedDestination.userId !== 'undefined' && resolvedDestination.userId) {
        const badge = await db(`
          SELECT count(1) as c
          FROM users
          LEFT JOIN tokens ON (tokens.user_id = users.user_id)
          LEFT JOIN payloads ON (payloads.token_id = tokens.token_id)
          WHERE users.user_id = :user_id
            AND tokens.token_hidden = 0
            AND tokens.token_reported = 0
            AND tokens.token_expiration > FROM_UNIXTIME(:now)
            AND payloads.payload_handler IS NULL
            AND payloads.payload_expiration > FROM_UNIXTIME(:now)
            AND payloads.payload_cancelled IS NULL
        `, {
          user_id: destination.userId,
          now: new Date() / 1000
        })
        return badge && badge.length === 1 ? badge[0].c : null
      }
    }
  } catch (e) {
    log('Error fetching user badge count', e.message || e)
  }
  return null
}
