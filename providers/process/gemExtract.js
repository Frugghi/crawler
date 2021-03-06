// Copyright (c) Microsoft Corporation and others. Licensed under the MIT license.
// SPDX-License-Identifier: MIT

const BaseHandler = require('../../lib/baseHandler')
const SourceSpec = require('../../lib/sourceSpec')
const sourceDiscovery = require('../../lib/sourceDiscovery')
const { get } = require('lodash')

class GemExtract extends BaseHandler {
  constructor(options, sourceFinder) {
    super(options)
    this.sourceFinder = sourceFinder
  }

  get schemaVersion() {
    return '1.1.2'
  }

  get toolSpec() {
    return { tool: 'clearlydefined', toolVersion: this.schemaVersion }
  }

  canHandle(request) {
    const spec = this.toSpec(request)
    return request.type === 'gem' && spec && spec.type === 'gem'
  }

  async handle(request) {
    if (this.isProcessing(request)) {
      const { spec } = super._process(request)
      this.addBasicToolLinks(request, spec)
      await this._createDocument(request, request.document.registryData)
      await BaseHandler.addInterestingFiles(request.document, request.document.location)
    }
    this.linkAndQueueTool(request, 'scancode')
    if (request.document.sourceInfo) {
      const sourceSpec = SourceSpec.fromObject(request.document.sourceInfo)
      this.linkAndQueue(request, 'source', sourceSpec.toEntitySpec())
    }
    return request
  }

  async _discoverSource(version, registryData) {
    if (!registryData) return null
    const candidates = []
    candidates.push(get(registryData, 'bug_tracker_uri'))
    candidates.push(get(registryData, 'changelog_uri'))
    candidates.push(get(registryData, 'documentation_uri'))
    candidates.push(get(registryData, 'gem_uri'))
    candidates.push(get(registryData, 'homepage_uri'))
    candidates.push(get(registryData, 'mailing_list_uri'))
    candidates.push(get(registryData, 'source_code_uri'))
    const allCandidates = candidates.filter(e => e)
    return this.sourceFinder(version, allCandidates, { githubToken: this.options.githubToken })
  }

  async _createDocument(request, registryData) {
    const sourceInfo = await this._discoverSource(registryData.version, registryData)
    if (sourceInfo) request.document.sourceInfo = sourceInfo
  }
}

module.exports = (options, sourceFinder) => new GemExtract(options, sourceFinder || sourceDiscovery)
