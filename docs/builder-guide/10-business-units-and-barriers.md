# Business Units & Information Barriers

<!-- nav:top -->
> **[Docs roadmap](../README.md)** › **[Builder guide](README.md)** › 10 of 20 · **For:** Administrators, compliance
> ← [Org chart](09-org-chart.md) · [Assignment rules](11-assignment-rules.md) →
> New to Genesis? Background: [Understanding Genesis › Who sees what](../understanding/05-who-sees-what.md)
<!-- /nav:top -->

> **Tools → Access & Barriers** · `/access` · Segment records by legal entity, wall off confidential work, approve
> temporary access and check the tamper-evident audit trail.

## What it is

Two access controls that sit on top of record ownership and the reporting hierarchy:

- **Business units** are the legal entities or divisions of your organisation, such as Lending, Wealth and Funds.
  A record tagged with a unit is visible only to that unit's members. People with no unit memberships, such as
  group functions, and administrators see every unit.
- **Information barriers** (Chinese walls) are zones for confidential work, such as advisory mandates or
  suspicious-transaction reports. A record in a zone is visible only to the zone's members.
  **Administrators are not exempt.** Only roles holding the *barrier override* operational permission see past a
  wall. Grant it in **Builder → Manage → Permissions → Operational → Barrier Override**.

A record someone may not see behaves as if it does not exist: it is missing from lists, search, related lists,
lookups, dashboards and documents. Opening its link answers "not found".

### Who sees a record: three layers

A user sees a record only when all three layers allow it:

| Layer | Question it answers | Where it is set |
| --- | --- | --- |
| **Record visibility** | Own records only, or every record of this object? Users see what they created or own; managers also see their team's. A role whose object permission says **Records: All** sees every record of that object. | **Builder → Permissions → object → Records** column |
| **Business unit** | Is the record in one of my units? | **Access & Barriers → Business units → Members** |
| **Information barrier** | Am I inside the wall around this record? | **Access & Barriers → Barrier zones** and **Wall-crossings** |

Related lists show hidden rows as "N restricted — contact Compliance", except on registers configured to conceal even
that count (the STR register).

### A workspace that does not use them

The page is empty until units and zones are created. A workspace with one legal entity and no confidential desks
needs neither. Record visibility and permissions still apply.

## Where to find it

Sidebar → **Tools** → **Access & Barriers**. Everyone can request a wall-crossing. Managing units needs an
admin role. Managing zones and the audit chain need an admin role or the *barrier override* permission. Deciding
crossings also needs one of those, or the *wall-crossing decisions* permission, which lets Compliance approve or reject
requests without seeing inside any wall. Nobody can approve their own request, or a crossing that brings themselves
over a wall.

## How records get their unit and zone

Records are tagged automatically when they are saved, from the object's settings in **Builder → Modules &
Objects → object → Record settings**:

| Setting | Effect |
| --- | --- |
| Business unit field | A field holding the unit code, such as `LND`. It may be a formula, for example one that derives the unit from the product. |
| Information barrier | Every record of the object goes into this zone, for example advisory mandates into `ADV_PRIVATE` |
| Barrier zone field | A field holding a zone code, so only some records are walled off, for example watch-list entries. A value in the field wins; the Information barrier is the fallback |
| Title field | The field shown when the record appears in a lookup or a related list |

## Tabs

### Business units

**New unit** asks for a **Code** (what formulas and settings refer to), **Name**, **Legal name**,
**Regulator**, **Licence** and **Base currency**. **Members** chooses the employees who work in the unit.

### Barrier zones

**New zone** asks for a **Code** and a **Name**. Under each zone, **Add standing member** adds a permanent
insider, and the **×** on a member removes them. **Insider list** shows everyone currently inside the wall,
standing members and approved crossings, with expiry dates. This is the list a regulator asks for.

### Wall-crossings

To bring someone over a wall for a specific piece of work:

1. Choose the **Zone**, the employee (**For**, or leave it empty for yourself) and a **Reason**, then
   **Submit request**.
2. Compliance sees the request in the same tab and chooses **Approve 30d** or **Reject**. The person who
   requested a crossing can never approve it.
3. Access ends automatically when the crossing expires. Approving a crossing for a standing member never
   shortens their membership.

### Audit chain

Every change to units, zones, members, crossings, permissions and public forms is written to a hash-chained log.
Each entry is sealed with the previous one, so editing or deleting any entry breaks the chain. **Verify
integrity** recomputes the chain and reports either "intact" or the first broken entry.

## Worked example: Genesis Capital

The Genesis Capital workspace (`genesis-capital`, sign in as `GCADMIN`) uses all three layers.

### Business units: the six licensed entities

| Code | Name | Legal entity and licence | Members |
| --- | --- | --- | --- |
| LND | Lending | Genesis Life Ltd (Loans business line) — FSC IS10000013 | Loans manager, loans executives, credit analyst, credit committee, operations checker, RMs |
| WLT | Wealth | Genesis Wealth Managers Ltd — FSC IX09000018 · CM12000023 · DF09000007 | Portfolio manager, RMs |
| FND | Funds | Genesis Global Funds Ltd — FSC CI11000044 | Portfolio managers, operations checker, RMs |
| SEC | Securities | Genesis CMB Securities Ltd — FSC IP16000002 | Trader, senior RM |
| ADV | Corporate Advisory | Genesis Corporate Advisors Ltd — FSC IZ19000019 | Corporate advisors |
| FX | Forex | Genesis Forex Ltd — Bank of Mauritius FX Dealer Licence No. 03 | FX dealer, corporate RM |

Group functions (COO, Compliance, MLRO, audit, marketing, BD) have no unit membership, so they see every unit. A
loan application is tagged `LND`, so a trader (`SEC` only) never sees it, while a client's party record has no
unit and is shared by every entity.

### Barrier zones

| Zone | What sits behind it | Standing members |
| --- | --- | --- |
| `ADV_PRIVATE` | Advisory mandates, deal teams, insider lists, investor books, deal documents | Corporate advisors, Compliance officer, MLRO |
| `MLRO_STR` | Suspicious-transaction reports (the count is concealed too: no tipping-off) | MLRO |
| `COMPLIANCE_ONLY` | Watch-list entries (restricted-list entries stay public) | Compliance officer, MLRO |
| `VIP_CLIENTS` | Clients flagged VIP / sensitive; every view is recorded on the audit chain | COO, senior RM, MLRO |

Only the MLRO holds **Barrier Override**. The Compliance Officer and the MLRO hold **Wall-crossing Decisions**, so
Compliance (`GCCOMP1`) approves crossings without being able to open what is behind the walls. The tenant administrator (`GCADMIN`) is in no zone, so cannot open advisory
mandates or STRs, which is deliberate.

### Wall-crossings in the demo

| For | Zone | Reason | Outcome |
| --- | --- | --- | --- |
| Senior RM | `ADV_PRIVATE` | Investor sounding with two wealth clients for an advisory raise | Approved by Compliance, 21 days |
| Credit analyst | `ADV_PRIVATE` | Credit view on a debt tranche | Approved by Compliance, 30 days |
| Trader | `ADV_PRIVATE` | Market colour on the issuer | Rejected by the MLRO: the trading desk stays public-side |
| FX dealer | `ADV_PRIVATE` | FX hedging for foreign-currency proceeds | Pending (approve it from the Wall-crossings tab) |
| RM | `VIP_CLIENTS` | Cover the VIP book during leave | Approved by the MLRO, 14 days |
| Internal auditor | `COMPLIANCE_ONLY` | Audit of the watch-list process | Approved by Compliance, 10 days |

The **Audit chain** tab starts with a baseline of this set-up, followed by every request and decision. **Verify
integrity** reports "intact".

### Try it

1. Sign in as the trader (`GCTRD1`): Corporate Advisory shows no mandates, and a client's Related tab reads
   "restricted — contact Compliance".
2. Sign in as the FX dealer (`GCFX1`) and look at the pending crossing; then sign in as the Compliance officer
   (`GCCOMP1`) and approve it. The FX dealer now sees that mandate and appears on its insider list.
3. As the MLRO (`GCMLRO`), open **Audit chain** and choose **Verify integrity**.

## Tips

- Leave group-level records, such as a client party shared by every entity, without a unit so everyone can see
  them. Tag the entity-specific records instead (the loan application, the mandate).
- Give the *barrier override* permission to as few roles as possible. In the Genesis Capital configuration only the
  MLRO holds it.
- Use crossings rather than standing membership for one-off work: they expire and leave an approval record.

## Related guides

- [14. Permissions](06-permissions.md) — object and operational permissions, including the **Barrier Override** tab
- [01. Modules & Objects](01-modules-and-objects.md) — where Record settings live
- [Platform Builder Extensions](../developer-guide/engines/platform-builder-extensions.md#5-business-units-and-information-barriers) —
  how enforcement works

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| An admin cannot see a record | The record is in a barrier zone and the admin is not a member | Add a standing member or request a crossing |
| A user sees records of another unit | The user has no unit memberships, so they are unrestricted by unit | Add the user to their unit under **Members** |
| New records are not tagged | The object has no Business unit field or the field holds an unknown code | Set it in Record settings, and check that the code matches a unit |
| Verify integrity reports a break | An audit entry was edited or deleted in the database | Treat as a security incident; the report names the first broken entry |

<!-- nav:bottom -->

---

### Where to next

| | |
|---|---|
| **Next** | [Assignment rules](11-assignment-rules.md) — Who gets a new record: fixed, rules, round robin, load balanced |
| **Previous** | [Org chart](09-org-chart.md) |
| **Background** | [Understanding Genesis › Who sees what](../understanding/05-who-sees-what.md) |
| **Related** | [Security](../developer-guide/security.md) |
| **Lost?** | [Docs roadmap](../README.md) · [Builder guide](README.md) · [Understanding Genesis](../understanding/README.md) |
<!-- /nav:bottom -->
