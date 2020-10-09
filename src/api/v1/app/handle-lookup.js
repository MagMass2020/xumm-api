const resolver = require('~api/v1/internal/handle-resolve')

/**
 * loadtest -n 2000 -c 100 \
 *  -H 'Content-Type: application/json;' \
 *  -H 'Authorization: Bearer 6a4d5d3b...' \
 *  http://localhost:3001/api/v1/app/handle-lookup/wietse
 */

module.exports = async (req, res) => {
  const handle = (req.params.handle || '').trim()

  res.json(await resolver(handle, req))
}
