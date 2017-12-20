const fs = require('fs')
const path = require('path')
const LRU = require('lru-cache')  //内存键值对存储管理
const favicon = require('koa-favicon')
const resolve = file => path.resolve(__dirname, file)
const { createBundleRenderer } = require('vue-server-renderer')
// const sendGoogleAnalytic = require('./middleware/serverGoogleAnalytic')

const isProd = process.env.NODE_ENV === 'production'
const useMicroCache = process.env.MICRO_CACHE !== 'false'
const serverInfo =
  `koa/${require('koa/package.json').version} ` +
  `vue-server-renderer/${require('vue-server-renderer/package.json').version}`

const Koa = require('koa')
const app = new Koa()
const router = require('koa-router')()
const bodyParser = require('koa-bodyparser')  
const logger = require('koa-logger')  

const template = fs.readFileSync(resolve('./src/template/index.template.html'), 'utf-8')

function createRenderer (bundle, options) {
  // https://github.com/vuejs/vue/blob/dev/packages/vue-server-renderer/README.md#why-use-bundlerenderer
  return createBundleRenderer(bundle, Object.assign(options, {
    template,
    // for component caching
    cache: LRU({
      max: 1000,
      maxAge: 1000 * 60 * 15
    }),
    // this is only needed when vue-server-renderer is npm-linked
    basedir: resolve('./dist'),
    // recommended for performance
    runInNewContext: false
  }))
}

let renderer
let readyPromise
if (isProd) {
  // In production: create server renderer using built server bundle.
  // The server bundle is generated by vue-ssr-webpack-plugin.
  const bundle = require('./dist/vue-ssr-server-bundle.json')
  // The client manifests are optional, but it allows the renderer
  // to automatically infer preload/prefetch links and directly add <script>
  // tags for any async chunks used during render, avoiding waterfall requests.
  const clientManifest = require('./dist/vue-ssr-client-manifest.json')
  renderer = createRenderer(bundle, {
    clientManifest
  })
} else {
  // In development: setup the dev server with watch and hot-reload,
  // and create a new renderer on bundle / index template update.

  readyPromise = require('./build/koa-setup-server')(app, (bundle, options) => {
    renderer = createRenderer(bundle, options)
  })
}

const staticCache = require('koa-static-cache')
//https://github.com/koajs/static-cache  参数设置，配置 prefix 提供的文件创建虚拟路径前缀  类似app.use('/static', express.static('public')) http://expressjs.com/zh-cn/starter/static-files.html
const serve = (pf, path, cache) => staticCache(resolve(path), {
  maxAge: cache && isProd ? 365 * 24 * 60 * 60 : 0,
  gzip: true,
  prefix: pf
})

app
.use(favicon('./public/logo-48.png'))
.use(serve('/dist', './dist', true))
.use(serve('/public', './public', true))
.use(serve('/manifest.json', './manifest.json', true))
.use(serve('/dist/service-worker.js', './dist/service-worker.js'))

// 配置HTTP请求体解析中间件，支持content-type：json, form and text 
app.use(bodyParser())
// 配置控制台个性日志中间件
app.use(logger())

// 1-second microcache.
// https://www.nginx.com/blog/benefits-of-microcaching-nginx/
const microCache = LRU({
  max: 100,
  maxAge: 1000
})

// since this app has no user-specific content, every page is micro-cacheable.
// if your app involves user-specific content, you need to implement custom
// logic to determine whether a request is cacheable based on its url and
// headers.
const isCacheable = req => useMicroCache

function render (ctx, next, resolve) {
  let req = ctx.request
  let res = ctx.response
  const s = Date.now()

  ctx.set("Content-Type", "text/html")
  ctx.set("Server", serverInfo)

  const handleError = err => {
    if (err.url) {
      ctx.redirect(err.url)
    } else if(err.code === 404) {
      ctx.status = 404
      ctx.body = '404 | Page Not Found'
    } else {
      // Render Error Page or Redirect
      ctx.status = 500
      ctx.body = '500 | Internal Server Error'
      console.error(`error during render : ${req.url}`)
      console.error(err.stack)
    }
    resolve()
  }

  const cacheable = isCacheable(req)
  //缓存 html 结构处理
  if (cacheable) {
    const hit = microCache.get(req.url)
    if (hit) {
      if (!isProd) {
        console.log(`cache hit!`)
      }
      ctx.body = hit
      // console.log("hit", hit)
      return
    }
  }

  const context = {
    title: 'Vue HN 2.0', // default title
    url: req.url
  }

  renderer.renderToString(context, (err, html) => {
    if (err) {
      return handleError(err)
    }

    ctx.body = html
    // console.log("html", html)
    if (cacheable) {
      microCache.set(req.url, html)
    }

    console.log(`整个服务端渲染的耗时 whole request: ${Date.now() - s}ms`)
    resolve()
  })

}

// router.get('/_.gif', (ctx, next) => sendGoogleAnalytic(ctx, next))

//router使用异步，需要 return new Promise()
router.get('*', (ctx, next) => {
  if(isProd){
    return new Promise( (resolve, reject) => {
      render(ctx, next, resolve)
    })
  }else{
    return new Promise( (resolve, reject) => {
      readyPromise.then(() => render(ctx, next, resolve))
    })
  }
})

app
.use(router.routes())
.use(router.allowedMethods());

const port = process.env.PORT || 8080
app.listen(port, () => {
  console.log(`server started at localhost:${port}`)
})
