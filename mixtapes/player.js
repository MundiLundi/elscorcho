```javascript
/* =========================================================
   EL SCORCHO
   player.js
   YouTube player setup, playback state, progress, and rewards
========================================================= */

(function () {
    "use strict";

    /* =====================================================
       CONFIGURATION
    ===================================================== */

    const DEFAULT_VIDEO_ID = "okthJIVbi6g";
    const PLAYER_ELEMENT_ID = "youtube-player";

    const POINT_INTERVAL_MS = 1000;
    const PROGRESS_INTERVAL_MS = 500;

    const DEFAULT_POINTS_PER_SECOND = 1;

    /* =====================================================
       INTERNAL STATE
    ===================================================== */

    let player = null;
    let apiReady = false;
    let playerReady = false;
    let pendingVideo = null;

    let pointTimer = null;
    let progressTimer = null;

    let lastKnownTime = 0;
    let lastRewardedSecond = -1;

    let playbackState = "unstarted";

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
                points: 0,
                lifetimePoints: 0,
                pointsPerSecond: 0,
                permanentMultiplier: 1,
                currentVideoId: DEFAULT_VIDEO_ID,
                currentVideoIndex: 0,
                watchedSeconds: 0,
                videosWatched: 0,
                settings: {
                    autoplayEnabled: true
                }
            };
        }

        return namespace.state;
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

    function getPlayerElement() {
        return document.getElementById(
            PLAYER_ELEMENT_ID
        );
    }

    function getVideoFrame() {
        return (
            document.querySelector(".video-frame") ||
            getPlayerElement()
        );
    }

    function getProgressElement() {
        return (
            document.getElementById("video-progress") ||
            document.querySelector(".video-progress")
        );
    }

    function getCurrentTimeElement() {
        return (
            document.getElementById("video-current-time") ||
            document.querySelector(".video-current-time")
        );
    }

    function getDurationElement() {
        return (
            document.getElementById("video-duration") ||
            document.querySelector(".video-duration")
        );
    }

    function formatTime(totalSeconds) {
        const seconds = Math.max(
            0,
            Math.floor(
                safeNumber(totalSeconds)
            )
        );

        const hours = Math.floor(
            seconds / 3600
        );

        const minutes = Math.floor(
            (seconds % 3600) / 60
        );

        const remainingSeconds =
            seconds % 60;

        const paddedSeconds = String(
            remainingSeconds
        ).padStart(2, "0");

        if (hours > 0) {
            return [
                hours,
                String(minutes).padStart(2, "0"),
                paddedSeconds
            ].join(":");
        }

        return `${minutes}:${paddedSeconds}`;
    }

    /* =====================================================
       YOUTUBE API
    ===================================================== */

    function loadYouTubeAPI() {
        if (
            window.YT &&
            typeof window.YT.Player === "function"
        ) {
            apiReady = true;
            createPlayer();

            return;
        }

        const existingScript =
            document.querySelector(
                'script[src*="youtube.com/iframe_api"]'
            );

        if (existingScript) {
            return;
        }

        const script =
            document.createElement("script");

        script.src =
            "https://www.youtube.com/iframe_api";

        script.async = true;

        const firstScript =
            document.getElementsByTagName("script")[0];

        if (firstScript) {
            firstScript.parentNode.insertBefore(
                script,
                firstScript
            );
        } else {
            document.head.appendChild(script);
        }
    }

    function createPlayer() {
        if (
            player ||
            !apiReady ||
            !getPlayerElement()
        ) {
            return;
        }

        const state = getState();

        const videoId =
            state.currentVideoId ||
            DEFAULT_VIDEO_ID;

        player = new window.YT.Player(
            PLAYER_ELEMENT_ID,
            {
                videoId,

                playerVars: {
                    autoplay: 0,
                    controls: 1,
                    rel: 0,
                    modestbranding: 1,
                    playsinline: 1,
                    enablejsapi: 1,
                    origin: window.location.origin
                },

                events: {
                    onReady: handlePlayerReady,
                    onStateChange:
                        handlePlayerStateChange,
                    onError: handlePlayerError
                }
            }
        );
    }

    window.onYouTubeIframeAPIReady = function () {
        apiReady = true;
        createPlayer();
    };

    /* =====================================================
       PLAYER EVENTS
    ===================================================== */

    function handlePlayerReady(event) {
        playerReady = true;
        player = event.target;

        const state = getState();

        if (pendingVideo) {
            const queuedVideo = pendingVideo;

            pendingVideo = null;

            loadVideo(
                queuedVideo.videoId,
                queuedVideo.options
            );
        } else if (
            state.watchedSeconds > 0 &&
            state.currentVideoId
        ) {
            try {
                player.seekTo(
                    state.watchedSeconds,
                    true
                );
            } catch (error) {
                console.warn(
                    "Could not restore video position:",
                    error
                );
            }
        }

        updateProgressDisplay();

        dispatch("player-ready", {
            player
        });
    }

    function handlePlayerStateChange(event) {
        const stateCode = event.data;

        switch (stateCode) {
            case window.YT.PlayerState.PLAYING:
                playbackState = "playing";
                handlePlay();
                break;

            case window.YT.PlayerState.PAUSED:
                playbackState = "paused";
                handlePause();
                break;

            case window.YT.PlayerState.ENDED:
                playbackState = "ended";
                handleEnded();
                break;

            case window.YT.PlayerState.BUFFERING:
                playbackState = "buffering";
                handleBuffering();
                break;

            case window.YT.PlayerState.CUED:
                playbackState = "cued";
                handleCued();
                break;

            default:
                playbackState = "unstarted";
                stopRewardLoop();
                updateFrameState();
        }

        dispatch("player-state-change", {
            state: playbackState,
            stateCode
        });
    }

    function handlePlayerError(event) {
        stopRewardLoop();
        stopProgressLoop();

        const errorCode = event.data;

        console.error(
            "YouTube player error:",
            errorCode
        );

        dispatch("player-error", {
            code: errorCode,
            videoId: getCurrentVideoId()
        });
    }

    /* =====================================================
       PLAYBACK HANDLERS
    ===================================================== */

    function handlePlay() {
        updateFrameState();

        startRewardLoop();
        startProgressLoop();

        dispatch("video-play", {
            videoId: getCurrentVideoId()
        });
    }

    function handlePause() {
        updateSavedPosition();
        updateFrameState();

        stopRewardLoop();
        stopProgressLoop();

        dispatch("video-pause", {
            videoId: getCurrentVideoId(),
            currentTime: getCurrentTime()
        });
    }

    function handleBuffering() {
        updateFrameState();

        stopRewardLoop();
        startProgressLoop();

        dispatch("video-buffering", {
            videoId: getCurrentVideoId()
        });
    }

    function handleCued() {
        stopRewardLoop();
        updateFrameState();
        updateProgressDisplay();
    }

    function handleEnded() {
        stopRewardLoop();
        stopProgressLoop();

        const state = getState();

        state.videosWatched =
            safeInteger(
                state.videosWatched
            ) + 1;

        state.watchedSeconds = 0;

        lastKnownTime = 0;
        lastRewardedSecond = -1;

        updateFrameState();
        updateProgressDisplay();

        saveState();

        dispatch("video-ended", {
            videoId: getCurrentVideoId(),
            videosWatched:
                state.videosWatched
        });

        const autoplayEnabled =
            !state.settings ||
            state.settings.autoplayEnabled !== false;

        if (
            autoplayEnabled &&
            getNamespace().Feed &&
            typeof getNamespace().Feed.playNext ===
                "function"
        ) {
            getNamespace().Feed.playNext();
        }
    }

    /* =====================================================
       PLAYBACK CONTROLS
    ===================================================== */

    function play() {
        if (
            playerReady &&
            player &&
            typeof player.playVideo === "function"
        ) {
            player.playVideo();
            return true;
        }

        return false;
    }

    function pause() {
        if (
            playerReady &&
            player &&
            typeof player.pauseVideo === "function"
        ) {
            player.pauseVideo();
            return true;
        }

        return false;
    }

    function stop() {
        if (
            playerReady &&
            player &&
            typeof player.stopVideo === "function"
        ) {
            player.stopVideo();

            stopRewardLoop();
            stopProgressLoop();

            return true;
        }

        return false;
    }

    function togglePlayback() {
        if (playbackState === "playing") {
            return pause();
        }

        return play();
    }

    function seekTo(seconds) {
        if (
            !playerReady ||
            !player ||
            typeof player.seekTo !== "function"
        ) {
            return false;
        }

        const duration = getDuration();

        const target = clamp(
            safeNumber(seconds),
            0,
            duration || Number.MAX_SAFE_INTEGER
        );

        player.seekTo(target, true);

        lastKnownTime = target;
        lastRewardedSecond =
            Math.floor(target) - 1;

        updateSavedPosition();
        updateProgressDisplay();

        dispatch("video-seek", {
            currentTime: target,
            duration
        });

        return true;
    }

    function setVolume(volume) {
        if (
            !playerReady ||
            !player ||
            typeof player.setVolume !== "function"
        ) {
            return false;
        }

        const cleanVolume = clamp(
            safeNumber(volume, 100),
            0,
            100
        );

        player.setVolume(cleanVolume);

        dispatch("volume-change", {
            volume: cleanVolume
        });

        return true;
    }

    function mute() {
        if (
            playerReady &&
            player &&
            typeof player.mute === "function"
        ) {
            player.mute();

            dispatch("mute-change", {
                muted: true
            });

            return true;
        }

        return false;
    }

    function unmute() {
        if (
            playerReady &&
            player &&
            typeof player.unMute === "function"
        ) {
            player.unMute();

            dispatch("mute-change", {
                muted: false
            });

            return true;
        }

        return false;
    }

    function toggleMute() {
        if (
            !playerReady ||
            !player ||
            typeof player.isMuted !== "function"
        ) {
            return false;
        }

        if (player.isMuted()) {
            return unmute();
        }

        return mute();
    }

    /* =====================================================
       VIDEO LOADING
    ===================================================== */

    function loadVideo(videoId, options = {}) {
        if (
            typeof videoId !== "string" ||
            !videoId.trim()
        ) {
            console.warn(
                "A valid YouTube video ID is required."
            );

            return false;
        }

        const cleanVideoId = videoId.trim();

        const {
            autoplay = false,
            startSeconds = 0,
            videoIndex = null
        } = options;

        const state = getState();

        state.currentVideoId = cleanVideoId;
        state.watchedSeconds = Math.max(
            0,
            safeNumber(startSeconds)
        );

        if (videoIndex !== null) {
            state.currentVideoIndex =
                safeInteger(videoIndex);
        }

        lastKnownTime =
            state.watchedSeconds;

        lastRewardedSecond =
            Math.floor(lastKnownTime) - 1;

        saveState();

        if (!playerReady || !player) {
            pendingVideo = {
                videoId: cleanVideoId,
                options
            };

            return true;
        }

        if (autoplay) {
            player.loadVideoById({
                videoId: cleanVideoId,
                startSeconds:
                    state.watchedSeconds
            });
        } else {
            player.cueVideoById({
                videoId: cleanVideoId,
                startSeconds:
                    state.watchedSeconds
            });
        }

        updateProgressDisplay();

        dispatch("video-loaded", {
            videoId: cleanVideoId,
            autoplay,
            startSeconds:
                state.watchedSeconds,
            videoIndex:
                state.currentVideoIndex
        });

        return true;
    }

    function loadPlaylistVideo(video, index = 0) {
        if (!video) {
            return false;
        }

        const videoId =
            typeof video === "string"
                ? video
                : video.id || video.videoId;

        const state = getState();

        const autoplay =
            !state.settings ||
            state.settings.autoplayEnabled !== false;

        return loadVideo(videoId, {
            autoplay,
            videoIndex: index
        });
    }

    /* =====================================================
       REWARD LOOP
    ===================================================== */

    function getRewardRate() {
        const state = getState();

        const baseRate = Math.max(
            DEFAULT_POINTS_PER_SECOND,
            safeNumber(
                state.pointsPerSecond,
                DEFAULT_POINTS_PER_SECOND
            )
        );

        const multiplier = Math.max(
            1,
            safeNumber(
                state.permanentMultiplier,
                1
            )
        );

        return baseRate * multiplier;
    }

    function awardWatchPoints() {
        if (
            playbackState !== "playing" ||
            !playerReady
        ) {
            return;
        }

        const currentTime = getCurrentTime();
        const currentSecond =
            Math.floor(currentTime);

        if (
            currentSecond < 0 ||
            currentSecond === lastRewardedSecond
        ) {
            return;
        }

        const elapsedSeconds = Math.max(
            1,
            currentSecond -
                lastRewardedSecond
        );

        const cappedElapsed = Math.min(
            elapsedSeconds,
            3
        );

        const pointsEarned =
            getRewardRate() *
            cappedElapsed;

        const state = getState();

        state.points =
            Math.max(
                0,
                safeNumber(state.points)
            ) + pointsEarned;

        state.lifetimePoints =
            Math.max(
                0,
                safeNumber(
                    state.lifetimePoints
                )
            ) + pointsEarned;

        state.watchedSeconds =
            currentTime;

        lastKnownTime = currentTime;
        lastRewardedSecond =
            currentSecond;

        dispatch("points-earned", {
            amount: pointsEarned,
            source: "watching",
            total: state.points,
            currentTime
        });
    }

    function startRewardLoop() {
        stopRewardLoop();

        pointTimer = window.setInterval(
            awardWatchPoints,
            POINT_INTERVAL_MS
        );
    }

    function stopRewardLoop() {
        if (pointTimer !== null) {
            window.clearInterval(pointTimer);
            pointTimer = null;
        }
    }

    /* =====================================================
       PROGRESS TRACKING
    ===================================================== */

    function getCurrentTime() {
        if (
            !playerReady ||
            !player ||
            typeof player.getCurrentTime !==
                "function"
        ) {
            return lastKnownTime;
        }

        return Math.max(
            0,
            safeNumber(
                player.getCurrentTime(),
                lastKnownTime
            )
        );
    }

    function getDuration() {
        if (
            !playerReady ||
            !player ||
            typeof player.getDuration !==
                "function"
        ) {
            return 0;
        }

        return Math.max(
            0,
            safeNumber(
                player.getDuration()
            )
        );
    }

    function getCurrentVideoId() {
        if (
            playerReady &&
            player &&
            typeof player.getVideoData ===
                "function"
        ) {
            const videoData =
                player.getVideoData();

            if (
                videoData &&
                videoData.video_id
            ) {
                return videoData.video_id;
            }
        }

        return (
            getState().currentVideoId ||
            DEFAULT_VIDEO_ID
        );
    }

    function updateSavedPosition() {
        const state = getState();
        const currentTime = getCurrentTime();

        state.watchedSeconds =
            currentTime;

        state.currentVideoId =
            getCurrentVideoId();

        lastKnownTime =
            currentTime;

        return currentTime;
    }

    function updateProgressDisplay() {
        const currentTime =
            getCurrentTime();

        const duration =
            getDuration();

        const progress =
            duration > 0
                ? clamp(
                    currentTime / duration,
                    0,
                    1
                )
                : 0;

        const progressElement =
            getProgressElement();

        if (progressElement) {
            if (
                progressElement instanceof
                HTMLProgressElement
            ) {
                progressElement.max = 1;
                progressElement.value =
                    progress;
            } else if (
                progressElement instanceof
                HTMLInputElement &&
                progressElement.type === "range"
            ) {
                progressElement.min = "0";
                progressElement.max = "1000";
                progressElement.value =
                    String(
                        Math.round(
                            progress * 1000
                        )
                    );
            } else {
                progressElement.style.setProperty(
                    "--video-progress",
                    `${progress * 100}%`
                );

                progressElement.style.width =
                    `${progress * 100}%`;
            }
        }

        const currentTimeElement =
            getCurrentTimeElement();

        if (currentTimeElement) {
            currentTimeElement.textContent =
                formatTime(currentTime);
        }

        const durationElement =
            getDurationElement();

        if (durationElement) {
            durationElement.textContent =
                formatTime(duration);
        }

        dispatch("video-progress", {
            currentTime,
            duration,
            progress
        });
    }

    function startProgressLoop() {
        if (progressTimer !== null) {
            return;
        }

        progressTimer = window.setInterval(
            () => {
                updateSavedPosition();
                updateProgressDisplay();
            },
            PROGRESS_INTERVAL_MS
        );
    }

    function stopProgressLoop() {
        if (progressTimer !== null) {
            window.clearInterval(
                progressTimer
            );

            progressTimer = null;
        }

        updateSavedPosition();
        updateProgressDisplay();
    }

    /* =====================================================
       DOM STATE
    ===================================================== */

    function updateFrameState() {
        const frame = getVideoFrame();

        if (!frame) {
            return;
        }

        frame.classList.remove(
            "is-playing",
            "is-paused",
            "is-loading",
            "is-ended"
        );

        if (playbackState === "playing") {
            frame.classList.add(
                "is-playing"
            );
        }

        if (playbackState === "paused") {
            frame.classList.add(
                "is-paused"
            );
        }

        if (playbackState === "buffering") {
            frame.classList.add(
                "is-loading"
            );
        }

        if (playbackState === "ended") {
            frame.classList.add(
                "is-ended"
            );
        }
    }

    function bindProgressControls() {
        const progressElement =
            getProgressElement();

        if (
            !progressElement ||
            !(
                progressElement instanceof
                HTMLInputElement
            ) ||
            progressElement.type !== "range"
        ) {
            return;
        }

        progressElement.addEventListener(
            "input",
            () => {
                const duration =
                    getDuration();

                if (duration <= 0) {
                    return;
                }

                const maximum =
                    safeNumber(
                        progressElement.max,
                        1000
                    );

                const ratio = clamp(
                    safeNumber(
                        progressElement.value
                    ) / maximum,
                    0,
                    1
                );

                seekTo(
                    duration * ratio
                );
            }
        );
    }

    function bindKeyboardControls() {
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
                    event.code === "Space"
                ) {
                    event.preventDefault();
                    togglePlayback();
                }

                if (
                    event.code === "ArrowRight"
                ) {
                    seekTo(
                        getCurrentTime() + 5
                    );
                }

                if (
                    event.code === "ArrowLeft"
                ) {
                    seekTo(
                        getCurrentTime() - 5
                    );
                }

                if (
                    event.key.toLowerCase() === "m"
                ) {
                    toggleMute();
                }
            }
        );
    }

    /* =====================================================
       SAVE INTEGRATION
    ===================================================== */

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

    function handlePageExit() {
        updateSavedPosition();
        saveState();
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
       INITIALIZATION
    ===================================================== */

    function init() {
        bindProgressControls();
        bindKeyboardControls();
        loadYouTubeAPI();

        dispatch("player-init");
    }

    /* =====================================================
       PUBLIC API
    ===================================================== */

    const namespace = getNamespace();

    namespace.Player = {
        init,

        play,
        pause,
        stop,
        togglePlayback,

        mute,
        unmute,
        toggleMute,
        setVolume,

        seekTo,
        loadVideo,
        loadPlaylistVideo,

        getPlayer() {
            return player;
        },

        isReady() {
            return playerReady;
        },

        getState() {
            return playbackState;
        },

        getCurrentTime,
        getDuration,
        getCurrentVideoId,
        getRewardRate,

        updateProgressDisplay
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

