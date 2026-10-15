# Loan process demo — website enquiry to approved loan

Video: [loan-process-demo.mp4](loan-process-demo.mp4) (6:03, 1440×900, H.264). It was recorded on 15 Oct 2026 against the
local app (frontend :5173, backend :3001). The backend points at the remote RDS database. Captions on screen name each
step and who is signed in. Long page-load waits were cut out; the remote database made many pages take 10–30 s to load.

## The flow and who does each step

| Step | Role (demo login) | What happens | Automation |
|---|---|---|---|
| Enquiry | Member of the public (no login) | Fills in the website loan form (Real Estate Loan, MUR 3,000,000, 240 months) | Enquiry created, scored, given an indicative rate, routed to a loans executive (round-robin GCLOAN1/GCLOAN2), acknowledgement emailed |
| Qualify | Loans Executive (`GCLOAN1`) | Enquiry pipeline: New → Contacted → Qualified | Speed-to-lead SLA stops at first contact |
| Convert | Loans Executive (`GCLOAN1`) | Qualified → Converted (gate: amount and tenure must be filled in) | Party, entity relationship, KYC case and consent record created, plus the loan application at *Pre-qualified* |
| Loan application | Loans Executive (`GCLOAN1`) | Edits the application (employment, income, existing repayments, property value, MCIB consent), then Pre-qualified → Application captured → Documents pending → Documents complete | Rate (PLR + margin), EMI, LTV, DSR, eligibility and approval authority calculated; document-request email |
| Appraisal | Credit Analyst (`GCCRED1`) | Documents complete → Credit appraisal (gate: eligible) → Credit approval (gate: risk grade and analyst recommendation) | Approval matrix: ≤ MUR 5m → Loans Manager, ≤ 20m → Credit Committee, above → Board CC; four eyes (the mover cannot approve) |
| Approval | Loans Manager (`GCLMGR`) | **Approvals** inbox → Approve | Credit decision = Approved, decision date set, stage → *Offer issued*, offer letter generated, client emailed |

Sources: `backend/prisma/verticals/genesis-capital/automation.js` (workflows, permissions),
`objects.js` (pipelines and stage gates), `docs/GENESIS-CAPITAL/genesis-capital-user-guide.md` §10A and `DEMO_PITCH.md`.
GCLMGR is view-only on enquiries, so the loans executive does the enquiry moves.

## Timestamps

| Time | Step | Shown |
|---|---|---|
| 0:04 | 1. Client fills in the website loan enquiry form | Public form `/f/2fe40fb6…?prod=LND-RE`: amount, currency, tenure, then name, email, language, consent |
| 0:16 | 2. Enquiry received | Confirmation with reference **ENQ-2026-000137** |
| 0:30 | Sign in as `GCLOAN1` (Sophie Lagesse, Loans Executive) | |
| 0:37 | 3. Loans executive opens the Enquiries list | New enquiry at the top, then its details (score, grade, indicative rate) |
| 0:54 | 4. Qualify: New → Contacted → Qualified | Drag on the Enquiry pipeline board |
| 1:15 | 5. Convert: Qualified → Converted | Conversion automation runs |
| 1:21 | 6. Loan application created automatically | **LA-2026-000028** at *Pre-qualified* on the Retail Lending board |
| 1:35 | 7. Capture the application | Edit form: Salaried, income MUR 150,000, repayments 0, property MUR 5,000,000, MCIB consent → Save |
| 2:22 | 7 (cont.) Save completed on the server | The UI showed a 60 s timeout error; the data was saved (see issues) |
| 2:34 | 8. Document stages | Pre-qualified → Application captured → Documents pending → Documents complete |
| 3:06 | 9. Sign in as `GCCRED1` (Credit Analyst); move to Credit appraisal | Entry rule passes (eligible, DSR 14.5 %, LTV 60 %) |
| 3:20 | 10. Move to Credit approval — **blocked** | "Complete Risk grade, Analyst recommendation before moving to Credit approval" |
| 3:31 | App gap note | Risk grade B / recommendation Approve set via the API (see issues) |
| 4:12 | 11. Move to Credit approval | Accepted; approval routed to the Loans Manager |
| 4:28 | Sign in as `GCLMGR` (Loans Manager) | |
| 4:35 | 12. Approvals inbox | "Credit approval: Demo Loan Applicant · LND-RE" waiting |
| 4:43 | 13. Loans Manager clicks **Approve** | The item leaves the inbox; the UI then shows a 60 s timeout error (approval had gone through) |
| 5:33 | 13 (cont.) Approval recorded | Approvals inbox after the decision |
| 5:36 | 14. Loan approved | Application at *Offer issued*, credit decision Approved, offer date and validity, Docs tab |
| 5:58 | Done | ENQ-2026-000137 → LA-2026-000028, approved by GCLMGR |

## Issues found in the app (not faked in the video)

1. **Risk grade and Analyst recommendation can't be entered in the UI.** They're only on the second loan form,
   *Credit appraisal workbench* (`loan_application_credit`). `RecordFormPage` / `metadataStore.getFormForObject`
   always picks the first form, and the record view has no inline edit. The *Credit approval* stage requires both
   fields, so in the UI no application can reach Credit approval. In the video the blocked move is shown, then the
   two fields are set with `PUT /api/runtime/records/:id` as GCCRED1, and the board move is done in the UI.
2. **Saving the loan edit form and approving both take more than 60 s on this setup.** The frontend's 60 s request
   timeout fires and shows an error ("timeout of 60000ms exceeded"), even though the server finishes the work: the
   income/property values were stored, and the approval moved the application to Offer issued. The video shows the
   errors and then the saved result.
3. Smaller issues: the approval comment box wasn't filled (the recording script's selector missed it), so the approval
   has no comment. The edit form briefly shows the applicant lookup as `#<id>` before its label loads.

## Records created on the remote database

All test addresses are `@example.com`. Acknowledgement, document-request and offer emails were triggered to them.

| Purpose | Records |
|---|---|
| Video run | Enquiry 5364 **ENQ-2026-000137** "Demo Loan Applicant" (Converted) → loan application 5369 **LA-2026-000028** (Offer issued, approved), plus its party, relationship, KYC case and consent record |
| API dry run | Enquiry 5356 ENQ-2026-000135 "Demo DryRun Loan Applicant" (Converted), party 5357, relationship 5358, KYC case 5359, consent 5360, loan application 5361 LA-2026-000027 (Offer issued, approved) |
| Abandoned attempt | Enquiry 5363 ENQ-2026-000136 "Demo Loan Applicant" (New, assigned to GCLOAN2) |

Karine Ruhee's pending credit approval (LA-2026-000024, used in the DEMO_PITCH scene) was not touched.

## Re-recording

The scripts in [scripts/](scripts/) need `playwright`, `ffmpeg-static` and Google Chrome. Run
`npx playwright install ffmpeg` once. Steps:

1. `node record.mjs` records one full run into `out/` (raw WebM, step marks, wait intervals).
2. `RESUME_LOAN=<id> RESUME_EXEC=GCLOAN1 RESUME_ENQ=<id> RESUME_ENQ_NO=<no>` resumes from a saved application.
   `FINAL_ONLY=<loan id>` records only the closing step.
3. `assemble.py` joins the parts, cuts long waits and encodes the MP4. Its part list, cut points and end times are for
   this recording; edit them for a new run.

The script's own clock and the video clock drift about 4 %, so check timestamps against the video.
