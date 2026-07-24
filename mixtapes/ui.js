```javascript
/* =========================================================
   EL SCORCHO
   ui.js

   Shared page interface for:
   - Points HUD
   - Current video information
   - Video progress display
   - Playback buttons
   - Like button
   - Keyboard shortcuts
   - Save controls
   - Status messages
   - Reduced-motion support
   - Module event synchronization
========================================================= */

(function () {
    "use strict";

    /* =====================================================
       CONFIGURATION
    ===================================================== */

    const UI_UPDATE_INTERVAL = 250;

    const VIDEO_LIKE_REWARD = 3;

    const SELECTORS = {
        pointsValue: "#points-value",
        shopPointsValue: "#shop-points-value",

        videoTitle: "#video-title",
        videoChannel: "#video-channel",
        videoNote: "[data-current-video-note]",

        currentTime: "#video-current-time",
        duration: "#video-duration",
        progress: "#video-progress",

        nextButton: "#video-next",
        previousButton: "#video-previous",
        randomButton: "#video-random",
        likeButton: "#video-like",

        shopOpen: "#shop-open",

        saveExport: "#save-export",
        saveImport: "#save-import",

        multiplierValue: "#multiplier-value"
    };

    /* =====================================================
       INTERNAL STATE
    ===================================================== */

    let initialized = false;
    let updateTimer = null;
    let progressDragging = false;
    let lastRenderedPoints = null;
    let lastRenderedVideoId = null;

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
            namespace.state = {
                points: 0,
                lifetimePoints: 0,
                likedVideos: [],
                settings: {}
            };
        }

        return namespace.state;
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
       BASIC HELPERS
    ===================================================== */

    function query(selector) {
        return document.querySelector(selector);
    }

    function queryAll(selector) {
        return Array.from(
            document.querySelectorAll(selector)
        );
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

    function formatNumber(value) {
        const number = Math.max(
            0,
            safeNumber(value)
        );

        if (number < 1000) {
            return Math.floor(number)
                .toLocaleString();
        }

        const suffixes = [
            {
                threshold: 1e12,
                suffix: "T"
            },
            {
                threshold: 1e9,
                suffix: "B"
            },
            {
                threshold: 1e6,
                suffix: "M"
            },
            {
                threshold: 1e3,
                suffix: "K"
            }
        ];

        const match = suffixes.find(
            (entry) =>
                number >= entry.threshold
        );

        if (!match) {
            return Math.floor(number)
                .toLocaleString();
        }

        const shortened =
            number / match.threshold;

        const decimals =
            shortened >= 100
                ? 0
                : shortened >= 10
                    ? 1
                    : 2;

        return (
            shortened
                .toFixed(decimals)
                .replace(
                    /\.0+$|(\.\d*[1-9])0+$/,
                    "$1"
                ) +
            match.suffix
        );
    }

    function formatMultiplier(value) {
        return Math.max(
            1,
            safeNumber(value, 1)
        )
            .toFixed(2)
            .replace(/\.00$/, "")
            .replace(/(\.\d)0$/, "$1");
    }

    function formatTime(seconds) {
        const totalSeconds =
            Math.max(
                0,
                safeInteger(seconds)
            );

        const hours =
            Math.floor(
                totalSeconds / 3600
            );

        const minutes =
            Math.floor(
                (
                    totalSeconds %
                    3600
                ) / 60
            );

        const remainingSeconds =
            totalSeconds % 60;

        if (hours > 0) {
            return [
                hours,
                String(minutes).padStart(
                    2,
                    "0"
                ),
                String(
                    remainingSeconds
                ).padStart(
                    2,
                    "0"
                )
            ].join(":");
        }

        return [
            minutes,
            String(
                remainingSeconds
            ).padStart(
                2,
                "0"
            )
        ].join(":");
    }

    function isTypingTarget(target) {
        if (!(target instanceof Element)) {
            return false;
        }

        return Boolean(
            target.closest(
                [
                    "input",
                    "textarea",
                    "select",
                    "[contenteditable='true']"
                ].join(",")
            )
        );
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

        if (
            !Array.isArray(
                state.likedVideos
            )
        ) {
            state.likedVideos = [];
        }

        if (
            !state.settings ||
            typeof state.settings !== "object" ||
            Array.isArray(state.settings)
        ) {
            state.settings = {};
        }

        return state;
    }

    /* =====================================================
       MODULE ACCESS
    ===================================================== */

    function getPlayerModule() {
        return getNamespace().Player || null;
    }

    function getFeedModule() {
        return getNamespace().Feed || null;
    }

    function getShopModule() {
        return getNamespace().Shop || null;
    }

    function getUpgradesModule() {
        return getNamespace().Upgrades || null;
    }

    function getCurrentVideo() {
        const feed = getFeedModule();

        if (
            feed &&
            typeof feed.getCurrentVideo ===
                "function"
        ) {
            return feed.getCurrentVideo();
        }

        if (
            feed &&
            typeof feed.getSelectedVideo ===
                "function"
        ) {
            return feed.getSelectedVideo();
        }

        const player = getPlayerModule();

        if (
            player &&
            typeof player.getCurrentVideo ===
                "function"
        ) {
            return player.getCurrentVideo();
        }

        return null;
    }

    function getCurrentVideoId() {
        const video = getCurrentVideo();

        if (video?.id) {
            return String(video.id);
        }

        const player = getPlayerModule();

        if (
            player &&
            typeof player.getVideoId ===
                "function"
        ) {
            return (
                player.getVideoId() ||
                null
            );
        }

        return null;
    }

    function getPlayerTime() {
        const player = getPlayerModule();

        if (!player) {
            return {
                currentTime: 0,
                duration: 0
            };
        }

        const currentTime =
            typeof player.getCurrentTime ===
                "function"
                ? safeNumber(
                    player.getCurrentTime()
                )
                : 0;

        const duration =
            typeof player.getDuration ===
                "function"
                ? safeNumber(
                    player.getDuration()
                )
                : 0;

        return {
            currentTime,
            duration
        };
    }

    /* =====================================================
       POINTS HUD
    ===================================================== */

    function renderPoints(options = {}) {
        const state = prepareState();
        const roundedPoints =
            Math.floor(state.points);

        if (
            !options.force &&
            roundedPoints ===
                lastRenderedPoints
        ) {
            return;
        }

        lastRenderedPoints =
            roundedPoints;

        const text =
            formatNumber(
                roundedPoints
            );

        [
            query(
                SELECTORS.pointsValue
            ),
            query(
                SELECTORS.shopPointsValue
            )
        ].forEach((element) => {
            if (element) {
                element.textContent = text;
            }
        });
    }

    function flashPoints(
        amount,
        type = "earned"
    ) {
        const hud =
            query("#points-hud");

        if (!hud) {
            return;
        }

        hud.classList.remove(
            "points-earned",
            "points-spent"
        );

        void hud.offsetWidth;

        hud.classList.add(
            type === "spent"
                ? "points-spent"
                : "points-earned"
        );

        const floating =
            document.createElement(
                "span"
            );

        floating.className =
            "points-float";

        floating.textContent =
            type === "spent"
                ? `-${formatNumber(
                    amount
                )}`
                : `+${formatNumber(
                    amount
                )}`;

        floating.setAttribute(
            "aria-hidden",
            "true"
        );

        hud.appendChild(floating);

        window.setTimeout(
            () => floating.remove(),
            1100
        );

        window.setTimeout(
            () => {
                hud.classList.remove(
                    "points-earned",
                    "points-spent"
                );
            },
            700
        );
    }

    /* =====================================================
       MULTIPLIER
    ===================================================== */

    function renderMultiplier() {
        const state = prepareState();
        const upgrades =
            getUpgradesModule();

        let multiplier =
            safeNumber(
                state.totalMultiplier,
                1
            );

        if (
            upgrades &&
            typeof upgrades.getEffects ===
                "function"
        ) {
            const effects =
                upgrades.getEffects();

            multiplier =
                safeNumber(
                    effects.totalMultiplier,
                    multiplier
                );
        }

        const element =
            query(
                SELECTORS.multiplierValue
            );

        if (element) {
            element.textContent =
                `×${formatMultiplier(
                    multiplier
                )}`;
        }
    }

    /* =====================================================
       CURRENT VIDEO INFO
    ===================================================== */

    function renderCurrentVideo(
        video = null,
        options = {}
    ) {
        const current =
            video || getCurrentVideo();

        if (!current) {
            return false;
        }

        const videoId =
            String(
                current.id || ""
            );

        if (
            !options.force &&
            videoId &&
            videoId === lastRenderedVideoId
        ) {
            renderLikeButton();
            return true;
        }

        lastRenderedVideoId =
            videoId || null;

        const title =
            current.title ||
            "El Scorcho";

        const channel =
            current.channel ||
            current.artist ||
            "Weezer";

        const note =
            current.note ||
            current.description ||
            "play this one loud";

        const titleElement =
            query(
                SELECTORS.videoTitle
            );

        const channelElement =
            query(
                SELECTORS.videoChannel
            );

        if (titleElement) {
            titleElement.textContent =
                title;
        }

        if (channelElement) {
            channelElement.textContent =
                channel;
        }

        queryAll(
            SELECTORS.videoNote
        ).forEach((element) => {
            element.textContent = note;
        });

        document.title =
            `${title} — El Scorcho`;

        renderLikeButton();

        dispatch(
            "ui-video-rendered",
            {
                video: {
                    ...current
                }
            }
        );

        return true;
    }

    /* =====================================================
       LIKE BUTTON
    ===================================================== */

    function isCurrentVideoLiked() {
        const state = prepareState();
        const videoId =
            getCurrentVideoId();

        if (!videoId) {
            return false;
        }

        return state.likedVideos.includes(
            videoId
        );
    }

    function renderLikeButton() {
        const button =
            query(
                SELECTORS.likeButton
            );

        if (!button) {
            return;
        }

        const liked =
            isCurrentVideoLiked();

        button.classList.toggle(
            "liked",
            liked
        );

        button.setAttribute(
            "aria-pressed",
            String(liked)
        );

        button.textContent =
            liked
                ? "♥ Liked"
                : "♥ Like";
    }

    function toggleCurrentVideoLike() {
        const state = prepareState();
        const videoId =
            getCurrentVideoId();

        if (!videoId) {
            showMessage(
                "No video is selected."
            );

            return false;
        }

        const existingIndex =
            state.likedVideos.indexOf(
                videoId
            );

        const wasLiked =
            existingIndex >= 0;

        if (wasLiked) {
            state.likedVideos.splice(
                existingIndex,
                1
            );
        } else {
            state.likedVideos.push(
                videoId
            );
        }

        let reward = 0;

        if (!wasLiked) {
            const upgrades =
                getUpgradesModule();

            if (
                upgrades &&
                typeof upgrades.calculateClickReward ===
                    "function" &&
                typeof upgrades.addPoints ===
                    "function"
            ) {
                reward =
                    upgrades.calculateClickReward(
                        VIDEO_LIKE_REWARD
                    );

                upgrades.addPoints(
                    reward,
                    "video-like"
                );
            } else {
                reward =
                    VIDEO_LIKE_REWARD;

                state.points += reward;
                state.lifetimePoints +=
                    reward;
            }
        }

        saveState();
        renderLikeButton();
        renderPoints({
            force: true
        });

        showMessage(
            wasLiked
                ? "Removed from your favorites."
                : `Video liked. +${formatNumber(
                    reward
                )} points.`
        );

        dispatch(
            "video-like-change",
            {
                videoId,
                liked: !wasLiked,
                reward
            }
        );

        return !wasLiked;
    }

    /* =====================================================
       VIDEO PROGRESS
    ===================================================== */

    function renderProgress() {
        const currentTimeElement =
            query(
                SELECTORS.currentTime
            );

        const durationElement =
            query(
                SELECTORS.duration
            );

        const progressElement =
            query(
                SELECTORS.progress
            );

        const {
            currentTime,
            duration
        } = getPlayerTime();

        if (currentTimeElement) {
            currentTimeElement.textContent =
                formatTime(
                    currentTime
                );
        }

        if (durationElement) {
            durationElement.textContent =
                formatTime(
                    duration
                );
        }

        if (
            progressElement &&
            !progressDragging
        ) {
            const progress =
                duration > 0
                    ? clamp(
                        currentTime /
                            duration,
                        0,
                        1
                    )
                    : 0;

            progressElement.value =
                String(
                    Math.round(
                        progress * 1000
                    )
                );

            progressElement.style.setProperty(
                "--video-progress",
                `${progress * 100}%`
            );
        }
    }

    function seekFromProgressInput() {
        const progress =
            query(
                SELECTORS.progress
            );

        const player =
            getPlayerModule();

        if (!progress || !player) {
            return;
        }

        const duration =
            getPlayerTime().duration;

        if (duration <= 0) {
            return;
        }

        const ratio =
            clamp(
                safeNumber(
                    progress.value
                ) / 1000,
                0,
                1
            );

        const targetTime =
            duration * ratio;

        if (
            typeof player.seekTo ===
                "function"
        ) {
            player.seekTo(
                targetTime,
                true
            );
        }

        renderProgress();
    }

    /* =====================================================
       VIDEO CONTROLS
    ===================================================== */

    function playNext() {
        const feed =
            getFeedModule();

        if (
            feed &&
            typeof feed.playNext ===
                "function"
        ) {
            feed.playNext({
                autoplay: true,
                scrollIntoView: true
            });

            return true;
        }

        return false;
    }

    function playPrevious() {
        const feed =
            getFeedModule();

        if (
            feed &&
            typeof feed.playPrevious ===
                "function"
        ) {
            feed.playPrevious({
                autoplay: true,
                scrollIntoView: true
            });

            return true;
        }

        return false;
    }

    function playRandom() {
        const feed =
            getFeedModule();

        if (
            feed &&
            typeof feed.playRandom ===
                "function"
        ) {
            feed.playRandom({
                autoplay: true,
                scrollIntoView: true
            });

            return true;
        }

        return false;
    }

    function togglePlayback() {
        const player =
            getPlayerModule();

        if (!player) {
            return false;
        }

        if (
            typeof player.togglePlayback ===
                "function"
        ) {
            player.togglePlayback();
            return true;
        }

        if (
            typeof player.isPlaying ===
                "function"
        ) {
            if (player.isPlaying()) {
                player.pause?.();
            } else {
                player.play?.();
            }

            return true;
        }

        return false;
    }

    function seekBy(seconds) {
        const player =
            getPlayerModule();

        if (!player) {
            return false;
        }

        if (
            typeof player.seekBy ===
                "function"
        ) {
            player.seekBy(seconds);
            return true;
        }

        if (
            typeof player.getCurrentTime ===
                "function" &&
            typeof player.seekTo ===
                "function"
        ) {
            const current =
                safeNumber(
                    player.getCurrentTime()
                );

            player.seekTo(
                Math.max(
                    0,
                    current + seconds
                ),
                true
            );

            return true;
        }

        return false;
    }

    /* =====================================================
       SHOP
    ===================================================== */

    function openShop() {
        const shop =
            getShopModule();

        if (
            shop &&
            typeof shop.open ===
                "function"
        ) {
            shop.open();
            return true;
        }

        return false;
    }

    /* =====================================================
       SAVE CONTROLS
    ===================================================== */

    function exportSave() {
        const namespace =
            getNamespace();

        if (
            namespace.Save &&
            typeof namespace.Save.export ===
                "function"
        ) {
            namespace.Save.export();

            showMessage(
                "Save file exported."
            );

            return true;
        }

        showMessage(
            "Save export is unavailable."
        );

        return false;
    }

    async function importSave(file) {
        const namespace =
            getNamespace();

        if (
            !namespace.Save ||
            typeof namespace.Save.importFile !==
                "function"
        ) {
            throw new Error(
                "Save import is unavailable."
            );
        }

        const state =
            await namespace.Save.importFile(
                file
            );

        getUpgradesModule()
            ?.recalculate?.({
                save: false
            });

        renderAll({
            force: true
        });

        showMessage(
            "Save imported."
        );

        dispatch(
            "ui-save-imported",
            { state }
        );

        return state;
    }

    /* =====================================================
       MESSAGES
    ===================================================== */

    function ensureMessageElement() {
        let element =
            document.getElementById(
                "ui-message"
            );

        if (element) {
            return element;
        }

        element =
            document.createElement(
                "div"
            );

        element.id = "ui-message";
        element.className =
            "ui-message";

        element.setAttribute(
            "role",
            "status"
        );

        element.setAttribute(
            "aria-live",
            "polite"
        );

        document.body.appendChild(
            element
        );

        return element;
    }

    function showMessage(
        message,
        duration = 2400
    ) {
        const shop =
            getShopModule();

        if (
            shop &&
            typeof shop.showToast ===
                "function"
        ) {
            shop.showToast(
                message,
                duration
            );

            return;
        }

        const element =
            ensureMessageElement();

        window.clearTimeout(
            showMessage.timer
        );

        element.textContent =
            String(message);

        element.classList.remove(
            "show",
            "hide"
        );

        void element.offsetWidth;

        element.classList.add(
            "show"
        );

        showMessage.timer =
            window.setTimeout(
                () => {
                    element.classList.remove(
                        "show"
                    );

                    element.classList.add(
                        "hide"
                    );
                },
                duration
            );
    }

    /* =====================================================
       BUTTON STATES
    ===================================================== */

    function renderButtonStates() {
        const video =
            getCurrentVideo();

        const disabled =
            !video;

        [
            SELECTORS.nextButton,
            SELECTORS.previousButton,
            SELECTORS.randomButton,
            SELECTORS.likeButton
        ].forEach((selector) => {
            const button =
                query(selector);

            if (button) {
                button.disabled =
                    disabled;
            }
        });
    }

    /* =====================================================
       BODY CLASSES
    ===================================================== */

    function renderSettings() {
        const state = prepareState();

        document.body.classList.toggle(
            "vhs-mode",
            Boolean(
                state.settings.vhsMode
            )
        );

        const reducedMotion =
            window.matchMedia?.(
                "(prefers-reduced-motion: reduce)"
            ).matches === true;

        document.body.classList.toggle(
            "reduced-motion",
            reducedMotion
        );
    }

    /* =====================================================
       FULL RENDER
    ===================================================== */

    function renderAll(options = {}) {
        renderPoints(options);
        renderMultiplier();
        renderCurrentVideo(
            null,
            options
        );
        renderProgress();
        renderButtonStates();
        renderSettings();

        dispatch(
            "ui-rendered"
        );
    }

    /* =====================================================
       EVENT BINDING
    ===================================================== */

    function bindButtons() {
        query(
            SELECTORS.nextButton
        )?.addEventListener(
            "click",
            playNext
        );

        query(
            SELECTORS.previousButton
        )?.addEventListener(
            "click",
            playPrevious
        );

        query(
            SELECTORS.randomButton
        )?.addEventListener(
            "click",
            playRandom
        );

        query(
            SELECTORS.likeButton
        )?.addEventListener(
            "click",
            toggleCurrentVideoLike
        );

        query(
            SELECTORS.shopOpen
        )?.addEventListener(
            "click",
            openShop
        );
    }

    function bindProgress() {
        const progress =
            query(
                SELECTORS.progress
            );

        if (!progress) {
            return;
        }

        progress.addEventListener(
            "pointerdown",
            () => {
                progressDragging = true;
            }
        );

        progress.addEventListener(
            "input",
            () => {
                progressDragging = true;

                const duration =
                    getPlayerTime().duration;

                const ratio =
                    clamp(
                        safeNumber(
                            progress.value
                        ) / 1000,
                        0,
                        1
                    );

                query(
                    SELECTORS.currentTime
                ).textContent =
                    formatTime(
                        duration * ratio
                    );

                progress.style.setProperty(
                    "--video-progress",
                    `${ratio * 100}%`
                );
            }
        );

        progress.addEventListener(
            "change",
            () => {
                seekFromProgressInput();
                progressDragging = false;
            }
        );

        progress.addEventListener(
            "pointerup",
            () => {
                seekFromProgressInput();
                progressDragging = false;
            }
        );

        progress.addEventListener(
            "pointercancel",
            () => {
                progressDragging = false;
            }
        );
    }

    function bindSaveControls() {
        query(
            SELECTORS.saveExport
        )?.addEventListener(
            "click",
            exportSave
        );

        query(
            SELECTORS.saveImport
        )?.addEventListener(
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
                    await importSave(file);
                } catch (error) {
                    console.error(
                        "Could not import save:",
                        error
                    );

                    showMessage(
                        "That save file could not be imported."
                    );
                } finally {
                    input.value = "";
                }
            }
        );
    }

    function bindKeyboard() {
        document.addEventListener(
            "keydown",
            (event) => {
                if (
                    event.defaultPrevented ||
                    isTypingTarget(
                        event.target
                    )
                ) {
                    return;
                }

                const shop =
                    getShopModule();

                if (
                    shop &&
                    typeof shop.isOpen ===
                        "function" &&
                    shop.isOpen()
                ) {
                    return;
                }

                switch (event.key) {
                    case " ":
                        event.preventDefault();
                        togglePlayback();
                        break;

                    case "ArrowRight":
                        event.preventDefault();
                        seekBy(5);
                        break;

                    case "ArrowLeft":
                        event.preventDefault();
                        seekBy(-5);
                        break;

                    case "ArrowDown":
                        event.preventDefault();
                        playNext();
                        break;

                    case "ArrowUp":
                        event.preventDefault();
                        playPrevious();
                        break;

                    case "l":
                    case "L":
                        event.preventDefault();
                        toggleCurrentVideoLike();
                        break;

                    case "r":
                    case "R":
                        event.preventDefault();
                        playRandom();
                        break;

                    case "s":
                    case "S":
                        event.preventDefault();
                        openShop();
                        break;

                    default:
                        break;
                }
            }
        );
    }

    function bindModuleEvents() {
        window.addEventListener(
            "elscorcho:points-earned",
            (event) => {
                renderPoints({
                    force: true
                });

                flashPoints(
                    event.detail?.amount || 0,
                    "earned"
                );
            }
        );

        window.addEventListener(
            "elscorcho:points-spent",
            (event) => {
                renderPoints({
                    force: true
                });

                flashPoints(
                    event.detail?.amount || 0,
                    "spent"
                );
            }
        );

        [
            "elscorcho:saved",
            "elscorcho:loaded",
            "elscorcho:imported",
            "elscorcho:reset",
            "elscorcho:deleted",
            "elscorcho:item-purchased",
            "elscorcho:upgrade-purchased",
            "elscorcho:upgrades-applied",
            "elscorcho:rebirth",
            "elscorcho:offline-progress"
        ].forEach((eventName) => {
            window.addEventListener(
                eventName,
                () => {
                    renderAll({
                        force: true
                    });
                }
            );
        });

        [
            "elscorcho:video-selected",
            "elscorcho:feed-video-selected",
            "elscorcho:video-change",
            "elscorcho:player-video-change",
            "elscorcho:player-ready",
            "elscorcho:feed-rendered"
        ].forEach((eventName) => {
            window.addEventListener(
                eventName,
                (event) => {
                    const video =
                        event.detail?.video ||
                        event.detail?.item ||
                        null;

                    lastRenderedVideoId =
                        null;

                    renderCurrentVideo(
                        video,
                        {
                            force: true
                        }
                    );

                    renderProgress();
                    renderButtonStates();
                }
            );
        });

        window.addEventListener(
            "elscorcho:vhs-mode-change",
            renderSettings
        );

        window.addEventListener(
            "elscorcho:video-like-change",
            renderLikeButton
        );
    }

    function bindVisibility() {
        document.addEventListener(
            "visibilitychange",
            () => {
                if (document.hidden) {
                    stopUpdateLoop();
                } else {
                    startUpdateLoop();

                    renderAll({
                        force: true
                    });
                }
            }
        );
    }

    /* =====================================================
       UPDATE LOOP
    ===================================================== */

    function update() {
        renderProgress();
        renderPoints();
    }

    function startUpdateLoop() {
        if (updateTimer !== null) {
            return;
        }

        updateTimer =
            window.setInterval(
                update,
                UI_UPDATE_INTERVAL
            );
    }

    function stopUpdateLoop() {
        if (updateTimer === null) {
            return;
        }

        window.clearInterval(
            updateTimer
        );

        updateTimer = null;
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

        bindButtons();
        bindProgress();
        bindSaveControls();
        bindKeyboard();
        bindModuleEvents();
        bindVisibility();

        renderAll({
            force: true
        });

        startUpdateLoop();

        dispatch(
            "ui-init"
        );
    }

    function destroy() {
        stopUpdateLoop();
        initialized = false;
    }

    /* =====================================================
       PUBLIC API
    ===================================================== */

    const namespace =
        getNamespace();

    namespace.UI = {
        init,
        destroy,

        render: renderAll,
        renderPoints,
        renderMultiplier,
        renderCurrentVideo,
        renderProgress,
        renderLikeButton,
        renderSettings,

        playNext,
        playPrevious,
        playRandom,
        togglePlayback,
        seekBy,

        toggleCurrentVideoLike,
        isCurrentVideoLiked,

        openShop,

        exportSave,
        importSave,

        showMessage,
        flashPoints,

        formatNumber,
        formatMultiplier,
        formatTime
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

