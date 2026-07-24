```javascript
/* =========================================================
   EL SCORCHO
   save.js
   Local save data, loading, importing, exporting, and reset
========================================================= */

(function () {
    "use strict";

    /* =====================================================
       CONFIGURATION
    ===================================================== */

    const SAVE_KEY = "elScorchoSave";
    const SAVE_VERSION = 1;

    const DEFAULT_SAVE = Object.freeze({
        version: SAVE_VERSION,

        points: 0,
        lifetimePoints: 0,
        pointsPerSecond: 0,
        clickPower: 1,

        currentVideoId: "okthJIVbi6g",
        currentVideoIndex: 0,
        watchedSeconds: 0,

        likes: 0,
        commentsPosted: 0,
        videosWatched: 0,

        upgrades: {},
        purchases: {},
        achievements: {},

        rebirths: 0,
        rebirthCurrency: 0,
        permanentMultiplier: 1,

        settings: {
            soundEnabled: false,
            autoplayEnabled: true,
            reducedEffects: false,
            vhsMode: false
        },

        comments: [],

        createdAt: null,
        lastSavedAt: null,
        lastPlayedAt: null
    });

    /* =====================================================
       INTERNAL HELPERS
    ===================================================== */

    function clone(value) {
        return JSON.parse(JSON.stringify(value));
    }

    function isPlainObject(value) {
        return (
            value !== null &&
            typeof value === "object" &&
            !Array.isArray(value)
        );
    }

    function mergeObjects(base, saved) {
        const output = clone(base);

        if (!isPlainObject(saved)) {
            return output;
        }

        Object.keys(saved).forEach((key) => {
            const savedValue = saved[key];
            const baseValue = output[key];

            if (
                isPlainObject(baseValue) &&
                isPlainObject(savedValue)
            ) {
                output[key] = mergeObjects(
                    baseValue,
                    savedValue
                );
            } else {
                output[key] = savedValue;
            }
        });

        return output;
    }

    function safeNumber(value, fallback = 0) {
        const number = Number(value);

        if (!Number.isFinite(number)) {
            return fallback;
        }

        return number;
    }

    function safeInteger(value, fallback = 0) {
        const number = Math.floor(
            safeNumber(value, fallback)
        );

        return Math.max(0, number);
    }

    function safeBoolean(value, fallback = false) {
        if (typeof value === "boolean") {
            return value;
        }

        return fallback;
    }

    function safeString(value, fallback = "") {
        if (typeof value === "string") {
            return value;
        }

        return fallback;
    }

    function createFreshSave() {
        const save = clone(DEFAULT_SAVE);
        const now = new Date().toISOString();

        save.createdAt = now;
        save.lastSavedAt = now;
        save.lastPlayedAt = now;

        return save;
    }

    /* =====================================================
       SAVE VALIDATION
    ===================================================== */

    function sanitizeSave(rawSave) {
        const save = mergeObjects(
            createFreshSave(),
            rawSave
        );

        save.version = SAVE_VERSION;

        save.points = Math.max(
            0,
            safeNumber(save.points)
        );

        save.lifetimePoints = Math.max(
            save.points,
            safeNumber(save.lifetimePoints)
        );

        save.pointsPerSecond = Math.max(
            0,
            safeNumber(save.pointsPerSecond)
        );

        save.clickPower = Math.max(
            1,
            safeNumber(save.clickPower, 1)
        );

        save.currentVideoId = safeString(
            save.currentVideoId,
            DEFAULT_SAVE.currentVideoId
        );

        save.currentVideoIndex = safeInteger(
            save.currentVideoIndex
        );

        save.watchedSeconds = Math.max(
            0,
            safeNumber(save.watchedSeconds)
        );

        save.likes = safeInteger(save.likes);
        save.commentsPosted = safeInteger(
            save.commentsPosted
        );

        save.videosWatched = safeInteger(
            save.videosWatched
        );

        save.rebirths = safeInteger(save.rebirths);

        save.rebirthCurrency = Math.max(
            0,
            safeNumber(save.rebirthCurrency)
        );

        save.permanentMultiplier = Math.max(
            1,
            safeNumber(
                save.permanentMultiplier,
                1
            )
        );

        save.settings.soundEnabled = safeBoolean(
            save.settings.soundEnabled,
            false
        );

        save.settings.autoplayEnabled = safeBoolean(
            save.settings.autoplayEnabled,
            true
        );

        save.settings.reducedEffects = safeBoolean(
            save.settings.reducedEffects,
            false
        );

        save.settings.vhsMode = safeBoolean(
            save.settings.vhsMode,
            false
        );

        if (!isPlainObject(save.upgrades)) {
            save.upgrades = {};
        }

        if (!isPlainObject(save.purchases)) {
            save.purchases = {};
        }

        if (!isPlainObject(save.achievements)) {
            save.achievements = {};
        }

        if (!Array.isArray(save.comments)) {
            save.comments = [];
        }

        if (!save.createdAt) {
            save.createdAt = new Date().toISOString();
        }

        save.lastSavedAt =
            save.lastSavedAt ||
            new Date().toISOString();

        save.lastPlayedAt =
            save.lastPlayedAt ||
            new Date().toISOString();

        return save;
    }

    /* =====================================================
       STATE ACCESS
    ===================================================== */

    function getGameState() {
        if (!window.ElScorcho) {
            window.ElScorcho = {};
        }

        if (!window.ElScorcho.state) {
            window.ElScorcho.state = createFreshSave();
        }

        return window.ElScorcho.state;
    }

    function replaceGameState(newState) {
        if (!window.ElScorcho) {
            window.ElScorcho = {};
        }

        window.ElScorcho.state =
            sanitizeSave(newState);

        return window.ElScorcho.state;
    }

    /* =====================================================
       LOCAL STORAGE
    ===================================================== */

    function storageAvailable() {
        try {
            const testKey = "__elScorchoStorageTest";

            localStorage.setItem(testKey, "1");
            localStorage.removeItem(testKey);

            return true;
        } catch (error) {
            console.warn(
                "Local storage is unavailable:",
                error
            );

            return false;
        }
    }

    function saveGame(options = {}) {
        const {
            silent = false,
            dispatchEvent = true
        } = options;

        const state = getGameState();

        state.version = SAVE_VERSION;
        state.lastSavedAt =
            new Date().toISOString();

        if (!state.createdAt) {
            state.createdAt = state.lastSavedAt;
        }

        if (!storageAvailable()) {
            return false;
        }

        try {
            const cleanState = sanitizeSave(state);

            localStorage.setItem(
                SAVE_KEY,
                JSON.stringify(cleanState)
            );

            replaceGameState(cleanState);

            if (dispatchEvent) {
                window.dispatchEvent(
                    new CustomEvent(
                        "elscorcho:saved",
                        {
                            detail: {
                                state: clone(cleanState)
                            }
                        }
                    )
                );
            }

            if (!silent) {
                console.info(
                    "El Scorcho save completed."
                );
            }

            return true;
        } catch (error) {
            console.error(
                "Could not save El Scorcho data:",
                error
            );

            return false;
        }
    }

    function loadGame(options = {}) {
        const {
            dispatchEvent = true
        } = options;

        if (!storageAvailable()) {
            return replaceGameState(
                createFreshSave()
            );
        }

        try {
            const rawSave =
                localStorage.getItem(SAVE_KEY);

            if (!rawSave) {
                const freshSave =
                    createFreshSave();

                replaceGameState(freshSave);
                saveGame({ silent: true });

                return freshSave;
            }

            const parsedSave = JSON.parse(rawSave);
            const cleanSave =
                sanitizeSave(parsedSave);

            cleanSave.lastPlayedAt =
                new Date().toISOString();

            replaceGameState(cleanSave);

            if (dispatchEvent) {
                window.dispatchEvent(
                    new CustomEvent(
                        "elscorcho:loaded",
                        {
                            detail: {
                                state: clone(cleanSave)
                            }
                        }
                    )
                );
            }

            return cleanSave;
        } catch (error) {
            console.error(
                "Could not load El Scorcho save:",
                error
            );

            const backup =
                localStorage.getItem(SAVE_KEY);

            if (backup) {
                localStorage.setItem(
                    `${SAVE_KEY}_corrupt_${Date.now()}`,
                    backup
                );
            }

            const freshSave =
                createFreshSave();

            replaceGameState(freshSave);

            return freshSave;
        }
    }

    function hasSave() {
        if (!storageAvailable()) {
            return false;
        }

        return Boolean(
            localStorage.getItem(SAVE_KEY)
        );
    }

    /* =====================================================
       AUTO SAVE
    ===================================================== */

    let autoSaveTimer = null;

    function startAutoSave(intervalMilliseconds = 15000) {
        stopAutoSave();

        const interval = Math.max(
            5000,
            safeInteger(
                intervalMilliseconds,
                15000
            )
        );

        autoSaveTimer = window.setInterval(
            () => {
                saveGame({
                    silent: true
                });
            },
            interval
        );

        return autoSaveTimer;
    }

    function stopAutoSave() {
        if (autoSaveTimer !== null) {
            window.clearInterval(
                autoSaveTimer
            );

            autoSaveTimer = null;
        }
    }

    /* =====================================================
       OFFLINE PROGRESS
    ===================================================== */

    function calculateOfflineProgress(
        state = getGameState(),
        maximumSeconds = 28800
    ) {
        const lastPlayed =
            Date.parse(state.lastPlayedAt);

        if (!Number.isFinite(lastPlayed)) {
            return {
                secondsAway: 0,
                pointsEarned: 0
            };
        }

        const now = Date.now();

        const secondsAway = Math.max(
            0,
            Math.min(
                Math.floor(
                    (now - lastPlayed) / 1000
                ),
                maximumSeconds
            )
        );

        const pointsPerSecond = Math.max(
            0,
            safeNumber(
                state.pointsPerSecond
            )
        );

        const multiplier = Math.max(
            1,
            safeNumber(
                state.permanentMultiplier,
                1
            )
        );

        const pointsEarned =
            secondsAway *
            pointsPerSecond *
            multiplier;

        return {
            secondsAway,
            pointsEarned
        };
    }

    function applyOfflineProgress(
        maximumSeconds = 28800
    ) {
        const state = getGameState();

        const result =
            calculateOfflineProgress(
                state,
                maximumSeconds
            );

        if (result.pointsEarned <= 0) {
            state.lastPlayedAt =
                new Date().toISOString();

            return result;
        }

        state.points += result.pointsEarned;
        state.lifetimePoints +=
            result.pointsEarned;

        state.lastPlayedAt =
            new Date().toISOString();

        window.dispatchEvent(
            new CustomEvent(
                "elscorcho:offline-progress",
                {
                    detail: result
                }
            )
        );

        return result;
    }

    /* =====================================================
       EXPORT AND IMPORT
    ===================================================== */

    function exportSave() {
        const state = sanitizeSave(
            getGameState()
        );

        const saveText = JSON.stringify(
            state,
            null,
            2
        );

        const blob = new Blob(
            [saveText],
            {
                type: "application/json"
            }
        );

        const url =
            URL.createObjectURL(blob);

        const link =
            document.createElement("a");

        const date =
            new Date()
                .toISOString()
                .slice(0, 10);

        link.href = url;
        link.download =
            `el-scorcho-save-${date}.json`;

        document.body.appendChild(link);
        link.click();
        link.remove();

        URL.revokeObjectURL(url);

        window.dispatchEvent(
            new CustomEvent(
                "elscorcho:exported"
            )
        );
    }

    function importSaveText(text) {
        if (typeof text !== "string") {
            throw new TypeError(
                "Imported save must be text."
            );
        }

        const parsed = JSON.parse(text);
        const cleanSave =
            sanitizeSave(parsed);

        replaceGameState(cleanSave);
        saveGame({ silent: true });

        window.dispatchEvent(
            new CustomEvent(
                "elscorcho:imported",
                {
                    detail: {
                        state: clone(cleanSave)
                    }
                }
            )
        );

        return cleanSave;
    }

    function importSaveFile(file) {
        return new Promise(
            (resolve, reject) => {
                if (!(file instanceof File)) {
                    reject(
                        new TypeError(
                            "Please select a valid save file."
                        )
                    );

                    return;
                }

                const reader =
                    new FileReader();

                reader.addEventListener(
                    "load",
                    () => {
                        try {
                            const state =
                                importSaveText(
                                    String(
                                        reader.result
                                    )
                                );

                            resolve(state);
                        } catch (error) {
                            reject(error);
                        }
                    }
                );

                reader.addEventListener(
                    "error",
                    () => {
                        reject(
                            new Error(
                                "The save file could not be read."
                            )
                        );
                    }
                );

                reader.readAsText(file);
            }
        );
    }

    /* =====================================================
       RESET
    ===================================================== */

    function resetSave(options = {}) {
        const {
            preserveSettings = true,
            preserveRebirth = false
        } = options;

        const oldState = getGameState();
        const freshSave = createFreshSave();

        if (preserveSettings) {
            freshSave.settings = clone(
                oldState.settings
            );
        }

        if (preserveRebirth) {
            freshSave.rebirths =
                safeInteger(oldState.rebirths);

            freshSave.rebirthCurrency =
                Math.max(
                    0,
                    safeNumber(
                        oldState.rebirthCurrency
                    )
                );

            freshSave.permanentMultiplier =
                Math.max(
                    1,
                    safeNumber(
                        oldState.permanentMultiplier,
                        1
                    )
                );
        }

        replaceGameState(freshSave);
        saveGame({ silent: true });

        window.dispatchEvent(
            new CustomEvent(
                "elscorcho:reset",
                {
                    detail: {
                        state: clone(freshSave)
                    }
                }
            )
        );

        return freshSave;
    }

    function deleteSave() {
        stopAutoSave();

        if (storageAvailable()) {
            localStorage.removeItem(SAVE_KEY);
        }

        const freshSave = createFreshSave();

        replaceGameState(freshSave);

        window.dispatchEvent(
            new CustomEvent(
                "elscorcho:deleted",
                {
                    detail: {
                        state: clone(freshSave)
                    }
                }
            )
        );

        return freshSave;
    }

    /* =====================================================
       PAGE LIFECYCLE
    ===================================================== */

    function handlePageExit() {
        const state = getGameState();

        state.lastPlayedAt =
            new Date().toISOString();

        saveGame({
            silent: true,
            dispatchEvent: false
        });
    }

    window.addEventListener(
        "beforeunload",
        handlePageExit
    );

    document.addEventListener(
        "visibilitychange",
        () => {
            if (document.hidden) {
                handlePageExit();
            }
        }
    );

    /* =====================================================
       PUBLIC API
    ===================================================== */

    if (!window.ElScorcho) {
        window.ElScorcho = {};
    }

    window.ElScorcho.Save = {
        key: SAVE_KEY,
        version: SAVE_VERSION,
        defaults: clone(DEFAULT_SAVE),

        createFreshSave,
        sanitizeSave,

        getState: getGameState,
        replaceState: replaceGameState,

        hasSave,
        save: saveGame,
        load: loadGame,
        reset: resetSave,
        delete: deleteSave,

        startAutoSave,
        stopAutoSave,

        calculateOfflineProgress,
        applyOfflineProgress,

        export: exportSave,
        importText: importSaveText,
        importFile: importSaveFile
    };

    /* Load saved state immediately so later scripts can use it. */

    loadGame({
        dispatchEvent: false
    });
})();
```

