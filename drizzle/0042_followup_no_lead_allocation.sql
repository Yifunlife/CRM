-- Follow-up staff maintain orders only. Keep all customer ownership and order history intact.
UPDATE crm_users SET trade_scopes='[]' WHERE role='followup' AND trade_scopes<>'[]';

UPDATE crm_allocation_configs
SET payload=json_set(payload,'$.members',json((
 SELECT json_group_array(json(m.value)) FROM json_each(crm_allocation_configs.payload,'$.members') m
 WHERE NOT EXISTS(SELECT 1 FROM crm_users u WHERE u.id=json_extract(m.value,'$.user_id') AND u.role='followup')
)))
WHERE json_valid(payload) AND json_type(payload,'$.members')='array'
 AND EXISTS(SELECT 1 FROM json_each(crm_allocation_configs.payload,'$.members') m
 JOIN crm_users u ON u.id=json_extract(m.value,'$.user_id') WHERE u.role='followup');
