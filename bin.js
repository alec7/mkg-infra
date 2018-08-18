#!/usr/bin/env node

'use strict'

/* eslint-disable no-console */

// cli to manage repos using this template

/*

Link on server:
  ssl/acme -> /etc/letsencrypt
  nginx/sites -> /etc/nginx/sites
  nginx/conf.d -> /etc/nginx/conf.d
  nginx/_ -> /etc/nginx/_

Link in repo:
  nginx/_/*
  nginx/conf.d/*
  nginx/nginx.conf
  ssl/acme-wrapper.sh
  dns/tool.sh

Cp to repo on init:
  nginx/sites/00-default.conf
  dns/domains/example.com

*/

const fs = require('fs')
const path = require('path')
const isInside = require('is-path-inside')
const mkdirp = require('mkdirp').sync
const glob = require('glob').sync

function findGitFolder (p, lp) {
  if (lp !== p) {
    if (fs.readdirSync(p).indexOf('.git') !== -1) {
      return p
    }
    return findGitFolder(path.dirname(p), p)
  }

  throw new Error('No .git folder found, is this the right repo?')
}

const repoFolder = __dirname
const mainFolder = findGitFolder(process.cwd())

if (!(isInside(repoFolder, mainFolder) || fs.readdirSync(repoFolder).indexOf('.git') !== -1)) { // repo must be in main folder, skip check if repo folder has .git (dev linked)
  throw new Error('Please don\'t use the globally installed version of this module! This would otherwise break the symlinks on every system!')
}

let config

function loadConfig () {
  config = require(path.join(mainFolder, 'config.json'))
}

function saveConfig () {
  fs.writeFileSync(path.join(mainFolder, 'config.json'), JSON.stringify(config, 0, 2))
}

/* file functions */

function link (from, to) {
  if (!to) {
    to = from
  }
  to = path.join(mainFolder, to)
  mkdirp(path.dirname(to))
  if (fs.existsSync(to)) {
    fs.unlinkSync(to)
  }
  fs.symlinkSync(path.relative(path.dirname(to), path.join(repoFolder, from)), to)
}

function cp (from, to) {
  if (!to) {
    to = from
  }
  to = path.join(mainFolder, to)
  mkdirp(path.dirname(to))
  if (fs.existsSync(to)) {
    return console.warn('%s already exists! Skipping overwrite...', to)
  }
  fs.writeFileSync(to, fs.readFileSync(path.join(repoFolder, from)))
}

function wlink (g, from, to) {
  if (!to) {
    to = from
  }
  const files = glob(path.join(repoFolder, from, g))
  files.map(f => path.basename(f)).forEach(f => {
    link(path.join(from, f), path.join(to, f))
  })
}

/* actual functions */

const addons = {
  base: {
    init: () => {
      cp('gitignore_repo', '.gitignore')
      cp('deploy.yaml')
    }
  },
  nginx: {
    init: () => {
      cp('nginx/sites/00-default.conf')
    },
    sync: () => {
      link('deploy.d/nginx.yaml')
      link('deploy.d/ssl.yaml')
      wlink('*', 'nginx/_')
      wlink('*', 'nginx/conf.d')
      link('nginx/nginx.conf')
      link('ssl/tool.sh')
    }
  },
  dns: {
    init: () => {
      cp('dns/domains/example.com')
    },
    sync: () => {
      link('dns/tool.sh')
    }
  },
  snoopy: {
    sync: () => {
      link('deploy.d/snoopy.yaml')
      link('etc/snoopy.ini')
    }
  },
  fail2ban: {
    sync: () => {
      link('deploy.d/fail2ban.yaml')
    }
  },
  node: {
    sync: () => {
      link('deploy.d/node.yaml')
    }
  }
}

function sync () {
  config.addons.concat(['base']).forEach(ad => {
    if (addons[ad].sync) {
      addons[ad].sync()
    }
  })
}

function init () {
  config.addons.concat(['base']).forEach(ad => {
    if (addons[ad].init) {
      addons[ad].init()
    }
  })
}

/* cli */

require('yargs') // eslint-disable-line no-unused-expressions
  .command({
    command: 'init',
    describe: 'Initializes a new repo',
    builder: {},
    handler (argv) {
      config = {addons: []}
      saveConfig()
      init()
      sync()
    }
  })
  .command({
    command: 'sync',
    describe: 'Syncronizes an existing repo',
    builder: {},
    handler (argv) {
      loadConfig()
      sync()
    }
  })
  .command({
    command: 'enable <addon>',
    describe: 'Enable an addon',
    handler (argv) {
      loadConfig()
      if (config.addons.indexOf(argv.addon) === -1 && addons[argv.addon]) {
        config.addons.push(argv.addon)
        addons[argv.addon].init()
        saveConfig()
        sync()
      } else {
        console.error('Addon already enabled or does not exist')
        console.error('Available addons: ' + Object.keys(addons).join(', '))
      }
    }
  })
  .argv
