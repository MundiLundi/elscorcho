
/* =========================================================
   EL SCORCHO
   feed.js
   Video feed rendering, selection, navigation, and playback
========================================================= */

(function () {
    "use strict";

    /* =====================================================
       VIDEO DATA
    ===================================================== */

    const DEFAULT_VIDEOS = [
        {
            id: "okthJIVbi6g",
            title: "El Scorcho",
            channel: "Weezer",
            duration: "4:04",
            views: "12M views",
            age: "8 years ago",
            thumbnail:
                "https://img.youtube.com/vi/okthJIVbi6g/hqdefault.jpg",
            note: "the main event",
            badge: "classic"
        },
        {
            id: "vGgWkvD2vGQ",
            title: "The Good Life",
            channel: "Weezer",
            duration: "4:19",
            views: "9M views",
            age: "8 years ago",
            thumbnail:
                "https://img.youtube.com/vi/vGgWkvD2vGQ/hqdefault.jpg",
            note: "play this one loud"
        },
        {
            id: "okthJIVbi6g",
            title: "El Scorcho — Replay",
            channel: "El Scorcho Archive",
            duration: "4:04",
            views: "favorite",
            age: "forever ago",
            thumbnail:
                "https://img.youtube.com/vi/okthJIVbi6g/hqdefault.jpg",
            note: "again, obviously"
        }
    ];

    /* =====================================================
       INTERNAL STATE
    ===================================================== */

    let videos = [];
    let selectedIndex = 0;
    let initialized = false;

    /* =====================================================
       HELPERS
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
                currentVideoId: "",
                currentVideoIndex: 0,
                settings: {
                    autoplayEnabled: true
                }
            };
        }

        return namespace.state;
    }

    function safeInteger(value, fallback = 0) {
        const number = Math.floor(Number(value));

        if (!Number.isFinite(number)) {
            return fallback;
        }

        return Math.max(0, number);
    }

    function dispatch(name, detail = {}) {
        window.dispatchEvent(
            new CustomEvent(
                `elscorcho:${name}`,
                { detail }
            )
        );
    }

    function getFeedElement() {
        return document.getElementById("feed");
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

    function escapeHTML(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function normalizeVideo(video, index) {
        const source =
            typeof video === "string"
                ? { id: video }
                : video || {};

        const id = String(
            source.id ||
            source.videoId ||
            ""
        ).trim();

        return {
            id,
            title:
                source.title ||
                `El Scorcho Video ${index + 1}`,
            channel:
                source.channel ||
                "El Scorcho",
            duration:
                source.duration ||
                "",
            views:
                source.views ||
                "",
            age:
                source.age ||
                "",
            thumbnail:
                source.thumbnail ||
                (
                    id
                        ? `https://img.youtube.com/vi/${id}/hqdefault.jpg`
                        : ""
                ),
            note:
                source.note ||
                "",
            badge:
                source.badge ||
                "",
            disabled:
                source.disabled === true
        };
    }

    function normalizeVideos(videoList) {
        if (!Array.isArray(videoList)) {
            return [];
        }

        return videoList
            .map(normalizeVideo)
            .filter((video) => video.id);
    }

    function getVideo(index) {
        if (videos.length === 0) {
            return null;
        }

        const safeIndex =
            ((index % videos.length) + videos.length) %
            videos.length;

        return videos[safeIndex] || null;
    }

    /* =====================================================
       FEED CARD CREATION
    ===================================================== */

    function createMetaHTML(video) {
        const meta = [];

        if (video.views) {
            meta.push(
                `<span>${escapeHTML(video.views)}</span>`
            );
        }

        if (video.age) {
            meta.push(
                `<span>${escapeHTML(video.age)}</span>`
            );
        }

        if (meta.length === 0) {
            return "";
        }

        return `
            <div class="feed-meta">
                ${meta.join("")}
            </div>
        `;
    }

    function createBadgeHTML(video) {
        if (!video.badge) {
            return "";
        }

        return `
            <div class="feed-badge">
                ${escapeHTML(video.badge)}
            </div>
        `;
    }

    function createDurationHTML(video) {
        if (!video.duration) {
            return "";
        }

        return `
            <span class="feed-duration">
                ${escapeHTML(video.duration)}
            </span>
        `;
    }

    function createNoteHTML(video) {
        if (!video.note) {
            return "";
        }

        return `
            <div class="feed-note">
                ${escapeHTML(video.note)}
            </div>
        `;
    }

    function createFeedCard(video, index) {
        const article =
            document.createElement("article");

        article.className = "feed-item";
        article.dataset.videoId = video.id;
        article.dataset.videoIndex =
            String(index);

        article.tabIndex =
            video.disabled ? -1 : 0;

        article.setAttribute(
            "role",
            "button"
        );

        article.setAttribute(
            "aria-label",
            `Play ${video.title}`
        );

        if (video.disabled) {
            article.classList.add("disabled");
            article.setAttribute(
                "aria-disabled",
                "true"
            );
        }

        article.innerHTML = `
            ${createBadgeHTML(video)}

            <div class="feed-tape"></div>

            <div class="feed-thumbnail">
                <img
                    src="${escapeHTML(video.thumbnail)}"
                    alt="${escapeHTML(video.title)}"
                    loading="lazy"
                >

                <span class="feed-play" aria-hidden="true">
                    ▶
                </span>

                ${createDurationHTML(video)}
            </div>

            <div class="feed-info">
                <div class="feed-title">
                    ${escapeHTML(video.title)}
                </div>

                <div class="feed-channel">
                    ${escapeHTML(video.channel)}
                </div>

                ${createMetaHTML(video)}
                ${createNoteHTML(video)}
            </div>
        `;

        article.addEventListener(
            "click",
            () => {
                if (!video.disabled) {
                    selectVideo(index, {
                        autoplay: true
                    });
                }
            }
        );

        article.addEventListener(
            "keydown",
            (event) => {
                if (video.disabled) {
                    return;
                }

                if (
                    event.key === "Enter" ||
                    event.key === " "
                ) {
                    event.preventDefault();

                    selectVideo(index, {
                        autoplay: true
                    });
                }
            }
        );

        const image =
            article.querySelector("img");

        if (image) {
            image.addEventListener(
                "error",
                () => {
                    image.src =
                        `https://img.youtube.com/vi/${video.id}/mqdefault.jpg`;
                },
                { once: true }
            );
        }

        return article;
    }

    /* =====================================================
       RENDERING
    ===================================================== */

    function render() {
        const feedElement =
            getFeedElement();

        if (!feedElement) {
            return false;
        }

        feedElement.innerHTML = "";

        if (videos.length === 0) {
            feedElement.innerHTML = `
                <div class="feed-empty">
                    no tapes in the box yet
                </div>
            `;

            return true;
        }

        const fragment =
            document.createDocumentFragment();

        videos.forEach((video, index) => {
            fragment.appendChild(
                createFeedCard(video, index)
            );
        });

        feedElement.appendChild(fragment);

        updateActiveCard();

        dispatch("feed-rendered", {
            videos: getVideos(),
            selectedIndex
        });

        return true;
    }

    function updateActiveCard() {
        const feedElement =
            getFeedElement();

        if (!feedElement) {
            return;
        }

        const cards =
            feedElement.querySelectorAll(
                ".feed-item"
            );

        cards.forEach((card) => {
            const cardIndex =
                safeInteger(
                    card.dataset.videoIndex
                );

            const active =
                cardIndex === selectedIndex;

            card.classList.toggle(
                "active",
                active
            );

            card.classList.toggle(
                "is-playing",
                active
            );

            card.setAttribute(
                "aria-current",
                active ? "true" : "false"
            );
        });
    }

    /* =====================================================
       VIDEO SELECTION
    ===================================================== */

    function selectVideo(index, options = {}) {
        if (videos.length === 0) {
            return false;
        }

        const cleanIndex =
            ((safeInteger(index) % videos.length) +
                videos.length) %
            videos.length;

        const video =
            videos[cleanIndex];

        if (!video || video.disabled) {
            return false;
        }

        const {
            autoplay = true,
            scrollIntoView = false
        } = options;

        selectedIndex = cleanIndex;

        const state = getState();

        state.currentVideoIndex =
            selectedIndex;

        state.currentVideoId =
            video.id;

        state.watchedSeconds = 0;

        updateActiveCard();
        updateVideoInformation(video);
        saveState();

        const namespace = getNamespace();

        if (
            namespace.Player &&
            typeof namespace.Player.loadVideo ===
                "function"
        ) {
            namespace.Player.loadVideo(
                video.id,
                {
                    autoplay,
                    startSeconds: 0,
                    videoIndex:
                        selectedIndex
                }
            );
        }

        if (scrollIntoView) {
            const card =
                document.querySelector(
                    `.feed-item[data-video-index="${selectedIndex}"]`
                );

            card?.scrollIntoView({
                behavior: "smooth",
                block: "nearest"
            });
        }

        dispatch("feed-selection", {
            video: { ...video },
            index: selectedIndex,
            autoplay
        });

        return true;
    }

    function updateVideoInformation(video) {
        const titleElements = [
            document.getElementById("video-title"),
            document.querySelector(".video-title"),
            document.querySelector(
                "[data-current-video-title]"
            )
        ].filter(Boolean);

        titleElements.forEach((element) => {
            element.textContent =
                video.title;
        });

        const channelElements = [
            document.getElementById("video-channel"),
            document.querySelector(".video-channel"),
            document.querySelector(
                "[data-current-video-channel]"
            )
        ].filter(Boolean);

        channelElements.forEach((element) => {
            element.textContent =
                video.channel;
        });

        const description =
            document.querySelector(
                "[data-current-video-note]"
            );

        if (description) {
            description.textContent =
                video.note || "";
        }

        document.title =
            `${video.title} — El Scorcho`;
    }

    /* =====================================================
       NAVIGATION
    ===================================================== */

    function playNext(options = {}) {
        if (videos.length === 0) {
            return false;
        }

        let nextIndex =
            selectedIndex;

        for (
            let attempts = 0;
            attempts < videos.length;
            attempts += 1
        ) {
            nextIndex =
                (nextIndex + 1) %
                videos.length;

            if (!videos[nextIndex].disabled) {
                return selectVideo(
                    nextIndex,
                    {
                        autoplay:
                            options.autoplay !== false,
                        scrollIntoView:
                            options.scrollIntoView === true
                    }
                );
            }
        }

        return false;
    }

    function playPrevious(options = {}) {
        if (videos.length === 0) {
            return false;
        }

        let previousIndex =
            selectedIndex;

        for (
            let attempts = 0;
            attempts < videos.length;
            attempts += 1
        ) {
            previousIndex =
                (
                    previousIndex -
                    1 +
                    videos.length
                ) %
                videos.length;

            if (
                !videos[previousIndex].disabled
            ) {
                return selectVideo(
                    previousIndex,
                    {
                        autoplay:
                            options.autoplay !== false,
                        scrollIntoView:
                            options.scrollIntoView === true
                    }
                );
            }
        }

        return false;
    }

    function playRandom() {
        if (videos.length === 0) {
            return false;
        }

        const availableIndexes =
            videos
                .map((video, index) => ({
                    video,
                    index
                }))
                .filter(
                    ({ video, index }) =>
                        !video.disabled &&
                        (
                            videos.length === 1 ||
                            index !== selectedIndex
                        )
                )
                .map(({ index }) => index);

        if (
            availableIndexes.length === 0
        ) {
            return selectVideo(
                selectedIndex,
                { autoplay: true }
            );
        }

        const randomIndex =
            availableIndexes[
                Math.floor(
                    Math.random() *
                    availableIndexes.length
                )
            ];

        return selectVideo(
            randomIndex,
            {
                autoplay: true,
                scrollIntoView: true
            }
        );
    }

    /* =====================================================
       VIDEO MANAGEMENT
    ===================================================== */

    function setVideos(videoList, options = {}) {
        const normalized =
            normalizeVideos(videoList);

        videos = normalized;

        const {
            preserveSelection = true,
            renderFeed = true
        } = options;

        if (videos.length === 0) {
            selectedIndex = 0;
        } else if (preserveSelection) {
            const currentId =
                getState().currentVideoId;

            const matchingIndex =
                videos.findIndex(
                    (video) =>
                        video.id === currentId
                );

            selectedIndex =
                matchingIndex >= 0
                    ? matchingIndex
                    : Math.min(
                        selectedIndex,
                        videos.length - 1
                    );
        } else {
            selectedIndex = 0;
        }

        if (renderFeed) {
            render();
        }

        dispatch("feed-updated", {
            videos: getVideos()
        });

        return getVideos();
    }

    function addVideo(video, options = {}) {
        const normalized =
            normalizeVideo(
                video,
                videos.length
            );

        if (!normalized.id) {
            return false;
        }

        const duplicate =
            videos.some(
                (existingVideo) =>
                    existingVideo.id ===
                        normalized.id &&
                    existingVideo.title ===
                        normalized.title
            );

        if (
            duplicate &&
            options.allowDuplicate !== true
        ) {
            return false;
        }

        videos.push(normalized);

        if (options.renderFeed !== false) {
            render();
        }

        dispatch("feed-video-added", {
            video: { ...normalized },
            index: videos.length - 1
        });

        return true;
    }

    function removeVideo(indexOrId) {
        let index = -1;

        if (
            typeof indexOrId === "number"
        ) {
            index =
                safeInteger(indexOrId);
        } else {
            index =
                videos.findIndex(
                    (video) =>
                        video.id ===
                        String(indexOrId)
                );
        }

        if (
            index < 0 ||
            index >= videos.length
        ) {
            return false;
        }

        const removed =
            videos.splice(index, 1)[0];

        if (videos.length === 0) {
            selectedIndex = 0;
        } else if (
            selectedIndex >= videos.length
        ) {
            selectedIndex =
                videos.length - 1;
        } else if (
            index < selectedIndex
        ) {
            selectedIndex -= 1;
        }

        render();

        dispatch("feed-video-removed", {
            video: { ...removed },
            index
        });

        return true;
    }

    function getVideos() {
        return videos.map(
            (video) => ({ ...video })
        );
    }

    function getCurrentVideo() {
        const video =
            getVideo(selectedIndex);

        return video
            ? { ...video }
            : null;
    }

    function getCurrentIndex() {
        return selectedIndex;
    }

    /* =====================================================
       PLAYER EVENT INTEGRATION
    ===================================================== */

    function handleVideoEnded() {
        const state = getState();

        const autoplay =
            !state.settings ||
            state.settings.autoplayEnabled !== false;

        if (autoplay) {
            playNext({
                autoplay: true,
                scrollIntoView: true
            });
        }
    }

    function handleVideoLoaded(event) {
        const videoId =
            event.detail?.videoId;

        if (!videoId) {
            return;
        }

        const index =
            videos.findIndex(
                (video) =>
                    video.id === videoId
            );

        if (index >= 0) {
            selectedIndex = index;
            updateActiveCard();
            updateVideoInformation(
                videos[index]
            );
        }
    }

    /* =====================================================
       KEYBOARD CONTROLS
    ===================================================== */

    function bindKeyboardNavigation() {
        document.addEventListener(
            "keydown",
            (event) => {
                const target = event.target;

                const isTyping =
                    target instanceof
                        HTMLInputElement ||
                    target instanceof
                        HTMLTextAreaElement ||
                    target?.isContentEditable;

                if (isTyping) {
                    return;
                }

                if (
                    event.key.toLowerCase() ===
                    "n"
                ) {
                    playNext({
                        autoplay: true,
                        scrollIntoView: true
                    });
                }

                if (
                    event.key.toLowerCase() ===
                    "p"
                ) {
                    playPrevious({
                        autoplay: true,
                        scrollIntoView: true
                    });
                }

                if (
                    event.key.toLowerCase() ===
                    "r"
                ) {
                    playRandom();
                }
            }
        );
    }

    /* =====================================================
       INITIALIZATION
    ===================================================== */

    function restoreSelection() {
        const state = getState();

        const savedIndex =
            safeInteger(
                state.currentVideoIndex
            );

        const savedVideoId =
            state.currentVideoId;

        const matchingIndex =
            videos.findIndex(
                (video) =>
                    video.id ===
                    savedVideoId
            );

        if (matchingIndex >= 0) {
            selectedIndex =
                matchingIndex;
        } else {
            selectedIndex =
                Math.min(
                    savedIndex,
                    Math.max(
                        0,
                        videos.length - 1
                    )
                );
        }

        const currentVideo =
            videos[selectedIndex];

        if (currentVideo) {
            state.currentVideoIndex =
                selectedIndex;

            state.currentVideoId =
                currentVideo.id;

            updateVideoInformation(
                currentVideo
            );
        }
    }

    function init(options = {}) {
        if (initialized) {
            return;
        }

        initialized = true;

        const initialVideos =
            options.videos ||
            window.EL_SCORCHO_VIDEOS ||
            DEFAULT_VIDEOS;

        videos =
            normalizeVideos(
                initialVideos
            );

        restoreSelection();
        render();
        bindKeyboardNavigation();

        window.addEventListener(
            "elscorcho:video-ended",
            handleVideoEnded
        );

        window.addEventListener(
            "elscorcho:video-loaded",
            handleVideoLoaded
        );

        dispatch("feed-init", {
            videos: getVideos(),
            selectedIndex
        });
    }

    /* =====================================================
       PUBLIC API
    ===================================================== */

    const namespace =
        getNamespace();

    namespace.Feed = {
        init,
        render,

        setVideos,
        addVideo,
        removeVideo,

        selectVideo,
        playNext,
        playPrevious,
        playRandom,

        getVideos,
        getCurrentVideo,
        getCurrentIndex
    };

    if (
        document.readyState === "loading"
    ) {
        document.addEventListener(
            "DOMContentLoaded",
            () => init(),
            { once: true }
        );
    } else {
        init();
    }
})();
