import { Devvit, SettingScope, type TriggerContext } from '@devvit/public-api';

// ─── Configure required Reddit API capabilities ───────────────────────────────
Devvit.configure({
  redditAPI: true,
  http: true,
});

// ─── App Settings ─────────────────────────────────────────────────────────────
Devvit.addSettings([
  {
    name: 'webhook-url',
    label: 'Webhook URL',
    helpText:
      'The URL to send POST requests to for this subreddit installation.',
    type: 'string',
    scope: SettingScope.Installation,
  },
  {
    name: 'webhook-type',
    label: 'Webhook Type',
    helpText: 'Choose "discord" for rich Discord embeds, or "generic" for plain JSON.',
    type: 'select',
    options: [
      { label: 'Discord', value: 'discord' },
      { label: 'Generic JSON', value: 'generic' },
    ],
    defaultValue: ['discord'],
    multiSelect: false,
    scope: SettingScope.Installation,
  },
  {
    name: 'monitor-posts',
    label: 'Monitor Posts',
    helpText: 'Send a webhook notification when a new post is submitted.',
    type: 'boolean',
    defaultValue: true,
    scope: SettingScope.Installation,
  },
  {
    name: 'monitor-comments',
    label: 'Monitor Comments',
    helpText: 'Send a webhook notification when a new comment is submitted.',
    type: 'boolean',
    defaultValue: true,
    scope: SettingScope.Installation,
  },
]);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Truncate text to a max length, appending "…" if cut.
 */
function truncate(text: string, max: number): string {
  if (!text) return '*(no content)*';
  return text.length <= max ? text : text.slice(0, max - 1) + '…';
}

/**
 * Format an epoch timestamp (seconds or milliseconds) as ISO-8601.
 * Returns undefined if the value is invalid.
 */
function toIso(epoch: number): string | undefined {
  if (!Number.isFinite(epoch) || epoch <= 0) return undefined;
  const epochMs = epoch >= 1_000_000_000_000 ? epoch : epoch * 1000;
  const date = new Date(epochMs);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

/**
 * Devvit select settings can be returned as either a single string or string[].
 */
function readSelectValue(value: string | string[] | undefined, fallback: string): string {
  if (Array.isArray(value) && value.length > 0) return value[0];
  return value ?? fallback;
}

/**
 * Build and send the webhook payload for a post.
 */
async function sendPostWebhook(
  context: TriggerContext,
  post: {
    id: string;
    title: string;
    body?: string;
    authorName: string;
    subredditName: string;
    url: string;
    createdAt: number; // epoch seconds
  }
): Promise<void> {
  const settings = await context.settings.getAll();
  const webhookUrl = (settings['webhook-url'] as string | undefined)?.trim();
  if (!webhookUrl) {
    console.error('[webhook-scanner] No webhook URL configured — skipping post event.');
    return;
  }

  const webhookType = readSelectValue(
    settings['webhook-type'] as string | string[] | undefined,
    'discord'
  );
  const monitorPosts = settings['monitor-posts'] as boolean ?? true;
  if (!monitorPosts) return;

  const profileUrl = `https://www.reddit.com/user/${post.authorName}`;
  const postUrl = post.url.startsWith('http') ? post.url : `https://www.reddit.com${post.url}`;
  const bodyPreview = truncate(post.body ?? '', 1000);
  const createdAtIso = toIso(post.createdAt);

  let payload: object;

  if (webhookType === 'discord') {
    payload = {
      username: 'Reddit Monitor',
      avatar_url: 'https://www.redditstatic.com/desktop2x/img/favicon/apple-icon-57x57.png',
      embeds: [
        {
          title: truncate(post.title, 256),
          url: postUrl,
          description: bodyPreview,
          color: 0xff4500, // Reddit orange
          author: {
            name: `u/${post.authorName}`,
            url: profileUrl,
            icon_url: `https://www.redditstatic.com/desktop2x/img/favicon/apple-icon-57x57.png`,
          },
          fields: [
            {
              name: '📌 Subreddit',
              value: `[r/${post.subredditName}](https://www.reddit.com/r/${post.subredditName})`,
              inline: true,
            },
            {
              name: '👤 Author',
              value: `[u/${post.authorName}](${profileUrl})`,
              inline: true,
            },
            {
              name: '🔗 Post Link',
              value: `[View Post](${postUrl})`,
              inline: true,
            },
          ],
          ...(createdAtIso ? { timestamp: createdAtIso } : {}),
        },
      ],
    };
  } else {
    // Generic JSON payload
    payload = {
      event: 'post_submitted',
      subreddit: post.subredditName,
      post_id: post.id,
      title: post.title,
      body: post.body ?? null,
      author: {
        username: post.authorName,
        profile_url: profileUrl,
      },
      post_url: postUrl,
      created_at: createdAtIso ?? null,
      markdown_summary: [
        `**New Post in r/${post.subredditName}**`,
        `**Author:** [u/${post.authorName}](${profileUrl})`,
        `**Title:** [${post.title}](${postUrl})`,
        post.body ? `**Content:**\n${bodyPreview}` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    };
  }

  await fireWebhook(webhookUrl, payload);
}

/**
 * Build and send the webhook payload for a comment.
 */
async function sendCommentWebhook(
  context: TriggerContext,
  comment: {
    id: string;
    body: string;
    authorName: string;
    subredditName: string;
    postId: string;
    postTitle?: string;
    permalink: string;
    createdAt: number; // epoch seconds
  }
): Promise<void> {
  const settings = await context.settings.getAll();
  const webhookUrl = (settings['webhook-url'] as string | undefined)?.trim();
  if (!webhookUrl) {
    console.error('[webhook-scanner] No webhook URL configured — skipping comment event.');
    return;
  }

  const webhookType = readSelectValue(
    settings['webhook-type'] as string | string[] | undefined,
    'discord'
  );
  const monitorComments = settings['monitor-comments'] as boolean ?? true;
  if (!monitorComments) return;

  const profileUrl = `https://www.reddit.com/user/${comment.authorName}`;
  const commentUrl = `https://www.reddit.com${comment.permalink}`;
  const bodyPreview = truncate(comment.body, 1000);
  const createdAtIso = toIso(comment.createdAt);

  let payload: object;

  if (webhookType === 'discord') {
    payload = {
      username: 'Reddit Monitor',
      avatar_url: 'https://www.redditstatic.com/desktop2x/img/favicon/apple-icon-57x57.png',
      embeds: [
        {
          title: `💬 New Comment${comment.postTitle ? ` on: ${truncate(comment.postTitle, 100)}` : ''}`,
          url: commentUrl,
          description: bodyPreview,
          color: 0x0079d3, // Reddit blue
          author: {
            name: `u/${comment.authorName}`,
            url: profileUrl,
            icon_url: `https://www.redditstatic.com/desktop2x/img/favicon/apple-icon-57x57.png`,
          },
          ...(createdAtIso ? { timestamp: createdAtIso } : {}),
        },
      ],
    };
  } else {
    payload = {
      event: 'comment_submitted',
      subreddit: comment.subredditName,
      comment_id: comment.id,
      post_id: comment.postId,
      body: comment.body,
      author: {
        username: comment.authorName,
        profile_url: profileUrl,
      },
      comment_url: commentUrl,
      created_at: createdAtIso ?? null,
      markdown_summary: [
        `**New Comment in r/${comment.subredditName}**`,
        `**Author:** [u/${comment.authorName}](${profileUrl})`,
        `**Comment:** [View Comment](${commentUrl})`,
        `**Content:**\n${bodyPreview}`,
      ].join('\n'),
    };
  }

  await fireWebhook(webhookUrl, payload);
}

/**
 * Send a JSON POST request to the webhook URL.
 */
async function fireWebhook(url: string, payload: object): Promise<void> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error(`[webhook-scanner] Webhook responded with ${res.status}: ${text}`);
    } else {
      console.log(`[webhook-scanner] Webhook fired successfully (${res.status}).`);
    }
  } catch (err) {
    console.error('[webhook-scanner] Failed to fire webhook:', err);
  }
}

// ─── Triggers ─────────────────────────────────────────────────────────────────

/**
 * Fires whenever a new post is submitted to a subreddit where this app is installed.
 */
Devvit.addTrigger({
  event: 'PostSubmit',
  onEvent: async (event, context) => {
    const post = event.post;
    if (!post) return;
    const authorName = event.author?.name ?? 'unknown';
    const subredditName = event.subreddit?.name ?? context.subredditName ?? 'unknown';

    console.log(`[webhook-scanner] PostSubmit: ${post.id} by u/${authorName}`);

    await sendPostWebhook(context, {
      id: post.id,
      title: post.title,
      body: post.selftext ?? undefined,
      authorName,
      subredditName,
      url: post.url,
      createdAt: post.createdAt,
    });
  },
});

/**
 * Fires whenever a new comment is submitted to a post in the subreddit.
 */
Devvit.addTrigger({
  event: 'CommentSubmit',
  onEvent: async (event, context) => {
    const comment = event.comment;
    if (!comment) return;
    const authorName = event.author?.name ?? 'unknown';
    const subredditName = event.subreddit?.name ?? context.subredditName ?? 'unknown';

    console.log(`[webhook-scanner] CommentSubmit: ${comment.id} by u/${authorName}`);

    // Optionally look up the parent post title for context
    let postTitle: string | undefined;
    try {
      const post = await context.reddit.getPostById(comment.postId);
      postTitle = post?.title;
    } catch {
      // Non-fatal — post title is just bonus context
    }

    await sendCommentWebhook(context, {
      id: comment.id,
      body: comment.body ?? '',
      authorName,
      subredditName,
      postId: comment.postId,
      postTitle,
      permalink: comment.permalink,
      createdAt: comment.createdAt,
    });
  },
});

// Devvit's bundler requires a default export from the entry file.
export default Devvit;
