'use strict';

/**
 * SocialConnector — Abstract base class for social media platform connectors.
 *
 * Every platform (Meta, LinkedIn, Twitter, WhatsApp) implements this interface.
 * The SimulationConnector provides a working demo without real API keys.
 *
 * Pattern matches: Salesforce SocialStudio, HubSpot Integration App Framework,
 * Zoho Social Channel Adapter.
 */
class SocialConnector {
  constructor(name) {
    if (new.target === SocialConnector) {
      throw new Error('SocialConnector is abstract — use a platform-specific subclass');
    }
    this.name = name;
  }

  // ── Authentication ──────────────────────────────────────────

  /**
   * Return the OAuth authorization URL to redirect the admin to.
   *
   * Genesis owns the callback: `GET /api/social-media/oauth/callback` receives
   * `code` + `state`, verifies the signed `state`, and calls `handleCallback`.
   * A connector must therefore forward both values to the platform.
   *
   * @param {object} account - SocialMediaAccount record
   * @param {{ redirectUri: string, state: string }} oauth - callback URL and the signed state Genesis expects back
   * @returns {string} Authorization URL
   */
  getAuthUrl(_account, _oauth) {
    throw new Error(`${this.name}.getAuthUrl() not implemented`);
  }

  /**
   * Exchange an OAuth authorization code for access + refresh tokens.
   * @param {string} code - Authorization code from callback
   * @param {object} account - SocialMediaAccount record
   * @returns {{ access_token: string, refresh_token?: string, expires_in?: number }}
   */
  async handleCallback(_code, _account) {
    throw new Error(`${this.name}.handleCallback() not implemented`);
  }

  /**
   * Refresh an expired access token using the stored refresh token.
   * @param {object} account - SocialMediaAccount record (has refresh_token)
   * @returns {{ access_token: string, refresh_token?: string, expires_in?: number }}
   */
  async refreshToken(_account) {
    throw new Error(`${this.name}.refreshToken() not implemented`);
  }

  // ── Publishing ──────────────────────────────────────────────

  /**
   * Publish a post to the platform.
   * @param {object} account - SocialMediaAccount record
   * @param {object} post - SocialMediaPost record (content, media_urls, post_type, etc.)
   * @returns {{ platform_post_id: string, post_url?: string, published_at: Date }}
   */
  async publish(_account, _post) {
    throw new Error(`${this.name}.publish() not implemented`);
  }

  /**
   * Delete a published post from the platform.
   * @param {object} account - SocialMediaAccount record
   * @param {string} platformPostId - Platform-specific post ID
   * @returns {{ deleted: boolean }}
   */
  async deletePost(_account, _platformPostId) {
    throw new Error(`${this.name}.deletePost() not implemented`);
  }

  // ── Engagement & Mentions ───────────────────────────────────

  /**
   * Fetch recent engagement metrics for a post.
   * @param {object} account - SocialMediaAccount record
   * @param {string} platformPostId - Platform-specific post ID
   * @returns {{ likes: number, comments: number, shares: number, views?: number }}
   */
  async getPostEngagement(_account, _platformPostId) {
    throw new Error(`${this.name}.getPostEngagement() not implemented`);
  }

  /**
   * Fetch recent mentions of the brand from the platform.
   * @param {object} account - SocialMediaAccount record
   * @param {Date} since - Fetch mentions after this date
   * @returns {Array<{ content, author_name, author_handle, sentiment, mentioned_at, ... }>}
   */
  async getMentions(_account, _since) {
    throw new Error(`${this.name}.getMentions() not implemented`);
  }

  /**
   * Send a reply to a mention or comment.
   *
   * `mentionId` is whatever the connector's own `getMentions()` put in the
   * mention's `post_url` (the platform's canonical URL or object id) — that is
   * the only per-mention identifier the schema stores, so a live connector
   * must populate it on ingest to be able to reply later.
   *
   * @param {object} account - SocialMediaAccount record
   * @param {string} mentionId - Platform-specific mention/comment identifier
   * @param {string} content - Reply text
   * @returns {{ reply_id: string, sent_at: Date }}
   */
  async sendReply(_account, _mentionId, _content) {
    throw new Error(`${this.name}.sendReply() not implemented`);
  }

  // ── Account Info ────────────────────────────────────────────

  /**
   * Fetch current profile metrics from the platform.
   * @param {object} account - SocialMediaAccount record
   * @returns {{ follower_count, following_count, post_count }}
   */
  async getProfileMetrics(_account) {
    throw new Error(`${this.name}.getProfileMetrics() not implemented`);
  }
}

module.exports = SocialConnector;
