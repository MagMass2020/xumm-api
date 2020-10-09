const uuid = require('uuid/v4')
const path = require('path')
const aws = require('aws-sdk')
const log = require('~src/handler/log')('app:devconsole:upload')
const multer = require('multer')
const multerS3 = require('multer-s3')

const uploadScope = {
  endpoint: undefined,
  s3: undefined,
  storage: undefined,
  method: undefined,
  validTypes: [
    'jpg',
    'jpeg',
    'png',
    'gif'
  ]
}

module.exports = (req, res) => {
  if (typeof uploadScope.endpoint === 'undefined') {
    // Init
    // Set S3 endpoint to DigitalOcean Spaces
    uploadScope.endpoint = new aws.Endpoint(req.config.uploadStore.endpoint)
    uploadScope.s3 = new aws.S3({
      endpoint: uploadScope.endpoint,
      credentials: {
        accessKeyId: req.config.uploadStore.key,
        secretAccessKey: req.config.uploadStore.secret
      }
    })

    uploadScope.storage = multerS3({
      s3: uploadScope.s3,
      contentType: multerS3.AUTO_CONTENT_TYPE,
      bucket: req.config.uploadStore.space,
      acl: 'public-read',
      key: function (req, file, cb) {
        // log('f', file)
        // cb(null, file.originalname)
        cb(null, 'app-logo/' + uuid() + '.' + file.mimetype.split('/')[1].toLowerCase())
      },
      metadata: function (req, file, cb) {
        cb(null, {
          oname: file.originalname,
          jwtuser: req.__auth.jwt.sub
        })
      }
    })

    uploadScope.method = multer({
      storage: uploadScope.storage,
      fileFilter (req, file, callback) {
        const ext = path.extname(file.originalname).toLowerCase().slice(1)
        if (uploadScope.validTypes.indexOf(ext) < 0) {
          return callback(new Error('Only images are allowed (E1)'))
        }
        if (file.mimetype.split('/')[0].toLowerCase() !== 'image') {
          return callback(new Error('Only images are allowed (M)'))
        }
        if (uploadScope.validTypes.indexOf(file.mimetype.split('/').reverse()[0].toLowerCase()) < 0) {
          return callback(new Error('Only images are allowed (E2)'))
        }
        callback(null, true)
      },
      limits: {
        fileSize: 10 * 1024 * 1024
      }
    }).single('upload')
  }

  try {
    return uploadScope.method(req, res, e => {
      if (e) {
        e.httpCode = e.code = 400
        res.handleError(e)
      } else {
        log('File uploaded successfully', req.file)
        return res.json({
          uploaded: true,
          file: req.file
        })
      }
    })
  } catch (e) {
    e.httpCode = e.code = 404
    return res.handleError(e)
  }
}
