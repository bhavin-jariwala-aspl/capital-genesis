// Writes docs/demo/README.md — the index of tutorial videos — from the MP4s themselves
// (duration and chapters via ffprobe), so it always matches the files.  node index.mjs
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const DEMO = path.resolve(here, '..');

// What each video covers and who appears in it (demo staff IDs, password in IMPLEMENTATION.md §0).
const VIDEOS = {
  '00-getting-started': ['Getting started', 'Sign in, home page, sidebar, global search, table and pipeline views, the record panel and its tabs, tasks, notifications, approvals, light/dark mode and English/French.', 'GCRM1'],
  '01-products-services': ['Products & Services', 'The product catalogue and a product sheet (rate from PLR + margin, document checklist); an administrator edits a product; the website preview and a product enquiry routed to the right desk.', 'GCRM1, GCADMIN, a website visitor'],
  '02-clients': ['Clients (Client 360)', 'A new client with household, address, consent and spouse link; a client relationship stopped at Active by the KYC rule; Client 360 figures and Related tab; consent withdrawal; personal data masked for the RM and revealed (audited) by Compliance.', 'GCRM1, GCCOMP1'],
  '03-enquiries-leads': ['Enquiries & Leads', 'A web form emailed to a prospect; the enquiry routed, scored and timed; qualify and convert (amount and tenure gate) and what conversion creates; "Talk to" links, disqualifying with a reason, a referral between entities, the qualification wizard and calculator sessions.', 'GCRM1, GCLOAN1/2, GCBDH, a client'],
  '04-cross-sell-rm-workbench': ['Cross-sell & RM Workbench', 'My Workbench; accepting and dismissing next-best actions; a discovery meeting note; an opportunity from Identified to Won (probability follows the stage); the Lost gate; RM targets; the RM League Table.', 'GCRM1, GCBDH'],
  '05-retail-lending': ['Retail Lending', 'Enquiry to disbursed home loan: application captured (pricing and eligibility calculated), documents and upload link, credit appraisal workbench, approval by the loans manager and offer letter, offer accepted and security, KYC gate and Compliance sign-off, operations checker and LMS booking, disbursed.', 'GCLOAN1/2, GCCRED1, GCLMGR, GCCOMP1, GCOPS1'],
  '06-commercial-lending': ['Commercial Lending', 'Facility request wizard with group exposure; RM assessment and the credit memo gate; financial spreading and ratios; risk grade and the approval matrix; Credit Committee approval and term sheet; security and activation; a covenant breach and its waiver.', 'GCRM3, GCCRED1, GCCC1, GCLMGR'],
  '07-collateral-pledges': ['Collateral & Pledges', 'A property registered as security with its haircut, allocated to a loan; a revaluation; pledged fund units and LTV monitoring; a market fall raises a margin call with its notice; client contacted, the cure gate, a pledge top-up and Cured.', 'GCLOAN1, GCCRED1, GCOPS1, GCLMGR'],
  '08-loan-servicing': ['Loan Servicing', 'The loan book and arrears; a PLR change campaign (approval gate, four-eyes), notices with old and new instalment and their letters, distribution by email; collections: promise to pay and escalation; the Loan Book dashboard.', 'GCLMGR, GCLOAN1, GCRM3'],
  '09-wealth-management': ['Wealth Management', 'Mandate onboarding; the investor questionnaire (model portfolio and risk ceiling); suitability records and the over-the-ceiling override; mandate stages with the risk-profile and KYC gates; AUM snapshot in the mandate currency; a mandate review with its gates; a SAAC decision.', 'GCRM2, GCPM1'],
  '10-investment-funds': ['Investment Funds', 'Funds, share classes and NAV history; a subscription through the wizard refused for KYC and for suitability, then captured with an override; payment-proof gate; operations checker approval; order confirmed, holding created; the FMB 2029 campaign and dashboard.', 'GCPM2, GCOPS1'],
  '11-trading-solutions': ['Trading Solutions', 'Securities account opening with the agreement and activation gates; a phone order sent to the OMS and executed; an order on a restricted issuer refused; an IPO / bond indication; a research note sent to subscribers; the information barrier.', 'GCTRD1'],
  '12-corporate-advisory': ['Corporate Advisory', 'A mandate under a code name; the automatic conflict check and its gate; Compliance clears it; the trader cannot see the deal and requests a wall-crossing; engagement letter and execution; deal team and insider list; bookbuilding with the NDA gate and a secure IM link; deliverable, fee invoice and time.', 'GCADV1, GCCOMP1, GCTRD1'],
  '13-forex-desk': ['Forex Desk', 'An FX client profile; a forward quote through the Quoted and Accepted gates; the FX deal booked automatically with the improvement against the board rate; the maturity reminder; a rate alert triggered by a new board rate.', 'GCFX1'],
  '14-marketing-consent': ['Marketing & Consent', 'A segment and a campaign; members refused for suppression; Compliance sign-off; a tracked web enquiry credited to the campaign; an event, registration and RM follow-up; a subscription; consent withdrawal stopping marketing.', 'GCMKT1, GCCOMP1, GCRM1, a prospect'],
  '15-introducers': ['Introducers & Partners', 'Introducer onboarding wizard with the agreement and KYC gates; a referral submitted in the introducer portal; the enquiry it creates; referral funded (amount gate) and the commission accrued; a clawback.', 'GCBDH, GCCOMP1, an introducer'],
  '16-revenue': ['Revenue Ledger', 'Revenue posted automatically from an FX deal; a manual fee with RM and referrer split; reconciliation status; filtering and CSV export; revenue on the Group Executive and RM League Table dashboards.', 'GCFX1, GCBDH, GCCOO'],
  '17-service-complaints': ['Service Requests & Complaints', 'The service catalogue; a statement request acknowledged, worked and resolved (gate); a request needing approval; a complaint owned by Compliance, the SLA pause while awaiting the client, the root-cause gate, survey and close.', 'GCRM1, GCLOAN1/2, GCBDH, GCCOMP1'],
  '18-kyc-compliance': ['KYC & Compliance', 'A PEP client\'s KYC case: risk score, documents checklist, automatic screening and the EDD gate, MLRO approval; a screening hit triaged; a gift needing approval; a restricted list entry; a data subject request; the STR register visible only to the MLRO.', 'GCRM1, GCCOMP1, GCMLRO'],
  '19-masters': ['Masters (reference data)', 'What each master drives; a product routing change followed by a new enquiry; a KYC risk weight change and the recalculated score; the approval matrix and service catalogue; PLR history, FX board and other masters.', 'GCADMIN, a website visitor'],
};

const probe = (file) => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-show_chapters', '-of', 'json', file]).toString());
const mmss = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

const rows = [];
const details = [];
let total = 0;
for (const [slug, [title, what, who]] of Object.entries(VIDEOS)) {
  const mp4 = path.join(DEMO, `${slug}.mp4`);
  if (!fs.existsSync(mp4)) { rows.push(`| ${slug.slice(0, 2)} | ${title} | — | (missing) | ${who} |`); continue; }
  const info = probe(mp4);
  const dur = Number(info.format.duration);
  total += dur;
  rows.push(`| ${slug.slice(0, 2)} | [${title}](${slug}.mp4) | ${mmss(dur)} | ${what} | ${who} |`);
  const chapters = (info.chapters || []).map((c) => `${mmss(Number(c.start_time))} ${c.tags?.title ?? ''}`);
  details.push(`### ${slug.slice(0, 2)} · ${title}\n\n[${slug}.mp4](${slug}.mp4) · captions [${slug}.srt](${slug}.srt), [${slug}.vtt](${slug}.vtt)\n\n${chapters.map((c) => `- ${c}`).join('\n')}\n`);
}

const md = `# Genesis CRM tutorial videos

Twenty end-to-end tutorials for staff: one to get started, then one for each module of the Genesis Capital
workspace. Every video was recorded against the running application, with real sign-ins, forms, pipeline moves and
approvals; nothing is mocked. Total running time ${mmss(total).replace(/^(\d+):/, (m, h) => `${Math.floor(h / 60)} h ${h % 60} min `).replace(/ \d+$/, '')}.

**Captions.** Each video shows captions on screen and also carries an English subtitle track (turn subtitles on in
the player). The same captions are next to each video as \`.srt\` and \`.vtt\` files. Videos have chapter markers,
one per step.

**Who is who.** The staff IDs below are the Genesis Capital demo accounts (password and roles:
[IMPLEMENTATION.md §0](../GENESIS-CAPITAL/IMPLEMENTATION.md#0-signing-in-to-the-genesis-demo)). The written
companion is the [user guide](../GENESIS-CAPITAL/genesis-capital-user-guide.md).

| # | Video | Length | What it shows | People |
| - | ----- | ------ | ------------- | ------ |
${rows.join('\n')}

## Chapters

${details.join('\n')}
## Re-recording

The videos are produced by the scripts in [scripts/](scripts/) — see [scripts/README.md](scripts/README.md). Run the
app locally (\`make start\`), then \`cd docs/demo/scripts && npm install && node run.mjs\` to record every video, or
\`node run.mjs 05\` for one. \`node index.mjs\` rewrites this page from the files.
`;
fs.writeFileSync(path.join(DEMO, 'README.md'), md);
console.log(`README.md: ${Object.keys(VIDEOS).length} videos, ${mmss(total)} total`);
