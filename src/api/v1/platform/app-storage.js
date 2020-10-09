const log = require('~src/handler/log')('app:custom-storage')

module.exports = async (req, res) => {
  const id = req.__auth.application.id || ''
  const application = {
    name: req.__auth.application.name,
    uuidv4: req.__auth.application.uuidv4
  }

  try {
    if (req.method.toUpperCase() === 'DELETE') {
      const u = await req.db(`
        DELETE FROM
          applications_blob
        WHERE
          application_id = :id
      `, { id })

      // log(u)
      res.json({
        application,
        stored: u.constructor.name === 'OkPacket',
        data: null
      })
    }
    if (req.method.toUpperCase() === 'GET') {
      const u = await req.db(`
        SELECT
          application_blob
        FROM
          applications_blob
        WHERE
          application_id = :id
      `, { id })

      let data = null
      if (u.constructor.name === 'Array' && u.length === 1 && u[0].constructor.name === 'RowDataPacket') {
        data = JSON.parse(u[0].application_blob.toString('utf-8'))
      }
      res.json({
        application,
        data
      })
    }
    if (req.method.toUpperCase() === 'POST') {
      const u = await req.db(`
        INSERT IGNORE INTO
          applications_blob (application_id, application_blob)
        VALUES
          (:id, :data)
        ON DUPLICATE KEY UPDATE
          application_blob = :data
      `,
      {
        id,
        data: JSON.stringify(req.body)
      })

      // log(u)
      res.json({
        application,
        stored: u.constructor.name === 'OkPacket',
        data: req.body,
      })
    }
  } catch (e) {
    const err = new Error(`App Storage Error`)
    err.causingError = e
    err.httpCode = err.code = 500
    return res.handleError(err)
  }
}
