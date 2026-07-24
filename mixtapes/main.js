```javascript
/* =========================================================
   EL SCORCHO
   main.js

   Main application controller for:
   - Controlled module initialization
   - Passive point generation
   - Offline earnings
   - Lifecycle saving
   - Application readiness
   - Error handling
   - Global game loop
========================================================= */

(function () {
    "use strict";

    /* =====================================================
       CONFIGURATION
    ===================================================== */

    const PASSIVE_TICK_INTERVAL = 1000;

    /*
     * Offline earnings are capped to prevent extremely large
     * rewards after leaving the website closed for months.
     */
    const MAX_OFFLINE_SECONDS = 60 * 60 * 8;

    /*
     * At least this much offline time must pass before an
     * offline reward is shown.
     */
    const MIN_OFFLINE_SECONDS = 10;

    const AUTO_SAVE_INTERVAL = 30000;

    const MODULE_ORDER = [
        "Save",
        "Upgrades",
        "Player",
        "Feed",
        "Shop",
        "Comments",
        "UI"
    ];

    /* =====================================================
       INTERNAL STATE
    ===================================================== */

    let initialized = false;
    let ready = false;

    let passiveTimer = null;
    let autoSaveTimer = null;

    let passiveRemainder = 0;
    let lastPassiveTick = null;

    /* =====================================================
       NAMESPACE
    ===================================================== */

    function getNamespace() {
        if (!window.ElScorcho) {
            window.ElScorcho = {};
        }

        return window.ElScorcho;
    }

    function getState() {
        const namespace = getNamespace();

        if (
            namespace.Save &&
            typeof namespace.Save.getState === "function"
        ) {
            return namespace.Save.getState();
        }

        if (!namespace.state) {
            namespace.state = createFallbackState();
        }

        return namespace.state;
    }

    function createFallbackState() {
        return {
            points: 0,
            lifetimePoints: 0,

            pointsPerSecond: 1,
            clickPower: 1,

            videoMultiplier: 1,
            permanentMultiplier: 1,
            totalMultiplier: 1,

            purchases: {},
            upgrades: {},
            comments: [],
            likedVideos: [],

            rebirths: 0,
            rebirthCurrency: 0,

            lastSavedAt: null,
            lastActiveAt: null,
            sessionStartedAt: null,
            totalPlayTime: 0,

            settings: {}
        };
    }

    function getModule(name) {
        return getNamespace()[name] || null;
    }

    /* =====================================================
       BASIC HELPERS
    ===================================================== */

    function safeNumber(value, fallback = 0) {
        const number = Number(value);

        return Number.isFinite(number)
            ? number
            : fallback;
    }

    function safeInteger(value, fallback = 0) {
        return Math.max(
            0,
            Math.floor(
                safeNumber(value, fallback)
            )
        );
    }

    function clamp(value, minimum, maximum) {
        return Math.min(
            maximum,
            Math.max(minimum, value)
        );
    }

    function dispatch(name, detail = {}) {
        window.dispatchEvent(
            new CustomEvent(
                `elscorcho:${name}`,
                { detail }
            )
        );
    }

    function nowISO() {
        return new Date().toISOString();
    }

    function isValidDate(value) {
        return Number.isFinite(
            Date.parse(value)
        );
    }

    function formatNumber(value) {
        const ui = getModule("UI");

        if (
            ui &&
            typeof ui.formatNumber === "function"
        ) {
            return ui.formatNumber(value);
        }

        return Math.floor(
            Math.max(
                0,
                safeNumber(value)
            )
        ).toLocaleString();
    }

    function showMessage(message, duration = 3000) {
        const ui = getModule("UI");

        if (
            ui &&
            typeof ui.showMessage === "function"
        ) {
            ui.showMessage(
                message,
                duration
            );

            return;
        }

        const shop = getModule("Shop");

        if (
            shop &&
            typeof shop.showToast === "function"
        ) {
            shop.showToast(
                message,
                duration
            );

            return;
        }

        console.info(message);
    }

    /* =====================================================
       STATE PREPARATION
    ===================================================== */

    function prepareState() {
        const state = getState();

        state.points = Math.max(
            0,
            safeNumber(state.points)
        );

        state.lifetimePoints = Math.max(
            state.points,
            safeNumber(
                state.lifetimePoints
            )
        );

        state.pointsPerSecond = Math.max(
            0,
            safeNumber(
                state.pointsPerSecond,
                1
            )
        );

        state.clickPower = Math.max(
            1,
            safeNumber(
                state.clickPower,
                1
            )
        );

        state.videoMultiplier = Math.max(
            1,
            safeNumber(
                state.videoMultiplier,
                1
            )
        );

        state.permanentMultiplier = Math.max(
            1,
            safeNumber(
                state.permanentMultiplier,
                1
            )
        );

        state.totalMultiplier = Math.max(
            1,
            safeNumber(
                state.totalMultiplier,
                state.videoMultiplier *
                    state.permanentMultiplier
            )
        );

        state.totalPlayTime = Math.max(
            0,
            safeNumber(
                state.totalPlayTime
            )
        );

        if (
            !state.settings ||
            typeof state.settings !== "object" ||
            Array.isArray(state.settings)
        ) {
            state.settings = {};
        }

        if (!state.sessionStartedAt) {
            state.sessionStartedAt =
                nowISO();
        }

        return state;
    }

    /* =====================================================
       SAVING
    ===================================================== */

    function save(options = {}) {
        const state = prepareState();
        const saveModule =
            getModule("Save");

        state.lastSavedAt = nowISO();
        state.lastActiveAt =
            state.lastSavedAt;

        if (
            saveModule &&
            typeof saveModule.save === "function"
        ) {
            try {
                saveModule.save({
                    silent:
                        options.silent !== false
                });

                return true;
            } catch (error) {
                console.error(
                    "El Scorcho save failed:",
                    error
                );

                dispatch(
                    "application-error",
                    {
                        source: "save",
                        error
                    }
                );

                return false;
            }
        }

        return false;
    }

    /* =====================================================
       MODULE INITIALIZATION
    ===================================================== */

    function initializeModule(name) {
        const module = getModule(name);

        if (!module) {
            console.warn(
                `El Scorcho module not found: ${name}`
            );

            dispatch(
                "module-missing",
                { name }
            );

            return false;
        }

        if (
            typeof module.init !== "function"
        ) {
            /*
             * Save modules may initialize as soon as they load
             * and may not expose init().
             */
            dispatch(
                "module-ready",
                {
                    name,
                    initialized: false
                }
            );

            return true;
        }

        try {
            /*
             * Every module created for this project has an
             * idempotent init function, so calling it here is
             * safe even if DOMContentLoaded already called it.
             */
            module.init();

            dispatch(
                "module-ready",
                {
                    name,
                    initialized: true
                }
            );

            return true;
        } catch (error) {
            console.error(
                `Could not initialize ${name}:`,
                error
            );

            dispatch(
                "application-error",
                {
                    source:
                        `module:${name}`,
                    error
                }
            );

            return false;
        }
    }

    function initializeModules() {
        const results = {};

        MODULE_ORDER.forEach((name) => {
            results[name] =
                initializeModule(name);
        });

        return results;
    }

    /* =====================================================
       UPGRADE SYNCHRONIZATION
    ===================================================== */

    function recalculateUpgrades() {
        const upgrades =
            getModule("Upgrades");

        if (
            upgrades &&
            typeof upgrades.recalculate ===
                "function"
        ) {
            try {
                return upgrades.recalculate({
                    save: false,
                    dispatchEvent: true
                });
            } catch (error) {
                console.error(
                    "Could not recalculate upgrades:",
                    error
                );
            }
        }

        return null;
    }

    /* =====================================================
       POINT MANAGEMENT
    ===================================================== */

    function addPoints(
        amount,
        source = "main",
        options = {}
    ) {
        const cleanAmount = Math.max(
            0,
            safeNumber(amount)
        );

        if (cleanAmount <= 0) {
            return 0;
        }

        const upgrades =
            getModule("Upgrades");

        if (
            upgrades &&
            typeof upgrades.addPoints ===
                "function"
        ) {
            return upgrades.addPoints(
                cleanAmount,
                source,
                {
                    save:
                        options.save === true,
                    countAsLifetime:
                        options.countAsLifetime !==
                        false
                }
            );
        }

        const state = prepareState();

        state.points += cleanAmount;

        if (
            options.countAsLifetime !==
            false
        ) {
            state.lifetimePoints +=
                cleanAmount;
        }

        if (options.save === true) {
            save();
        }

        dispatch(
            "points-earned",
            {
                amount: cleanAmount,
                source,
                total: state.points,
                lifetimePoints:
                    state.lifetimePoints
            }
        );

        return cleanAmount;
    }

    /* =====================================================
       PASSIVE EARNINGS
    ===================================================== */

    function calculatePassiveReward(seconds) {
        const cleanSeconds = Math.max(
            0,
            safeNumber(seconds)
        );

        if (cleanSeconds <= 0) {
            return 0;
        }

        const upgrades =
            getModule("Upgrades");

        if (
            upgrades &&
            typeof upgrades.calculatePassiveReward ===
                "function"
        ) {
            return Math.max(
                0,
                safeNumber(
                    upgrades.calculatePassiveReward(
                        cleanSeconds,
                        {
                            usePermanentMultiplier:
                                true
                        }
                    )
                )
            );
        }

        const state = prepareState();

        return (
            state.pointsPerSecond *
            state.permanentMultiplier *
            cleanSeconds
        );
    }

    function processPassiveTick() {
        if (!ready) {
            return 0;
        }

        const now = Date.now();

        if (lastPassiveTick === null) {
            lastPassiveTick = now;
            return 0;
        }

        /*
         * Using real elapsed time rather than assuming exactly
         * one second prevents timer throttling from losing points.
         */
        const elapsedSeconds = clamp(
            (now - lastPassiveTick) /
                1000,
            0,
            10
        );

        lastPassiveTick = now;

        const exactReward =
            calculatePassiveReward(
                elapsedSeconds
            ) + passiveRemainder;

        const wholeReward =
            Math.floor(exactReward);

        passiveRemainder =
            exactReward -
            wholeReward;

        if (wholeReward <= 0) {
            return 0;
        }

        const awarded = addPoints(
            wholeReward,
            "passive",
            {
                save: false,
                countAsLifetime: true
            }
        );

        dispatch(
            "passive-points-earned",
            {
                amount: awarded,
                elapsedSeconds,
                remainder:
                    passiveRemainder
            }
        );

        return awarded;
    }

    function startPassiveLoop() {
        if (passiveTimer !== null) {
            return;
        }

        lastPassiveTick = Date.now();

        passiveTimer =
            window.setInterval(
                processPassiveTick,
                PASSIVE_TICK_INTERVAL
            );

        dispatch(
            "passive-loop-started"
        );
    }

    function stopPassiveLoop() {
        if (passiveTimer === null) {
            return;
        }

        window.clearInterval(
            passiveTimer
        );

        passiveTimer = null;
        lastPassiveTick = null;

        dispatch(
            "passive-loop-stopped"
        );
    }

    /* =====================================================
       OFFLINE EARNINGS
    ===================================================== */

    function getLastActiveTimestamp() {
        const state = prepareState();

        const candidates = [
            state.lastActiveAt,
            state.lastSavedAt,
            state.updatedAt
        ];

        const validDate =
            candidates.find(
                isValidDate
            );

        if (!validDate) {
            return null;
        }

        return Date.parse(validDate);
    }

    function calculateOfflineProgress() {
        const lastActive =
            getLastActiveTimestamp();

        if (lastActive === null) {
            return {
                seconds: 0,
                rawSeconds: 0,
                reward: 0,
                capped: false
            };
        }

        const rawSeconds = Math.max(
            0,
            Math.floor(
                (
                    Date.now() -
                    lastActive
                ) / 1000
            )
        );

        if (
            rawSeconds <
            MIN_OFFLINE_SECONDS
        ) {
            return {
                seconds: 0,
                rawSeconds,
                reward: 0,
                capped: false
            };
        }

        const seconds = Math.min(
            rawSeconds,
            MAX_OFFLINE_SECONDS
        );

        const reward = Math.floor(
            calculatePassiveReward(
                seconds
            )
        );

        return {
            seconds,
            rawSeconds,
            reward,
            capped:
                rawSeconds >
                MAX_OFFLINE_SECONDS
        };
    }

    function awardOfflineProgress() {
        const result =
            calculateOfflineProgress();

        if (result.reward <= 0) {
            return result;
        }

        const awarded = addPoints(
            result.reward,
            "offline-progress",
            {
                save: false,
                countAsLifetime: true
            }
        );

        const finalResult = {
            ...result,
            reward: awarded
        };

        save({
            silent: true
        });

        dispatch(
            "offline-progress",
            finalResult
        );

        const capMessage =
            result.capped
                ? " The reward was capped at eight hours."
                : "";

        showMessage(
            `While you were away, the tape earned ${formatNumber(
                awarded
            )} points.${capMessage}`,
            5000
        );

        return finalResult;
    }

    /* =====================================================
       AUTO SAVE
    ===================================================== */

    function startAutoSave() {
        if (autoSaveTimer !== null) {
            return;
        }

        autoSaveTimer =
            window.setInterval(
                () => {
                    save({
                        silent: true
                    });
                },
                AUTO_SAVE_INTERVAL
            );

        dispatch(
            "auto-save-started"
        );
    }

    function stopAutoSave() {
        if (autoSaveTimer === null) {
            return;
        }

        window.clearInterval(
            autoSaveTimer
        );

        autoSaveTimer = null;

        dispatch(
            "auto-save-stopped"
        );
    }

    /* =====================================================
       VISIBILITY AND LIFECYCLE
    ===================================================== */

    function handleVisibilityChange() {
        const state = prepareState();

        if (document.hidden) {
            processPassiveTick();

            state.lastActiveAt =
                nowISO();

            save({
                silent: true
            });

            stopPassiveLoop();

            dispatch(
                "application-hidden"
            );

            return;
        }

        /*
         * This handles time spent hidden in a background tab.
         */
        awardOfflineProgress();

        state.lastActiveAt =
            nowISO();

        startPassiveLoop();

        getModule("UI")
            ?.render?.({
                force: true
            });

        dispatch(
            "application-visible"
        );
    }

    function handlePageHide() {
        const state = prepareState();

        processPassiveTick();

        state.lastActiveAt =
            nowISO();

        save({
            silent: true
        });
    }

    function handleBeforeUnload() {
        handlePageHide();
    }

    function handleOnline() {
        document.body.classList.remove(
            "is-offline"
        );

        showMessage(
            "Back online."
        );

        dispatch(
            "network-online"
        );
    }

    function handleOffline() {
        document.body.classList.add(
            "is-offline"
        );

        showMessage(
            "You are offline. Your local save still works."
        );

        dispatch(
            "network-offline"
        );
    }

    function bindLifecycleEvents() {
        document.addEventListener(
            "visibilitychange",
            handleVisibilityChange
        );

        window.addEventListener(
            "pagehide",
            handlePageHide
        );

        window.addEventListener(
            "beforeunload",
            handleBeforeUnload
        );

        window.addEventListener(
            "online",
            handleOnline
        );

        window.addEventListener(
            "offline",
            handleOffline
        );
    }

    /* =====================================================
       MODULE EVENT INTEGRATION
    ===================================================== */

    function bindApplicationEvents() {
        window.addEventListener(
            "elscorcho:imported",
            () => {
                recalculateUpgrades();

                getModule("UI")
                    ?.render?.({
                        force: true
                    });

                save({
                    silent: true
                });
            }
        );

        window.addEventListener(
            "elscorcho:reset",
            () => {
                passiveRemainder = 0;
                lastPassiveTick =
                    Date.now();

                recalculateUpgrades();

                getModule("UI")
                    ?.render?.({
                        force: true
                    });
            }
        );

        window.addEventListener(
            "elscorcho:rebirth",
            () => {
                passiveRemainder = 0;

                getModule("UI")
                    ?.render?.({
                        force: true
                    });
            }
        );

        window.addEventListener(
            "elscorcho:application-error",
            (event) => {
                const source =
                    event.detail?.source ||
                    "unknown";

                console.error(
                    `El Scorcho application error from ${source}`,
                    event.detail?.error
                );
            }
        );
    }

    /* =====================================================
       NETWORK STATE
    ===================================================== */

    function applyInitialNetworkState() {
        document.body.classList.toggle(
            "is-offline",
            navigator.onLine === false
        );
    }

    /* =====================================================
       INITIALIZATION
    ===================================================== */

    function init() {
        if (initialized) {
            return getSnapshot();
        }

        initialized = true;

        document.documentElement.classList.add(
            "elscorcho-loading"
        );

        dispatch(
            "application-init-start"
        );

        /*
         * The save module must load its persisted state before
         * upgrade effects and the UI are synchronized.
         */
        const saveModule =
            getModule("Save");

        if (
            saveModule &&
            typeof saveModule.load === "function"
        ) {
            try {
                saveModule.load();
            } catch (error) {
                console.error(
                    "Could not load the saved game:",
                    error
                );
            }
        }

        prepareState();

        const moduleResults =
            initializeModules();

        recalculateUpgrades();

        bindLifecycleEvents();
        bindApplicationEvents();
        applyInitialNetworkState();

        /*
         * Offline progress is calculated after upgrades are
         * restored so it uses the correct passive rate.
         */
        const offlineProgress =
            awardOfflineProgress();

        const state = prepareState();

        state.sessionStartedAt =
            nowISO();

        state.lastActiveAt =
            state.sessionStartedAt;

        ready = true;

        startPassiveLoop();
        startAutoSave();

        getModule("UI")
            ?.render?.({
                force: true
            });

        save({
            silent: true
        });

        document.documentElement.classList.remove(
            "elscorcho-loading"
        );

        document.documentElement.classList.add(
            "elscorcho-ready"
        );

        const detail = {
            moduleResults,
            offlineProgress,
            state: getSnapshot()
        };

        dispatch(
            "application-ready",
            detail
        );

        return detail;
    }

    /* =====================================================
       DESTRUCTION
    ===================================================== */

    function destroy() {
        if (!initialized) {
            return;
        }

        processPassiveTick();

        stopPassiveLoop();
        stopAutoSave();

        save({
            silent: true
        });

        ready = false;
        initialized = false;

        document.documentElement.classList.remove(
            "elscorcho-ready"
        );

        dispatch(
            "application-destroyed"
        );
    }

    /* =====================================================
       SNAPSHOT
    ===================================================== */

    function getSnapshot() {
        const state = prepareState();
        const upgrades =
            getModule("Upgrades");

        return {
            initialized,
            ready,

            points: state.points,
            lifetimePoints:
                state.lifetimePoints,

            pointsPerSecond:
                state.pointsPerSecond,

            clickPower:
                state.clickPower,

            videoMultiplier:
                state.videoMultiplier,

            permanentMultiplier:
                state.permanentMultiplier,

            totalMultiplier:
                state.totalMultiplier,

            rebirths:
                state.rebirths,

            rebirthCurrency:
                state.rebirthCurrency,

            lastSavedAt:
                state.lastSavedAt,

            lastActiveAt:
                state.lastActiveAt,

            upgrades:
                upgrades &&
                typeof upgrades.getSnapshot ===
                    "function"
                    ? upgrades.getSnapshot()
                    : null
        };
    }

    .video-frame {
    position: relative;
    width: 100%;
    aspect-ratio: 16 / 9;
    min-height: 300px;
    overflow: hidden;
    background: #000;
}

#youtube-player,
#youtube-player iframe,
.video-frame iframe {
    position: absolute;
    inset: 0;
    width: 100% !important;
    height: 100% !important;
    border: 0;
    display: block;
}

    /* =====================================================
       PUBLIC API
    ===================================================== */

    const namespace =
        getNamespace();

    namespace.Main = {
        init,
        destroy,

        save,

        addPoints,

        calculatePassiveReward,
        processPassiveTick,
        startPassiveLoop,
        stopPassiveLoop,

        calculateOfflineProgress,
        awardOfflineProgress,

        startAutoSave,
        stopAutoSave,

        getSnapshot,

        isReady() {
            return ready;
        },

        constants: {
            passiveTickInterval:
                PASSIVE_TICK_INTERVAL,

            maximumOfflineSeconds:
                MAX_OFFLINE_SECONDS,

            minimumOfflineSeconds:
                MIN_OFFLINE_SECONDS,

            autoSaveInterval:
                AUTO_SAVE_INTERVAL
        }
    };

    /*
     * main.js is the final script, so it starts the complete
     * application after the HTML has been parsed.
     */
    if (
        document.readyState === "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            init,
            { once: true }
        );
    } else {
        init();
    }
})();
```

