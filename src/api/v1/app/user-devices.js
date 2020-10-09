const getUserDevices = require('~api/v1/internal/get-user-devices')

module.exports = async (req, res) => {
  try {
    const devices = await getUserDevices(req.__auth.user.id, req.db, { /** options */ })
    return res.json(devices)
  } catch (e) {
    res.handleError(e)
  }
}
