
```javascript
/* =========================================================
   EL SCORCHO
   comments.js
   Comment creation, rendering, likes, replies, deletion,
   persistence, moderation, and comment rewards
========================================================= */

(function () {
    "use strict";

    /* =====================================================
       CONFIGURATION
    ===================================================== */

    const MAX_COMMENT_LENGTH = 500;
    const MAX_AUTHOR_LENGTH = 40;

    const POST_REWARD = 5;
    const LIKE_REWARD = 1;

    const DEFAULT_AUTHOR = "Anonymous Scorcho";

    const DEFAULT_AVATAR =
        "elscorcho/images/avatar-default.png";

    const SYSTEM_COMMENTS = [
        {
            id: "system-rivers",
            author: "El Scorcho Archive",
            avatar:
                "elscorcho/images/avatar-rivers.png",
            text:
                "How stupid is it? I can't talk about it.",
            createdAt: "1996-09-24T00:00:00.000Z",
            likes: 1996,
            likedByUser: false,
            pinned: true,
            verified: true,
            deletable: false,
            replyTo: null
        },
        {
            id: "system-pink-triangle",
            author: "Pink Triangle",
            avatar: DEFAULT_AVATAR,
            text:
                "This tape has been stuck in my stereo for several weeks.",
            createdAt: "2005-01-01T00:00:00.000Z",
            likes: 42,
            likedByUser: false,
            pinned: false,
            verified: false,
            deletable: false,
            replyTo: null
        }
    ];

    /* =====================================================
       INTERNAL STATE
    ===================================================== */

    let initialized = false;
    let replyingToId = null;
    let editingCommentId = null;

    /* =====================================================
       NAMESPACE AND STATE
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
                clickPower: 1,
                commentsPosted: 0,
                comments: [],
                settings: {}
            };
        }

        return namespace.state;
    }

    function prepareState() {
        const state = getState();

        if (!Array.isArray(state.comments)) {
            state.comments = [];
        }

        state.commentsPosted = safeInteger(
            state.commentsPosted
        );

        state.points = Math.max(
            0,
            safeNumber(state.points)
        );

        state.lifetimePoints = Math.max(
            state.points,
            safeNumber(state.lifetimePoints)
        );

        state.clickPower = Math.max(
            1,
            safeNumber(state.clickPower, 1)
        );

        return state;
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

    function safeString(value, fallback = "") {
        return typeof value === "string"
            ? value
            : fallback;
    }

    function clamp(value, minimum, maximum) {
        return Math.min(
            maximum,
            Math.max(minimum, value)
        );
    }

    function escapeHTML(value) {
        return String(value)
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    function generateId() {
        if (
            window.crypto &&
            typeof window.crypto.randomUUID === "function"
        ) {
            return window.crypto.randomUUID();
        }

        return [
            "comment",
            Date.now(),
            Math.random()
                .toString(36)
                .slice(2, 10)
        ].join("-");
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
        return safeInteger(value)
            .toLocaleString();
    }

    /* =====================================================
       COMMENT NORMALIZATION
    ===================================================== */

    function normalizeComment(comment) {
        const source =
            comment &&
            typeof comment === "object"
                ? comment
                : {};

        const text = safeString(
            source.text
        ).trim();

        return {
            id:
                safeString(source.id).trim() ||
                generateId(),

            author:
                safeString(
                    source.author,
                    DEFAULT_AUTHOR
                )
                    .trim()
                    .slice(0, MAX_AUTHOR_LENGTH) ||
                DEFAULT_AUTHOR,

            avatar:
                safeString(
                    source.avatar,
                    DEFAULT_AVATAR
                ).trim() ||
                DEFAULT_AVATAR,

            text:
                text.slice(
                    0,
                    MAX_COMMENT_LENGTH
                ),

            createdAt:
                isValidDate(source.createdAt)
                    ? new Date(
                        source.createdAt
                    ).toISOString()
                    : new Date().toISOString(),

            updatedAt:
                isValidDate(source.updatedAt)
                    ? new Date(
                        source.updatedAt
                    ).toISOString()
                    : null,

            likes: safeInteger(
                source.likes
            ),

            likedByUser:
                source.likedByUser === true,

            pinned:
                source.pinned === true,

            verified:
                source.verified === true,

            deletable:
                source.deletable !== false,

            replyTo:
                safeString(
                    source.replyTo
                ).trim() || null
        };
    }

    function isValidDate(value) {
        return Number.isFinite(
            Date.parse(value)
        );
    }

    function sanitizeStoredComments() {
        const state = prepareState();

        state.comments = state.comments
            .map(normalizeComment)
            .filter(
                (comment) =>
                    comment.text.length > 0
            );

        return state.comments;
    }

    /* =====================================================
       COMMENT ACCESS
    ===================================================== */

    function getUserComments() {
        return sanitizeStoredComments()
            .map(
                (comment) => ({
                    ...comment
                })
            );
    }

    function getAllComments() {
        const systemComments =
            SYSTEM_COMMENTS.map(
                normalizeComment
            );

        const userComments =
            sanitizeStoredComments();

        return [
            ...systemComments,
            ...userComments
        ].sort(compareComments);
    }

    function compareComments(a, b) {
        if (a.pinned !== b.pinned) {
            return a.pinned ? -1 : 1;
        }

        return (
            Date.parse(b.createdAt) -
            Date.parse(a.createdAt)
        );
    }

    function getCommentById(commentId) {
        return getAllComments().find(
            (comment) =>
                comment.id === commentId
        ) || null;
    }

    function getStoredCommentIndex(commentId) {
        const state = prepareState();

        return state.comments.findIndex(
            (comment) =>
                comment.id === commentId
        );
    }

    /* =====================================================
       AUTHOR PROFILE
    ===================================================== */

    function getAuthorProfile() {
        const state = prepareState();

        if (
            !state.settings ||
            typeof state.settings !== "object"
        ) {
            state.settings = {};
        }

        return {
            author:
                safeString(
                    state.settings.commentAuthor,
                    DEFAULT_AUTHOR
                )
                    .trim()
                    .slice(
                        0,
                        MAX_AUTHOR_LENGTH
                    ) ||
                DEFAULT_AUTHOR,

            avatar:
                safeString(
                    state.settings.commentAvatar,
                    DEFAULT_AVATAR
                ).trim() ||
                DEFAULT_AVATAR
        };
    }

    function setAuthorProfile(author, avatar) {
        const state = prepareState();

        if (
            !state.settings ||
            typeof state.settings !== "object"
        ) {
            state.settings = {};
        }

        state.settings.commentAuthor =
            safeString(
                author,
                DEFAULT_AUTHOR
            )
                .trim()
                .slice(
                    0,
                    MAX_AUTHOR_LENGTH
                ) ||
            DEFAULT_AUTHOR;

        state.settings.commentAvatar =
            safeString(
                avatar,
                DEFAULT_AVATAR
            ).trim() ||
            DEFAULT_AVATAR;

        saveState();

        dispatch("comment-profile-change", {
            author:
                state.settings.commentAuthor,
            avatar:
                state.settings.commentAvatar
        });

        return getAuthorProfile();
    }

    /* =====================================================
       RELATIVE TIME
    ===================================================== */

    function formatRelativeTime(dateValue) {
        const timestamp =
            Date.parse(dateValue);

        if (!Number.isFinite(timestamp)) {
            return "some time ago";
        }

        const elapsedSeconds =
            Math.floor(
                (Date.now() - timestamp) /
                1000
            );

        if (elapsedSeconds < 10) {
            return "just now";
        }

        if (elapsedSeconds < 60) {
            return `${elapsedSeconds} seconds ago`;
        }

        const minutes =
            Math.floor(
                elapsedSeconds / 60
            );

        if (minutes < 60) {
            return `${minutes} minute${
                minutes === 1 ? "" : "s"
            } ago`;
        }

        const hours =
            Math.floor(minutes / 60);

        if (hours < 24) {
            return `${hours} hour${
                hours === 1 ? "" : "s"
            } ago`;
        }

        const days =
            Math.floor(hours / 24);

        if (days < 30) {
            return `${days} day${
                days === 1 ? "" : "s"
            } ago`;
        }

        const months =
            Math.floor(days / 30);

        if (months < 12) {
            return `${months} month${
                months === 1 ? "" : "s"
            } ago`;
        }

        const years =
            Math.floor(days / 365);

        return `${years} year${
            years === 1 ? "" : "s"
        } ago`;
    }

    /* =====================================================
       REWARD HANDLING
    ===================================================== */

    function awardPoints(amount, source) {
        const state = prepareState();

        const cleanAmount =
            Math.max(
                0,
                safeNumber(amount)
            );

        if (cleanAmount <= 0) {
            return 0;
        }

        state.points += cleanAmount;
        state.lifetimePoints +=
            cleanAmount;

        dispatch("points-earned", {
            amount: cleanAmount,
            source,
            total: state.points
        });

        return cleanAmount;
    }

    /* =====================================================
       CREATING COMMENTS
    ===================================================== */

    function createComment(text, options = {}) {
        const cleanText =
            safeString(text)
                .trim()
                .slice(
                    0,
                    MAX_COMMENT_LENGTH
                );

        if (!cleanText) {
            showMessage(
                "Write something first.",
                "error"
            );

            return null;
        }

        const state = prepareState();
        const profile =
            getAuthorProfile();

        const comment =
            normalizeComment({
                id: generateId(),
                author:
                    options.author ||
                    profile.author,
                avatar:
                    options.avatar ||
                    profile.avatar,
                text: cleanText,
                createdAt:
                    new Date().toISOString(),
                likes: 0,
                likedByUser: false,
                pinned: false,
                verified: false,
                deletable: true,
                replyTo:
                    options.replyTo ||
                    replyingToId ||
                    null
            });

        state.comments.push(comment);
        state.commentsPosted += 1;

        const reward =
            awardPoints(
                POST_REWARD *
                state.clickPower,
                "comment"
            );

        replyingToId = null;
        editingCommentId = null;

        saveState();
        render();

        showMessage(
            `Comment posted. +${formatNumber(
                reward
            )} points.`,
            "success"
        );

        dispatch("comment-posted", {
            comment: { ...comment },
            reward,
            totalComments:
                state.commentsPosted
        });

        return { ...comment };
    }

    /* =====================================================
       EDITING COMMENTS
    ===================================================== */

    function beginEdit(commentId) {
        const index =
            getStoredCommentIndex(
                commentId
            );

        if (index < 0) {
            return false;
        }

        const state = prepareState();
        const comment =
            state.comments[index];

        editingCommentId =
            commentId;

        replyingToId = null;

        const input =
            getElement("comment-input");

        if (input) {
            input.value =
                comment.text;

            input.focus();

            input.setSelectionRange(
                input.value.length,
                input.value.length
            );
        }

        updateFormMode();

        dispatch("comment-edit-start", {
            comment: {
                ...normalizeComment(
                    comment
                )
            }
        });

        return true;
    }

    function updateComment(commentId, text) {
        const index =
            getStoredCommentIndex(
                commentId
            );

        if (index < 0) {
            return false;
        }

        const cleanText =
            safeString(text)
                .trim()
                .slice(
                    0,
                    MAX_COMMENT_LENGTH
                );

        if (!cleanText) {
            showMessage(
                "A comment cannot be empty.",
                "error"
            );

            return false;
        }

        const state = prepareState();
        const oldComment =
            normalizeComment(
                state.comments[index]
            );

        state.comments[index] = {
            ...oldComment,
            text: cleanText,
            updatedAt:
                new Date().toISOString()
        };

        editingCommentId = null;

        saveState();
        render();
        resetForm();

        showMessage(
            "Comment updated.",
            "success"
        );

        dispatch("comment-updated", {
            comment: {
                ...state.comments[index]
            }
        });

        return true;
    }

    /* =====================================================
       DELETING COMMENTS
    ===================================================== */

    function deleteComment(
        commentId,
        options = {}
    ) {
        const index =
            getStoredCommentIndex(
                commentId
            );

        if (index < 0) {
            return false;
        }

        const {
            skipConfirmation = false
        } = options;

        if (
            !skipConfirmation &&
            !window.confirm(
                "Delete this comment?"
            )
        ) {
            return false;
        }

        const state = prepareState();

        const removed =
            normalizeComment(
                state.comments[index]
            );

        state.comments.splice(
            index,
            1
        );

        if (
            editingCommentId ===
            commentId
        ) {
            editingCommentId = null;
            resetForm();
        }

        if (
            replyingToId ===
            commentId
        ) {
            replyingToId = null;
        }

        saveState();
        render();

        showMessage(
            "Comment deleted.",
            "success"
        );

        dispatch("comment-deleted", {
            comment: removed
        });

        return true;
    }

    /* =====================================================
       LIKES
    ===================================================== */

    function toggleLike(commentId) {
        const systemCommentIndex =
            SYSTEM_COMMENTS.findIndex(
                (comment) =>
                    comment.id ===
                    commentId
            );

        if (systemCommentIndex >= 0) {
            const comment =
                SYSTEM_COMMENTS[
                    systemCommentIndex
                ];

            const liked =
                comment.likedByUser ===
                true;

            comment.likedByUser =
                !liked;

            comment.likes =
                Math.max(
                    0,
                    safeInteger(
                        comment.likes
                    ) +
                    (liked ? -1 : 1)
                );

            render();

            dispatch("comment-liked", {
                commentId,
                liked:
                    comment.likedByUser,
                likes:
                    comment.likes,
                system: true
            });

            return {
                liked:
                    comment.likedByUser,
                likes:
                    comment.likes
            };
        }

        const index =
            getStoredCommentIndex(
                commentId
            );

        if (index < 0) {
            return null;
        }

        const state = prepareState();

        const comment =
            normalizeComment(
                state.comments[index]
            );

        const wasLiked =
            comment.likedByUser;

        comment.likedByUser =
            !wasLiked;

        comment.likes =
            Math.max(
                0,
                comment.likes +
                (
                    wasLiked
                        ? -1
                        : 1
                )
            );

        state.comments[index] =
            comment;

        let reward = 0;

        if (!wasLiked) {
            reward =
                awardPoints(
                    LIKE_REWARD,
                    "comment-like"
                );
        }

        saveState();
        updateCommentLikeUI(
            commentId,
            comment
        );

        dispatch("comment-liked", {
            commentId,
            liked:
                comment.likedByUser,
            likes:
                comment.likes,
            reward,
            system: false
        });

        return {
            liked:
                comment.likedByUser,
            likes:
                comment.likes,
            reward
        };
    }

    function updateCommentLikeUI(
        commentId,
        comment
    ) {
        const article =
            document.querySelector(
                `[data-comment-id="${CSS.escape(
                    commentId
                )}"]`
            );

        if (!article) {
            render();
            return;
        }

        const button =
            article.querySelector(
                "[data-comment-like]"
            );

        const score =
            article.querySelector(
                ".comment-score"
            );

        if (button) {
            button.classList.toggle(
                "liked",
                comment.likedByUser
            );

            button.setAttribute(
                "aria-pressed",
                String(
                    comment.likedByUser
                )
            );

            button.textContent =
                comment.likedByUser
                    ? "♥ Liked"
                    : "♥ Like";
        }

        if (score) {
            score.textContent =
                formatNumber(
                    comment.likes
                );
        }
    }

    /* =====================================================
       REPLIES
    ===================================================== */

    function beginReply(commentId) {
        const comment =
            getCommentById(
                commentId
            );

        if (!comment) {
            return false;
        }

        replyingToId =
            commentId;

        editingCommentId = null;

        const input =
            getElement("comment-input");

        if (input) {
            input.focus();

            if (!input.value.trim()) {
                input.value =
                    `@${comment.author} `;
            }

            input.setSelectionRange(
                input.value.length,
                input.value.length
            );
        }

        updateFormMode();

        dispatch("comment-reply-start", {
            comment: { ...comment }
        });

        return true;
    }

    function cancelFormMode() {
        replyingToId = null;
        editingCommentId = null;

        resetForm();

        dispatch(
            "comment-form-cancelled"
        );
    }

    /* =====================================================
       COMMENT MARKUP
    ===================================================== */

    function createCommentElement(comment) {
        const article =
            document.createElement(
                "article"
            );

        article.className =
            "comment";

        article.dataset.commentId =
            comment.id;

        if (comment.pinned) {
            article.classList.add(
                "pinned"
            );
        }

        if (comment.replyTo) {
            article.classList.add(
                "is-reply"
            );
        }

        const replyTarget =
            comment.replyTo
                ? getCommentById(
                    comment.replyTo
                )
                : null;

        const editedText =
            comment.updatedAt
                ? `<span class="comment-edited">edited</span>`
                : "";

        const verifiedHTML =
            comment.verified
                ? `
                    <span
                        class="verified"
                        title="Verified"
                        aria-label="Verified"
                    >
                        ●
                    </span>
                `
                : "";

        const pinnedHTML =
            comment.pinned
                ? `
                    <span class="comment-pin">
                        pinned
                    </span>
                `
                : "";

        const replyContextHTML =
            replyTarget
                ? `
                    <div class="comment-reply-context">
                        Replying to
                        ${escapeHTML(
                            replyTarget.author
                        )}
                    </div>
                `
                : "";

        const controlsHTML =
            comment.deletable
                ? `
                    <button
                        class="comment-edit"
                        type="button"
                        data-comment-edit="${escapeHTML(
                            comment.id
                        )}"
                    >
                        Edit
                    </button>

                    <button
                        class="comment-delete"
                        type="button"
                        data-comment-delete="${escapeHTML(
                            comment.id
                        )}"
                    >
                        Delete
                    </button>
                `
                : "";

        article.innerHTML = `
            <img
                class="comment-avatar-image"
                src="${escapeHTML(
                    comment.avatar
                )}"
                alt=""
                loading="lazy"
            >

            <div class="comment-content">

                ${replyContextHTML}

                <div class="comment-author">
                    ${escapeHTML(
                        comment.author
                    )}

                    ${verifiedHTML}
                    ${pinnedHTML}
                </div>

                <div class="comment-date">
                    <time
                        datetime="${escapeHTML(
                            comment.createdAt
                        )}"
                    >
                        ${escapeHTML(
                            formatRelativeTime(
                                comment.createdAt
                            )
                        )}
                    </time>

                    ${editedText}
                </div>

                <p class="comment-text"></p>

                <div class="comment-footer">

                    <button
                        class="comment-like${
                            comment.likedByUser
                                ? " liked"
                                : ""
                        }"
                        type="button"
                        data-comment-like="${escapeHTML(
                            comment.id
                        )}"
                        aria-pressed="${String(
                            comment.likedByUser
                        )}"
                    >
                        ${
                            comment.likedByUser
                                ? "♥ Liked"
                                : "♥ Like"
                        }
                    </button>

                    <span class="comment-score">
                        ${formatNumber(
                            comment.likes
                        )}
                    </span>

                    <button
                        class="comment-reply"
                        type="button"
                        data-comment-reply="${escapeHTML(
                            comment.id
                        )}"
                    >
                        Reply
                    </button>

                    ${controlsHTML}

                </div>

            </div>
        `;

        const textElement =
            article.querySelector(
                ".comment-text"
            );

        if (textElement) {
            textElement.textContent =
                comment.text;
        }

        const image =
            article.querySelector(
                "img"
            );

        image?.addEventListener(
            "error",
            () => {
                image.src =
                    DEFAULT_AVATAR;
            },
            { once: true }
        );

        return article;
    }

    /* =====================================================
       RENDERING
    ===================================================== */

    function render() {
        const list =
            getElement("comment-list");

        if (!list) {
            return false;
        }

        const comments =
            getAllComments();

        list.innerHTML = "";

        if (comments.length === 0) {
            list.innerHTML = `
                <div class="comments-empty">
                    no notebook comments yet
                </div>
            `;

            return true;
        }

        const fragment =
            document.createDocumentFragment();

        comments.forEach(
            (comment) => {
                fragment.appendChild(
                    createCommentElement(
                        comment
                    )
                );
            }
        );

        list.appendChild(fragment);

        updateFormMode();
        updateCharacterCounter();

        dispatch("comments-rendered", {
            comments:
                comments.map(
                    (comment) => ({
                        ...comment
                    })
                )
        });

        return true;
    }

    /* =====================================================
       FORM DISPLAY
    ===================================================== */

    function getSubmitButton() {
        return document.querySelector(
            "#comment-form .comment-submit"
        );
    }

    function ensureFormStatusElement() {
        const form =
            getElement("comment-form");

        if (!form) {
            return null;
        }

        let status =
            form.querySelector(
                ".comment-form-status"
            );

        if (!status) {
            status =
                document.createElement(
                    "div"
                );

            status.className =
                "comment-form-status";

            status.setAttribute(
                "aria-live",
                "polite"
            );

            form.prepend(status);
        }

        return status;
    }

    function ensureCharacterCounter() {
        const form =
            getElement("comment-form");

        if (!form) {
            return null;
        }

        let counter =
            form.querySelector(
                ".comment-character-count"
            );

        if (!counter) {
            counter =
                document.createElement(
                    "span"
                );

            counter.className =
                "comment-character-count";

            const actions =
                form.querySelector(
                    ".comment-actions"
                );

            actions?.prepend(counter);
        }

        return counter;
    }

    function ensureCancelButton() {
        const form =
            getElement("comment-form");

        if (!form) {
            return null;
        }

        let button =
            form.querySelector(
                ".comment-cancel"
            );

        if (!button) {
            button =
                document.createElement(
                    "button"
                );

            button.type = "button";
            button.className =
                "comment-cancel";
            button.textContent =
                "Cancel";

            button.addEventListener(
                "click",
                cancelFormMode
            );

            form.querySelector(
                ".comment-actions"
            )?.prepend(button);
        }

        return button;
    }

    function updateFormMode() {
        const status =
            ensureFormStatusElement();

        const cancelButton =
            ensureCancelButton();

        const submitButton =
            getSubmitButton();

        if (editingCommentId) {
            const comment =
                getCommentById(
                    editingCommentId
                );

            if (status) {
                status.textContent =
                    comment
                        ? `Editing your comment`
                        : "";
            }

            if (submitButton) {
                submitButton.textContent =
                    "Save Changes";
            }

            if (cancelButton) {
                cancelButton.hidden =
                    false;
            }

            return;
        }

        if (replyingToId) {
            const target =
                getCommentById(
                    replyingToId
                );

            if (status) {
                status.textContent =
                    target
                        ? `Replying to ${target.author}`
                        : "";
            }

            if (submitButton) {
                submitButton.textContent =
                    "Post Reply";
            }

            if (cancelButton) {
                cancelButton.hidden =
                    false;
            }

            return;
        }

        if (status) {
            status.textContent = "";
        }

        if (submitButton) {
            submitButton.textContent =
                "Post Comment";
        }

        if (cancelButton) {
            cancelButton.hidden = true;
        }
    }

    function updateCharacterCounter() {
        const input =
            getElement("comment-input");

        const counter =
            ensureCharacterCounter();

        if (!input || !counter) {
            return;
        }

        const remaining =
            MAX_COMMENT_LENGTH -
            input.value.length;

        counter.textContent =
            `${remaining} left`;

        counter.classList.toggle(
            "near-limit",
            remaining <= 50
        );

        counter.classList.toggle(
            "at-limit",
            remaining <= 0
        );
    }

    function resetForm() {
        const form =
            getElement("comment-form");

        form?.reset();

        replyingToId = null;
        editingCommentId = null;

        updateFormMode();
        updateCharacterCounter();
    }

    /* =====================================================
       MESSAGES
    ===================================================== */

    function showMessage(
        message,
        type = "info"
    ) {
        const namespace =
            getNamespace();

        if (
            namespace.Shop &&
            typeof namespace.Shop.showToast ===
                "function"
        ) {
            namespace.Shop.showToast(
                message
            );

            return;
        }

        let messageElement =
            getElement(
                "comment-message"
            );

        if (!messageElement) {
            messageElement =
                document.createElement(
                    "div"
                );

            messageElement.id =
                "comment-message";

            messageElement.className =
                "comment-message";

            getElement("comment-form")
                ?.after(
                    messageElement
                );
        }

        if (!messageElement) {
            return;
        }

        messageElement.textContent =
            String(message);

        messageElement.dataset.type =
            type;

        messageElement.classList.add(
            "show"
        );

        window.clearTimeout(
            showMessage.timer
        );

        showMessage.timer =
            window.setTimeout(
                () => {
                    messageElement.classList.remove(
                        "show"
                    );
                },
                2500
            );
    }

    /* =====================================================
       EVENT HANDLERS
    ===================================================== */

    function handleFormSubmit(event) {
        event.preventDefault();

        const input =
            getElement("comment-input");

        if (!input) {
            return;
        }

        if (editingCommentId) {
            updateComment(
                editingCommentId,
                input.value
            );

            return;
        }

        const created =
            createComment(
                input.value,
                {
                    replyTo:
                        replyingToId
                }
            );

        if (created) {
            resetForm();
        }
    }

    function handleCommentListClick(event) {
        const likeButton =
            event.target.closest(
                "[data-comment-like]"
            );

        if (likeButton) {
            toggleLike(
                likeButton.dataset
                    .commentLike
            );

            return;
        }

        const replyButton =
            event.target.closest(
                "[data-comment-reply]"
            );

        if (replyButton) {
            beginReply(
                replyButton.dataset
                    .commentReply
            );

            return;
        }

        const editButton =
            event.target.closest(
                "[data-comment-edit]"
            );

        if (editButton) {
            beginEdit(
                editButton.dataset
                    .commentEdit
            );

            return;
        }

        const deleteButton =
            event.target.closest(
                "[data-comment-delete]"
            );

        if (deleteButton) {
            deleteComment(
                deleteButton.dataset
                    .commentDelete
            );
        }
    }

    function bindEvents() {
        getElement("comment-form")
            ?.addEventListener(
                "submit",
                handleFormSubmit
            );

        getElement("comment-input")
            ?.addEventListener(
                "input",
                updateCharacterCounter
            );

        getElement("comment-list")
            ?.addEventListener(
                "click",
                handleCommentListClick
            );

        window.addEventListener(
            "elscorcho:imported",
            () => {
                sanitizeStoredComments();
                render();
            }
        );

        window.addEventListener(
            "elscorcho:reset",
            render
        );

        window.addEventListener(
            "elscorcho:deleted",
            render
        );
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
        sanitizeStoredComments();

        bindEvents();
        ensureFormStatusElement();
        ensureCharacterCounter();
        ensureCancelButton();

        render();
        updateCharacterCounter();

        dispatch("comments-init", {
            comments:
                getAllComments()
        });
    }

    /* =====================================================
       PUBLIC API
    ===================================================== */

    const namespace =
        getNamespace();

    namespace.Comments = {
        init,
        render,

        createComment,
        updateComment,
        deleteComment,

        beginReply,
        beginEdit,
        cancelFormMode,

        toggleLike,

        getAllComments,
        getUserComments,
        getCommentById,

        getAuthorProfile,
        setAuthorProfile,

        formatRelativeTime,

        limits: {
            commentLength:
                MAX_COMMENT_LENGTH,
            authorLength:
                MAX_AUTHOR_LENGTH
        },

        rewards: {
            post: POST_REWARD,
            like: LIKE_REWARD
        }
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
