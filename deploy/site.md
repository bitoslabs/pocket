# Production site

https://pocket.bitos.space

nginx root: `/var/www/pocket.bitos.space`

## Build and verify locally

```bash
npm test
npm run build:check
npm run deploy:check
npm run deploy:list
```

`deploy/deploy.sh` packages the site in a temporary directory and stamps the service
worker with a hash of the files being published. Deploy through that script so each
changed release gets a fresh offline cache. Keep `deploy/.env` private.

Install `deploy/pocket.bitos.space.conf` on the server and reload nginx. The
`Cache-Control: no-cache` rules for `/`, HTML, JavaScript, CSS, the manifest,
icons, and `service-worker.js` let browsers revalidate reused filenames.
