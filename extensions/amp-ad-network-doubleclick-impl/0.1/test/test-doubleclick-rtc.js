/**
 * Copyright 2016 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
import {RTC_ERROR_ENUM} from '../../../amp-a4a/0.1/real-time-config-manager';
import {
  AmpAdNetworkDoubleclickImpl,
} from '../amp-ad-network-doubleclick-impl';
import {createElementWithAttributes} from '../../../../src/dom';
// Need the following side-effect import because in actual production code,
// Fast Fetch impls are always loaded via an AmpAd tag, which means AmpAd is
// always available for them. However, when we test an impl in isolation,
// AmpAd is not loaded already, so we need to load it separately.
import '../../../amp-ad/0.1/amp-ad';

describes.realWin('DoubleClick Fast Fetch RTC', {amp: true}, env => {
  let impl;
  let element;
  let sandbox;

  beforeEach(() => {
    sandbox = env.sandbox;
    env.win.AMP_MODE.test = true;
    const doc = env.win.document;
    // TODO(a4a-cam@): This is necessary in the short term, until A4A is
    // smarter about host document styling.  The issue is that it needs to
    // inherit the AMP runtime style element in order for shadow DOM-enclosed
    // elements to behave properly.  So we have to set up a minimal one here.
    const ampStyle = doc.createElement('style');
    ampStyle.setAttribute('amp-runtime', 'scratch-fortesting');
    doc.head.appendChild(ampStyle);
    element = createElementWithAttributes(env.win.document, 'amp-ad', {
      'width': '200',
      'height': '50',
      'type': 'doubleclick',
      'layout': 'fixed',
    });
    impl = new AmpAdNetworkDoubleclickImpl(element, env.win.document, env.win);
    impl.populateAdUrlState();
  });

  afterEach(() => {
    sandbox.restore();
    impl = null;
  });

  describe('#mergeRtcResponses_', () => {
    function testMergeRtcResponses(
        rtcResponseArray, expectedParams, expectedJsonTargeting) {
      const rtcUrlParams = impl.mergeRtcResponses_(rtcResponseArray);
      expect(rtcUrlParams).to.deep.equal(expectedParams);
      expect(impl.jsonTargeting_).to.deep.equal(expectedJsonTargeting);
    }
    it('should properly merge RTC responses into jsonTargeting on impl', () => {
      const rtcResponseArray = [
        {response: {targeting: {'a': [1,2,3], 'b': {c: 'd'}}},
          callout: 'www.exampleA.com', rtcTime: 100},
        {response: {targeting: {'a': 'foo', 'b': {e: 'f'}}},
          callout: 'www.exampleB.com', rtcTime: 500},
        {response: {targeting: {'z': [{a: 'b'}, {c: 'd'}], 'b': {c: 'd'}}},
          callout: 'www.exampleC.com', rtcTime: 100},
      ];
      const expectedParams = {
        ati: '2,2,2',
        artc: '100,500,100',
        ard: 'www.exampleA.com,www.exampleB.com,www.exampleC.com',
      };
      const expectedJsonTargeting = {
        targeting: {
          'a': 'foo', 'b': {c: 'd', e: 'f'}, 'z': [{a: 'b'}, {c: 'd'}]},
      };
      testMergeRtcResponses(
          rtcResponseArray, expectedParams, expectedJsonTargeting);
    });

    it('should only add params for callouts that were actually sent', () => {
      const rtcResponseArray = [
        {error: RTC_ERROR_ENUM.MALFORMED_JSON_RESPONSE,
          callout: 'www.exampleA.com', rtcTime: 100},
        {response: {targeting: {'a': 'foo', 'b': {e: 'f'}}},
          callout: 'www.exampleB.com', rtcTime: 500},
        {error: RTC_ERROR_ENUM.DUPLICATE_URL,
          callout: 'www.exampleB.com', rtcTime: 0},
        {error: RTC_ERROR_ENUM.NETWORK_FAILURE,
          callout: 'www.exampleC.com', rtcTime: 100},
      ];
      const expectedParams = {
        ati: '3,2,3',
        artc: '100,500,100',
        ard: 'www.exampleA.com,www.exampleB.com,www.exampleC.com',
      };
      const expectedJsonTargeting = {
        targeting: {'a': 'foo', 'b': {e: 'f'}},
      };
      testMergeRtcResponses(
          rtcResponseArray, expectedParams, expectedJsonTargeting);
    });

    it('should properly merge mix of success and errors', () => {
      impl.jsonTargeting_ = {targeting:
                            {'abc': [1,2,3], 'b': {n: 'm'}, 'a': 'TEST'},
        categoryExclusions: {loc: 'USA'}};
      const rtcResponseArray = [
        {error: RTC_ERROR_ENUM.TIMEOUT,
          callout: 'www.exampleA.com', rtcTime: 1500},
        {response: {targeting: {'a': 'foo', 'b': {e: 'f'}},
          categoryExclusions: {sport: 'baseball'}},
          callout: 'VendorFoo', rtcTime: 500},
        {response: {targeting: {'a': [1,2,3], 'b': {c: 'd'}}},
          callout: 'www.exampleB.com', rtcTime: 100},
        {response: {targeting: {'a': [4,5,6], 'b': {x: [1,2]}}},
          callout: 'VendCom', rtcTime: 500},
        {error: RTC_ERROR_ENUM.DUPLICATE_URL,
          callout: 'www.exampleB.com', rtcTime: 0},
        {error: RTC_ERROR_ENUM.NETWORK_FAILURE,
          callout: '3PVend', rtcTime: 100},
      ];
      const expectedParams = {
        ati: '3,2,2,2,3',
        artc: '1500,500,100,500,100',
        ard: 'www.exampleA.com,VendorFoo,www.exampleB.com,' +
            'VendCom,3PVend',
      };
      const expectedJsonTargeting = {
        targeting: {
          'a': [4,5,6], 'b': {n: 'm', e: 'f', c: 'd', x: [1,2]},
          abc: [1,2,3]},
        categoryExclusions: {loc: 'USA', sport: 'baseball'},
      };
      testMergeRtcResponses(
          rtcResponseArray, expectedParams, expectedJsonTargeting);
    });

    it('should return null for empty array', () => {
      expect(impl.mergeRtcResponses_()).to.be.null;
    });

  });
});
