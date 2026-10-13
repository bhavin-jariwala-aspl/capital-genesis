# Business Units & Information Barriers

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

## Where to find it

Sidebar → **Tools** → **Access & Barriers**. Everyone can request a wall-crossing. Managing units needs an
admin role. Managing zones, deciding crossings and the audit chain need an admin role or the *barrier override*
permission.

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

## Tips

- Leave group-level records, such as a client party shared by every entity, without a unit so everyone can see
  them. Tag the entity-specific records instead (the loan application, the mandate).
- Give the *barrier override* permission to as few roles as possible. In the SWAN Capital configuration only the
  MLRO holds it.
- Use crossings rather than standing membership for one-off work: they expire and leave an approval record.

## Related guides

- [14. Permissions](14-permissions.md) — object and operational permissions, including the **Barrier Override** tab
- [01. Modules & Objects](01-modules-and-objects.md) — where Record settings live
- [Platform Builder Extensions](../developer-guide/PLATFORM_BUILDER_EXTENSIONS.md#5-business-units-and-information-barriers) —
  how enforcement works

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| An admin cannot see a record | The record is in a barrier zone and the admin is not a member | Add a standing member or request a crossing |
| A user sees records of another unit | The user has no unit memberships, so they are unrestricted by unit | Add the user to their unit under **Members** |
| New records are not tagged | The object has no Business unit field or the field holds an unknown code | Set it in Record settings, and check that the code matches a unit |
| Verify integrity reports a break | An audit entry was edited or deleted in the database | Treat as a security incident; the report names the first broken entry |
