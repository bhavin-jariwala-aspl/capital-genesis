'use strict';

const crypto = require('crypto');

/**
 * DocumentShareService — shareable public links + engagement tracking.
 *
 * Authenticated callers create/list/revoke links and read analytics (tenant
 * context present → Prisma tenant-scope extension applies automatically).
 *
 * The PUBLIC surface (resolveByToken / recordEvent) is hit by unauthenticated
 * visitors, so there is NO tenant context: the extension skips scoping and the
 * lookup is by unguessable unique token. recordEvent therefore sets tenant_id
 * explicitly from the resolved link (the extension won't inject it).
 */
class DocumentShareService {
  constructor(prisma) {
    this.db = prisma;
  }

  // ── Authenticated management ────────────────────────────────────────────────

  async createLink(documentId, { expiresInDays = null, allowDownload = true, createdBy = null } = {}) {
    const doc = await this.db.document.findFirst({ where: { id: Number(documentId), deleted_at: null } });
    if (!doc) throw Object.assign(new Error('Document not found'), { statusCode: 404 });

    const token = crypto.randomBytes(24).toString('base64url'); // ~32 chars, URL-safe
    const expires_at = expiresInDays != null && Number(expiresInDays) > 0
      ? new Date(Date.now() + Number(expiresInDays) * 24 * 60 * 60 * 1000)
      : null;

    return this.db.documentShareLink.create({
      data: {
        document_id: doc.id,
        token,
        allow_download: Boolean(allowDownload),
        expires_at,
        created_by: createdBy != null ? String(createdBy) : null,
      },
    });
  }

  listLinks(documentId) {
    return this.db.documentShareLink.findMany({
      where: { document_id: Number(documentId) },
      orderBy: { created_at: 'desc' },
    });
  }

  async revokeLink(linkId) {
    return this.db.documentShareLink.update({
      where: { id: Number(linkId) },
      data: { is_active: false },
    });
  }

  /** Aggregate engagement for a document across all its share links. */
  async getAnalytics(documentId) {
    const id = Number(documentId);
    const [links, events, recent] = await Promise.all([
      this.db.documentShareLink.findMany({ where: { document_id: id } }),
      this.db.documentViewEvent.groupBy({
        by: ['event_type'],
        where: { document_id: id },
        _count: { _all: true },
      }),
      this.db.documentViewEvent.findMany({
        where: { document_id: id },
        orderBy: { viewed_at: 'desc' },
        take: 25,
      }),
    ]);

    const counts = events.reduce((acc, e) => { acc[e.event_type] = e._count._all; return acc; }, {});
    return {
      total_views: counts.view || 0,
      total_downloads: counts.download || 0,
      active_links: links.filter(l => l.is_active).length,
      total_links: links.length,
      links,
      recent_events: recent,
    };
  }

  // ── Public (unauthenticated) surface ────────────────────────────────────────

  /**
   * Resolve a live share link + its document by public token. Returns null when
   * the token is unknown, revoked, expired, or the document is deleted.
   * No tenant context here — lookup is by the unique unguessable token.
   */
  async resolveByToken(token) {
    if (!token) return null;
    const link = await this.db.documentShareLink.findFirst({ where: { token: String(token) } });
    if (!link || !link.is_active) return null;
    if (link.expires_at && link.expires_at.getTime() < Date.now()) return null;
    const document = await this.db.document.findFirst({ where: { id: link.document_id, deleted_at: null } });
    if (!document) return null;
    return { link, document };
  }

  /**
   * Record a view/download event for a resolved link and bump its counters.
   * tenant_id is set explicitly from the link because the public request has no
   * tenant context for the extension to inject.
   */
  async recordEvent(link, { type = 'view', ip = null, userAgent = null, referrer = null, durationSecs = null } = {}) {
    const eventType = type === 'download' ? 'download' : 'view';
    await this.db.documentViewEvent.create({
      data: {
        share_link_id: link.id,
        document_id: link.document_id,
        event_type: eventType,
        viewer_ip: ip ? String(ip).slice(0, 64) : null,
        user_agent: userAgent ? String(userAgent) : null,
        referrer: referrer ? String(referrer).slice(0, 500) : null,
        duration_secs: durationSecs != null ? Number(durationSecs) : null,
        tenant_id: link.tenant_id,
      },
    });
    // View events bump the counter; downloads don't double-count an open.
    if (eventType === 'view') {
      await this.db.documentShareLink.update({
        where: { id: link.id },
        data: { view_count: { increment: 1 }, last_viewed_at: new Date() },
      });
    }
  }
}

module.exports = DocumentShareService;
