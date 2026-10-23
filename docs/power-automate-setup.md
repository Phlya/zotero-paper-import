# Setting up the Teams → Zotero flow

A Power Automate flow saves every new message in your Teams channel as a small `.json` file in
your OneDrive. OneDrive syncs it to your Mac, and the Zotero plugin picks it up from there.
Nothing needs admin approval: the flow runs under your own account and uses the standard
Teams and OneDrive connectors.

```
Teams channel ──(Power Automate)──▶ OneDrive/ZoteroInbox/<message id>.json
                                         │ OneDrive sync
                                         ▼
                        Zotero plugin (checks every 5 min) ──▶ chosen library/collection
```

## 1. Create the inbox folder

In Finder, open your OneDrive (*OneDrive - Friedrich Miescher Institute…*) and create a folder
called **`ZoteroInbox`** at the top level, next to *Attachments*, *Meetings* etc.

To check the Zotero side before setting up the flow, copy
[`sample-message.json`](sample-message.json) into `ZoteroInbox` and choose
**Tools → Check Teams Inbox Now** in Zotero. It should add *Attention Is All You Need* to
the library chosen in settings; delete it afterwards.

## 2. Create the flow

1. Go to <https://make.powerautomate.com> and sign in with your FMI account.
2. **Create → Automated cloud flow**.
3. Name it *Teams papers to Zotero*. In *Choose your flow's trigger*, search for
   **When a new channel message is added** (Microsoft Teams) and select it. Click **Create**.
4. In the trigger, pick the **Team** and the **Channel** where papers are posted.
5. The trigger only says *that* a message was posted (its ID and a link), not what it says. To
   fetch the message itself, click **+** under the trigger → **Add an action**, search for
   **Get message details** (**Microsoft Teams**) and select it. Fill it in:
   - **Message**: click into the field, open the dynamic content list (the ⚡ button) and pick
     **Message ID** from the trigger. Power Automate wraps the step in a **For each** loop
     automatically, because the trigger can report several messages at once. That's expected.
   - **Message type**: **Channel**.
   - **Team** and **Channel**: pick the same team and channel as in the trigger (or the dynamic
     content **Team ID** / **Channel ID** from the trigger).
6. Inside the **For each**, below *Get message details*, click **+** → **Add an action**, search
   for **Create file** (**OneDrive for Business**) and select it. Fill it in:
   - **Folder Path**: click the folder icon and choose `/ZoteroInbox`.
   - **File Name**: pick the dynamic content **Message ID** from the trigger, then type `.json`
     right after it, so the field shows `[Message ID].json`.
   - **File Content**: choose **Insert expression** (the *fx* button), paste the following and
     click **Add**:
     ```
     string(body('Get_message_details'))
     ```
     If you renamed the *Get message details* step, use its new name with spaces replaced by
     underscores.
7. **Save**. If your organization blocks one of the connectors, Power Automate says so here.

The finished flow looks like this:

```
When a new channel message is added
└─ For each
   ├─ Get message details
   └─ Create file   (/ZoteroInbox/[Message ID].json, content = the message)
```

A correct file starts with something like `{"id":"1792755836084","replyToId":null,…,"body":{"contentType":"html","content":"<p>…`.
If a file only contains `"changeType":"created"` and `"resourceData"`, the *Get message details*
step is missing or the *File Content* expression points at the trigger instead of that step;
Zotero moves such files to `ZoteroInbox/failed/` and shows a warning.

## 3. Test it

1. Post a message with a paper link in the channel.
2. Within a few minutes (Power Automate checks for new messages periodically), a file like
   `1761217260000.json` appears in `ZoteroInbox`. In Power Automate, *My flows → Teams papers to
   Zotero* shows each run and any errors.
3. In Zotero, **Tools → Check Teams Inbox Now** (or wait up to 5 minutes). A popup reports what
   was added. The paper lands in the library and collection chosen in settings, with a child note saying who posted it,
   when, and a link back to the message. The file moves to `ZoteroInbox/processed/`.

## Settings

**Zotero → Settings → Teams Import**: turn automatic import on/off, choose the folder (empty means
`ZoteroInbox` in your OneDrive), the library (My Library or any group library you can edit) and
collection to save into, how often to check, and whether to download full text.

Duplicates are checked within the chosen library only: a paper that's in My Library but not in the
group library will be added to the group.

## Limits

- **Replies in threads probably aren't included.** The trigger is meant for new posts in the
  channel. If papers posted as replies don't arrive, tell me.
- **Older messages aren't imported.** For a backfill, copy the old messages from Teams and paste
  them into **Tools → Import Papers from Teams Text…**.
- **Zotero must run sometime.** Messages wait in the folder until Zotero is open; nothing is lost
  while it's closed.
- **Edited messages** aren't picked up again; only the version when it was first posted.
