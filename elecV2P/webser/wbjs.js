const formidable = require('formidable')

const { logger, downloadfile, eAxios, errStack, sString, sType, Jsfile, file, wsSer } = require('../utils')
const clog = new logger({ head: 'wbjsfile', cb: wsSer.send.func('jsmanage') })

const { runJSFile, JSLISTS } = require('../script')

module.exports = app => {
  app.get("/jsfile", (req, res)=>{
    let jsfn = req.query.jsfn
    clog.info((req.headers['x-forwarded-for'] || req.connection.remoteAddress), "get js file", jsfn)
    if (!jsfn || /\.\./.test(jsfn)) {
      res.end(JSON.stringify({
        rescode: -1,
        message: 'illegal request to get js file ' + jsfn
      }))
      return
    }
    let jscont = Jsfile.get(jsfn)
    if (jscont) {
      res.end(jscont)
    } else {
      res.writeHead(404, { 'Content-Type': 'text/plain;charset=utf-8' })
      res.end(JSON.stringify({
        rescode: 404,
        message: '404 ' + jsfn + ' don\'t exist'
      }))
    }
  })

  app.get("/jsmanage", (req, res)=>{
    clog.info((req.headers['x-forwarded-for'] || req.connection.remoteAddress), "get js manage data")
    res.end(JSON.stringify({
      storemanage: true,
      jslists: Object.assign(JSLISTS, Jsfile.get('list'))
    }))
  })

  app.put("/jsfile", (req, res)=>{
    const op = req.body.op
    clog.info((req.headers['x-forwarded-for'] || req.connection.remoteAddress), op, req.body.url)
    switch(op){
      case 'jsdownload':
        downloadfile(req.body.url, Jsfile.get(req.body.name, 'path') || file.get('script/JSFile', 'path'), d=>{
          clog.info(d.finish || d.progress + '\r')
        }).then(jsl=>{
          res.end(JSON.stringify({
            rescode: 0,
            message: 'download js file to: ' + jsl
          }))
          if (req.body.name && JSLISTS.indexOf(req.body.name) === -1) {
            JSLISTS.push(req.body.name)
          }
        }).catch(e=>{
          res.end(JSON.stringify({
            rescode: -1,
            message: `${req.body.name ? req.body.name + ' ' : ''}${errStack(e)}`
          }))
        })
        break
      default: {
        res.end(JSON.stringify({
          rescode: -1,
          message: op + " - wrong operation on js file"
        }))
        break
      }
    }
  })

  app.post("/jsfile", (req, res)=>{
    let jsname = req.body.jsname
    let jscontent = req.body.jscontent
    clog.info((req.headers['x-forwarded-for'] || req.connection.remoteAddress), "post", jsname, req.body.type || 'to save')
    if (!(jsname && jscontent)) {
      res.end("a name of js and content is expect")
      return
    }
    if (req.body.type === 'totest') {
      runJSFile(req.body.jscontent, {
        type: 'rawcode',
        filename: jsname.split('.js')[0] + '-test.js',
        from: 'test',
        cb: wsSer.send.func('jsmanage'),
        timeout: 5000
      }).then(data=>{
        res.end(sString(data))
      }).catch(error=>{
        res.end('error: ' + error)
        clog.error(errStack(error))
      })
    } else {
      if (Jsfile.put(jsname, req.body.jscontent)) {
        res.end(JSON.stringify({
          rescode: 0,
          message: `${jsname} success saved`
        }))
        if (JSLISTS.indexOf(jsname) === -1) {
          JSLISTS.push(jsname)
        }
      } else {
        res.end(JSON.stringify({
          rescode: -1,
          message: `${jsname} fail to save`
        }))
      }
    }
  })

  app.delete("/jsfile", (req, res)=>{
    const jsfn = req.body.jsfn
    clog.notify((req.headers['x-forwarded-for'] || req.connection.remoteAddress), "delete js file " + jsfn)
    if (jsfn) {
      let bDelist = Jsfile.delete(jsfn)
      if (bDelist) {
        if (sType(bDelist) === 'array') {
          res.end(JSON.stringify({
            rescode: 0,
            message: bDelist.join(', ') + ' success deleted'
          }))
          bDelist.forEach(fn=>{
            let fnidx = JSLISTS.indexOf(fn)
            if (fnidx !== -1) {
              JSLISTS.splice(fnidx, 1)
            }
          })
        } else {
          res.end(JSON.stringify({
            rescode: 0,
            message: jsfn + ' success deleted'
          }))
          let fnidx = JSLISTS.indexOf(jsfn)
          if (fnidx !== -1) {
            JSLISTS.splice(fnidx, 1)
          }
        }
      } else {
        res.end(JSON.stringify({
          rescode: 404,
          message: jsfn + ' not existed'
        }))
      }
    } else {
      clog.error('a js file name is expect')
      res.end(JSON.stringify({
        rescode: -1,
        message: 'a parameter jsfn is expect'
      }))
    }
  })

  app.post('/uploadjs', (req, res) => {
    clog.info((req.headers['x-forwarded-for'] || req.connection.remoteAddress), "uploading JS file")
    const uploadfile = new formidable.IncomingForm()
    uploadfile.maxFieldsSize = 20 * 1024 * 1024 //限制为最大20M
    uploadfile.keepExtensions = true
    uploadfile.multiples = true
    uploadfile.parse(req, (err, fields, files) => {
      if (err) {
        clog.error('upload js Error', errStack(err))
        return res.end(JSON.stringify({
          rescode: -1,
          message: 'js upload fail ' + err.message
        }))
      }

      if (!files.js) {
        clog.info('no js file to upload')
        return res.end(JSON.stringify({
          rescode: 404,
          message: 'no js file upload'
        }))
      }
      if (files.js.length) {
        files.js.forEach(sgfile=>{
          clog.notify('upload js file:', sgfile.name)
          file.copy(sgfile.path, Jsfile.get(sgfile.name, 'path'))
          if (JSLISTS.indexOf(sgfile.name) === -1) {
            JSLISTS.push(sgfile.name)
          }
        })
      } else {
        clog.notify('upload js file:', files.js.name)
        file.copy(files.js.path, Jsfile.get(files.js.name, 'path'))
        if (JSLISTS.indexOf(files.js.name) === -1) {
          JSLISTS.push(files.js.name)
        }
      }
      return res.end(JSON.stringify({
        rescode: 0,
        message: 'upload success'
      }))
    })
  })

  app.put('/mock', (req, res)=>{
    clog.notify((req.headers['x-forwarded-for'] || req.connection.remoteAddress), 'make mock', req.body.type)
    const request = req.body.request
    switch(req.body.type){
      case "req":
        eAxios(request).then(response=>{
          clog.notify('mock request response:', response.data)
          res.end('success!')
        }).catch(error=>{
          clog.error('mock request', errStack(error))
          res.end('fail! ' + error.message)
        })
        break
      case "js":
        let jsname = req.body.jsname
        if (jsname) {
          if (!/\.js$/.test(jsname)) jsname = jsname + '.js'
        } else {
          jsname = 'elecV2Pmock.js'
        }
        const jscont = `/**
 * mock JS from elecV2P - ${jsname}
**/

const request = ${ JSON.stringify(request, null, 2) }

$axios(request).then(res=>{
  console.log(res.data)
}).catch(e=>{
  console.error(e)
})`
        Jsfile.put(jsname, jscont)
        res.end(`success save ${jsname}!`)
        clog.notify(`success save ${jsname}!`)
        if (JSLISTS.indexOf(jsname) === -1) {
          JSLISTS.push(jsname)
        }
        break
      default:{
        res.end("wrong mock type")
      }
    }
  })
}