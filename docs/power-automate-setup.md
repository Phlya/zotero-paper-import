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
5. The trigger only says *that* a message was posted (its ID, whether it's a reply, and a link),
   not what it says, and it can report several messages at once. Click **+** under the trigger →
   **Add an action**, search for **For each** (**Control**) and select it. In *Select an output from
   previous steps*, choose **Insert expression** (the *fx* button), paste the following and click
   **Add**:
   ```
   triggerBody()?['value']
   ```
6. Inside the **For each**, click **+** → **Add an action**, search for **Send a Microsoft Graph
   HTTP request** (**Microsoft Teams**) and select it. This fetches the message itself; unlike
   *Get message details*, it also works for replies, which Teams stores under their parent post.
   - **URI**: **Insert expression**, paste the following (one line) and click **Add**:
     ```
     concat('https://graph.microsoft.com/v1.0/teams/', items('For_each')?['teamId'], '/channels/', items('For_each')?['channelId'], '/messages/', if(or(empty(items('For_each')?['replyToMessageId']), equals(items('For_each')?['replyToMessageId'], items('For_each')?['messageId'])), items('For_each')?['messageId'], concat(items('For_each')?['replyToMessageId'], '/replies/', items('For_each')?['messageId'])))
     ```
     For a post this asks for `…/messages/<post id>`, for a reply `…/messages/<post id>/replies/<reply id>`.
   - **Method**: **GET**.
7. Still inside the **For each**, below the HTTP request, click **+** → **Add an action**, search
   for **Create file** (**OneDrive for Business**) and select it. Fill it in:
   - **Folder Path**: click the folder icon and choose `/ZoteroInbox`.
   - **File Name**: **Insert expression**:
     ```
     concat(items('For_each')?['messageId'], '.json')
     ```
   - **File Content**: **Insert expression**:
     ```
     string(body('Send_a_Microsoft_Graph_HTTP_request'))
     ```
   The expressions refer to the steps by name, with spaces replaced by underscores. If your loop
   is called *Apply to each* (older designer) or you renamed a step, change `For_each` or
   `Send_a_Microsoft_Graph_HTTP_request` to match.
8. **Save**. If your organization blocks one of the connectors, Power Automate says so here.

The finished flow looks like this:

```
When a new channel message is added
└─ For each   (each message the trigger reports)
   ├─ Send a Microsoft Graph HTTP request   (GET the post or reply)
   └─ Create file   (/ZoteroInbox/<message id>.json, content = the message)
```

A correct file starts with something like `{"@odata.context":…,"id":"1792755836084","replyToId":…,"body":{"contentType":"html","content":"<p>…`.
If a file only contains `"changeType":"created"` and `"resourceData"`, the *File Content*
expression points at the trigger instead of the HTTP request; Zotero moves such files to
`ZoteroInbox/failed/` and shows a warning.

### Already set up the flow with *Get message details*?

That step fails for replies (*UnknownError*), because it can only look up top-level posts. Edit
the flow:

1. Inside the **For each**, add **Send a Microsoft Graph HTTP request** (Microsoft Teams) with the
   **URI** and **Method** from step 6 above. If your loop is called *Apply to each*, use
   `Apply_to_each` instead of `For_each` in the expression.
2. In **Create file**, replace the **File Content** expression with
   `string(body('Send_a_Microsoft_Graph_HTTP_request'))`. The file name can stay as it is.
3. Delete the **Get message details** step and **Save**.
4. To recover a reply that failed before the change: in the flow's **Run history**, open the
   failed run and click **Resubmit**.

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

- **Replies** are included with the flow above (the trigger fires for them too).
- **Older messages aren't imported.** For a backfill, copy the old messages from Teams and paste
  them into **Tools → Import Papers from Text…** (the Paper Link Import plugin).
- **Zotero must run sometime.** Messages wait in the folder until Zotero is open; nothing is lost
  while it's closed.
- **Edited messages** aren't picked up again; only the version when it was first posted.
