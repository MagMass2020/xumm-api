const log = require('~src/handler/log')('app:xapp:shortlist')
// const getUserDevices = require('~api/v1/internal/get-user-devices')

module.exports = async (req, res) => {
  try {
    // const baseUrl = 'https://xapps.xumm.app/'
    // const envUrl = `account:${req.params.account}/version:${req.params.version}/locale:${req.params.locale}/`

    const appList = {
      'xumm.tangem': 'Tangem Backup',
      'wietse': 'Wietse Dev',
      'koen': 'Koen Dev',
      'xumm.hook': 'Sample Hook'
    }

    log('DeviceId', req.__auth.device.id)

    // const customUrl = {
    //   wietse: 'https://thong-clients-brazil-locked.trycloudflare.com/detect/xapp:xumm.tangem'
    // }

    const apps = Object.keys(appList).map(k => {
      return {
        title: appList[k],
        icon: 'https://xumm.app/assets/icons/apps/' + k + (k.split('.').length > 1 ? '.png' : '.jpg'),
        identifier: k
        // location: Object.keys(customUrl).indexOf(k) > -1
        //   ? customUrl[k]
        //   : baseUrl + envUrl + 'app:' + k
      }
    })

    return res.json({
      ...(req.params),
      apps
      // moreUrl: baseUrl // + envUrl
    })
  } catch (e) {
    res.handleError(e)
  }
}
