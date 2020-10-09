const advisory = require('~api/v1/internal/advisory')

/**
 * loadtest -n 2000 -c 100 \
 *  -H 'Content-Type: application/json;' \
 *  -H 'Authorization: Bearer 6a4d5d3b...' \
 *  http://localhost:3001/api/v1/app/account-advisory/rPEPPER7kfTD9w2To4CQk6UCfuHM9c6GDY
 */

module.exports = async (req, res) => {
  const address = (req.params.address || '').trim()

  res.json(await advisory(address))
}
