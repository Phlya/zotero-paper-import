const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../plugin/content/linkParser.js");

// Shape of the Graph chatMessage that Power Automate's "When a new channel message is added" returns
const message = {
	id: "1761217260000",
	replyToId: null,
	messageType: "message",
	createdDateTime: "2026-10-23T11:01:00.000Z",
	deletedDateTime: null,
	from: { user: { id: "u1", displayName: "Jane Doe" } },
	body: {
		contentType: "html",
		content: '<p>Great paper on enhancers &amp; nanoscopy:</p><p><a href="https://www.cell.com/cell/abstract/S0092-8674(26)01130-X" rel="noreferrer noopener" target="_blank">https://www.cell.com/cell/abstract/S0092-8674(26)01130-X</a></p>',
	},
	attachments: [
		{ contentType: "reference", contentUrl: "https://fmich.sharepoint.com/sites/lab/Shared%20Documents/notes.docx", name: "notes.docx" },
		{ contentType: "application/vnd.microsoft.card.adaptive", content: '{"body":[{"type":"TextBlock","text":"https://arxiv.org/abs/2401.12345"}]}' },
	],
	webUrl: "https://teams.microsoft.com/l/message/19%3Aabc%40thread.tacv2/1761217260000",
};

test("parseTeamsMessage reads the trigger body", () => {
	let m = P.parseTeamsMessage(message);
	assert.equal(m.id, "1761217260000");
	assert.equal(m.author, "Jane Doe");
	assert.equal(m.created, "2026-10-23T11:01:00.000Z");
	assert.equal(m.url, message.webUrl);
	assert.equal(m.skip, false);
	assert.deepEqual(P.extractReferences(m.text).map(r => r.ids), [
		{ PII: "S009286742601130X" },
		{ arXiv: "2401.12345" },
	]);
});

test("parseTeamsMessage unwraps triggerOutputs()", () => {
	let m = P.parseTeamsMessage({ statusCode: 200, headers: {}, body: message });
	assert.equal(m.id, "1761217260000");
	assert.equal(m.author, "Jane Doe");
});

test("parseTeamsMessage rejects a bare trigger notification", () => {
	// What the trigger alone produces (IDs anonymized)
	let notification = {
		value: [{
			subscriptionId: "00000000-0000-0000-0000-000000000001",
			changeType: "created",
			clientState: "secretClientValue",
			resource: "teams('t1')/channels('19:c1@thread.tacv2')/messages('1792755836084')",
			resourceData: { id: "1792755836084", "@odata.type": "#Microsoft.Graph.chatMessage" },
			encryptedContent: null,
			teamId: "t1",
			channelId: "19:c1@thread.tacv2",
			messageId: "1792755836084",
			replyToMessageId: "1792755836084",
			linkToMessage: "https://teams.microsoft.com/l/message/19:c1@thread.tacv2/1792755836084",
		}],
	};
	assert.throws(() => P.parseTeamsMessage(notification), (e) => {
		assert.equal(e.notificationOnly, true);
		assert.equal(e.linkToMessage, notification.value[0].linkToMessage);
		return true;
	});
	assert.throws(() => P.parseTeamsMessage({ something: "else" }), /Not a Teams message/);
});

test("parseTeamsMessage unwraps a single-message value list", () => {
	assert.equal(P.parseTeamsMessage({ value: [message] }).id, "1761217260000");
});

test("parseTeamsMessage skips system and deleted messages", () => {
	assert.equal(P.parseTeamsMessage({ ...message, messageType: "systemEventMessage" }).skip, true);
	assert.equal(P.parseTeamsMessage({ ...message, deletedDateTime: "2026-10-23T12:00:00Z" }).skip, true);
	assert.throws(() => P.parseTeamsMessage(null));
});

test("messageToNoteHTML", () => {
	let html = P.messageToNoteHTML(P.parseTeamsMessage(message));
	assert.equal(html,
		'<p><strong>Posted in Teams</strong> by Jane Doe on 2026-10-23<br/>'
		+ '<a href="https://teams.microsoft.com/l/message/19%3Aabc%40thread.tacv2/1761217260000">Open message in Teams</a></p>'
		+ '<blockquote><p>Great paper on enhancers &amp; nanoscopy:<br/>https://www.cell.com/cell/abstract/S0092-8674(26)01130-X</p></blockquote>');
	let minimal = P.messageToNoteHTML({ html: "<b>x</b> <script>y</script>" });
	assert.equal(minimal, "<p><strong>Posted in Teams</strong></p><blockquote><p>x y</p></blockquote>");
	let long = P.messageToNoteHTML({ html: "a".repeat(50) }, { maxLength: 10 });
	assert.match(long, /a{10}…/);
});
