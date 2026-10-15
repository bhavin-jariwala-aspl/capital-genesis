// Getting started: sign in, home page, navigation, search, records, views, record panel, approvals, personalising.
import { records, obj } from '../lib/studio.mjs';

export const title = 'Getting started with Genesis CRM';

export default async function run(S) {
  const { p } = S;
  await S.go('/login');
  await S.card({
    eyebrow: 'Genesis CRM · Tutorial 0',
    title: 'Getting started',
    text: 'How to find your way around the CRM before you work in any module.',
    bullets: ['Sign in and your home page', 'The sidebar and global search', 'Lists, pipeline boards and the record panel', 'Tasks, approvals, notifications', 'Light/dark mode and English/French'],
    foot: 'Demo workspace: Genesis Capital · every action in this video is real',
  }, 7000);

  await S.step(1, 'Sign in', 'Sign in with your Employee ID and password', 'Employee IDs are in capitals — demo accounts start with GC');
  await S.login('GCRM1', 'Relationship manager — her own book of clients and enquiries');

  await S.step(2, 'Home page', 'Your home page opens on the dashboard for your role', 'Relationship managers land on My Workbench');
  await p.waitForTimeout(2500);
  await S.say('At the top: the Service Levels radiator', 'Your items that are breached, at risk or on track — click one to open it');
  await S.highlight(p.getByText('Service Levels').first().locator('xpath=ancestor::div[contains(@class,"rounded")][1]'), 3500);
  await S.say('Below it: My Workbench — open enquiries, next-best actions, reviews and KYC', 'Every widget only counts records you are allowed to see');
  await S.scroll(420, 2600);
  await S.scroll(420, 2200);
  await S.say('Switch to any other dashboard you may see from this menu', 'Group Executive, Lead Funnel, Lending Pipeline, Wealth…');
  await S.scroll(-1200, 900);
  await S.moveTo(p.locator('main select').first(), { click: false });
  await p.waitForTimeout(2500);

  await S.step(3, 'The sidebar', 'The sidebar groups the modules by business area', 'Tools · Documents · Client 360 · Lending · Investments · Advisory · Growth · Service · Compliance · Masters');
  const nav = p.locator('aside nav, aside').first();
  await S.moveTo(p.getByRole('link', { name: 'Approvals' }).first(), { click: false });
  await p.waitForTimeout(1500);
  await S.moveTo(p.getByRole('link', { name: 'Clients' }).first(), { click: false });
  await p.waitForTimeout(1200);
  await nav.evaluate((e) => e.scrollBy({ top: 500, behavior: 'smooth' })).catch(() => {});
  await p.waitForTimeout(2000);
  await S.say('You only see the modules your role is allowed to use', 'An RM sees client, lending, investment and service modules — not the advisory deal room');
  await p.waitForTimeout(3000);
  await nav.evaluate((e) => e.scrollTo({ top: 0, behavior: 'smooth' })).catch(() => {});

  await S.step(4, 'Global search', 'Search finds clients, enquiries, applications and more', 'By name, number, email or phone — results respect what you may see');
  const search = p.getByPlaceholder('Search records…');
  await S.moveTo(search);
  await S.type('Seegoolam', 90);
  await p.waitForTimeout(2500);
  await S.settle(1500);
  const hit = p.locator('[role=listbox] [role=option], ul li a, ul li button').filter({ hasText: /Deepak Seegoolam/ }).first();
  if (await hit.count()) {
    await S.say('Pick a result to open it', 'Here: the client Deepak Seegoolam — the client record comes first');
    await S.moveTo(hit);
    await S.settle(1500);
  } else {
    S.issue('Global search showed no clickable result for "Seegoolam"');
    await p.keyboard.press('Escape');
  }

  await S.step(5, 'Lists and views', 'Open a module, then pick an object from the tabs at the top', 'Enquiries & Leads ▸ Enquiries');
  const enq = await S.openObject('enquiry');
  await p.waitForTimeout(1500);
  await S.say('The Table view: sort by a column, filter, search, select rows for bulk actions', 'Export gives a CSV of what you see');
  await S.view('Table');
  await p.waitForTimeout(3000);
  await S.say('The Pipeline view: a Kanban board with one column per stage', 'Drag a card to another column to move it — gates may ask for missing information first');
  await S.view('Pipeline');
  await p.waitForTimeout(3500);

  await S.step(6, 'The record panel', 'Click a record to open its panel', 'Header with stage and actions · fields grouped by heading · tabs underneath');
  const mine = (await records('GCRM1', enq.id)).find((r) => r.assigned_to === 'GCRM1' && r.data?.first_name) || (await records('GCRM1', enq.id))[0];
  await S.openRecord('enquiry', mine.id);
  await p.waitForTimeout(2500);
  await S.say('Calculated fields are greyed and update by themselves', 'Lead score and grade, indicative rate and instalment');
  await S.scroll(450, 2500);
  for (const [tab, text, sub] of [
    ['Related', 'Related: every record linked to this one', 'For a client: applications, KYC cases, mandates, holdings, requests…'],
    ['Activity', 'Activity: calls, meetings, emails and notes', 'Log your own call or note here'],
    ['Tasks', 'Tasks: follow-ups with an owner, due date and priority', 'Overdue tasks appear on your workbench'],
    ['Docs', 'Docs: documents, the document checklist, upload, share and e-signature', 'Ask the client for documents with a secure upload link'],
    ['Audit', 'Audit: who changed what and when', 'Stage changes, approvals with comments and data reveals'],
  ]) {
    await S.say(text, sub);
    await S.tab(tab);
    await p.waitForTimeout(2200);
  }

  await S.step(7, 'Add a task', 'Add a follow-up task on the record', 'Tasks tab ▸ new task');
  await S.tab('Tasks');
  const add = p.getByRole('button', { name: /Add task|New task|\+ Task|Add Task/i }).first();
  if (await add.count()) {
    await S.moveTo(add);
    await p.waitForTimeout(800);
    const t = p.locator('input[name=title], input[placeholder*="title" i], input[placeholder*="task" i]').first();
    await S.moveTo(t); await S.type('Call client to confirm documents', 40);
    const save = p.getByRole('button', { name: /^(Save|Add|Create)( task)?$/i }).last();
    await S.moveTo(save);
    await S.settle(1500);
    await S.say('The task is saved on the record and appears on your workbench');
    await p.waitForTimeout(2500);
  } else S.issue('Tasks tab: no add-task button found');

  await S.step(8, 'Notifications & approvals', 'The bell shows new assignments, approvals waiting for you and SLA warnings', 'Click a notification to open the record or approval');
  await S.moveTo(p.locator('button[title=Notifications]'));
  await p.waitForTimeout(3000);
  await p.keyboard.press('Escape');
  await S.say('Approvals: credit decisions, KYC sign-off and maker-checker steps wait here', 'Tools ▸ Approvals — the person who asked can never approve their own request');
  await S.go('/approvals', 1500);
  await p.waitForTimeout(3500);
  await S.say('My Reminders: personal nudges you can snooze or complete', 'Tools ▸ My Reminders');
  await S.go('/reminders', 1500);
  await p.waitForTimeout(3000);

  await S.step(9, 'Personalise', 'Personalise: light or dark mode, text size and motion', 'The palette icon in the header');
  await S.go('/', 1200);
  const pers = p.locator('button[aria-label="Personalize appearance"]');
  await S.moveTo(pers);
  await p.waitForTimeout(2000);
  const dark = p.getByRole('button', { name: /^Dark$/ }).first();
  if (await dark.count()) {
    await S.moveTo(dark); await p.waitForTimeout(2500);
    const light = p.getByRole('button', { name: /^Light$/ }).first();
    if (await light.count()) { await S.moveTo(light); await p.waitForTimeout(1500); }
  }
  await p.keyboard.press('Escape');
  await p.mouse.click(700, 500);
  await S.say('EN | FR switches module, field, stage and picklist names to French', 'Useful when working with French-speaking clients');
  await S.moveTo(p.locator('button[title="Français"]'));
  await S.settle(1500);
  await S.openObject('enquiry', { view: 'Pipeline' });
  await p.waitForTimeout(3000);
  await S.moveTo(p.locator('button[title="English"]'));
  await S.settle(1500);
  await p.waitForTimeout(1200);

  await S.step(10, 'Sign out', 'Sign out from the header when you are done', 'Avatar ▸ Security: change password, two-factor authentication, calendar feed');
  await S.moveTo(p.locator('button[aria-label="My account — security"]'), { click: false });
  await p.waitForTimeout(2000);
  await S.logout();
  await S.card({
    eyebrow: 'Next',
    title: 'Pick a module tutorial',
    text: 'Each module has its own end-to-end video in this folder.',
    bullets: ['Enquiries & Leads', 'Clients (Client 360)', 'Retail Lending', 'KYC & Compliance', 'Investment Funds', 'Forex Desk'],
  }, 5000);
  void obj;
}
