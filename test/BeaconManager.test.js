import assert from 'assert';
import sinon from 'sinon';
import BeaconLcp from '../src/BeaconLcp.js';
import BeaconManager from '../src/BeaconManager.js'
import BeaconUtils from '../src/Utils.js';
import node_fetch from 'node-fetch';
global.fetch = node_fetch;

describe('BeaconManager', function() {
    let beacon;
    const config = { nonce: 'test', url: 'http://example.com', is_mobile: false, status: {atf: true}, width_threshold: 100, height_threshold: 100 };
    beforeEach(function() {
        // Deep copy of config
        beacon = new BeaconManager(JSON.parse(JSON.stringify(config)));

        // Mock window and document objects
        global.window = {
            pageYOffset: 0
        };
        global.document = {
            documentElement: {
                scrollTop: 0
            },
            querySelector: sinon.stub().returns({
                setAttribute: sinon.spy()
            })
        };
    });

    describe('#constructor()', function() {
        it('should initialize with the given config', function() {
            assert.deepStrictEqual(beacon.config, config);
        });
    });

    describe('#init()', function() {
        let fetchStub;
        let _isValidPreconditionsStub;
        let isPageCachedStub;
        let _finalizeStub;
        beforeEach(function() {
            // Stub the global fetch method
            _isValidPreconditionsStub = sinon.stub(beacon, '_isValidPreconditions');
            isPageCachedStub = sinon.stub(BeaconUtils, 'isPageCached');
            _finalizeStub = sinon.stub(beacon, '_finalize');
            fetchStub = sinon.stub(global, 'fetch');
            
        });
        afterEach(function() {
            // Restore the original fetch method
            _isValidPreconditionsStub.restore();
            isPageCachedStub.restore();
            _finalizeStub.restore();
            fetchStub.restore();
        });
        it('should not send AJAX calls if invalid preconditions', async function() {
            // Mock _isValidPreconditions
            _isValidPreconditionsStub.resolves(false);
            await beacon.init();
            assert.strictEqual(_isValidPreconditionsStub.calledOnce, true);
            assert.strictEqual(fetchStub.notCalled, true);
        });
        it('should not send AJAX calls if not cached page', async function() {
            // Mock _isValidPreconditions
            _isValidPreconditionsStub.resolves(true);
            isPageCachedStub.returns(false);
            beacon.config.status.atf = false;

            await beacon.init();

            assert.strictEqual(_isValidPreconditionsStub.calledOnce, true);
            assert.strictEqual(isPageCachedStub.calledOnce, true );
            assert.strictEqual(fetchStub.notCalled, true);
        });
    });

    describe('#init()', function() {
        let fetchStub;
        let _isValidPreconditionsStub;
        let _getGeneratedBeforeStub;
        let _saveFinalResultIntoDBStub;
        let _finalizeStub;
        beforeEach(function() {
            // Stub the global fetch method
            _isValidPreconditionsStub = sinon.stub(beacon, '_isValidPreconditions');
            _getGeneratedBeforeStub = sinon.stub(beacon, '_getGeneratedBefore');
            _saveFinalResultIntoDBStub = sinon.stub(beacon, '_saveFinalResultIntoDB');
            _finalizeStub = sinon.stub(beacon, '_finalize');
            fetchStub = sinon.stub(global, 'fetch');

            beacon.config = config;
            
        });
        afterEach(function() {
            // Restore the original fetch method
            _isValidPreconditionsStub.restore();
            _getGeneratedBeforeStub.restore();
            _saveFinalResultIntoDBStub.restore()
            _finalizeStub.restore();
            fetchStub.restore();
        });
        it('should not send AJAX save data if data already generated', async function() {
            // Mock _isValidPreconditions
            _isValidPreconditionsStub.resolves(true);
            _getGeneratedBeforeStub.resolves(true);

            await beacon.init();
            
            assert.strictEqual(_isValidPreconditionsStub.calledOnce, true);
            assert.strictEqual(_saveFinalResultIntoDBStub.notCalled, true);
        });
        it('should not send AJAX save data if no features ran', async function() {
            // Mock _isValidPreconditions
            _isValidPreconditionsStub.resolves(true);
            _getGeneratedBeforeStub.resolves(false);
            beacon.config.status.atf = false;

            await beacon.init();
            
            assert.strictEqual(_isValidPreconditionsStub.calledOnce, true);
            assert.strictEqual(_saveFinalResultIntoDBStub.notCalled, true);
        });
    });

    describe('#init()', function() {
        let fetchStub;
        let _isValidPreconditionsStub;
        let isPageCachedStub;
        let _finalizeStub;

        beforeEach(function() {
            // Stub the global fetch method
            _isValidPreconditionsStub = sinon.stub(beacon, '_isValidPreconditions');
            isPageCachedStub = sinon.stub(BeaconUtils, 'isPageCached');
            _finalizeStub = sinon.stub(beacon, '_finalize');
            fetchStub = sinon.stub(global, 'fetch').resolves({
                json: () => Promise.resolve({ data: false })
            });
        });

        afterEach(function() {
            // Restore the original fetch method
            _isValidPreconditionsStub.restore();
            isPageCachedStub.restore();
            _finalizeStub.restore();
            fetchStub.restore();
        });

        it('should bail out if the page is scrolled', async function() {
            // Mock _isValidPreconditions
            _isValidPreconditionsStub.resolves(true);
            isPageCachedStub.returns(false);

            // Simulate page being scrolled
            global.window.pageYOffset = 100;
            global.document.documentElement.scrollTop = 100;

            await beacon.init();

            assert.strictEqual(_isValidPreconditionsStub.calledOnce, true);
            assert.strictEqual(_finalizeStub.calledOnce, true);
            assert.strictEqual(fetchStub.notCalled, true);
        });
    });

    describe('#_isValidPreconditions()', function() {
        it('should return true for desktop screensize larger than threshold', async function() {
            // Mocking window properties and methods since they are used in _isValidPreconditions
            global.window = {
                innerWidth: 800,
                innerHeight: 600,
                document: {
                    documentElement: {
                        clientWidth: 800,
                        clientHeight: 600
                    }
                }
            };

            const result = await beacon._isValidPreconditions();
            assert.strictEqual(result, true);
        });
        it('should return false for desktop width lower than threshold', async function() {
            // Mocking window properties and methods since they are used in _isValidPreconditions
            global.window = {
                innerWidth: 50,
                innerHeight: 600,
                document: {
                    documentElement: {
                        clientWidth: 50,
                        clientHeight: 600
                    }
                }
            };

            const result = await beacon._isValidPreconditions();
            assert.strictEqual(result, false);
        });
        it('should return true for desktop height lower than threshold', async function() {
            // Mocking window properties and methods since they are used in _isValidPreconditions
            global.window = {
                innerWidth: 800,
                innerHeight: 60,
                document: {
                    documentElement: {
                        clientWidth: 800,
                        clientHeight: 60
                    }
                }
            };

            const result = await beacon._isValidPreconditions();
            assert.strictEqual(result, false);
        });
        it('should return true for desktop screensize lower than threshold', async function() {
            // Mocking window properties and methods since they are used in _isValidPreconditions
            global.window = {
                innerWidth: 80,
                innerHeight: 60,
                document: {
                    documentElement: {
                        clientWidth: 80,
                        clientHeight: 60
                    }
                }
            };

            const result = await beacon._isValidPreconditions();
            assert.strictEqual(result, false);
        });
        it('should return false for mobile screensize larger than threshold', async function() {
            // Mocking window properties and methods since they are used in _isValidPreconditions
            global.window = {
                innerWidth: 800,
                innerHeight: 600,
                document: {
                    documentElement: {
                        clientWidth: 800,
                        clientHeight: 600
                    }
                }
            };
            beacon.config.is_mobile = true;

            const result = await beacon._isValidPreconditions();
            assert.strictEqual(result, false);
        });
        it('should return false for mobile width larger than threshold', async function() {
            // Mocking window properties and methods since they are used in _isValidPreconditions
            global.window = {
                innerWidth: 800,
                innerHeight: 60,
                document: {
                    documentElement: {
                        clientWidth: 800,
                        clientHeight: 60
                    }
                }
            };
            beacon.config.is_mobile = true;

            const result = await beacon._isValidPreconditions();
            assert.strictEqual(result, false);
        });
        it('should return false for mobile height larger than threshold', async function() {
            // Mocking window properties and methods since they are used in _isValidPreconditions
            global.window = {
                innerWidth: 80,
                innerHeight: 600,
                document: {
                    documentElement: {
                        clientWidth: 80,
                        clientHeight: 600
                    }
                }
            };
            beacon.config.is_mobile = true;

            const result = await beacon._isValidPreconditions();
            assert.strictEqual(result, false);
        });
        it('should return false for mobile screensize lower than threshold', async function() {
            // Mocking window properties and methods since they are used in _isValidPreconditions
            global.window = {
                innerWidth: 10,
                innerHeight: 5,
                document: {
                    documentElement: {
                        clientWidth: 10,
                        clientHeight: 5
                    }
                }
            };
            beacon.config.is_mobile = true;

            const result = await beacon._isValidPreconditions();
            assert.strictEqual(result, true);
        });
    });

    describe('#_getFinalStatus()', function() {
        it('should return error code if set', function() {
            beacon.errorCode = 'error';
            assert.strictEqual(beacon._getFinalStatus(), 'error');
        });

        it('should return timeout if script time exceeds 10 seconds', function() {
            beacon.scriptTimer = new Date() - 11000; // 11 seconds ago
            assert.strictEqual(beacon._getFinalStatus(), 'timeout');
        });

        it('should return success for valid conditions', function() {
            beacon.scriptTimer = new Date();
            assert.strictEqual(beacon._getFinalStatus(), 'success');
        });
    });

    describe('#_saveFinalResultIntoDB()', function() {
        let fetchStub;

        beforeEach(function() {
            // Setup fetch stub
            fetchStub = sinon.stub(global, 'fetch');
            // Simulate fetch resolving with a JSON response
            fetchStub.resolves({
                json: () => Promise.resolve({ message: 'Data saved successfully' })
            });
        });

        afterEach(function() {
            // Restore the original fetch function
            fetchStub.restore();
        });

        it('should call fetch with the correct parameters and handle the response', async function() {
            beacon.performanceImages = [{ src: 'http://example.com/image.jpg', label: 'lcp' }];
            beacon.errorCode = '';
            beacon.scriptTimer = new Date();

            await beacon._saveFinalResultIntoDB();

            sinon.assert.calledOnce(fetchStub);
            const expectedBody = new FormData();
            expectedBody.append('action', 'rocket_lcp');
            expectedBody.append('rocket_lcp_nonce', config.nonce);
            expectedBody.append('url', config.url);
            expectedBody.append('is_mobile', config.is_mobile.toString());
            expectedBody.append('images', JSON.stringify(beacon.performanceImages));
            expectedBody.append('status', beacon._getFinalStatus());

            const fetchCall = fetchStub.getCall(0);
            assert.strictEqual(fetchCall.args[0], config.ajax_url);
            assert.deepStrictEqual(fetchCall.args[1].method, "POST");
            // Note: Direct comparison of FormData objects might not work as expected, so you may need to compare each field individually if necessary.

            // Additional assertions can be made here regarding the handling of the fetch response and the finalization process
        });
    });

    describe('#_saveFinalResultIntoDB()', function() {
        let fetchStub, finalizeSpy, setAttributeSpy;

        beforeEach(function() {
            // Setup fetch stub to simulate a successful response
            // (_finalize is invoked by the method's own promise chain, so it must
            // not be called from inside the stub — _saveFinalResultIntoDB() now
            // returns its promise and the await below observes the full chain.)
            fetchStub = sinon.stub(global, 'fetch').callsFake(() =>
                Promise.resolve({
                    json: () => Promise.resolve({ message: 'Data saved successfully' })
                })
            );
            global.document = {
                querySelector: sinon.stub().withArgs('[data-name="wpr-lcp-beacon"]').returns({
                    setAttribute: function() {}
                })
            };
            // Spy on setAttribute to ensure it's called with the correct arguments
            setAttributeSpy = sinon.spy(global.document.querySelector('[data-name="wpr-lcp-beacon"]'), 'setAttribute');
            // Prepare performanceImages or any other data needed by _saveFinalResultIntoDB
            beacon.lcpBeacon = new BeaconLcp(beacon.config);
            beacon.lcpBeacon.performanceImages = [{ src: 'http://example.com/image.jpg', label: 'lcp' }];
            beacon.errorCode = '';
            beacon.scriptTimer = new Date();
            finalizeSpy = sinon.spy(beacon, '_finalize');
        });

        afterEach(function() {
            // Restore the original fetch function
            fetchStub.restore();
            finalizeSpy.restore();
            setAttributeSpy.restore();
        });

        it('should call fetch with the correct parameters and handle the response', async function() {
            await beacon._saveFinalResultIntoDB();

            sinon.assert.calledOnce(fetchStub);
            const fetchCall = fetchStub.getCall(0);
            assert.strictEqual(fetchCall.args[0], beacon.config.ajax_url);
            assert.deepStrictEqual(fetchCall.args[1].method, "POST");
            const sentFormData = fetchCall.args[1].body;

            // Convert FormData to a plain object for easier comparison
            const sentDataObject = formDataToObject(sentFormData);

            // Now you can assert the values in sentDataObject
            assert.strictEqual(sentDataObject['action'], 'rocket_beacon');
            assert.strictEqual(sentDataObject['rocket_beacon_nonce'], config.nonce);
            assert.strictEqual(sentDataObject['url'], config.url);
            assert.strictEqual(sentDataObject['is_mobile'], config.is_mobile.toString());
            // For complex types like arrays or objects, you might need to parse them before assertion
            const expectedResults = JSON.parse(JSON.stringify({lcp : beacon.lcpBeacon.performanceImages, lrc: null, preload_fonts: null, preconnect_external_domain: null}));
            assert.deepStrictEqual(JSON.parse(sentDataObject['results']), expectedResults);
            assert.strictEqual(sentDataObject['status'], beacon._getFinalStatus());
            sinon.assert.calledOnce(finalizeSpy);
            sinon.assert.calledWith(setAttributeSpy, 'beacon-completed', 'true');
        });
    });

    describe('#_handleInfiniteLoop()', function() {
        let saveFinalResultIntoDBSpy;

        beforeEach(function() {
            // Spy on _saveFinalResultIntoDB to ensure it's called
            saveFinalResultIntoDBSpy = sinon.spy(beacon, '_saveFinalResultIntoDB');
        });

        afterEach(function() {
            // Restore the original methods
            saveFinalResultIntoDBSpy.restore();
        });

        it('should call _saveFinalResultIntoDB and set beacon-completed to true', function() {
            beacon._handleInfiniteLoop();
            sinon.assert.calledOnce(saveFinalResultIntoDBSpy);
        });
    });
    describe('#_getGeneratedBefore() with a stale nonce', function() {
        let fetchStub;
        let isPageCachedStub;

        beforeEach(function() {
            isPageCachedStub = sinon.stub(BeaconUtils, 'isPageCached').returns(true);
            fetchStub = sinon.stub(global, 'fetch');
            beacon = new BeaconManager(JSON.parse(JSON.stringify(config)));
        });

        afterEach(function() {
            isPageCachedStub.restore();
            fetchStub.restore();
        });

        it('should refresh the nonce and retry once when the check returns 403', async function() {
            fetchStub.onCall(0).resolves({
                status: 403,
                json: () => Promise.resolve(-1)
            });
            fetchStub.onCall(1).resolves({
                json: () => Promise.resolve({ success: true, data: { nonce: 'freshnonce' } })
            });
            fetchStub.onCall(2).resolves({
                json: () => Promise.resolve({ success: true, data: { lcp: 'not found', lrc: 'not found' } })
            });

            const result = await beacon._getGeneratedBefore();

            assert.strictEqual(fetchStub.callCount, 3);
            // The FormData object is reused (mutated) by the retry, so the first
            // call cannot be inspected afterwards — assert the sequence instead:
            // refresh endpoint called once, and the retried check carries the fresh nonce.
            assert.strictEqual(formDataToObject(fetchStub.getCall(1).args[1].body)['action'], 'rocket_beacon_nonce');
            assert.strictEqual(formDataToObject(fetchStub.getCall(2).args[1].body)['rocket_beacon_nonce'], 'freshnonce');
            assert.strictEqual(beacon.config.nonce, 'freshnonce');
            assert.deepStrictEqual(result, { lcp: 'not found', lrc: 'not found' });
        });

        it('should return false when the check returns 403 and the nonce cannot be refreshed', async function() {
            fetchStub.onCall(0).resolves({
                status: 403,
                json: () => Promise.resolve(-1)
            });
            fetchStub.onCall(1).resolves({
                json: () => Promise.resolve(0)
            });

            const result = await beacon._getGeneratedBefore();

            assert.strictEqual(result, false);
            assert.strictEqual(fetchStub.callCount, 2);
        });

        it('should not refresh the nonce more than once', async function() {
            fetchStub.onCall(0).resolves({
                status: 403,
                json: () => Promise.resolve(-1)
            });
            fetchStub.onCall(1).resolves({
                json: () => Promise.resolve({ success: true, data: { nonce: 'freshnonce' } })
            });
            fetchStub.onCall(2).resolves({
                status: 403,
                json: () => Promise.resolve(-1)
            });

            const result = await beacon._getGeneratedBefore();

            // Initial call + one refresh + one retry, then it gives up instead of looping.
            assert.strictEqual(fetchStub.callCount, 3);
            assert.strictEqual(result, false);
        });

        it('should return false when the response body is not valid JSON', async function() {
            fetchStub.resolves({
                status: 200,
                json: () => Promise.reject(new Error('invalid json'))
            });

            const result = await beacon._getGeneratedBefore();

            assert.strictEqual(result, false);
            assert.strictEqual(fetchStub.callCount, 1);
        });

        it('should return false when the response has no data field', async function() {
            fetchStub.resolves({
                status: 200,
                json: () => Promise.resolve({ success: false })
            });

            const result = await beacon._getGeneratedBefore();

            assert.strictEqual(result, false);
        });

        it('should return false when fetch rejects', async function() {
            fetchStub.rejects(new Error('network error'));

            const result = await beacon._getGeneratedBefore();

            assert.strictEqual(result, false);
        });
    });

    describe('#_saveFinalResultIntoDB() with a stale nonce', function() {
        let fetchStub;
        let finalizeSpy;

        beforeEach(function() {
            fetchStub = sinon.stub(global, 'fetch');
            beacon = new BeaconManager(JSON.parse(JSON.stringify(config)));
            beacon.lcpBeacon = new BeaconLcp(beacon.config);
            beacon.lcpBeacon.performanceImages = [{ src: 'http://example.com/image.jpg', label: 'lcp' }];
            beacon.errorCode = '';
            beacon.scriptTimer = new Date();
            finalizeSpy = sinon.spy(beacon, '_finalize');
        });

        afterEach(function() {
            fetchStub.restore();
            finalizeSpy.restore();
        });

        it('should refresh the nonce and retry the save once on 403', async function() {
            fetchStub.onCall(0).resolves({
                status: 403,
                json: () => Promise.resolve(-1)
            });
            fetchStub.onCall(1).resolves({
                json: () => Promise.resolve({ success: true, data: { nonce: 'freshnonce' } })
            });
            fetchStub.onCall(2).resolves({
                json: () => Promise.resolve({ success: true, data: { lcp: 'saved' } })
            });

            await beacon._saveFinalResultIntoDB();

            assert.strictEqual(fetchStub.callCount, 3);
            assert.strictEqual(formDataToObject(fetchStub.getCall(0).args[1].body)['action'], 'rocket_beacon');
            assert.strictEqual(formDataToObject(fetchStub.getCall(1).args[1].body)['action'], 'rocket_beacon_nonce');
            assert.strictEqual(formDataToObject(fetchStub.getCall(2).args[1].body)['action'], 'rocket_beacon');
            assert.strictEqual(formDataToObject(fetchStub.getCall(2).args[1].body)['rocket_beacon_nonce'], 'freshnonce');
            sinon.assert.calledOnce(finalizeSpy);
        });

        it('should finalize once when the save keeps returning 403', async function() {
            fetchStub.onCall(0).resolves({
                status: 403,
                json: () => Promise.resolve(-1)
            });
            fetchStub.onCall(1).resolves({
                json: () => Promise.resolve({ success: true, data: { nonce: 'freshnonce' } })
            });
            fetchStub.onCall(2).resolves({
                status: 403,
                json: () => Promise.resolve(-1)
            });

            await beacon._saveFinalResultIntoDB();

            assert.strictEqual(fetchStub.callCount, 3);
            sinon.assert.calledOnce(finalizeSpy);
        });
    });

    describe('#_finalize()', function() {
        let setAttributeSpy, clearTimeoutSpy;

        beforeEach(function() {
            // Mock document.querySelector to prevent errors in a Node environment
            global.document = {
                querySelector: sinon.stub().withArgs('[data-name="wpr-lcp-beacon"]').returns({
                    setAttribute: function() {}
                })
            };
            // Spy on setAttribute to ensure it's called with the correct arguments
            setAttributeSpy = sinon.spy(global.document.querySelector('[data-name="wpr-lcp-beacon"]'), 'setAttribute');
            // Spy on clearTimeout to ensure it's called
            clearTimeoutSpy = sinon.spy(global, 'clearTimeout');
            // Mock the infiniteLoopId to simulate a timeout being set
            beacon.infiniteLoopId = setTimeout(() => {
                throw new Error('Timeout during test.');
            }, 10000);
        });

        afterEach(function() {
            // Restore the original methods
            setAttributeSpy.restore();
            clearTimeoutSpy.restore();
        });

        it('should set beacon-completed to true and clear the timeout', function() {
            beacon._finalize();
            sinon.assert.calledWith(setAttributeSpy, 'beacon-completed', 'true');
            sinon.assert.calledOnce(clearTimeoutSpy);
            sinon.assert.calledWith(clearTimeoutSpy, beacon.infiniteLoopId);
        });
    });
});

// Helper function to convert FormData to a plain object
function formDataToObject(formData) {
    const object = {};
    formData.forEach((value, key) => {
        // Check if the object already contains the key
        if (Object.prototype.hasOwnProperty.call(object, key)) {
            // If it's an array, push the new value
            if (Array.isArray(object[key])) {
                object[key].push(value);
            } else {
                // Convert to an array with the current and new value
                object[key] = [object[key], value];
            }
        } else {
            // Add the key and value
            object[key] = value;
        }
    });
    return object;
}