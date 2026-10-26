/* global LinkParser */

/*
 * Teams-specific message handling: reading the files the Power Automate flow writes, and the
 * note that records where a paper was posted. No Zotero dependencies, so it can be unit-tested.
 */

var TeamsMessage = (function () {
	// In Zotero, core/linkParser.js is loaded into the same scope first; in Node (tests), require it
	const Links = typeof LinkParser !== "undefined" ? LinkParser : require("../../../core/linkParser.js");

	/**
	 * Read a Teams channel message as written by the Power Automate flow: the Graph
	 * chatMessage from "When a new channel message is added", either as-is or wrapped in
	 * { body: ... } (if the flow saved triggerOutputs() instead of triggerBody()).
	 *
	 * @return {{id, author, created, url, html, text, skip}} `text` is what to scan for links;
	 *     `skip` is true for system/deleted messages
	 */
	function parseTeamsMessage(json) {
		// The trigger itself only delivers a change notification ({ value: [{ resourceData, messageId,
		// linkToMessage, ... }] }) without the message text; the flow needs "Get message details" for that
		let list = json && Array.isArray(json.value) ? json.value : null;
		if (list && list.length && list.every(v => v && v.resourceData && !v.body)) {
			let e = new Error("The file contains only a Teams change notification, not the message");
			e.notificationOnly = true;
			e.linkToMessage = list[0].linkToMessage || null;
			throw e;
		}
		if (list && list.length === 1) json = list[0];
		let msg = json && json.body && json.body.body && typeof json.body.body === "object" ? json.body : json;
		if (!msg || typeof msg !== "object" || !msg.body) throw new Error("Not a Teams message");
		let html = (msg.body && msg.body.content) || "";
		// Link previews and cards can carry URLs outside the body
		let extra = (msg.attachments || [])
			.map(a => [a.contentUrl, typeof a.content === "string" ? a.content : JSON.stringify(a.content || "")].filter(Boolean).join(" "))
			.join("\n");
		return {
			id: msg.id || null,
			author: (msg.from && msg.from.user && msg.from.user.displayName) || null,
			created: msg.createdDateTime || null,
			url: msg.webUrl || msg.linkToMessage || null,
			html,
			text: extra ? html + "\n" + extra : html,
			skip: (msg.messageType && msg.messageType !== "message") || !!msg.deletedDateTime,
		};
	}

	/**
	 * Child note recording where a paper came from
	 */
	function messageToNoteHTML(message, { maxLength = 2000 } = {}) {
		let by = [
			message.author && `by ${Links.escapeHTML(message.author)}`,
			message.created && `on ${Links.escapeHTML(message.created.slice(0, 10))}`,
		].filter(Boolean).join(" ");
		let text = Links.htmlToText(message.html);
		if (text.length > maxLength) text = text.slice(0, maxLength) + "…";
		let link = message.url ? `<br/><a href="${Links.escapeHTML(message.url)}">Open message in Teams</a>` : "";
		return `<p><strong>Posted in Teams</strong>${by ? " " + by : ""}${link}</p>`
			+ (text ? `<blockquote><p>${Links.escapeHTML(text).replace(/\n/g, "<br/>")}</p></blockquote>` : "");
	}

	return { parseTeamsMessage, messageToNoteHTML };
})();

if (typeof module !== "undefined") {
	module.exports = TeamsMessage;
}
