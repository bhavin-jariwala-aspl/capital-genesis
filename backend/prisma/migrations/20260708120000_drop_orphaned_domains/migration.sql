-- Drop 65 orphaned models across 9 never-implemented feature domains.
-- These tables had NO backend service, route, seed data, or frontend usage
-- (verified via codebase scan) and were confirmed EMPTY (0 rows) on the
-- target database before this migration. Domains removed:
--   Email Campaigns, Calendar/Meetings, Analytics/KPI (duplicate of UiDashboard),
--   Contracts, Deal Stages, Territories, Sales Teams, Customer Portal/Knowledge,
--   Partner/Channel (PRM), plus the CallLog remnant and 3 unused SocialMedia models.
-- The live CRM (UiDashboard, Activity, UiPipeline, EmployeeHierarchy, SLA, reports)
-- is unaffected. See CHANGELOG.

-- DropForeignKey
ALTER TABLE `analytic_dashboards` DROP FOREIGN KEY `analytic_dashboards_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `analytic_widgets` DROP FOREIGN KEY `analytic_widgets_dashboard_id_fkey`;

-- DropForeignKey
ALTER TABLE `analytic_widgets` DROP FOREIGN KEY `analytic_widgets_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `article_attachments` DROP FOREIGN KEY `article_attachments_article_id_fkey`;

-- DropForeignKey
ALTER TABLE `article_attachments` DROP FOREIGN KEY `article_attachments_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `article_feedback` DROP FOREIGN KEY `article_feedback_article_id_fkey`;

-- DropForeignKey
ALTER TABLE `article_feedback` DROP FOREIGN KEY `article_feedback_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `article_feedback` DROP FOREIGN KEY `article_feedback_user_id_fkey`;

-- DropForeignKey
ALTER TABLE `calendar_attendees` DROP FOREIGN KEY `calendar_attendees_event_id_fkey`;

-- DropForeignKey
ALTER TABLE `calendar_attendees` DROP FOREIGN KEY `calendar_attendees_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `calendar_events` DROP FOREIGN KEY `calendar_events_organizer_id_fkey`;

-- DropForeignKey
ALTER TABLE `calendar_events` DROP FOREIGN KEY `calendar_events_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `call_logs` DROP FOREIGN KEY `call_logs_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `campaign_email_sends` DROP FOREIGN KEY `campaign_email_sends_campaign_id_fkey`;

-- DropForeignKey
ALTER TABLE `campaign_email_sends` DROP FOREIGN KEY `campaign_email_sends_recipient_id_fkey`;

-- DropForeignKey
ALTER TABLE `campaign_email_sends` DROP FOREIGN KEY `campaign_email_sends_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `campaign_list_assignments` DROP FOREIGN KEY `campaign_list_assignments_campaign_id_fkey`;

-- DropForeignKey
ALTER TABLE `campaign_list_assignments` DROP FOREIGN KEY `campaign_list_assignments_list_id_fkey`;

-- DropForeignKey
ALTER TABLE `campaign_list_assignments` DROP FOREIGN KEY `campaign_list_assignments_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `campaign_recipients` DROP FOREIGN KEY `campaign_recipients_campaign_id_fkey`;

-- DropForeignKey
ALTER TABLE `campaign_recipients` DROP FOREIGN KEY `campaign_recipients_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `case_escalations` DROP FOREIGN KEY `case_escalations_case_id_fkey`;

-- DropForeignKey
ALTER TABLE `case_escalations` DROP FOREIGN KEY `case_escalations_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `case_messages` DROP FOREIGN KEY `case_messages_case_id_fkey`;

-- DropForeignKey
ALTER TABLE `case_messages` DROP FOREIGN KEY `case_messages_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `channel_conflicts` DROP FOREIGN KEY `channel_conflicts_primary_partner_id_fkey`;

-- DropForeignKey
ALTER TABLE `channel_conflicts` DROP FOREIGN KEY `channel_conflicts_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `competitor_social_activities` DROP FOREIGN KEY `competitor_social_activities_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `contract_amendments` DROP FOREIGN KEY `contract_amendments_contract_id_fkey`;

-- DropForeignKey
ALTER TABLE `contract_amendments` DROP FOREIGN KEY `contract_amendments_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `contract_approvals` DROP FOREIGN KEY `contract_approvals_contract_id_fkey`;

-- DropForeignKey
ALTER TABLE `contract_approvals` DROP FOREIGN KEY `contract_approvals_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `contract_milestones` DROP FOREIGN KEY `contract_milestones_contract_id_fkey`;

-- DropForeignKey
ALTER TABLE `contract_milestones` DROP FOREIGN KEY `contract_milestones_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `contract_renewals` DROP FOREIGN KEY `contract_renewals_contract_id_fkey`;

-- DropForeignKey
ALTER TABLE `contract_renewals` DROP FOREIGN KEY `contract_renewals_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `contract_signatures` DROP FOREIGN KEY `contract_signatures_contract_id_fkey`;

-- DropForeignKey
ALTER TABLE `contract_signatures` DROP FOREIGN KEY `contract_signatures_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `contract_templates` DROP FOREIGN KEY `contract_templates_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `contracts` DROP FOREIGN KEY `contracts_related_account_id_fkey`;

-- DropForeignKey
ALTER TABLE `contracts` DROP FOREIGN KEY `contracts_related_contact_id_fkey`;

-- DropForeignKey
ALTER TABLE `contracts` DROP FOREIGN KEY `contracts_related_opportunity_id_fkey`;

-- DropForeignKey
ALTER TABLE `contracts` DROP FOREIGN KEY `contracts_template_id_fkey`;

-- DropForeignKey
ALTER TABLE `contracts` DROP FOREIGN KEY `contracts_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `customer_cases` DROP FOREIGN KEY `customer_cases_related_crm_case_id_fkey`;

-- DropForeignKey
ALTER TABLE `customer_cases` DROP FOREIGN KEY `customer_cases_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `customer_cases` DROP FOREIGN KEY `customer_cases_user_id_fkey`;

-- DropForeignKey
ALTER TABLE `customer_feedback` DROP FOREIGN KEY `customer_feedback_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `customer_feedback` DROP FOREIGN KEY `customer_feedback_user_id_fkey`;

-- DropForeignKey
ALTER TABLE `customer_portal_users` DROP FOREIGN KEY `customer_portal_users_account_id_fkey`;

-- DropForeignKey
ALTER TABLE `customer_portal_users` DROP FOREIGN KEY `customer_portal_users_contact_id_fkey`;

-- DropForeignKey
ALTER TABLE `customer_portal_users` DROP FOREIGN KEY `customer_portal_users_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `dashboard_kpis` DROP FOREIGN KEY `dashboard_kpis_dashboard_id_fkey`;

-- DropForeignKey
ALTER TABLE `dashboard_kpis` DROP FOREIGN KEY `dashboard_kpis_kpi_id_fkey`;

-- DropForeignKey
ALTER TABLE `dashboard_kpis` DROP FOREIGN KEY `dashboard_kpis_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `dashboard_shares` DROP FOREIGN KEY `dashboard_shares_dashboard_id_fkey`;

-- DropForeignKey
ALTER TABLE `dashboard_shares` DROP FOREIGN KEY `dashboard_shares_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `data_exports` DROP FOREIGN KEY `data_exports_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `deal_competitors` DROP FOREIGN KEY `deal_competitors_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `deal_stage_history` DROP FOREIGN KEY `deal_stage_history_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `deal_stage_history` DROP FOREIGN KEY `deal_stage_history_to_stage_id_fkey`;

-- DropForeignKey
ALTER TABLE `deal_stages` DROP FOREIGN KEY `deal_stages_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `email_campaigns` DROP FOREIGN KEY `email_campaigns_email_template_id_fkey`;

-- DropForeignKey
ALTER TABLE `email_campaigns` DROP FOREIGN KEY `email_campaigns_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `email_click_events` DROP FOREIGN KEY `email_click_events_email_send_id_fkey`;

-- DropForeignKey
ALTER TABLE `email_click_events` DROP FOREIGN KEY `email_click_events_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `email_list_subscriptions` DROP FOREIGN KEY `email_list_subscriptions_list_id_fkey`;

-- DropForeignKey
ALTER TABLE `email_list_subscriptions` DROP FOREIGN KEY `email_list_subscriptions_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `email_lists` DROP FOREIGN KEY `email_lists_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `email_unsubscribes` DROP FOREIGN KEY `email_unsubscribes_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `knowledge_articles` DROP FOREIGN KEY `knowledge_articles_category_id_fkey`;

-- DropForeignKey
ALTER TABLE `knowledge_articles` DROP FOREIGN KEY `knowledge_articles_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `knowledge_categories` DROP FOREIGN KEY `knowledge_categories_parent_id_fkey`;

-- DropForeignKey
ALTER TABLE `knowledge_categories` DROP FOREIGN KEY `knowledge_categories_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `kpi_definitions` DROP FOREIGN KEY `kpi_definitions_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `kpi_values` DROP FOREIGN KEY `kpi_values_kpi_id_fkey`;

-- DropForeignKey
ALTER TABLE `kpi_values` DROP FOREIGN KEY `kpi_values_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `meeting_notes` DROP FOREIGN KEY `meeting_notes_event_id_fkey`;

-- DropForeignKey
ALTER TABLE `meeting_notes` DROP FOREIGN KEY `meeting_notes_recorded_by_fkey`;

-- DropForeignKey
ALTER TABLE `meeting_notes` DROP FOREIGN KEY `meeting_notes_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `meeting_rooms` DROP FOREIGN KEY `meeting_rooms_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `partner_certifications` DROP FOREIGN KEY `partner_certifications_contact_id_fkey`;

-- DropForeignKey
ALTER TABLE `partner_certifications` DROP FOREIGN KEY `partner_certifications_partner_id_fkey`;

-- DropForeignKey
ALTER TABLE `partner_certifications` DROP FOREIGN KEY `partner_certifications_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `partner_contacts` DROP FOREIGN KEY `partner_contacts_partner_id_fkey`;

-- DropForeignKey
ALTER TABLE `partner_contacts` DROP FOREIGN KEY `partner_contacts_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `partner_lead_shares` DROP FOREIGN KEY `partner_lead_shares_partner_id_fkey`;

-- DropForeignKey
ALTER TABLE `partner_lead_shares` DROP FOREIGN KEY `partner_lead_shares_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `partner_marketing_activities` DROP FOREIGN KEY `partner_marketing_activities_partner_id_fkey`;

-- DropForeignKey
ALTER TABLE `partner_marketing_activities` DROP FOREIGN KEY `partner_marketing_activities_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `partner_opportunities` DROP FOREIGN KEY `partner_opportunities_opportunity_id_fkey`;

-- DropForeignKey
ALTER TABLE `partner_opportunities` DROP FOREIGN KEY `partner_opportunities_partner_id_fkey`;

-- DropForeignKey
ALTER TABLE `partner_opportunities` DROP FOREIGN KEY `partner_opportunities_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `partner_performances` DROP FOREIGN KEY `partner_performances_partner_id_fkey`;

-- DropForeignKey
ALTER TABLE `partner_performances` DROP FOREIGN KEY `partner_performances_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `partner_portal_users` DROP FOREIGN KEY `partner_portal_users_contact_id_fkey`;

-- DropForeignKey
ALTER TABLE `partner_portal_users` DROP FOREIGN KEY `partner_portal_users_partner_id_fkey`;

-- DropForeignKey
ALTER TABLE `partner_portal_users` DROP FOREIGN KEY `partner_portal_users_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `partners` DROP FOREIGN KEY `partners_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `portal_downloads` DROP FOREIGN KEY `portal_downloads_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `portal_downloads` DROP FOREIGN KEY `portal_downloads_user_id_fkey`;

-- DropForeignKey
ALTER TABLE `portal_sessions` DROP FOREIGN KEY `portal_sessions_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `portal_sessions` DROP FOREIGN KEY `portal_sessions_user_id_fkey`;

-- DropForeignKey
ALTER TABLE `report_subscriptions` DROP FOREIGN KEY `report_subscriptions_report_id_fkey`;

-- DropForeignKey
ALTER TABLE `report_subscriptions` DROP FOREIGN KEY `report_subscriptions_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `room_bookings` DROP FOREIGN KEY `room_bookings_booked_by_fkey`;

-- DropForeignKey
ALTER TABLE `room_bookings` DROP FOREIGN KEY `room_bookings_event_id_fkey`;

-- DropForeignKey
ALTER TABLE `room_bookings` DROP FOREIGN KEY `room_bookings_room_id_fkey`;

-- DropForeignKey
ALTER TABLE `room_bookings` DROP FOREIGN KEY `room_bookings_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `sales_team_members` DROP FOREIGN KEY `sales_team_members_employee_id_fkey`;

-- DropForeignKey
ALTER TABLE `sales_team_members` DROP FOREIGN KEY `sales_team_members_team_id_fkey`;

-- DropForeignKey
ALTER TABLE `sales_team_members` DROP FOREIGN KEY `sales_team_members_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `sales_teams` DROP FOREIGN KEY `sales_teams_manager_id_fkey`;

-- DropForeignKey
ALTER TABLE `sales_teams` DROP FOREIGN KEY `sales_teams_parent_team_id_fkey`;

-- DropForeignKey
ALTER TABLE `sales_teams` DROP FOREIGN KEY `sales_teams_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `service_requests` DROP FOREIGN KEY `service_requests_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `service_requests` DROP FOREIGN KEY `service_requests_user_id_fkey`;

-- DropForeignKey
ALTER TABLE `social_media_engagements` DROP FOREIGN KEY `social_media_engagements_account_id_fkey`;

-- DropForeignKey
ALTER TABLE `social_media_engagements` DROP FOREIGN KEY `social_media_engagements_post_id_fkey`;

-- DropForeignKey
ALTER TABLE `social_media_engagements` DROP FOREIGN KEY `social_media_engagements_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `social_media_leads` DROP FOREIGN KEY `social_media_leads_campaign_id_fkey`;

-- DropForeignKey
ALTER TABLE `social_media_leads` DROP FOREIGN KEY `social_media_leads_crm_lead_id_fkey`;

-- DropForeignKey
ALTER TABLE `social_media_leads` DROP FOREIGN KEY `social_media_leads_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `team_meetings` DROP FOREIGN KEY `team_meetings_team_id_fkey`;

-- DropForeignKey
ALTER TABLE `team_meetings` DROP FOREIGN KEY `team_meetings_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `team_performances` DROP FOREIGN KEY `team_performances_team_id_fkey`;

-- DropForeignKey
ALTER TABLE `team_performances` DROP FOREIGN KEY `team_performances_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `territories` DROP FOREIGN KEY `territories_parent_territory_id_fkey`;

-- DropForeignKey
ALTER TABLE `territories` DROP FOREIGN KEY `territories_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `territory_assignments` DROP FOREIGN KEY `territory_assignments_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `territory_assignments` DROP FOREIGN KEY `territory_assignments_territory_id_fkey`;

-- DropForeignKey
ALTER TABLE `territory_members` DROP FOREIGN KEY `territory_members_employee_id_fkey`;

-- DropForeignKey
ALTER TABLE `territory_members` DROP FOREIGN KEY `territory_members_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `territory_members` DROP FOREIGN KEY `territory_members_territory_id_fkey`;

-- DropForeignKey
ALTER TABLE `territory_performances` DROP FOREIGN KEY `territory_performances_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `territory_performances` DROP FOREIGN KEY `territory_performances_territory_id_fkey`;

-- DropForeignKey
ALTER TABLE `territory_rules` DROP FOREIGN KEY `territory_rules_tenant_id_fkey`;

-- DropForeignKey
ALTER TABLE `territory_rules` DROP FOREIGN KEY `territory_rules_territory_id_fkey`;

-- DropTable
DROP TABLE `analytic_dashboards`;

-- DropTable
DROP TABLE `analytic_widgets`;

-- DropTable
DROP TABLE `article_attachments`;

-- DropTable
DROP TABLE `article_feedback`;

-- DropTable
DROP TABLE `calendar_attendees`;

-- DropTable
DROP TABLE `calendar_events`;

-- DropTable
DROP TABLE `call_logs`;

-- DropTable
DROP TABLE `campaign_email_sends`;

-- DropTable
DROP TABLE `campaign_list_assignments`;

-- DropTable
DROP TABLE `campaign_recipients`;

-- DropTable
DROP TABLE `case_escalations`;

-- DropTable
DROP TABLE `case_messages`;

-- DropTable
DROP TABLE `channel_conflicts`;

-- DropTable
DROP TABLE `competitor_social_activities`;

-- DropTable
DROP TABLE `contract_amendments`;

-- DropTable
DROP TABLE `contract_approvals`;

-- DropTable
DROP TABLE `contract_milestones`;

-- DropTable
DROP TABLE `contract_renewals`;

-- DropTable
DROP TABLE `contract_signatures`;

-- DropTable
DROP TABLE `contract_templates`;

-- DropTable
DROP TABLE `contracts`;

-- DropTable
DROP TABLE `customer_cases`;

-- DropTable
DROP TABLE `customer_feedback`;

-- DropTable
DROP TABLE `customer_portal_users`;

-- DropTable
DROP TABLE `dashboard_kpis`;

-- DropTable
DROP TABLE `dashboard_shares`;

-- DropTable
DROP TABLE `data_exports`;

-- DropTable
DROP TABLE `deal_competitors`;

-- DropTable
DROP TABLE `deal_stage_history`;

-- DropTable
DROP TABLE `deal_stages`;

-- DropTable
DROP TABLE `email_campaigns`;

-- DropTable
DROP TABLE `email_click_events`;

-- DropTable
DROP TABLE `email_list_subscriptions`;

-- DropTable
DROP TABLE `email_lists`;

-- DropTable
DROP TABLE `email_unsubscribes`;

-- DropTable
DROP TABLE `knowledge_articles`;

-- DropTable
DROP TABLE `knowledge_categories`;

-- DropTable
DROP TABLE `kpi_definitions`;

-- DropTable
DROP TABLE `kpi_values`;

-- DropTable
DROP TABLE `meeting_notes`;

-- DropTable
DROP TABLE `meeting_rooms`;

-- DropTable
DROP TABLE `partner_certifications`;

-- DropTable
DROP TABLE `partner_contacts`;

-- DropTable
DROP TABLE `partner_lead_shares`;

-- DropTable
DROP TABLE `partner_marketing_activities`;

-- DropTable
DROP TABLE `partner_opportunities`;

-- DropTable
DROP TABLE `partner_performances`;

-- DropTable
DROP TABLE `partner_portal_users`;

-- DropTable
DROP TABLE `partners`;

-- DropTable
DROP TABLE `portal_downloads`;

-- DropTable
DROP TABLE `portal_sessions`;

-- DropTable
DROP TABLE `report_subscriptions`;

-- DropTable
DROP TABLE `room_bookings`;

-- DropTable
DROP TABLE `sales_team_members`;

-- DropTable
DROP TABLE `sales_teams`;

-- DropTable
DROP TABLE `service_requests`;

-- DropTable
DROP TABLE `social_media_engagements`;

-- DropTable
DROP TABLE `social_media_leads`;

-- DropTable
DROP TABLE `team_meetings`;

-- DropTable
DROP TABLE `team_performances`;

-- DropTable
DROP TABLE `territories`;

-- DropTable
DROP TABLE `territory_assignments`;

-- DropTable
DROP TABLE `territory_members`;

-- DropTable
DROP TABLE `territory_performances`;

-- DropTable
DROP TABLE `territory_rules`;

