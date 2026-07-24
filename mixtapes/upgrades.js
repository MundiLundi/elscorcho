```javascript
/* =========================================================
   EL SCORCHO
   upgrades.js

   Central upgrade system for:
   - Upgrade definitions
   - Levels
   - Prices
   - Reward calculations
   - Click power
   - Passive points
   - Multipliers
   - Rebirth rewards
   - State normalization
========================================================= */

(function () {
    "use strict";

    /* =====================================================
       CONFIGURATION
    ===================================================== */

    const REBIRTH_REQUIREMENT = 10000;
    const REBIRTH_REWARD_DIVISOR = 10000;
    const REBIRTH_MULTIPLIER_PER_POINT = 0.25;

    const UPGRADE_DEFINITIONS = {
        "cheap-headphones": {
            id: "cheap-headphones",
            name: "Cheap Headphones",

            basePrice: 25,
            priceGrowth: 1.55,
            maximumLevel: null,

            description:
                "Earn one additional passive point per second for each level.",

            getEffect(level) {
                return {
                    passivePointsBonus: level
                };
            },

            getEffectText(level) {
                const amount = Math.max(
                    0,
                    safeInteger(level)
                );

                return `+${amount} point${
                    amount === 1 ? "" : "s"
                } per second`;
            }
        },

        "pinkerton-cd": {
            id: "pinkerton-cd",
            name: "Scratched Pinkerton CD",

            basePrice: 75,
            priceGrowth: 1.7,
            maximumLevel: null,

            description:
                "Increase the value of manual actions by two points per level.",

            getEffect(level) {
                return {
                    clickPowerBonus:
                        safeInteger(level) * 2
                };
            },

            getEffectText(level) {
                const amount =
                    safeInteger(level) * 2;

                return `+${amount} click power`;
            }
        },

        "old-television": {
            id: "old-television",
            name: "Old Television",

            basePrice: 250,
            priceGrowth: 2,
            maximumLevel: 10,

            description:
                "Increase video rewards by ten percent per level.",

            getEffect(level) {
                return {
                    videoMultiplierBonus:
                        safeInteger(level) * 0.1
                };
            },

            getEffectText(level) {
                return `+${
                    safeInteger(level) * 10
                }% video rewards`;
            }
        }
    };

    /* =====================================================
       INTERNAL STATE
    ===================================================== */

    let initialized = false;

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
            typeof namespace.Save.getState ===
                "function"
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

            purchases: {},
            upgrades: {},

            pointsPerSecond: 1,
            clickPower: 1,

            videoMultiplier: 1,
            shopMultiplier: 1,
            permanentMultiplier: 1,
            totalMultiplier: 1,

            rebirths: 0,
            rebirthCurrency: 0,

            settings: {}
        };
    }

    function saveState() {
        const namespace = getNamespace();

        if (
            namespace.Save &&
            typeof namespace.Save.save ===
                "function"
        ) {
            namespace.Save.save({
                silent: true
            });
        }
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

    function roundNumber(value, decimals = 6) {
        const multiplier = Math.pow(
            10,
            decimals
        );

        return (
            Math.round(
                safeNumber(value) *
                multiplier
            ) / multiplier
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

    function clone(value) {
        if (
            typeof structuredClone ===
            "function"
        ) {
            return structuredClone(value);
        }

        return JSON.parse(
            JSON.stringify(value)
        );
    }

    /* =====================================================
       STATE PREPARATION
    ===================================================== */

    function prepareState() {
        const state = getState();

        if (
            !state.purchases ||
            typeof state.purchases !== "object" ||
            Array.isArray(state.purchases)
        ) {
            state.purchases = {};
        }

        if (
            !state.upgrades ||
            typeof state.upgrades !== "object" ||
            Array.isArray(state.upgrades)
        ) {
            state.upgrades = {};
        }

        if (
            !state.settings ||
            typeof state.settings !== "object" ||
            Array.isArray(state.settings)
        ) {
            state.settings = {};
        }

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

        state.rebirths = safeInteger(
            state.rebirths
        );

        state.rebirthCurrency = Math.max(
            0,
            safeNumber(
                state.rebirthCurrency
            )
        );

        state.permanentMultiplier = Math.max(
            1,
            safeNumber(
                state.permanentMultiplier,
                1
            )
        );

        Object.keys(
            UPGRADE_DEFINITIONS
        ).forEach((upgradeId) => {
            const purchaseLevel =
                safeInteger(
                    state.purchases[
                        upgradeId
                    ]
                );

            const upgradeLevel =
                safeInteger(
                    state.upgrades[
                        upgradeId
                    ]
                );

            const level = Math.max(
                purchaseLevel,
                upgradeLevel
            );

            state.purchases[
                upgradeId
            ] = level;

            state.upgrades[
                upgradeId
            ] = level;
        });

        return state;
    }

    /* =====================================================
       UPGRADE DEFINITIONS
    ===================================================== */

    function getDefinition(upgradeId) {
        return (
            UPGRADE_DEFINITIONS[
                upgradeId
            ] || null
        );
    }

    function getDefinitions() {
        return Object.values(
            UPGRADE_DEFINITIONS
        ).map((definition) => ({
            ...definition
        }));
    }

    function hasUpgrade(upgradeId) {
        return Boolean(
            getDefinition(upgradeId)
        );
    }

    /* =====================================================
       LEVELS
    ===================================================== */

    function getLevel(upgradeId) {
        if (!hasUpgrade(upgradeId)) {
            return 0;
        }

        const state = prepareState();

        return safeInteger(
            state.upgrades[
                upgradeId
            ]
        );
    }

    function setLevel(
        upgradeId,
        level,
        options = {}
    ) {
        const definition =
            getDefinition(upgradeId);

        if (!definition) {
            return false;
        }

        let cleanLevel =
            safeInteger(level);

        if (
            definition.maximumLevel !==
            null
        ) {
            cleanLevel = clamp(
                cleanLevel,
                0,
                definition.maximumLevel
            );
        }

        const state = prepareState();

        const previousLevel =
            getLevel(upgradeId);

        state.upgrades[
            upgradeId
        ] = cleanLevel;

        state.purchases[
            upgradeId
        ] = cleanLevel;

        if (
            options.recalculate !== false
        ) {
            recalculate({
                save:
                    options.save !== false,
                dispatchEvent:
                    options.dispatchEvent !==
                    false
            });
        } else if (
            options.save !== false
        ) {
            saveState();
        }

        dispatch(
            "upgrade-level-change",
            {
                upgradeId,
                previousLevel,
                level: cleanLevel
            }
        );

        return cleanLevel;
    }

    function addLevel(
        upgradeId,
        amount = 1,
        options = {}
    ) {
        const definition =
            getDefinition(upgradeId);

        if (!definition) {
            return false;
        }

        const currentLevel =
            getLevel(upgradeId);

        const increase =
            safeInteger(amount, 1);

        return setLevel(
            upgradeId,
            currentLevel + increase,
            options
        );
    }

    function resetLevels(options = {}) {
        const state = prepareState();

        Object.keys(
            UPGRADE_DEFINITIONS
        ).forEach((upgradeId) => {
            state.upgrades[
                upgradeId
            ] = 0;

            state.purchases[
                upgradeId
            ] = 0;
        });

        recalculate({
            save:
                options.save !== false,
            dispatchEvent:
                options.dispatchEvent !==
                false
        });

        dispatch(
            "upgrades-reset"
        );

        return getLevels();
    }

    function getLevels() {
        const levels = {};

        Object.keys(
            UPGRADE_DEFINITIONS
        ).forEach((upgradeId) => {
            levels[upgradeId] =
                getLevel(upgradeId);
        });

        return levels;
    }

    function isMaximumLevel(upgradeId) {
        const definition =
            getDefinition(upgradeId);

        if (
            !definition ||
            definition.maximumLevel ===
                null
        ) {
            return false;
        }

        return (
            getLevel(upgradeId) >=
            definition.maximumLevel
        );
    }

    /* =====================================================
       PRICES
    ===================================================== */

    function getPrice(
        upgradeId,
        level = null
    ) {
        const definition =
            getDefinition(upgradeId);

        if (!definition) {
            return Infinity;
        }

        const currentLevel =
            level === null
                ? getLevel(upgradeId)
                : safeInteger(level);

        if (
            definition.maximumLevel !==
                null &&
            currentLevel >=
                definition.maximumLevel
        ) {
            return Infinity;
        }

        return Math.max(
            1,
            Math.floor(
                definition.basePrice *
                Math.pow(
                    definition.priceGrowth,
                    currentLevel
                )
            )
        );
    }

    function getPriceForLevels(
        upgradeId,
        amount = 1
    ) {
        const definition =
            getDefinition(upgradeId);

        if (!definition) {
            return Infinity;
        }

        const requestedAmount =
            Math.max(
                1,
                safeInteger(amount, 1)
            );

        const startingLevel =
            getLevel(upgradeId);

        let total = 0;
        let levelsIncluded = 0;

        for (
            let index = 0;
            index < requestedAmount;
            index += 1
        ) {
            const level =
                startingLevel + index;

            if (
                definition.maximumLevel !==
                    null &&
                level >=
                    definition.maximumLevel
            ) {
                break;
            }

            total += getPrice(
                upgradeId,
                level
            );

            levelsIncluded += 1;
        }

        if (levelsIncluded === 0) {
            return Infinity;
        }

        return total;
    }

    function canAfford(
        upgradeId,
        amount = 1
    ) {
        if (
            !hasUpgrade(upgradeId) ||
            isMaximumLevel(upgradeId)
        ) {
            return false;
        }

        const state = prepareState();

        const price =
            getPriceForLevels(
                upgradeId,
                amount
            );

        return (
            Number.isFinite(price) &&
            state.points >= price
        );
    }

    function getMaximumAffordableLevels(
        upgradeId
    ) {
        const definition =
            getDefinition(upgradeId);

        if (!definition) {
            return 0;
        }

        const state = prepareState();

        let remainingPoints =
            state.points;

        let level =
            getLevel(upgradeId);

        let affordableLevels = 0;

        while (true) {
            if (
                definition.maximumLevel !==
                    null &&
                level >=
                    definition.maximumLevel
            ) {
                break;
            }

            const price =
                getPrice(
                    upgradeId,
                    level
                );

            if (
                !Number.isFinite(price) ||
                remainingPoints < price
            ) {
                break;
            }

            remainingPoints -= price;
            affordableLevels += 1;
            level += 1;

            if (affordableLevels > 10000) {
                break;
            }
        }

        return affordableLevels;
    }

    /* =====================================================
       EFFECT CALCULATION
    ===================================================== */

    function calculateEffects() {
        const effects = {
            basePointsPerSecond: 1,
            passivePointsBonus: 0,

            baseClickPower: 1,
            clickPowerBonus: 0,

            baseVideoMultiplier: 1,
            videoMultiplierBonus: 0,

            permanentMultiplier: 1,

            pointsPerSecond: 1,
            clickPower: 1,
            videoMultiplier: 1,
            totalMultiplier: 1
        };

        Object.values(
            UPGRADE_DEFINITIONS
        ).forEach((definition) => {
            const level =
                getLevel(definition.id);

            const upgradeEffects =
                definition.getEffect(
                    level
                ) || {};

            Object.entries(
                upgradeEffects
            ).forEach(
                ([key, value]) => {
                    effects[key] =
                        safeNumber(
                            effects[key]
                        ) +
                        safeNumber(value);
                }
            );
        });

        const state = prepareState();

        effects.permanentMultiplier =
            Math.max(
                1,
                safeNumber(
                    state.permanentMultiplier,
                    1
                )
            );

        effects.pointsPerSecond =
            Math.max(
                0,
                effects.basePointsPerSecond +
                effects.passivePointsBonus
            );

        effects.clickPower =
            Math.max(
                1,
                effects.baseClickPower +
                effects.clickPowerBonus
            );

        effects.videoMultiplier =
            Math.max(
                1,
                effects.baseVideoMultiplier +
                effects.videoMultiplierBonus
            );

        effects.totalMultiplier =
            effects.videoMultiplier *
            effects.permanentMultiplier;

        Object.keys(effects).forEach(
            (key) => {
                effects[key] =
                    roundNumber(
                        effects[key]
                    );
            }
        );

        return effects;
    }

    function recalculate(options = {}) {
        const state = prepareState();
        const effects =
            calculateEffects();

        state.pointsPerSecond =
            effects.pointsPerSecond;

        state.clickPower =
            effects.clickPower;

        state.videoMultiplier =
            effects.videoMultiplier;

        /*
         * shopMultiplier is retained for compatibility
         * with the existing shop.js and older saves.
         */
        state.shopMultiplier =
            effects.videoMultiplier;

        state.totalMultiplier =
            effects.totalMultiplier;

        if (options.save !== false) {
            saveState();
        }

        if (
            options.dispatchEvent !==
            false
        ) {
            dispatch(
                "upgrades-applied",
                {
                    ...effects,
                    levels: getLevels()
                }
            );
        }

        return {
            ...effects
        };
    }

    function getEffects() {
        return {
            ...calculateEffects()
        };
    }

    function getEffectText(upgradeId) {
        const definition =
            getDefinition(upgradeId);

        if (!definition) {
            return "";
        }

        return definition.getEffectText(
            getLevel(upgradeId)
        );
    }

    /* =====================================================
       REWARD CALCULATIONS
    ===================================================== */

    function calculateVideoReward(
        baseAmount,
        options = {}
    ) {
        const effects = getEffects();

        const amount = Math.max(
            0,
            safeNumber(baseAmount)
        );

        let multiplier =
            effects.totalMultiplier;

        if (
            options.ignorePermanentMultiplier
        ) {
            multiplier /=
                effects.permanentMultiplier;
        }

        if (
            options.ignoreVideoMultiplier
        ) {
            multiplier /=
                effects.videoMultiplier;
        }

        if (
            Number.isFinite(
                options.additionalMultiplier
            )
        ) {
            multiplier *= Math.max(
                0,
                options.additionalMultiplier
            );
        }

        return roundNumber(
            amount * multiplier
        );
    }

    function calculateClickReward(
        baseAmount = 1,
        options = {}
    ) {
        const effects = getEffects();

        const amount = Math.max(
            0,
            safeNumber(baseAmount, 1)
        );

        let reward =
            amount *
            effects.clickPower;

        if (
            options.usePermanentMultiplier ===
            true
        ) {
            reward *=
                effects.permanentMultiplier;
        }

        return roundNumber(reward);
    }

    function calculatePassiveReward(
        seconds = 1,
        options = {}
    ) {
        const effects = getEffects();

        const cleanSeconds = Math.max(
            0,
            safeNumber(seconds, 1)
        );

        let reward =
            effects.pointsPerSecond *
            cleanSeconds;

        if (
            options.usePermanentMultiplier !==
            false
        ) {
            reward *=
                effects.permanentMultiplier;
        }

        if (
            Number.isFinite(
                options.maximumSeconds
            )
        ) {
            const maximumSeconds =
                Math.max(
                    0,
                    options.maximumSeconds
                );

            reward =
                effects.pointsPerSecond *
                Math.min(
                    cleanSeconds,
                    maximumSeconds
                );

            if (
                options.usePermanentMultiplier !==
                false
            ) {
                reward *=
                    effects.permanentMultiplier;
            }
        }

        return roundNumber(reward);
    }

    function calculateCommentReward(
        baseAmount,
        options = {}
    ) {
        return calculateClickReward(
            baseAmount,
            {
                usePermanentMultiplier:
                    options.usePermanentMultiplier ===
                    true
            }
        );
    }

    /* =====================================================
       POINT MANAGEMENT
    ===================================================== */

    function addPoints(
        amount,
        source = "upgrade-system",
        options = {}
    ) {
        const state = prepareState();

        const cleanAmount = Math.max(
            0,
            safeNumber(amount)
        );

        if (cleanAmount <= 0) {
            return 0;
        }

        state.points += cleanAmount;

        if (
            options.countAsLifetime !==
            false
        ) {
            state.lifetimePoints +=
                cleanAmount;
        }

        if (options.save !== false) {
            saveState();
        }

        dispatch("points-earned", {
            amount: cleanAmount,
            source,
            total: state.points,
            lifetimePoints:
                state.lifetimePoints
        });

        return cleanAmount;
    }

    function spendPoints(
        amount,
        source = "upgrade-system",
        options = {}
    ) {
        const state = prepareState();

        const cleanAmount = Math.max(
            0,
            safeNumber(amount)
        );

        if (
            cleanAmount <= 0 ||
            state.points < cleanAmount
        ) {
            return false;
        }

        state.points -= cleanAmount;

        if (options.save !== false) {
            saveState();
        }

        dispatch("points-spent", {
            amount: cleanAmount,
            source,
            total: state.points
        });

        return true;
    }

    /* =====================================================
       PURCHASING
    ===================================================== */

    function purchase(
        upgradeId,
        options = {}
    ) {
        const definition =
            getDefinition(upgradeId);

        if (!definition) {
            return {
                success: false,
                reason: "unknown-upgrade"
            };
        }

        if (isMaximumLevel(upgradeId)) {
            return {
                success: false,
                reason: "maximum-level",
                upgradeId,
                level:
                    getLevel(upgradeId)
            };
        }

        let amount =
            safeInteger(
                options.amount,
                1
            );

        if (amount <= 0) {
            amount = 1;
        }

        if (
            options.buyMaximum === true
        ) {
            amount =
                getMaximumAffordableLevels(
                    upgradeId
                );
        }

        if (amount <= 0) {
            return {
                success: false,
                reason: "cannot-afford",
                upgradeId,
                level:
                    getLevel(upgradeId),
                price:
                    getPrice(upgradeId)
            };
        }

        const currentLevel =
            getLevel(upgradeId);

        const maximumLevel =
            definition.maximumLevel;

        if (maximumLevel !== null) {
            amount = Math.min(
                amount,
                maximumLevel -
                currentLevel
            );
        }

        const price =
            getPriceForLevels(
                upgradeId,
                amount
            );

        const state = prepareState();

        if (
            !Number.isFinite(price) ||
            state.points < price
        ) {
            return {
                success: false,
                reason: "cannot-afford",
                upgradeId,
                level: currentLevel,
                price,
                points: state.points,
                missing: Math.max(
                    0,
                    price - state.points
                )
            };
        }

        const spent = spendPoints(
            price,
            "shop",
            {
                save: false
            }
        );

        if (!spent) {
            return {
                success: false,
                reason: "cannot-afford",
                upgradeId,
                price
            };
        }

        const newLevel = setLevel(
            upgradeId,
            currentLevel + amount,
            {
                save: false,
                recalculate: false,
                dispatchEvent: false
            }
        );

        const effects = recalculate({
            save: true,
            dispatchEvent: true
        });

        const result = {
            success: true,
            upgradeId,
            definition: {
                ...definition
            },
            amount,
            price,
            previousLevel:
                currentLevel,
            level: newLevel,
            points: state.points,
            effects
        };

        dispatch(
            "item-purchased",
            result
        );

        dispatch(
            "upgrade-purchased",
            result
        );

        return result;
    }

    /* =====================================================
       REBIRTH
    ===================================================== */

    function calculateRebirthReward(
        lifetimePoints = null
    ) {
        const state = prepareState();

        const points =
            lifetimePoints === null
                ? state.lifetimePoints
                : Math.max(
                    0,
                    safeNumber(
                        lifetimePoints
                    )
                );

        if (
            points <
            REBIRTH_REQUIREMENT
        ) {
            return 0;
        }

        return Math.max(
            1,
            Math.floor(
                Math.sqrt(
                    points /
                    REBIRTH_REWARD_DIVISOR
                )
            )
        );
    }

    function canRebirth() {
        return (
            calculateRebirthReward() >
            0
        );
    }

    function getPermanentMultiplier(
        rebirthCurrency = null
    ) {
        const state = prepareState();

        const currency =
            rebirthCurrency === null
                ? state.rebirthCurrency
                : Math.max(
                    0,
                    safeNumber(
                        rebirthCurrency
                    )
                );

        return roundNumber(
            1 +
            currency *
                REBIRTH_MULTIPLIER_PER_POINT
        );
    }

    function performRebirth(options = {}) {
        const state = prepareState();

        const reward =
            calculateRebirthReward();

        if (reward <= 0) {
            return {
                success: false,
                reason:
                    "requirement-not-met",
                requirement:
                    REBIRTH_REQUIREMENT,
                lifetimePoints:
                    state.lifetimePoints
            };
        }

        const oldState = {
            points: state.points,
            rebirths: state.rebirths,
            rebirthCurrency:
                state.rebirthCurrency,
            permanentMultiplier:
                state.permanentMultiplier,
            levels: getLevels()
        };

        state.rebirths += 1;
        state.rebirthCurrency += reward;

        state.permanentMultiplier =
            getPermanentMultiplier(
                state.rebirthCurrency
            );

        state.points = 0;

        /*
         * lifetimePoints is reset so the next rebirth
         * must be earned again.
         *
         * Set preserveLifetimePoints to true if you prefer
         * rebirth rewards to keep scaling from all-time points.
         */
        if (
            options.preserveLifetimePoints !==
            true
        ) {
            state.lifetimePoints = 0;
        }

        Object.keys(
            UPGRADE_DEFINITIONS
        ).forEach((upgradeId) => {
            state.upgrades[
                upgradeId
            ] = 0;

            state.purchases[
                upgradeId
            ] = 0;
        });

        const effects = recalculate({
            save: true,
            dispatchEvent: true
        });

        const result = {
            success: true,
            reward,
            rebirths:
                state.rebirths,
            rebirthCurrency:
                state.rebirthCurrency,
            permanentMultiplier:
                state.permanentMultiplier,
            previous: oldState,
            effects
        };

        dispatch("rebirth", result);

        return result;
    }

    /* =====================================================
       SNAPSHOT
    ===================================================== */

    function getSnapshot() {
        const state = prepareState();
        const effects = getEffects();

        const upgrades = {};

        Object.keys(
            UPGRADE_DEFINITIONS
        ).forEach((upgradeId) => {
            const definition =
                getDefinition(upgradeId);

            upgrades[upgradeId] = {
                id: upgradeId,
                name:
                    definition.name,
                level:
                    getLevel(upgradeId),
                price:
                    getPrice(upgradeId),
                maximumLevel:
                    definition.maximumLevel,
                maximumReached:
                    isMaximumLevel(
                        upgradeId
                    ),
                affordable:
                    canAfford(upgradeId),
                effectText:
                    getEffectText(
                        upgradeId
                    )
            };
        });

        return {
            points: state.points,
            lifetimePoints:
                state.lifetimePoints,

            rebirths:
                state.rebirths,
            rebirthCurrency:
                state.rebirthCurrency,
            permanentMultiplier:
                state.permanentMultiplier,

            levels: getLevels(),
            upgrades,
            effects,

            rebirth: {
                available:
                    canRebirth(),
                reward:
                    calculateRebirthReward(),
                requirement:
                    REBIRTH_REQUIREMENT
            }
        };
    }

    /* =====================================================
       IMPORT / RESET INTEGRATION
    ===================================================== */

    function handleLoadedState() {
        prepareState();
        recalculate({
            save: false,
            dispatchEvent: true
        });
    }

    function bindEvents() {
        [
            "elscorcho:loaded",
            "elscorcho:imported",
            "elscorcho:reset",
            "elscorcho:deleted"
        ].forEach((eventName) => {
            window.addEventListener(
                eventName,
                handleLoadedState
            );
        });
    }

    /* =====================================================
       INITIALIZATION
    ===================================================== */

    function init() {
        if (initialized) {
            return;
        }

        initialized = true;

        prepareState();
        bindEvents();

        const effects = recalculate({
            save: true,
            dispatchEvent: false
        });

        dispatch(
            "upgrades-init",
            {
                levels: getLevels(),
                effects,
                definitions:
                    getDefinitions()
            }
        );
    }

    /* =====================================================
       PUBLIC API
    ===================================================== */

    const namespace =
        getNamespace();

    namespace.Upgrades = {
        init,

        prepareState,
        recalculate,

        getDefinition,
        getDefinitions,
        hasUpgrade,

        getLevel,
        getLevels,
        setLevel,
        addLevel,
        resetLevels,
        isMaximumLevel,

        getPrice,
        getPriceForLevels,
        canAfford,
        getMaximumAffordableLevels,

        calculateEffects,
        getEffects,
        getEffectText,

        calculateVideoReward,
        calculateClickReward,
        calculatePassiveReward,
        calculateCommentReward,

        addPoints,
        spendPoints,
        purchase,

        calculateRebirthReward,
        canRebirth,
        getPermanentMultiplier,
        performRebirth,

        getSnapshot,

        definitions:
            UPGRADE_DEFINITIONS,

        constants: {
            rebirthRequirement:
                REBIRTH_REQUIREMENT,

            rebirthRewardDivisor:
                REBIRTH_REWARD_DIVISOR,

            rebirthMultiplierPerPoint:
                REBIRTH_MULTIPLIER_PER_POINT
        }
    };

    if (
        document.readyState ===
        "loading"
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

