import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('../src/services/uploadLinks.service', () => ({ uploadLinksService: { checklist: vi.fn(), create: vi.fn(), describe: vi.fn(), upload: vi.fn() } }));
vi.mock('../src/hooks/useWorkspaceBranding', () => ({ useWorkspaceBranding: () => {} }));
import { uploadLinksService } from '../src/services/uploadLinks.service';
import UploadPage from '../src/pages/UploadPage';
import DocumentChecklist from '../src/components/runtime/DocumentChecklist';

const INFO = {
  tenant_id: 7, workspace: 'Genesis Capital', reference: 'LA-2026-000050', what: 'Loan Application', expires_at: '2026-10-29T00:00:00Z', outstanding: 1,
  items: [{ label: 'Applicant ID', category: 'kyc_id', required: true, received: true }, { label: 'Valuation report', category: 'valuation', required: true, received: false }],
};

describe('UploadPage (client)', () => {
  beforeEach(() => { vi.clearAllMocks(); uploadLinksService.describe.mockResolvedValue({ data: INFO }); });

  it('shows what is still needed for the record', async () => {
    render(<MemoryRouter initialEntries={['/upload/gul1.a.b']}><Routes><Route path="/upload/:token" element={<UploadPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByText('LA-2026-000050')).toBeTruthy();
    expect(screen.getByText('1 document still needed. Upload each one below — a photo or a PDF is fine.')).toBeTruthy();
    expect(screen.getByText('Received — thank you')).toBeTruthy();
    expect(screen.getByRole('button', { name: /^Upload$/ })).toBeTruthy();
  });

  it('explains an expired link without detail', async () => {
    uploadLinksService.describe.mockRejectedValue({ response: { status: 404 } });
    render(<MemoryRouter initialEntries={['/upload/gul1.a.b']}><Routes><Route path="/upload/:token" element={<UploadPage />} /></Routes></MemoryRouter>);
    expect(await screen.findByText('This link no longer works')).toBeTruthy();
  });
});

describe('DocumentChecklist (staff Docs tab)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    uploadLinksService.checklist.mockResolvedValue({ data: {
      outstanding: 1, categories: [],
      checklists: [{ id: 1, label: 'Real estate loan', items: [
        { label: 'Applicant ID', category: 'kyc_id', required: true, received: true, documents: [{ id: 3, filename: 'id.pdf', status: 'approved' }] },
        { label: 'Valuation report', category: 'valuation', required: true, received: false, documents: [] },
      ] }],
    } });
    uploadLinksService.create.mockResolvedValue({ data: { url: 'http://localhost:5173/upload/gul1.x.y', expires_at: '2026-10-29T00:00:00Z' } });
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue() } });
  });

  const renderList = () => render(<QueryClientProvider client={new QueryClient()}><DocumentChecklist recordId={50} clientEmail="anne@example.mu" /></QueryClientProvider>);

  it('shows the outstanding count and copies a client upload link', async () => {
    renderList();
    expect(await screen.findByText('1 outstanding')).toBeTruthy();
    expect(screen.getByText('id.pdf · approved')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Copy client link/ }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('http://localhost:5173/upload/gul1.x.y'));
  });

  it('emails the link to the client', async () => {
    renderList();
    fireEvent.click(await screen.findByRole('button', { name: /Email link to client/ }));
    expect(screen.getByLabelText(/Client email/).value).toBe('anne@example.mu');
    fireEvent.click(screen.getByRole('button', { name: /Send link/ }));
    await waitFor(() => expect(uploadLinksService.create).toHaveBeenCalledWith(50, { days: 14, email: { to: 'anne@example.mu', name: null, language: 'en' } }));
    expect(await screen.findByText('Link sent to anne@example.mu')).toBeTruthy();
  });
});
