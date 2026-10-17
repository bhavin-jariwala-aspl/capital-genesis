import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../src/services/document.service', () => ({ documentService: {
  getForRecord: vi.fn(), listShareLinks: vi.fn(), getAnalytics: vi.fn(), createShareLink: vi.fn(),
} }));
vi.mock('../src/components/runtime/DocumentChecklist', () => ({ default: () => null }));
vi.mock('../src/hooks/useDocumentPreviewEnabled', () => ({ useDocumentPreviewEnabled: () => false }));
import { documentService } from '../src/services/document.service';
import DocumentPanel from '../src/components/runtime/DocumentPanel';

// The Docs tab of a record shares a document by secure link (e.g. an information memorandum sent to an investor
// once the NDA is signed) — the same links and analytics as Document Management.
describe('DocumentPanel — share link from the Docs tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    documentService.getForRecord.mockResolvedValue({ data: [{ id: 9, filename: 'Information memorandum.pdf', file_size: 2048, category: 'deal_documents', created_at: new Date().toISOString() }] });
    documentService.listShareLinks.mockResolvedValue({ data: [] });
    documentService.getAnalytics.mockResolvedValue({ data: { total_views: 0, total_downloads: 0, active_links: 0 } });
    documentService.createShareLink.mockResolvedValue({ data: { id: 1, token: 'abc' } });
  });

  it('opens Share & Analytics for the document and creates a link', async () => {
    render(<QueryClientProvider client={new QueryClient()}><DocumentPanel recordId={50} relatedType="investor_target" /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole('button', { name: 'Share link' }));
    expect(await screen.findByText('Share & Analytics')).toBeTruthy();
    expect(documentService.listShareLinks).toHaveBeenCalledWith(9);
    fireEvent.click(await screen.findByRole('button', { name: /Create link/ }));
    await vi.waitFor(() => expect(documentService.createShareLink).toHaveBeenCalledWith(9, { expires_in_days: null, allow_download: true }));
  });
});
