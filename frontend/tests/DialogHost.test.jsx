import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect } from 'vitest';
import { act } from 'react';
import DialogHost from '../src/components/ui/DialogHost';
import { confirmDialog, promptDialog, showError, showSuccess } from '../src/utils/dialog';

describe('DialogHost', () => {
  it('shows an error alert and resolves when acknowledged', async () => {
    const user = userEvent.setup();
    render(<DialogHost />);

    let result;
    act(() => { result = showError('Could not save the policy'); });
    expect(await screen.findByText('Could not save the policy')).toBeInTheDocument();
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Got it' }));
    await expect(result).resolves.toBe(true);
    await waitFor(() => expect(screen.queryByText('Could not save the policy')).not.toBeInTheDocument());
  });

  it('resolves a confirm to true on confirm and false on cancel', async () => {
    const user = userEvent.setup();
    render(<DialogHost />);

    let yes;
    act(() => { yes = confirmDialog({ title: 'Delete plan', message: 'Gone for good.', confirmLabel: 'Delete' }); });
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await expect(yes).resolves.toBe(true);

    let no;
    act(() => { no = confirmDialog('Delete this announcement?'); });
    await user.click(await screen.findByRole('button', { name: 'Cancel' }));
    await expect(no).resolves.toBe(false);
  });

  it('cancels a confirm when Escape is pressed', async () => {
    const user = userEvent.setup();
    render(<DialogHost />);

    let answer;
    act(() => { answer = confirmDialog('Terminate appointment?'); });
    await screen.findByText('Terminate appointment?');
    await user.keyboard('{Escape}');
    await expect(answer).resolves.toBe(false);
  });

  it('returns the typed value from a prompt, and null when cancelled', async () => {
    const user = userEvent.setup();
    render(<DialogHost />);

    let typed;
    act(() => { typed = promptDialog({ title: 'New folder', placeholder: 'Folder name' }); });
    await user.type(await screen.findByPlaceholderText('Folder name'), 'Contracts 2026');
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    await expect(typed).resolves.toBe('Contracts 2026');

    let cancelled;
    act(() => { cancelled = promptDialog({ title: 'New folder' }); });
    await screen.findByText('New folder');
    await user.keyboard('{Escape}');
    await expect(cancelled).resolves.toBeNull();
  });

  it('stacks dialogs and closes only the topmost on Escape', async () => {
    const user = userEvent.setup();
    render(<DialogHost />);

    let first, second;
    act(() => { first = showSuccess({ title: 'Saved', message: 'Policy issued.' }); });
    act(() => { second = confirmDialog({ title: 'One more thing', message: 'Send the welcome pack?' }); });
    await screen.findByText('Send the welcome pack?');

    await user.keyboard('{Escape}');
    await expect(second).resolves.toBe(false);
    expect(screen.getByText('Policy issued.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Got it' }));
    await expect(first).resolves.toBe(true);
  });
});
