const getUserDevices = require('~api/v1/internal/get-user-devices')

module.exports = async (req, res) => {
  try {
    const baseUrl = 'https://xapps.xumm.app/'
    const envUrl = `account:${req.params.account}/version:${req.params.version}/locale:${req.params.locale}/`

    const appList = {
      'xumm.tangem': 'Tangem Backup',
      'wietse': 'Wietse Dev',
      'koen': 'Koen Dev',
      'xumm.hook': 'Sample Hook'
    }

    const apps = Object.keys(appList).map(k => {
      return {
        title: appList[k],
        icon: 'https://xumm.app/assets/icons/apps/' + k + (k.split('.').length > 1 ? '.png' : '.jpg'),
        location: baseUrl + envUrl + 'app:' + k
      }
    })

    return res.json({
      ...(req.params),
      apps,
      moreUrl: baseUrl + envUrl
    })
  } catch (e) {
    res.handleError(e)
  }
}
