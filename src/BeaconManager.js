'use strict';

import BeaconLcp from "./BeaconLcp.js";
import BeaconLrc from "./BeaconLrc.js";
import BeaconPreloadFonts from "./BeaconPreloadFonts.js";
import BeaconPreconnectExternalDomain from "./BeaconPreconnectExternalDomain.js";
import BeaconUtils from "./Utils.js";
import Logger from "./Logger.js";

class BeaconManager {
    constructor(config) {
        this.config = config;
        this.lcpBeacon = null;
        this.lrcBeacon = null;
        this.preloadFontsBeacon = null;
        this.preconnectExternalDomainBeacon = null;
        this.infiniteLoopId = null;
        this.errorCode = '';
        this.nonceRefreshed = false;
        this.logger = new Logger(this.config.debug);
    }

    async init() {
        this.scriptTimer = new Date();
        if (!await this._isValidPreconditions()) {
            this._finalize();
            return;
        }

        if (BeaconUtils.isPageScrolled()) {
            this.logger.logMessage('Bailing out because the page has been scrolled');
            this._finalize();
            return;
        }

        this.infiniteLoopId = setTimeout(() => {
            this._handleInfiniteLoop();
        }, 10000);

        const isGeneratedBefore = await this._getGeneratedBefore();

        // OCI / LCP / ATF / PRELOAD FONTS / PRECONNECT EXTERNAL DOMAIN
        const shouldGenerateLcp = (
            this.config.status.atf && (isGeneratedBefore === false || isGeneratedBefore.lcp === false)
        );
        const shouldGeneratelrc = (
            this.config.status.lrc && (isGeneratedBefore === false || isGeneratedBefore.lrc === false)
        );
        const shouldGeneratePreloadFonts = (
            this.config.status.preload_fonts && (isGeneratedBefore === false || isGeneratedBefore.preload_fonts === false)
        );
        const shouldGeneratePreconnectExternalDomain = (
            this.config.status.preconnect_external_domain && (isGeneratedBefore === false || isGeneratedBefore.preconnect_external_domain === false)
        );
        if (shouldGenerateLcp) {
            this.lcpBeacon = new BeaconLcp(this.config, this.logger);
            await this.lcpBeacon.run();
        } else {
            this.logger.logMessage('Not running BeaconLcp because data is already available or feature is disabled');
        }

        if (shouldGeneratelrc) {
            this.lrcBeacon = new BeaconLrc(this.config, this.logger);
            await this.lrcBeacon.run();
        } else {
            this.logger.logMessage('Not running BeaconLrc because data is already available or feature is disabled');
        }

        if (shouldGeneratePreloadFonts) {
            this.preloadFontsBeacon = new BeaconPreloadFonts(this.config, this.logger);
            await this.preloadFontsBeacon.run();
        } else {
            this.logger.logMessage('Not running BeaconPreloadFonts because data is already available or feature is disabled');
        }

        if (shouldGeneratePreconnectExternalDomain) {
            this.preconnectExternalDomainBeacon = new BeaconPreconnectExternalDomain(this.config, this.logger);
            await this.preconnectExternalDomainBeacon.run();
        } else {
            this.logger.logMessage('Not running BeaconPreconnectExternalDomain because data is already available or feature is disabled');
        }

        if (shouldGenerateLcp || shouldGeneratelrc || shouldGeneratePreloadFonts || shouldGeneratePreconnectExternalDomain) {
            this._saveFinalResultIntoDB();
        } else {
            this.logger.logMessage("Not saving results into DB as no beacon features ran.");
            this._finalize();
        }
    }

    async _isValidPreconditions() {
        const threshold = {
            width: this.config.width_threshold,
            height: this.config.height_threshold
        };
        if (BeaconUtils.isNotValidScreensize(this.config.is_mobile, threshold)) {
            this.logger.logMessage('Bailing out because screen size is not acceptable');
            return false;
        }

        return true;
    }

    async _getGeneratedBefore() {

        if (!BeaconUtils.isPageCached()) {
            return false;
        }     

        let data_check = new FormData();
        data_check.append('action', 'rocket_check_beacon');
        data_check.append('rocket_beacon_nonce', this.config.nonce);
        data_check.append('url', this.config.url);
        data_check.append('is_mobile', this.config.is_mobile);

        // The nonce was generated at page render time and may have expired
        // while the page was sitting in the cache: a 403 then triggers a
        // single nonce refresh + retry instead of crashing below.
        const beacon_data_response = await this._fetchBeaconData(data_check);

        if (!beacon_data_response || !beacon_data_response.data) {
            return false;
        }

        return beacon_data_response.data;
    }

    async _fetchBeaconData(data, headers = {}) {
        try {
            const response = await fetch(this.config.ajax_url, {
                method: "POST",
                credentials: 'same-origin',
                body: data,
                headers
            });

            if (response.status === 403 && await this._refreshNonce()) {
                data.set('rocket_beacon_nonce', this.config.nonce);

                return await this._fetchBeaconData(data, headers);
            }

            return await response.json().catch(() => null);
        } catch (error) {
            this.logger.logMessage(error);

            return null;
        }
    }

    async _refreshNonce() {
        if (this.nonceRefreshed) {
            return false;
        }

        this.nonceRefreshed = true;

        let data_refresh = new FormData();
        data_refresh.append('action', 'rocket_beacon_nonce');

        try {
            const response = await fetch(this.config.ajax_url, {
                method: "POST",
                credentials: 'same-origin',
                body: data_refresh
            });

            const json = await response.json().catch(() => null);

            if (!json || !json.data || !json.data.nonce) {
                this.logger.logMessage('Beacon nonce could not be refreshed');

                return false;
            }

            this.config.nonce = json.data.nonce;

            this.logger.logMessage('Beacon nonce refreshed after a 403 response');

            return true;
        } catch (error) {
            this.logger.logMessage(error);

            return false;
        }
    }

    _saveFinalResultIntoDB() {
        const results = {
            lcp: this.lcpBeacon ? this.lcpBeacon.getResults() : null,
            lrc: this.lrcBeacon ? this.lrcBeacon.getResults() : null,
            preload_fonts: this.preloadFontsBeacon ? this.preloadFontsBeacon.getResults() : null,
            preconnect_external_domain: this.preconnectExternalDomainBeacon ? this.preconnectExternalDomainBeacon.getResults() : null
        };

        const data = new FormData();
        data.append('action', 'rocket_beacon');
        data.append('rocket_beacon_nonce', this.config.nonce);
        data.append('url', this.config.url);
        data.append('is_mobile', this.config.is_mobile);
        data.append('status', this._getFinalStatus());
        data.append('results', JSON.stringify(results));

        return this._fetchBeaconData(data, {
            'wpr-saas-no-intercept': true
        })
            .then(json => {
                this.logger.logMessage(json && json.data ? json.data.lcp : '');
            })
            .finally(() => {
                this._finalize();
            });
    }

    _getFinalStatus() {
        if ('' !== this.errorCode) {
            return this.errorCode;
        }

        const scriptTime = (new Date() - this.scriptTimer) / 1000;
        if (10 <= scriptTime) {
            return 'timeout';
        }

        return 'success';
    }

    _handleInfiniteLoop() {
        this._saveFinalResultIntoDB();
    }

    _finalize() {
        const beaconscript = document.querySelector('[data-name="wpr-wpr-beacon"]');
        beaconscript.setAttribute('beacon-completed', 'true');
        clearTimeout(this.infiniteLoopId);
    }

}

export default BeaconManager;
