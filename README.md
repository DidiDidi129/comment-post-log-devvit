# Reddit Webhook Scanner

A [Devvit](https://developers.reddit.com/docs) app that listens to every post and comment submitted to your subreddit and forwards them to a webhook in real time.

Supports **Discord webhooks** (rich embeds with colour, author, fields) and **generic JSON webhooks** for any custom endpoint.

---

## What each notification includes

| Field | Description |
|---|---|
| **Author** | `u/username` as a clickable profile link |
| **Content** | Full post body or comment text (up to 1 000 characters preview) |
| **Direct link** | A URL straight to the post or comment |
| **Subreddit** | Which subreddit it came from |
| **Timestamp** | ISO-8601 timestamp of submission |

---

## Quick start

### 1. Install the Devvit CLI

```bash
npm install -g devvit
devvit login
```

### 2. Clone & install dependencies

```bash
git clone <this-repo>
cd devvit-webhook-scanner
npm install
```

### 3. Upload the app to Reddit

```bash
devvit upload
```

### 4. Install on your subreddit

```bash
devvit install r/YOUR_SUBREDDIT
```

### 5. Configure the webhook URL

Go to your subreddit → **Mod Tools** → **Apps** → find **webhook-scanner** → click **Settings**.

| Setting | Description |
|---|---|
| **Webhook URL** | The endpoint to POST to (Discord webhook URL or your own server) |
| **Webhook Type** | `discord` (rich embeds) or `generic` (plain JSON) |
| **Monitor Posts** | Toggle post scanning on/off |
| **Monitor Comments** | Toggle comment scanning on/off |

---

## Discord webhook payload example

```json
{
  "username": "Reddit Monitor",
  "embeds": [{
    "title": "My awesome post title",
    "url": "https://www.reddit.com/r/example/comments/abc123/...",
    "description": "Full post body here...",
    "color": 16729344,
    "author": {
      "name": "u/some_redditor",
      "url": "https://www.reddit.com/user/some_redditor"
    },
    "fields": [
      { "name": "📌 Subreddit", "value": "[r/example](...)", "inline": true },
      { "name": "👤 Author",    "value": "[u/some_redditor](...)", "inline": true },
      { "name": "🔗 Post Link", "value": "[View Post](...)", "inline": true }
    ],
    "timestamp": "2024-01-15T10:30:00.000Z"
  }]
}
```

## Generic JSON payload example

```json
{
  "event": "comment_submitted",
  "subreddit": "example",
  "comment_id": "t1_xyz789",
  "post_id": "t3_abc123",
  "body": "This is the comment text.",
  "author": {
    "username": "some_redditor",
    "profile_url": "https://www.reddit.com/user/some_redditor"
  },
  "comment_url": "https://www.reddit.com/r/example/comments/abc123/.../xyz789/",
  "created_at": "2024-01-15T10:31:00.000Z",
  "markdown_summary": "**New Comment in r/example**\n**Author:** [u/some_redditor](...)\n..."
}
```

---

## Local development / playtesting

```bash
devvit playtest r/YOUR_TEST_SUBREDDIT
```

This streams live logs to your terminal so you can see webhook fire confirmations or errors in real time.

---

## Notes

- The app only receives events **after** installation. It does not back-fill historical posts/comments.
- Devvit triggers fire for content in the subreddit where the app is installed only.
- The webhook URL is configured in an **app-scoped setting** so it can be stored as a secret in Devvit.
- Webhook type and monitor toggles remain **installation settings** so each subreddit can control behavior locally.
- If the webhook endpoint returns a non-2xx status, the error is logged in your app's Devvit console.
