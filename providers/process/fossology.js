// Copyright (c) Microsoft Corporation and others. Licensed under the MIT license.
// SPDX-License-Identifier: MIT

const BaseHandler = require('../../lib/baseHandler')
const { exec } = require('child_process')
const path = require('path')
const { promisify } = require('util')
const du = require('du')
const bufferReplace = require('buffer-replace')
const getFiles = promisify(require('node-dir').files)

let _toolVersion

class FossologyProcessor extends BaseHandler {
  constructor(options) {
    super(options)
    // TODO little questionable here. Kick off an async operation on load with the expecation that
    // by the time someone actually uses this instance, the call will have completed.
    // Need to detect the tool version before anyone tries to run this processor.
    this._versionPromise = this._detectVersion()
  }

  get schemaVersion() {
    return _toolVersion
  }

  get toolSpec() {
    return { tool: 'fossology', toolVersion: this.schemaVersion }
  }

  canHandle(request) {
    return request.type === 'fossology'
  }

  async handle(request) {
    _toolVersion = await this._versionPromise
    if (!_toolVersion) return request.markSkip('FOSSology tool configuration issue. See startup log.')

    const { document, spec } = super._process(request)
    const size = await this._computeSize(document)
    request.addMeta({ k: size.k, fileCount: size.count })
    this.addBasicToolLinks(request, spec)
    this.logger.info(`Analyzing ${request.toString()} using FOSSology. input: ${request.document.location}`)
    await this._createDocument(request)
    return request
  }

  async _runNomos(request) {
    const version = await this._nomosVersion
    return new Promise((resolve, reject) => {
      // TODO add correct parameters and command line here
      const parameters = ['-ld', request.document.location].join(' ')
      exec(
        `cd ${this.options.installDir}/nomos/agent && ./nomossa ${parameters}`,
        { maxBuffer: 5000 * 1024 },
        (error, stdout) => {
          if (error) {
            request.markDead('Error', error ? error.message : 'FOSSology run failed')
            return reject(error)
          }
          const output = {
            contentType: 'text/plain',
            content: bufferReplace(new Buffer(stdout), request.document.location + '/', '').toString()
          }
          const nomosOutput = { version, parameters, output }
          resolve(nomosOutput)
        }
      )
    })
  }

  async _visitFiles(files, runner) {
    const results = []
    for (const file of files) {
      if (file) {
        try {
          const output = await runner(path)
          if (output) results.push({ path: file, output: JSON.parse(output) })
        } catch (error) {
          this.logger.error(error)
        }
      }
    }
    return { output: { contentType: 'application/json', content: results } }
  }

  async _runCopyrights(request, files) {
    const result = await this._visitFiles(files, path => this._runCopyright(request, path))
    result.version = await this._copyrightVersion
    return result
  }

  _runCopyright(request, file) {
    return new Promise((resolve, reject) => {
      const parameters = ['--files', file, '-J'].join(' ')
      exec(`cd ${this.options.installDir}/copyright/agent && ./copyright ${parameters}`, (error, stdout) => {
        if (error) {
          request.markDead('Error', error ? error.message : 'FOSSology copyright run failed')
          return reject(error)
        }
        resolve(stdout)
      })
    })
  }

  async _runMonkOnFiles(request, files) {
    const result = await this._visitFiles(files, path => this._runMonk(request, path))
    result.version = await this._monkVersion
    return result
  }

  _runMonk(request, file) {
    // TODO figure out where to get a license file. May have to be created at build time
    const licenseFile = ''
    return new Promise((resolve, reject) => {
      const parameters = ['-k', licenseFile, '-J', file].join(' ')
      exec(`cd ${this.options.installDir}/monk/agent && ./monk ${parameters}`, (error, stdout) => {
        if (error) {
          request.markDead('Error', error ? error.message : 'FOSSology monk run failed')
          return reject(error)
        }
        resolve(stdout)
      })
    })
  }

  async _computeSize(document) {
    let count = 0
    const bytes = await promisify(du)(document.location, {
      filter: file => {
        if (path.basename(file) === '.git') return false
        count++
        return true
      }
    })
    return { k: Math.round(bytes / 1024), count }
  }

  _getUrn(spec) {
    const newSpec = Object.assign(Object.create(spec), spec, { tool: 'fossology', toolVersion: this.toolVersion })
    return newSpec.toUrn()
  }

  // Aggregate the semver numbers from all the tools to form the FOSSology tool version
  // This approach is ok as we expect the individual version numbers to monotonically increase
  // and don't really care which changes, just that something changed.
  async _detectVersion() {
    if (this._versionPromise) return this._versionPromise
    try {
      // base is used to account for any high level changes in the way the FOSSology tools are run or configured
      const base = '0.0.0'
      this._nomosVersion = await this._detectNomosVersion()
      this._copyrightVersion = await this._detectCopyrightVersion()
      this._monkVersion = await this._detectMonkVersion()
      return BaseHandler._aggregateVersions(
        [this._nomosVersion, this._copyrightVersion, this._monkVersion],
        'FOSSology tool version misformatted',
        base
      )
    } catch (error) {
      this.logger.log(`Could not find FOSSology tool version: ${error.message}`)
      return null
    }
  }

  _detectNomosVersion() {
    return new Promise((resolve, reject) => {
      exec(`cd ${this.options.installDir}/nomos/agent && ./nomossa -V`, (error, stdout) => {
        if (error) return reject(error)
        const rawVersion = stdout.replace('nomos build version:', '').trim()
        resolve(rawVersion.replace(/-.*/, '').trim())
      })
    })
  }

  _detectMonkVersion() {
    return new Promise((resolve, reject) => {
      exec(`cd ${this.options.installDir}/monk/agent && ./monk -V`, (error, stdout) => {
        if (error) return reject(error)
        const rawVersion = stdout.replace('monk version', '').trim()
        resolve(rawVersion.replace(/-.*/, '').trim())
      })
    })
  }

  // TODO see how copyright outputs its version and format accordingly. The code appears to not have
  // a means of getting a version. So, for now, use 0.0.0 to simulate using the same version as
  // nomos. That will be taken as the overall version of the FOSSology support as they are
  // built from the same tree at the same time.
  _detectCopyrightVersion() {
    return new Promise(resolve => {
      resolve('0.0.0')
      // exec(`cd ${this.options.installDir}/copyright/agent && ./copyright -V`, (error, stdout) => {
      //   if (error) return reject(null)
      //   resolve('0.0.0')
      // })
    })
  }

  async _createDocument(request) {
    const files = await getFiles(request.document.location)
    const nomosOutput = await this._runNomos(request)
    const copyrightOutput = await this._runCopyrights(request, files)
    const monkOutput = await this._runMonk(request, files)
    request.document = { _metadata: request.document._metadata }
    if (nomosOutput) request.document.nomos = nomosOutput
    if (copyrightOutput) request.document.copyright = copyrightOutput
    if (monkOutput) request.document.monk = monkOutput
  }
}

module.exports = options => new FossologyProcessor(options)
