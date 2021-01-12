const getUserDevices = require('~api/v1/internal/get-user-devices')

module.exports = async (req, res) => {
  const apps = [
    {
      title: 'Tangem Backup',
      icon: 'https://xapps.xumm.app/assets/app-icons/app1.png',
      location: 'https://xapps.xumm.app/account:rxxxx/version:1.0.1/locale:en-US/app:xumm.tangem/',
    },
    {
      title: 'Multi Sign',
      icon: 'https://xapps.xumm.app/assets/app-icons/app2.png',
      location: 'https://xapps.xumm.app/account:rxxxx/version:1.0.1/locale:en-US/app:xumm.multisign/',
    },
    {
      title: 'Create Escrow',
      icon: 'https://xapps.xumm.app/assets/app-icons/app3.png',
      location: 'https://xapps.xumm.app/account:rxxxx/version:1.0.1/locale:en-US/app:xumm.escrow/',
    },
    {
      title: 'Sample Hook',
      icon: 'https://xapps.xumm.app/assets/app-icons/app4.png',
      location: 'https://xapps.xumm.app/account:rxxxx/version:1.0.1/locale:en-US/app:xumm.hook/',
    }
  ]

  try {
    return res.json({
      ...(req.params),
      apps,
      moreUrl: `https://xapps.xumm.app/account:${req.params.account}/version:${req.params.version}/locale:${req.params.locale}/`
    })
    // return res.json(devices)
  } catch (e) {
    res.handleError(e)
  }
}
