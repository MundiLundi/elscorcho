
```javascript
/* =========================================================
   EL SCORCHO
   shop.js
   Shop items, purchases, pricing, modal controls, and rebirth
========================================================= */

(function () {
    "use strict";

    /* =====================================================
       SHOP CONFIGURATION
    ===================================================== */

    const SHOP_ITEMS = {
        "cheap-headphones": {
            id: "cheap-headphones",
            name: "Cheap Headphones",
            basePrice: 25,
            priceGrowth: 1.55,
            maximumLevel: null,

            description:
                "Earn one additional point per second.",

            effectText(level) {
                return `+${level} point${
                    level === 1 ? "" : "s"
                } per second`;
            },

            apply(state, level) {
                state.pointsPerSecond =
                    1 + level;
            }
        },

        "pinkerton-cd": {
            id: "pinkerton-cd",
            name: "Scratched Pinkerton CD",
            basePrice: 75,
            priceGrowth: 1.7,
            maximumLevel: null,

            description:
                "Increase the value of manual clicks and likes.",

            effectText(level) {
                const bonus = level * 2;

                return `+${bonus} click power`;
            },

            apply(state, level) {
                state.clickPower =
                    1 + level * 2;
            }
        },

        "old-television": {
            id: "old-television",
            name: "Old Television",
            basePrice: 250,
            priceGrowth: 2,
            maximumLevel: 10,

            description:
                "Increase all video rewards by ten percent per level.",

            effectText(level) {
                return `+${level * 10}% video rewards`;
            },

            apply(state, level) {
                state.shopMultiplier =
                    1 + level * 0.1;
            }
        }
    };

    const REBIRTH_REQUIREMENT = 10000;
    const REBIRTH_REWARD_DIVISOR = 10000;

    /* =====================================================
       INTERNAL STATE
    ===================================================== */

    let initialized = false;
    let toastTimer = null;
    let focusedBeforeOpen = null;

    /* =====================================================
       GENERAL HELPERS
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
            namespace.state = {
                points: 0,
                lifetimePoints: 0,
                pointsPerSecond: 1,
                clickPower: 1,
                purchases: {},
                upgrades: {},
                rebirths: 0,
                rebirthCurrency: 0,
                permanentMultiplier: 1,
                shopMultiplier: 1,
                settings: {
                    vhsMode: false
                }
            };
        }

        return namespace.state;
    }

    function getElement(id) {
        return document.getElementById(id);
    }

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

    function formatNumber(value) {
        const number = Math.max(
            0,
            safeNumber(value)
        );

        if (number < 1000) {
            return Math.floor(number).toLocaleString();
        }

        const suffixes = [
            { value: 1e12, label: "T" },
            { value: 1e9, label: "B" },
            { value: 1e6, label: "M" },
            { value: 1e3, label: "K" }
        ];

        const suffix = suffixes.find(
            (entry) => number >= entry.value
        );

        if (!suffix) {
            return Math.floor(number).toLocaleString();
        }

        const shortened =
            number / suffix.value;

        const precision =
            shortened >= 100
                ? 0
                : shortened >= 10
                    ? 1
                    : 2;

        return (
            shortened
                .toFixed(precision)
                .replace(/\.0+$|(\.\d*[1-9])0+$/, "$1") +
            suffix.label
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

    function saveState() {
        const namespace = getNamespace();

        if (
            namespace.Save &&
            typeof namespace.Save.save === "function"
        ) {
            namespace.Save.save({
                silent: true
            });
        }
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
            typeof state.settings !== "object"
        ) {
            state.settings = {};
        }

        Object.keys(SHOP_ITEMS).forEach((itemId) => {
            const purchaseLevel =
                safeInteger(
                    state.purchases[itemId]
                );

            const upgradeLevel =
                safeInteger(
                    state.upgrades[itemId]
                );

            const level = Math.max(
                purchaseLevel,
                upgradeLevel
            );

            state.purchases[itemId] = level;
            state.upgrades[itemId] = level;
        });

        state.points = Math.max(
            0,
            safeNumber(state.points)
        );

        state.lifetimePoints = Math.max(
            state.points,
            safeNumber(state.lifetimePoints)
        );

        state.rebirths =
            safeInteger(state.rebirths);

        state.rebirthCurrency = Math.max(
            0,
            safeNumber(state.rebirthCurrency)
        );

        state.permanentMultiplier = Math.max(
            1,
            safeNumber(
                state.permanentMultiplier,
                1
            )
        );

        state.shopMultiplier = Math.max(
            1,
            safeNumber(
                state.shopMultiplier,
                1
            )
        );

        return state;
    }

    function getItemLevel(itemId) {
        const state = prepareState();

        return safeInteger(
            state.purchases[itemId]
        );
    }

    function setItemLevel(itemId, level) {
        const state = prepareState();
        const cleanLevel = safeInteger(level);

        state.purchases[itemId] =
            cleanLevel;

        state.upgrades[itemId] =
            cleanLevel;

        return cleanLevel;
    }

    /* =====================================================
       ITEM PRICING
    ===================================================== */

    function getItem(itemId) {
        return SHOP_ITEMS[itemId] || null;
    }

    function getItemPrice(itemId, level = null) {
        const item = getItem(itemId);

        if (!item) {
            return Infinity;
        }

        const currentLevel =
            level === null
                ? getItemLevel(itemId)
                : safeInteger(level);

        return Math.floor(
            item.basePrice *
            Math.pow(
                item.priceGrowth,
                currentLevel
            )
        );
    }

    function isMaximumLevel(itemId) {
        const item = getItem(itemId);

        if (
            !item ||
            item.maximumLevel === null
        ) {
            return false;
        }

        return (
            getItemLevel(itemId) >=
            item.maximumLevel
        );
    }

    function canAfford(itemId) {
        const state = prepareState();
        const price = getItemPrice(itemId);

        return (
            !isMaximumLevel(itemId) &&
            state.points >= price
        );
    }

    /* =====================================================
       APPLYING EFFECTS
    ===================================================== */

    function applyUpgradeEffects() {
        const state = prepareState();

        Object.values(SHOP_ITEMS).forEach(
            (item) => {
                const level =
                    getItemLevel(item.id);

                item.apply(state, level);
            }
        );

        state.totalMultiplier =
            Math.max(
                1,
                safeNumber(
                    state.permanentMultiplier,
                    1
                )
            ) *
            Math.max(
                1,
                safeNumber(
                    state.shopMultiplier,
                    1
                )
            );

        dispatch("upgrades-applied", {
            pointsPerSecond:
                state.pointsPerSecond,
            clickPower:
                state.clickPower,
            shopMultiplier:
                state.shopMultiplier,
            permanentMultiplier:
                state.permanentMultiplier,
            totalMultiplier:
                state.totalMultiplier
        });

        return state;
    }

    /* =====================================================
       PURCHASES
    ===================================================== */

    function purchaseItem(itemId) {
        const item = getItem(itemId);

        if (!item) {
            console.warn(
                `Unknown shop item: ${itemId}`
            );

            return false;
        }

        const state = prepareState();
        const level = getItemLevel(itemId);
        const price = getItemPrice(
            itemId,
            level
        );

        const itemElement =
            document.querySelector(
                `[data-shop-item="${itemId}"]`
            );

        const button =
            document.querySelector(
                `[data-buy-item="${itemId}"]`
            );

        if (isMaximumLevel(itemId)) {
            showToast(
                `${item.name} is already maxed out.`
            );

            itemElement?.classList.add(
                "cannot-afford"
            );

            window.setTimeout(
                () => {
                    itemElement?.classList.remove(
                        "cannot-afford"
                    );
                },
                400
            );

            return false;
        }

        if (state.points < price) {
            const missing =
                price - state.points;

            showToast(
                `You need ${formatNumber(
                    missing
                )} more points.`
            );

            itemElement?.classList.add(
                "cannot-afford"
            );

            button?.classList.add("fail");

            window.setTimeout(
                () => {
                    itemElement?.classList.remove(
                        "cannot-afford"
                    );

                    button?.classList.remove(
                        "fail"
                    );
                },
                450
            );

            dispatch("purchase-failed", {
                itemId,
                price,
                points: state.points,
                missing
            });

            return false;
        }

        state.points -= price;

        const newLevel =
            setItemLevel(
                itemId,
                level + 1
            );

        applyUpgradeEffects();
        saveState();
        render();

        itemElement?.classList.add(
            "purchased"
        );

        button?.classList.add("success");

        showPurchaseStamp(
            itemElement
        );

        window.setTimeout(
            () => {
                itemElement?.classList.remove(
                    "purchased"
                );

                button?.classList.remove(
                    "success"
                );
            },
            600
        );

        showToast(
            `${item.name} upgraded to level ${newLevel}.`
        );

        dispatch("item-purchased", {
            itemId,
            item: { ...item },
            price,
            level: newLevel,
            points: state.points
        });

        dispatch("points-spent", {
            amount: price,
            source: "shop",
            total: state.points
        });

        return true;
    }

    /* =====================================================
       PURCHASE STAMP
    ===================================================== */

    function showPurchaseStamp(container) {
        if (!container) {
            return;
        }

        const existing =
            container.querySelector(
                ".purchase-stamp"
            );

        existing?.remove();

        const stamp =
            document.createElement("div");

        stamp.className =
            "purchase-stamp";

        stamp.textContent =
            "BOUGHT";

        stamp.setAttribute(
            "aria-hidden",
            "true"
        );

        container.appendChild(stamp);

        requestAnimationFrame(() => {
            stamp.classList.add("show");
        });

        window.setTimeout(
            () => stamp.remove(),
            900
        );
    }

    /* =====================================================
       REBIRTH
    ===================================================== */

    function calculateRebirthReward() {
        const state = prepareState();

        if (
            state.lifetimePoints <
            REBIRTH_REQUIREMENT
        ) {
            return 0;
        }

        return Math.max(
            1,
            Math.floor(
                Math.sqrt(
                    state.lifetimePoints /
                    REBIRTH_REWARD_DIVISOR
                )
            )
        );
    }

    function canRebirth() {
        return calculateRebirthReward() > 0;
    }

    function rebirth(options = {}) {
        const reward =
            calculateRebirthReward();

        if (reward <= 0) {
            showToast(
                `Earn ${formatNumber(
                    REBIRTH_REQUIREMENT
                )} lifetime points first.`
            );

            return false;
        }

        const {
            skipConfirmation = false
        } = options;

        if (
            !skipConfirmation &&
            !window.confirm(
                [
                    "Rewind everything?",
                    "",
                    "This resets your current points and ordinary shop upgrades.",
                    `You will gain ${reward} permanent multiplier point${
                        reward === 1 ? "" : "s"
                    }.`
                ].join("\n")
            )
        ) {
            return false;
        }

        const state = prepareState();

        state.rebirths += 1;
        state.rebirthCurrency += reward;

        state.permanentMultiplier =
            1 +
            state.rebirthCurrency * 0.25;

        state.points = 0;
        state.pointsPerSecond = 1;
        state.clickPower = 1;
        state.shopMultiplier = 1;

        Object.keys(SHOP_ITEMS).forEach(
            (itemId) => {
                setItemLevel(itemId, 0);
            }
        );

        applyUpgradeEffects();
        saveState();
        render();

        showToast(
            `Tape rewound. Permanent multiplier is now ×${formatMultiplier(
                state.permanentMultiplier
            )}.`
        );

        dispatch("rebirth", {
            reward,
            rebirths: state.rebirths,
            rebirthCurrency:
                state.rebirthCurrency,
            permanentMultiplier:
                state.permanentMultiplier
        });

        return true;
    }

    /* =====================================================
       MODAL CONTROLS
    ===================================================== */

    function isOpen() {
        const backdrop =
            getElement("shop-backdrop");

        return Boolean(
            backdrop?.classList.contains("open") ||
            backdrop?.classList.contains("is-open")
        );
    }

    function open() {
        const backdrop =
            getElement("shop-backdrop");

        if (!backdrop || isOpen()) {
            return false;
        }

        focusedBeforeOpen =
            document.activeElement;

        backdrop.classList.remove(
            "closing"
        );

        backdrop.classList.add(
            "open",
            "is-open"
        );

        backdrop.setAttribute(
            "aria-hidden",
            "false"
        );

        document.body.classList.add(
            "shop-is-open"
        );

        render();

        window.setTimeout(
            () => {
                getElement("shop-close")
                    ?.focus();
            },
            50
        );

        dispatch("shop-opened");

        return true;
    }

    function close() {
        const backdrop =
            getElement("shop-backdrop");

        if (!backdrop || !isOpen()) {
            return false;
        }

        backdrop.classList.add(
            "closing"
        );

        backdrop.classList.remove(
            "open",
            "is-open"
        );

        document.body.classList.remove(
            "shop-is-open"
        );

        window.setTimeout(
            () => {
                backdrop.classList.remove(
                    "closing"
                );

                backdrop.setAttribute(
                    "aria-hidden",
                    "true"
                );
            },
            220
        );

        if (
            focusedBeforeOpen instanceof
            HTMLElement
        ) {
            focusedBeforeOpen.focus();
        }

        focusedBeforeOpen = null;

        dispatch("shop-closed");

        return true;
    }

    function toggle() {
        return isOpen()
            ? close()
            : open();
    }

    function trapFocus(event) {
        if (
            event.key !== "Tab" ||
            !isOpen()
        ) {
            return;
        }

        const modal =
            getElement("shop-modal");

        if (!modal) {
            return;
        }

        const focusable =
            Array.from(
                modal.querySelectorAll(
                    [
                        "button:not([disabled])",
                        "a[href]",
                        "input:not([disabled])",
                        "select:not([disabled])",
                        "textarea:not([disabled])",
                        "[tabindex]:not([tabindex='-1'])"
                    ].join(",")
                )
            ).filter(
                (element) =>
                    element.offsetParent !== null
            );

        if (focusable.length === 0) {
            return;
        }

        const first = focusable[0];
        const last =
            focusable[
                focusable.length - 1
            ];

        if (
            event.shiftKey &&
            document.activeElement === first
        ) {
            event.preventDefault();
            last.focus();
        } else if (
            !event.shiftKey &&
            document.activeElement === last
        ) {
            event.preventDefault();
            first.focus();
        }
    }

    /* =====================================================
       VHS MODE
    ===================================================== */

    function setVHSMode(enabled) {
        const state = prepareState();
        const active = Boolean(enabled);

        state.settings.vhsMode =
            active;

        document.body.classList.toggle(
            "vhs-mode",
            active
        );

        saveState();
        renderVHSButton();

        dispatch("vhs-mode-change", {
            enabled: active
        });

        return active;
    }

    function toggleVHSMode() {
        const state = prepareState();

        return setVHSMode(
            !state.settings.vhsMode
        );
    }

    function renderVHSButton() {
        const button =
            getElement("vhs-toggle");

        if (!button) {
            return;
        }

        const enabled =
            Boolean(
                prepareState()
                    .settings
                    .vhsMode
            );

        button.textContent =
            enabled
                ? "Disable"
                : "Enable";

        button.setAttribute(
            "aria-pressed",
            String(enabled)
        );
    }

    /* =====================================================
       SAVE IMPORT AND EXPORT
    ===================================================== */

    function exportSave() {
        const namespace = getNamespace();

        if (
            namespace.Save &&
            typeof namespace.Save.export === "function"
        ) {
            namespace.Save.export();

            showToast(
                "Save file exported."
            );

            return true;
        }

        showToast(
            "Save export is unavailable."
        );

        return false;
    }

    async function importSaveFile(file) {
        const namespace = getNamespace();

        if (
            !namespace.Save ||
            typeof namespace.Save.importFile !== "function"
        ) {
            throw new Error(
                "Save import is unavailable."
            );
        }

        const state =
            await namespace.Save.importFile(
                file
            );

        prepareState();
        applyUpgradeEffects();
        setVHSMode(
            Boolean(
                state.settings?.vhsMode
            )
        );

        render();

        showToast(
            "Save file imported."
        );

        dispatch("shop-save-imported", {
            state
        });

        return state;
    }

    /* =====================================================
       TOASTS
    ===================================================== */

    function showToast(
        message,
        duration = 2500
    ) {
        const toast =
            getElement("shop-toast");

        if (!toast) {
            return;
        }

        window.clearTimeout(
            toastTimer
        );

        toast.classList.remove(
            "show",
            "hide"
        );

        toast.textContent =
            String(message);

        void toast.offsetWidth;

        toast.classList.add("show");

        toastTimer =
            window.setTimeout(
                () => {
                    toast.classList.remove(
                        "show"
                    );

                    toast.classList.add(
                        "hide"
                    );

                    window.setTimeout(
                        () => {
                            toast.classList.remove(
                                "hide"
                            );
                        },
                        350
                    );
                },
                Math.max(
                    500,
                    safeInteger(
                        duration,
                        2500
                    )
                )
            );
    }

    /* =====================================================
       RENDERING
    ===================================================== */

    function formatMultiplier(value) {
        const multiplier = Math.max(
            1,
            safeNumber(value, 1)
        );

        return multiplier
            .toFixed(2)
            .replace(/\.00$/, "")
            .replace(/(\.\d)0$/, "$1");
    }

    function renderPoints() {
        const state = prepareState();

        const elements = [
            getElement("points-value"),
            getElement("shop-points-value")
        ];

        elements.forEach((element) => {
            if (element) {
                element.textContent =
                    formatNumber(
                        state.points
                    );
            }
        });
    }

    function renderMultiplier() {
        const state = prepareState();

        const multiplier =
            Math.max(
                1,
                safeNumber(
                    state.permanentMultiplier,
                    1
                )
            ) *
            Math.max(
                1,
                safeNumber(
                    state.shopMultiplier,
                    1
                )
            );

        state.totalMultiplier =
            multiplier;

        const element =
            getElement("multiplier-value");

        if (element) {
            element.textContent =
                `×${formatMultiplier(
                    multiplier
                )}`;
        }
    }

    function renderItem(itemId) {
        const item = getItem(itemId);

        if (!item) {
            return;
        }

        const container =
            document.querySelector(
                `[data-shop-item="${itemId}"]`
            );

        if (!container) {
            return;
        }

        const level =
            getItemLevel(itemId);

        const maximumReached =
            isMaximumLevel(itemId);

        const price =
            getItemPrice(itemId);

        const levelElement =
            container.querySelector(
                "[data-item-level]"
            );

        const priceElement =
            container.querySelector(
                "[data-item-price]"
            );

        const effectElement =
            container.querySelector(
                ".shop-item-effect"
            );

        const button =
            container.querySelector(
                `[data-buy-item="${itemId}"]`
            );

        if (levelElement) {
            levelElement.textContent =
                item.maximumLevel === null
                    ? String(level)
                    : `${level}/${item.maximumLevel}`;
        }

        if (priceElement) {
            priceElement.textContent =
                maximumReached
                    ? "MAX"
                    : formatNumber(price);
        }

        if (effectElement) {
            effectElement.textContent =
                item.effectText(level);
        }

        if (button) {
            button.disabled =
                maximumReached;

            button.textContent =
                maximumReached
                    ? "Maxed"
                    : "Buy";

            button.setAttribute(
                "aria-label",
                maximumReached
                    ? `${item.name} is at maximum level`
                    : `Buy ${item.name} for ${formatNumber(
                        price
                    )} points`
            );
        }

        container.classList.toggle(
            "cannot-afford",
            !maximumReached &&
            !canAfford(itemId)
        );

        container.classList.toggle(
            "maxed",
            maximumReached
        );
    }

    function renderRebirth() {
        const reward =
            calculateRebirthReward();

        const rewardElement =
            getElement(
                "rebirth-reward-value"
            );

        const button =
            getElement(
                "rebirth-button"
            );

        if (rewardElement) {
            rewardElement.textContent =
                reward > 0
                    ? `+${reward}`
                    : "×0";
        }

        if (button) {
            button.disabled =
                reward <= 0;

            button.textContent =
                reward > 0
                    ? `Rewind for +${reward}`
                    : "Rewind Everything";
        }
    }

    function render() {
        prepareState();

        renderPoints();
        renderMultiplier();
        renderVHSButton();
        renderRebirth();

        Object.keys(SHOP_ITEMS).forEach(
            renderItem
        );

        dispatch("shop-rendered", {
            points: getState().points,
            items: Object.keys(
                SHOP_ITEMS
            ).map((itemId) => ({
                id: itemId,
                level:
                    getItemLevel(itemId),
                price:
                    getItemPrice(itemId)
            }))
        });
    }

    /* =====================================================
       EVENT BINDING
    ===================================================== */

    function bindModalControls() {
        getElement("shop-open")
            ?.addEventListener(
                "click",
                open
            );

        getElement("shop-close")
            ?.addEventListener(
                "click",
                close
            );

        getElement("shop-backdrop")
            ?.addEventListener(
                "click",
                (event) => {
                    if (
                        event.target ===
                        event.currentTarget
                    ) {
                        close();
                    }
                }
            );

        document.addEventListener(
            "keydown",
            (event) => {
                if (
                    event.key === "Escape" &&
                    isOpen()
                ) {
                    close();
                }

                trapFocus(event);
            }
        );
    }

    function bindPurchaseButtons() {
        document.addEventListener(
            "click",
            (event) => {
                const button =
                    event.target.closest(
                        "[data-buy-item]"
                    );

                if (!button) {
                    return;
                }

                const itemId =
                    button.dataset.buyItem;

                purchaseItem(itemId);
            }
        );
    }

    function bindExtraControls() {
        getElement("rebirth-button")
            ?.addEventListener(
                "click",
                () => rebirth()
            );

        getElement("vhs-toggle")
            ?.addEventListener(
                "click",
                toggleVHSMode
            );

        getElement("save-export")
            ?.addEventListener(
                "click",
                exportSave
            );

        getElement("save-import")
            ?.addEventListener(
                "change",
                async (event) => {
                    const input =
                        event.currentTarget;

                    const file =
                        input.files?.[0];

                    if (!file) {
                        return;
                    }

                    try {
                        await importSaveFile(
                            file
                        );
                    } catch (error) {
                        console.error(
                            "Could not import save:",
                            error
                        );

                        showToast(
                            "That save file could not be imported."
                        );
                    } finally {
                        input.value = "";
                    }
                }
            );
    }

    function bindGameEvents() {
        [
            "elscorcho:points-earned",
            "elscorcho:points-spent",
            "elscorcho:saved",
            "elscorcho:loaded",
            "elscorcho:offline-progress",
            "elscorcho:reset",
            "elscorcho:imported"
        ].forEach((eventName) => {
            window.addEventListener(
                eventName,
                render
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
        applyUpgradeEffects();

        const state = getState();

        document.body.classList.toggle(
            "vhs-mode",
            Boolean(
                state.settings?.vhsMode
            )
        );

        bindModalControls();
        bindPurchaseButtons();
        bindExtraControls();
        bindGameEvents();

        render();
        saveState();

        dispatch("shop-init", {
            items: Object.keys(
                SHOP_ITEMS
            )
        });
    }

    /* =====================================================
       PUBLIC API
    ===================================================== */

    const namespace =
        getNamespace();

    namespace.Shop = {
        init,
        open,
        close,
        toggle,
        isOpen,

        render,
        showToast,

        getItem,
        getItemLevel,
        getItemPrice,
        canAfford,
        purchaseItem,

        applyUpgradeEffects,

        calculateRebirthReward,
        canRebirth,
        rebirth,

        setVHSMode,
        toggleVHSMode,

        exportSave,
        importSaveFile,

        items: SHOP_ITEMS
    };

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
