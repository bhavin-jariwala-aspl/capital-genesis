# Admin Guide

Guides for system administrators, module managers, and power users configuring Genesis CRM.

## Guides in This Section

| Guide | Who It's For | What You'll Learn |
| ----- | ------------ | ----------------- |
| [SYSTEM_CONFIGURATION.md](SYSTEM_CONFIGURATION.md) | Admins | Modules, fields, users, data import, integrations, monitoring |
| [PERMISSIONS_AND_ROLES.md](PERMISSIONS_AND_ROLES.md) | Admins | Two-tier permission model, roles, scopes, configuration |
| [WORKFLOW_AUTOMATION.md](WORKFLOW_AUTOMATION.md) | Admins & Power Users | Creating and managing automated workflows |
| [AUTOMATION_REFERENCE.md](AUTOMATION_REFERENCE.md) | Admins | The four AUTOMATE sections compared; every trigger, step type, operator and escalation action; the shipped rule sets and the configurations each section refuses |
| [SOCIAL_MEDIA.md](SOCIAL_MEDIA.md) | Admins | Connecting social accounts (tokens or OAuth), scheduled publishing, inbox routing rules, listening keywords, background automation, adding a live platform connector |
| [SUPER_ADMIN.md](SUPER_ADMIN.md) | Platform Admins | The platform console: tenants, plans, feature flags, announcements, security policies, analytics, audit log |
| [TENANT_ONBOARDING.md](TENANT_ONBOARDING.md) | Platform Admins | Putting a customer onto the platform: the wizard, what a usable workspace consists of, the setup checklist, the provisioning API |
| [PLANS_AND_FEATURES.md](PLANS_AND_FEATURES.md) | Platform Admins | Pricing tiers and the feature catalogue; granting or revoking a feature for one customer; why a flag can only withhold |

## Quick Navigation

**Configuring the system for first use?**
Start with [SYSTEM_CONFIGURATION.md](SYSTEM_CONFIGURATION.md) — covers module management, field types, user accounts,
and system settings.

**Setting up user access control?**
[PERMISSIONS_AND_ROLES.md](PERMISSIONS_AND_ROLES.md) explains the two-tier model (metadata permissions + operational
scope permissions).

**Automating business processes?**
[WORKFLOW_AUTOMATION.md](WORKFLOW_AUTOMATION.md) covers workflow concepts, the builder interface, and common automation
patterns. [AUTOMATION_REFERENCE.md](AUTOMATION_REFERENCE.md) is the reference for all four AUTOMATE sections — start
there if you are unsure whether you want a workflow, an assignment rule, a lead score or an SLA, since picking the
wrong mechanism is the most expensive configuration mistake there is.

**Pricing the product, or turning a feature on for one customer?**
[PLANS_AND_FEATURES.md](PLANS_AND_FEATURES.md) — three things decide whether a customer has a feature:
the plan (what was sold), the flag (whether we shipped it), and a per-tenant override (the deliberate
exception). The guide says which to reach for and why the order is what it is.

**Onboarding a new customer onto the platform?**
[TENANT_ONBOARDING.md](TENANT_ONBOARDING.md) — sign in as the platform administrator, run the three-step wizard, and
check the setup badge. A tenant row on its own is not a workspace anyone can use; the guide explains what the other
eight pieces are and how to finish a setup that stalled.

## Related Sections

- **Setup**: [../getting-started/INSTALLATION.md](../getting-started/INSTALLATION.md)
- **User Operations**: [../user-guide/README.md](../user-guide/README.md)
- **Developer Reference**: [../developer-guide/README.md](../developer-guide/README.md)
- **All Guides**: [../INDEX.md](../INDEX.md)
