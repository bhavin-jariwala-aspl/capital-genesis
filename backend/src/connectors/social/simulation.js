'use strict';

const crypto = require('node:crypto');
const SocialConnector = require('./base');

/**
 * SimulationConnector — A fully functional connector that simulates
 * social media platform APIs without requiring real API keys.
 *
 * Used for:
 *  - Demo environments (show the full publish → engage → mention flow)
 *  - Development and testing
 *  - CI/CD pipelines
 *
 * All operations succeed with realistic simulated responses. A small
 * random delay (50–200ms) is added to mimic network latency.
 */
class SimulationConnector extends SocialConnector {
  constructor() {
    super('simulation');
  }

  #delay() {
    const ms = 50 + Math.floor(Math.random() * 150);
    return new Promise(r => setTimeout(r, ms));
  }

  #id() {
    return `sim_${crypto.randomBytes(8).toString('hex')}`;
  }

  // ── Authentication ──────────────────────────────────────────

  /**
   * There is no simulated consent screen: the "authorization URL" is the
   * Genesis callback itself, carrying a fake code and the signed state, so an
   * admin clicking Authorize completes the whole OAuth round-trip instantly.
   */
  getAuthUrl(_account, { redirectUri, state } = {}) {
    const code = `sim_code_${crypto.randomBytes(8).toString('hex')}`;
    const params = new URLSearchParams({ code, state: state ?? '' });
    return `${redirectUri ?? 'https://sim.genesis-crm.local/oauth/callback'}?${params}`;
  }

  async handleCallback(_code, _account) {
    await this.#delay();
    const expiresIn = 3600 * 24 * 60; // 60 days
    return {
      access_token:  `sim_at_${crypto.randomBytes(20).toString('hex')}`,
      refresh_token: `sim_rt_${crypto.randomBytes(20).toString('hex')}`,
      expires_in:    expiresIn,
    };
  }

  async refreshToken(_account) {
    await this.#delay();
    return {
      access_token:  `sim_at_${crypto.randomBytes(20).toString('hex')}`,
      refresh_token: `sim_rt_${crypto.randomBytes(20).toString('hex')}`,
      expires_in:    3600 * 24 * 60,
    };
  }

  // ── Publishing ──────────────────────────────────────────────

  async publish(account, post) {
    await this.#delay();
    const platformPostId = `${account.platform}_${this.#id()}`;
    return {
      platform_post_id: platformPostId,
      post_url: `https://${account.platform}.com/p/${platformPostId}`,
      published_at: new Date(),
    };
  }

  async deletePost(_account, _platformPostId) {
    await this.#delay();
    return { deleted: true };
  }

  // ── Engagement & Mentions ───────────────────────────────────

  async getPostEngagement(_account, _platformPostId) {
    await this.#delay();
    return {
      likes:    Math.floor(Math.random() * 200) + 10,
      comments: Math.floor(Math.random() * 30) + 1,
      shares:   Math.floor(Math.random() * 50),
      views:    Math.floor(Math.random() * 5000) + 100,
    };
  }

  async getMentions(account, _since) {
    await this.#delay();
    const names = [
      { name: 'Alex Rivera', handle: 'arivera_tech' },
      { name: 'Priya Sharma', handle: 'priya_biz' },
      { name: 'Marcus Chen', handle: 'mchen_cto' },
    ];
    const sentiments = ['positive', 'neutral', 'negative'];
    const types = ['mention', 'hashtag', 'comment', 'tag'];
    const contents = [
      `Love what @${account.account_name} is building! The CRM space needs this.`,
      `Has anyone tried @${account.account_name}? Looking for alternatives to our current setup.`,
      `@${account.account_name} your latest feature update is exactly what we needed. Great work!`,
    ];

    // Return 0–2 simulated mentions per sync
    const count = Math.floor(Math.random() * 3);
    return Array.from({ length: count }, (_, i) => {
      const person = names[i % names.length];
      const sentiment = sentiments[Math.floor(Math.random() * sentiments.length)];
      return {
        content:        contents[i % contents.length],
        author_name:    person.name,
        author_handle:  person.handle,
        follower_count: Math.floor(Math.random() * 10000) + 500,
        sentiment,
        sentiment_score: sentiment === 'positive' ? 0.7 + Math.random() * 0.3
                       : sentiment === 'negative' ? -(0.3 + Math.random() * 0.5)
                       : Math.random() * 0.3 - 0.15,
        influence_score: Math.floor(Math.random() * 60) + 20,
        reach_estimate:  Math.floor(Math.random() * 8000) + 500,
        mention_type:    types[Math.floor(Math.random() * types.length)],
        mentioned_at:    new Date(Date.now() - Math.floor(Math.random() * 86400000)),
        requires_response: sentiment === 'negative' || Math.random() > 0.6,
        response_priority: sentiment === 'negative' ? 'high' : 'medium',
      };
    });
  }

  async sendReply(_account, _mentionId, _content) {
    await this.#delay();
    return {
      reply_id: this.#id(),
      sent_at:  new Date(),
    };
  }

  // ── Account Info ────────────────────────────────────────────

  async getProfileMetrics(account) {
    await this.#delay();
    // Simulate small fluctuations from current values
    const base = (v) => (v || 0) + Math.floor(Math.random() * 20) - 5;
    return {
      follower_count:  Math.max(0, base(account.follower_count)),
      following_count: Math.max(0, base(account.following_count)),
      post_count:      Math.max(0, (account.post_count || 0) + Math.floor(Math.random() * 3)),
    };
  }
}

module.exports = SimulationConnector;
