import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { useAuthStore } from '../src/store/authStore';
import StaffPreviewBar, { OwnWorkspaceRedirect } from '../src/components/layout/StaffPreviewBar';

const signIn = (tenant_slug) => useAuthStore.setState({ token: 't', employee: { employee_name: 'A', tenant_slug } });
const signOut = () => useAuthStore.setState({ token: null, employee: null });

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/site" element={<OwnWorkspaceRedirect pageKey="site" />} />
        <Route path="/portal" element={<OwnWorkspaceRedirect pageKey="portal" />} />
        <Route path="/site/:slug" element={<p>site page</p>} />
        <Route path="/portal/:slug" element={<p>portal page</p>} />
        <Route path="/login" element={<p>login page</p>} />
        <Route path="/" element={<p>home page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('slug-less public page shortcuts', () => {
  beforeEach(signOut);

  it('take a signed-in user to their own workspace', () => {
    signIn('genesis-capital');
    renderAt('/site');
    expect(screen.getByText('site page')).toBeInTheDocument();
  });

  it('work for the portal too', () => {
    signIn('genesis-capital');
    renderAt('/portal');
    expect(screen.getByText('portal page')).toBeInTheDocument();
  });

  it('send a signed-out visitor to sign in', () => {
    renderAt('/site');
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('send a user with no workspace (platform admin) home', () => {
    signIn(null);
    renderAt('/portal');
    expect(screen.getByText('home page')).toBeInTheDocument();
  });
});

describe('StaffPreviewBar', () => {
  beforeEach(signOut);
  const renderBar = (slug) => render(<MemoryRouter><StaffPreviewBar pageKey="site" slug={slug} /></MemoryRouter>);

  it('shows staff of the workspace what the page is and the way back', () => {
    signIn('genesis-capital');
    renderBar('genesis-capital');
    expect(screen.getByText('Website preview')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /back to crm/i })).toHaveAttribute('href', '/web-forms');
  });

  it('is invisible to visitors', () => {
    renderBar('genesis-capital');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('is invisible to staff of another workspace', () => {
    signIn('other-co');
    renderBar('genesis-capital');
    expect(screen.queryByRole('status')).toBeNull();
  });
});
