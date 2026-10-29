-- One confirmed deal belongs to at most one active sales project, even during concurrent writes.
CREATE UNIQUE INDEX crm_sales_projects_deal_unique ON crm_sales_projects(json_extract(details,'$.deal_id'))
WHERE json_extract(details,'$.deal_id') IS NOT NULL AND json_extract(details,'$.deal_id')<>'';
