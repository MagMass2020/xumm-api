# XUMM platform backend

 - Docs: http://xumm.readme.io
 - Developer Dashboard: https://apps.xumm.dev

**PLEASE NOTE! You are probably not looking for this source code, as you can just check the [docs](https://xumm.readme.io) and connect to the [public API XUMM Developer API](https://xumm.app/api/v1/platform/).**

## Config

Copy `sample-config.json` to either `development.json` or `production.json` (depending on your environment).

## Required infra

- Redis
- MySQL/MariaDB

## Dabase

Import the schema from `setup/database/create.sql`

## Tests

The tests require the service to be running. So: run `npm run dev`, and while dev is running, run `npm run test`
