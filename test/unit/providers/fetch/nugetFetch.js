// Copyright (c) Microsoft Corporation and others. Licensed under the MIT license.
// SPDX-License-Identifier: MIT

const chai = require('chai')
const NuGetFetch = require('../../../../providers/fetch/nugetFetch')({})
const expect = chai.expect

describe('NuGet fetch', () => {
  it('should normalize version correctly', () => {
    expect(NuGetFetch._normalizeVersion('1.0.0.0')).to.equal('1.0.0')
    expect(NuGetFetch._normalizeVersion('1.0.01.0')).to.equal('1.0.1')
    expect(NuGetFetch._normalizeVersion('1.00')).to.equal('1.0')
    expect(NuGetFetch._normalizeVersion('1.01.1')).to.equal('1.1.1')
    expect(NuGetFetch._normalizeVersion('1.00.0.1')).to.equal('1.0.0.1')
    expect(NuGetFetch._normalizeVersion('2.2.20')).to.equal('2.2.20')
    expect(NuGetFetch._normalizeVersion('1.0.000abc')).to.equal('1.0.abc')
    expect(NuGetFetch._normalizeVersion('2.200.0002000.0')).to.equal('2.200.2000')
    expect(NuGetFetch._normalizeVersion('3.00000000000000005')).to.equal('3.5')
    expect(NuGetFetch._normalizeVersion('0.00050')).to.equal('0.50')
    expect(NuGetFetch._normalizeVersion('3.0.0')).to.equal('3.0.0')
    expect(NuGetFetch._normalizeVersion('3.0.0-alpha')).to.equal('3.0.0-alpha')
    expect(NuGetFetch._normalizeVersion('2.1.0-preview2-final')).to.equal('2.1.0-preview2-final')
    expect(NuGetFetch._normalizeVersion('4.5.0-preview2-26406-04')).to.equal('4.5.0-preview2-26406-04')
  })
})
